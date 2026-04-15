// src/ipc-handlers/license-handlers.js
// Gestión del plan/licencia local. Persiste en userData/vs-license.json.
'use strict';

const { ipcMain, app, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

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

function registerLicenseHandlers() {
  // Devuelve el plan activo al renderer
  ipcMain.handle('get-subscription-status', () => {
    const lic = readLicense();
    return {
      plan:      lic?.plan      || 'FREE',
      tenant_id: lic?.tenant_id || null,
      email:     lic?.email     || null,
      activated: !!lic && lic.plan !== 'FREE',
    };
  });

  // Abre URL en el navegador del sistema
  ipcMain.handle('open-external-url', (_event, url) => {
    shell.openExternal(url);
  });

  // Guarda la licencia después de la activación cloud
  ipcMain.handle('save-license', (_event, data) => {
    try {
      writeLicense(data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = { registerLicenseHandlers, readLicense, writeLicense };
