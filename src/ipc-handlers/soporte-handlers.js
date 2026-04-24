'use strict';

const { app, shell, ipcMain, clipboard } = require('electron');
const { spawn }  = require('child_process');
const os         = require('os');
const fs         = require('fs');
const path       = require('path');
const dns        = require('dns').promises;

const SUPPORT_WHATSAPP = '5493417559591';
const { CLOUD_API_URL: API_URL } = require('../config');

const RUSTDESK_PATHS = [
  'C:\\Program Files\\RustDesk\\rustdesk.exe',
  'C:\\Program Files (x86)\\RustDesk\\rustdesk.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'RustDesk', 'rustdesk.exe'),
];

// ── Diagnóstico local ────────────────────────────────────────────────────────

function getDbPath() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'database.sqlite')
    : path.join(process.cwd(), 'database.sqlite');
}

async function checkInternet() {
  try { await dns.resolve('google.com'); return { ok: true, msg: 'Conectado' }; }
  catch { return { ok: false, msg: 'Sin conexión a internet' }; }
}

async function checkBackend() {
  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 5000);
    const res  = await fetch(`${API_URL}/health`, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(t);
    if (!res) return { ok: false, msg: 'No responde' };
    return { ok: res.ok, msg: res.ok ? 'OK' : `HTTP ${res.status}` };
  } catch { return { ok: false, msg: 'No responde' }; }
}

function checkDatabase() {
  const p = getDbPath();
  try {
    if (!fs.existsSync(p)) return { ok: false, msg: 'Archivo no encontrado' };
    const kb = Math.round(fs.statSync(p).size / 1024);
    return { ok: true, msg: `OK · ${kb} KB` };
  } catch { return { ok: false, msg: 'Error al leer la base' }; }
}

async function checkDiskSpace() {
  try {
    const si    = require('systeminformation');
    const drives = await si.fsSize();
    const main   = drives.find(d => /^[Cc]:|^\//.test(d.mount)) || drives[0];
    if (!main || !main.size) return { ok: true, msg: 'N/D' };
    const usedPct = Math.round((main.used / main.size) * 100);
    const freeGb  = (main.available / 1024 / 1024 / 1024).toFixed(1);
    return { ok: usedPct < 90, msg: `${usedPct}% usado · ${freeGb} GB libres` };
  } catch { return { ok: true, msg: 'N/D' }; }
}

function getSysInfo() {
  return {
    version:  app.getVersion(),
    os:       `${os.type()} ${os.release()}`,
    hostname: os.hostname(),
    memory:   `${Math.round(os.freemem() / 1024 / 1024)} MB libres de ${Math.round(os.totalmem() / 1024 / 1024)} MB`,
    dbPath:   getDbPath(),
  };
}

// ── Chat API helpers ─────────────────────────────────────────────────────────

function getClientId() {
  const idFile = path.join(app.getPath('userData'), '.support_client_id');
  try {
    if (fs.existsSync(idFile)) return fs.readFileSync(idFile, 'utf8').trim();
    const id = require('crypto').randomUUID();
    fs.writeFileSync(idFile, id, 'utf8');
    return id;
  } catch { return 'anonymous'; }
}

async function apiPost(endpoint, body) {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) { clearTimeout(t); throw e; }
}

async function apiGet(endpoint) {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${API_URL}${endpoint}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) { clearTimeout(t); throw e; }
}

// ── Registro de handlers ─────────────────────────────────────────────────────

function registerSoporteHandlers() {

  // Diagnóstico
  ipcMain.handle('soporte-diagnostics', async () => {
    const [internet, backend, disk] = await Promise.all([checkInternet(), checkBackend(), checkDiskSpace()]);
    const db  = checkDatabase();
    const sys = getSysInfo();
    return { internet, backend, db, disk, sys };
  });

  // RustDesk
  ipcMain.handle('soporte-launch-rustdesk', async () => {
    const exe = RUSTDESK_PATHS.find(p => fs.existsSync(p));
    if (!exe) return { ok: false, msg: 'RustDesk no está instalado en esta máquina.' };
    try {
      spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    } catch (e) { return { ok: false, msg: e.message }; }
  });

  // WhatsApp
  ipcMain.handle('soporte-open-whatsapp', async (_e, msg) => {
    const text = encodeURIComponent(msg || 'Hola, necesito soporte con VentaSimple.');
    await shell.openExternal(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`);
    return { ok: true };
  });

  // Copiar reporte
  ipcMain.handle('soporte-copy-report', async (_e, report) => {
    clipboard.writeText(report || '');
    return { ok: true };
  });

  // Chat — iniciar conversación + enviar contexto automático
  ipcMain.handle('soporte-chat-init', async (_e, clientInfo) => {
    try {
      const client_id = getClientId();
      const data = await apiPost('/api/support/conversations', {
        client_id,
        business_name: clientInfo?.business_name || 'Sin nombre',
        app_version:   app.getVersion(),
        context:       clientInfo?.context || {},
      });

      const ctx = clientInfo?.context || {};
      const ctxText = [
        '📋 Contexto automático:',
        `• App: v${app.getVersion()}`,
        `• OS: ${ctx.os || 'N/D'}`,
        `• Equipo: ${ctx.hostname || 'N/D'}`,
        `• Internet: ${ctx.internet || 'N/D'}`,
        `• Base de datos: ${ctx.db || 'N/D'}`,
        `• Disco: ${ctx.disk || 'N/D'}`,
      ].join('\n');

      await apiPost('/api/support/messages', {
        conversation_id: data.conversation_id,
        sender: 'system',
        text: ctxText,
      });

      return { ok: true, conversation_id: data.conversation_id, client_id };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Chat — enviar mensaje del usuario
  ipcMain.handle('soporte-chat-send', async (_e, { conversation_id, text }) => {
    try {
      const data = await apiPost('/api/support/messages', { conversation_id, sender: 'user', text });
      return { ok: true, ...data };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Chat — polling de mensajes nuevos
  ipcMain.handle('soporte-chat-poll', async (_e, { conversation_id, since }) => {
    try {
      const qs   = since ? `?since=${encodeURIComponent(since)}` : '';
      const data = await apiGet(`/api/support/messages/${conversation_id}${qs}`);
      return { ok: true, messages: data };
    } catch (e) { return { ok: false, messages: [], error: e.message }; }
  });
}

module.exports = { registerSoporteHandlers };
