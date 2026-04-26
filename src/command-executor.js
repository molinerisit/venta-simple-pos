'use strict';

/**
 * Ejecutor de comandos remotos — whitelist estricta.
 * Recibe comandos del backend (soporte) y los ejecuta localmente de forma segura.
 * NUNCA ejecuta shell arbitrario. Solo los tipos definidos en HANDLERS.
 */

const { exec, execFile } = require('child_process');
const os   = require('os');
const fs   = require('fs');
const path = require('path');
const { app, Notification } = require('electron');

const { CLOUD_API_URL } = require('./config');

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else     resolve(stdout.trim());
    });
  });
}

function getTempDirs() {
  return [os.tmpdir(), path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Temp')].filter(d => fs.existsSync(d));
}

function clearDir(dir, maxAgeDays = 7) {
  const cutoff = Date.now() - maxAgeDays * 86400000;
  let count = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      try {
        const stat = fs.statSync(full);
        if (stat.mtimeMs < cutoff) {
          if (stat.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
          else fs.unlinkSync(full);
          count++;
        }
      } catch { /* archivo en uso, skip */ }
    }
  } catch { /* sin permiso, skip */ }
  return count;
}

// ── Handlers de comandos ──────────────────────────────────────────────────────

const HANDLERS = {

  async KILL_PORT({ port }) {
    if (!port || isNaN(Number(port))) throw new Error('Parámetro port inválido');
    const p = Number(port);
    if (p < 1024 || p > 65535) throw new Error('Puerto fuera de rango permitido (1024-65535)');

    const out = await run(`netstat -ano | findstr :${p}`).catch(() => '');
    const pids = [...new Set(
      out.split('\n')
        .map(l => l.trim().split(/\s+/).pop())
        .filter(pid => pid && /^\d+$/.test(pid) && pid !== '0')
    )];

    if (!pids.length) return { freed: false, message: `No hay proceso usando el puerto ${p}` };

    for (const pid of pids) {
      await run(`taskkill /PID ${pid} /F`).catch(() => {});
    }
    return { freed: true, pids, message: `Puerto ${p} liberado (PID: ${pids.join(', ')})` };
  },

  async CLEAR_TEMP() {
    const dirs = getTempDirs();
    let total = 0;
    for (const d of dirs) total += clearDir(d, 7);
    return { files_removed: total, dirs: dirs.length, message: `${total} archivos temporales eliminados` };
  },

  async CLEAR_LOG() {
    const logDir = app.isPackaged
      ? path.join(app.getPath('userData'), 'logs')
      : path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) return { message: 'Sin directorio de logs' };
    const count = clearDir(logDir, 0);
    return { files_removed: count, message: `${count} archivos de log eliminados` };
  },

  async RESTART_SYNC() {
    // Emite evento interno para que el módulo de sync se reinicie
    const { ipcMain } = require('electron');
    ipcMain.emit('internal-restart-sync');
    return { message: 'Módulo de sincronización reiniciado' };
  },

  async CHECK_DB() {
    const dbPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'database.sqlite')
      : path.join(process.cwd(), 'database.sqlite');

    if (!fs.existsSync(dbPath)) return { ok: false, message: 'Archivo de base de datos no encontrado' };

    try {
      const Database = require('better-sqlite3');
      const db = new Database(dbPath, { readonly: false });
      const integ = db.pragma('integrity_check', { simple: true });
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.exec('VACUUM');
      db.close();
      return { ok: integ === 'ok', integrity: integ, message: `Integridad: ${integ} — VACUUM completado` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  },

  async REPORT_FULL() {
    const si = require('systeminformation');
    const [cpu, mem, disk, processes] = await Promise.all([
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
      si.fsSize().catch(() => []),
      si.processes().catch(() => null),
    ]);

    const dbPath = app.isPackaged
      ? path.join(app.getPath('userData'), 'database.sqlite')
      : path.join(process.cwd(), 'database.sqlite');

    return {
      cpu_pct:     cpu  ? Math.round(cpu.currentLoad) : null,
      ram_pct:     mem  ? Math.round((mem.used / mem.total) * 100) : null,
      ram_free_mb: mem  ? Math.round(mem.free / 1024 / 1024) : null,
      disk_pct:    disk.length ? Math.round((disk[0].used / disk[0].size) * 100) : null,
      processes:   processes?.all || null,
      db_size_kb:  fs.existsSync(dbPath) ? Math.round(fs.statSync(dbPath).size / 1024) : null,
      hostname:    os.hostname(),
      uptime_h:    Math.round(os.uptime() / 3600),
    };
  },

  async NOTIFY({ message, title }) {
    if (!message) throw new Error('Parámetro message requerido');
    new Notification({
      title: title || 'VentaSimple Soporte',
      body:  String(message).slice(0, 200),
    }).show();
    return { shown: true };
  },
};

// ── Polling y ejecución ───────────────────────────────────────────────────────

let _token    = null;
let _pollTimer = null;

function setToken(token) { _token = token; }

async function authFetch(endpoint, opts = {}) {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${CLOUD_API_URL}${endpoint}`, {
      ...opts,
      headers: { Authorization: `Bearer ${_token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return res;
  } catch (e) { clearTimeout(t); throw e; }
}

async function executeCommand(cmd) {
  const handler = HANDLERS[cmd.command_type];
  if (!handler) {
    await reportResult(cmd.id, 'skipped', 'Comando no reconocido en este cliente');
    return;
  }

  // Validar antigüedad (<10 min)
  const ageMs = Date.now() - new Date(cmd.created_at).getTime();
  if (ageMs > 10 * 60 * 1000) {
    await reportResult(cmd.id, 'skipped', 'Comando expirado (>10 min)');
    return;
  }

  try {
    const data = await handler(cmd.params || {});
    await reportResult(cmd.id, 'done', null, data);
  } catch (e) {
    await reportResult(cmd.id, 'error', e.message);
  }
}

async function reportResult(id, status, message, data) {
  try {
    await authFetch(`/api/tenants/me/commands/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, message, data }),
    });
  } catch { /* silencioso */ }
}

async function pollCommands() {
  if (!_token) return;
  try {
    const res = await authFetch('/api/tenants/me/commands');
    if (!res.ok) return;
    const commands = await res.json();
    for (const cmd of commands) {
      await executeCommand(cmd);
    }
  } catch { /* sin conexión, ignorar */ }
}

function startPolling(token) {
  _token = token;
  stopPolling();
  // Poll inmediato + cada 60s
  pollCommands();
  _pollTimer = setInterval(pollCommands, 60000);
}

function stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// Enriquecer el heartbeat con métricas del sistema
async function buildPingPayload(token) {
  setToken(token);
  try {
    const si = require('systeminformation');
    const [cpu, mem, disk] = await Promise.all([
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
      si.fsSize().catch(() => []),
    ]);
    return {
      cpu_pct:     cpu  ? Math.round(cpu.currentLoad) : null,
      ram_pct:     mem  ? Math.round((mem.used / mem.total) * 100) : null,
      ram_free_mb: mem  ? Math.round(mem.free / 1024 / 1024) : null,
      disk_pct:    disk.length ? Math.round((disk[0].used / disk[0].size) * 100) : null,
    };
  } catch { return {}; }
}

module.exports = { startPolling, stopPolling, setToken, buildPingPayload };
