'use strict';

const { ipcMain }         = require('electron');
const { CLOUD_API_URL }   = require('../config');
const heartbeat           = require('../heartbeat');

function authFetch(endpoint, token, opts = {}) {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), 8000);
  return fetch(`${CLOUD_API_URL}${endpoint}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t));
}

function registerMonitoringHandlers() {

  // Obtener horarios del negocio
  ipcMain.handle('monitoring-get-hours', async (_e, token) => {
    try {
      const res = await authFetch('/api/tenants/me/hours', token);
      if (!res.ok) return { ok: false };
      return { ok: true, hours: await res.json() };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Guardar horarios del negocio
  ipcMain.handle('monitoring-set-hours', async (_e, { token, hours }) => {
    try {
      const res = await authFetch('/api/tenants/me/hours', token, {
        method: 'PUT',
        body: JSON.stringify({ hours }),
      });
      if (!res.ok) return { ok: false };
      // Reiniciar heartbeat con los nuevos horarios
      await heartbeat.loadHoursAndStart(token);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  // Iniciar heartbeat al hacer login
  ipcMain.handle('monitoring-start', async (_e, token) => {
    await heartbeat.loadHoursAndStart(token);
    const executor = require('../command-executor');
    executor.startPolling(token);
    return { ok: true };
  });

  // Detener heartbeat al cerrar sesión
  ipcMain.handle('monitoring-stop', () => {
    heartbeat.stop();
    const executor = require('../command-executor');
    executor.stopPolling();
    return { ok: true };
  });
}

module.exports = { registerMonitoringHandlers };
