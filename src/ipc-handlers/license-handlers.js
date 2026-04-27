// src/ipc-handlers/license-handlers.js
// Gestión del plan/licencia local. Persiste en userData/vs-license.json.
'use strict';

const { ipcMain, app, shell, BrowserWindow } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');
const http  = require('http');

const { CLOUD_API_URL: CLOUD_API } = require('../config');


const LICENSE_PATH = path.join(app.getPath('userData'), 'vs-license.json');

function readLicense() {
  try {
    if (fs.existsSync(LICENSE_PATH)) {
      return JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'));
    }
  } catch {}
  return null;
}

function writeLicense(data) {
  fs.writeFileSync(LICENSE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Recibe la URL del deep link (ventasimple://activate?token=...) y:
 * 1. Llama al backend para canjear el token
 * 2. Guarda la licencia localmente
 * 3. Notifica a todas las ventanas abiertas
 */
async function handleDeepLink(url) {
  try {
    const parsed = new URL(url);

    // ventasimple://mp_oauth?ok=1  (MP OAuth callback desde el desktop)
    if (parsed.hostname === 'mp_oauth') {
      await _handleMpOauthDeepLink(parsed);
      return;
    }

    // ventasimple://activate?token=...
    if (parsed.hostname !== 'activate') return;

    const token = parsed.searchParams.get('token');
    if (!token) return;

    // Always use the hardcoded cloud URL — never follow api_url from disk
    const apiUrl = CLOUD_API.replace(/\/$/, '');
    const data   = await _get(`${apiUrl}/api/auth/desktop-callback?token=${token}`);

    const VALID_PLANS = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
    const plan = VALID_PLANS.includes(data.plan) ? data.plan : 'FREE';

    writeLicense({
      plan,
      tenant_id: data.tenant_id || null,
      email:     data.email     || null,
      nombre:    data.nombre    || null,
      token:     data.token     || null,
      licencia:  data.licencia  || null,
      api_url:   apiUrl,
    });

    // Notificar al renderer en todas las ventanas
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('license-activated', {
          plan:   data.plan,
          nombre: data.nombre,
        });
      }
    });

    console.log('[DeepLink] Licencia activada — plan:', data.plan);
  } catch (e) {
    console.error('[DeepLink] Error al activar:', e.message);
    // Notificar error al renderer
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('license-activation-error', { error: e.message });
      }
    });
  }
}

/** GET simple con el módulo https nativo. */
function _get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Respuesta inválida del servidor'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('Timeout al conectar con el servidor'));
    });
  });
}

/** GET autenticado con Bearer token usando el módulo https/http nativo. */
function _getAuthed(url, token) {
  return new Promise((resolve, reject) => {
    const mod  = url.startsWith('https') ? https : http;
    const req  = mod.request(url, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      let body = '';
      res.on('data', c => (body += c));
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Respuesta inválida del servidor')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

/** Maneja ventasimple://mp_oauth?ok=1 */
async function _handleMpOauthDeepLink(parsed) {
  const ok  = parsed.searchParams.get('ok');
  const err = parsed.searchParams.get('error');

  const broadcast = (channel, data) => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) win.webContents.send(channel, data);
    });
  };

  if (!ok || ok !== '1') {
    broadcast('mp-oauth-error', { error: err || 'cancelled' });
    return;
  }

  const lic = readLicense();
  if (!lic?.token) {
    broadcast('mp-oauth-error', { error: 'no_license' });
    return;
  }

  const apiUrl = (lic.api_url || CLOUD_API).replace(/\/$/, '');
  try {
    const data = await _getAuthed(`${apiUrl}/mercadopago/tokens`, lic.token);
    broadcast('mp-oauth-connected', {
      accessToken: data.access_token,
      userId:      data.user_id,
      posId:       data.pos_id || null,
    });
  } catch (e) {
    broadcast('mp-oauth-error', { error: e.message });
  }
}

function registerLicenseHandlers() {
  // Devuelve URL autenticada para abrir la web con sesión activa
  ipcMain.handle('get-web-login-url', (_event, path = '/cuenta') => {
    const lic = readLicense();
    const safePath = (typeof path === 'string' && path.startsWith('/')) ? path : '/cuenta';
    if (!lic?.token) return `https://ventasimple.cloud${safePath}`;
    const url = new URL('https://ventasimple.cloud/auto-login');
    url.searchParams.set('token', lic.token);
    url.searchParams.set('next', safePath);
    return url.toString();
  });

  // Devuelve el plan activo al renderer
  ipcMain.handle('get-subscription-status', () => {
    const lic = readLicense();
    return {
      plan:      lic?.plan      || 'FREE',
      tenant_id: lic?.tenant_id || null,
      email:     lic?.email     || null,
      nombre:    lic?.nombre    || null,
      activated: !!lic && lic.plan !== 'FREE',
    };
  });

  // Abre URL en el navegador del sistema
  ipcMain.handle('open-external-url', (_event, url) => {
    shell.openExternal(url);
  });

  // Guarda la licencia después de la activación manual (e.g. ingreso de clave)
  ipcMain.handle('save-license', (_event, data) => {
    const VALID_PLANS = ['FREE', 'BASIC', 'PRO', 'ENTERPRISE'];
    if (!data || typeof data !== 'object') return { ok: false, error: 'Datos inválidos' };
    if (data.plan && !VALID_PLANS.includes(String(data.plan).toUpperCase())) {
      return { ok: false, error: 'Plan inválido' };
    }
    // api_url always pinned to production — never allow arbitrary server override
    const sanitized = { ...data, api_url: CLOUD_API };
    try {
      writeLicense(sanitized);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerLicenseHandlers, readLicense, writeLicense, handleDeepLink };
