// src/ipc-handlers/license-handlers.js
// Gestión del plan/licencia local. Persiste en userData/vs-license.json.
'use strict';

const { ipcMain, app, shell, BrowserWindow } = require('electron');
const path  = require('path');
const fs    = require('fs');
const https = require('https');

// URL del backend cloud — actualizá antes de buildear para producción
const CLOUD_API = 'https://venta-simple-web-backend-py.vercel.app';

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
    // ventasimple://activate?token=...
    if (parsed.hostname !== 'activate') return;

    const token = parsed.searchParams.get('token');
    if (!token) return;

    const apiUrl = (readLicense()?.api_url || CLOUD_API).replace(/\/$/, '');
    const data   = await _get(`${apiUrl}/api/auth/desktop-callback?token=${token}`);

    writeLicense({
      plan:      data.plan      || 'FREE',
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

function registerLicenseHandlers() {
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
    try {
      writeLicense(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerLicenseHandlers, readLicense, writeLicense, handleDeepLink };
