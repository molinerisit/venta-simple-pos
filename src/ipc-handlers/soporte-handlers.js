'use strict';

const { app, shell, ipcMain, clipboard } = require('electron');
const { spawn }   = require('child_process');
const os          = require('os');
const fs          = require('fs');
const path        = require('path');
const dns         = require('dns').promises;

const SUPPORT_WHATSAPP = '5491100000000'; // ← reemplazar con número real (sin + ni espacios)
const CLOUD_API_URL    = 'https://backend-py-mauve.vercel.app';

const RUSTDESK_PATHS = [
  'C:\\Program Files\\RustDesk\\rustdesk.exe',
  'C:\\Program Files (x86)\\RustDesk\\rustdesk.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'RustDesk', 'rustdesk.exe'),
];

function getDbPath() {
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'database.sqlite')
    : path.join(process.cwd(), 'database.sqlite');
}

async function checkInternet() {
  try {
    await dns.resolve('google.com');
    return { ok: true, msg: 'Conectado' };
  } catch {
    return { ok: false, msg: 'Sin conexión a internet' };
  }
}

async function checkBackend() {
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res   = await fetch(`${CLOUD_API_URL}/health`, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(timer);
    if (!res) return { ok: false, msg: 'No responde' };
    return { ok: res.ok, msg: res.ok ? 'OK' : `HTTP ${res.status}` };
  } catch {
    return { ok: false, msg: 'No responde' };
  }
}

function checkDatabase() {
  const dbPath = getDbPath();
  try {
    if (!fs.existsSync(dbPath)) return { ok: false, msg: 'Archivo no encontrado' };
    const kb = Math.round(fs.statSync(dbPath).size / 1024);
    return { ok: true, msg: `OK · ${kb} KB` };
  } catch {
    return { ok: false, msg: 'Error al leer la base' };
  }
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
  } catch {
    return { ok: true, msg: 'N/D' };
  }
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

function registerSoporteHandlers() {
  ipcMain.handle('soporte-diagnostics', async () => {
    const [internet, backend, disk] = await Promise.all([
      checkInternet(),
      checkBackend(),
      checkDiskSpace(),
    ]);
    const db  = checkDatabase();
    const sys = getSysInfo();
    return { internet, backend, db, disk, sys };
  });

  ipcMain.handle('soporte-launch-rustdesk', async () => {
    const exe = RUSTDESK_PATHS.find(p => fs.existsSync(p));
    if (!exe) return { ok: false, msg: 'RustDesk no está instalado en esta máquina.' };
    try {
      spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  });

  ipcMain.handle('soporte-open-whatsapp', async (_e, msg) => {
    const text = encodeURIComponent(msg || 'Hola, necesito soporte con VentaSimple.');
    await shell.openExternal(`https://wa.me/${SUPPORT_WHATSAPP}?text=${text}`);
    return { ok: true };
  });

  ipcMain.handle('soporte-copy-report', async (_e, report) => {
    clipboard.writeText(report || '');
    return { ok: true };
  });
}

module.exports = { registerSoporteHandlers };
