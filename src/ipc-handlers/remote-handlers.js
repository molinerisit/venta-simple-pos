// src/ipc-handlers/remote-handlers.js
'use strict';

const { ipcMain } = require('electron');
const crypto = require('crypto');
const remoteServer = require('../remote/server');

function registerRemoteHandlers(models) {
  const { Usuario } = models;

  // ── helpers ─────────────────────────────────────────────────
  async function getSuperAdmin() {
    return Usuario.findOne({ where: { rol: 'superadmin' } });
  }

  function generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // ── get current config ────────────────────────────────────
  ipcMain.handle('remote-get-config', async () => {
    try {
      const sa = await getSuperAdmin();
      return {
        enabled: !!sa?.remote_access_enabled,
        port:    sa?.remote_access_port   || 4827,
        token:   sa?.remote_access_token  || null,
        running: remoteServer.isRunning(),
        clients: remoteServer.connectedClients(),
      };
    } catch (e) {
      return { enabled: false, port: 4827, token: null, running: false, clients: 0 };
    }
  });

  // ── save config + start/stop server ──────────────────────
  ipcMain.handle('remote-save-config', async (_e, { enabled, port }) => {
    try {
      const sa = await getSuperAdmin();
      if (!sa) return { success: false, error: 'Superadmin no encontrado.' };

      const cleanPort = Number(port) || 4827;
      if (cleanPort < 1024 || cleanPort > 65535) {
        return { success: false, error: 'Puerto debe estar entre 1024 y 65535.' };
      }

      // Generate token on first enable
      let token = sa.remote_access_token;
      if (!token) token = generateToken();

      await sa.update({
        remote_access_enabled: !!enabled,
        remote_access_port:    cleanPort,
        remote_access_token:   token,
      });

      if (enabled && !remoteServer.isRunning()) {
        const result = await remoteServer.start(models, token, cleanPort);
        if (!result.success) return { success: false, error: result.error };
      } else if (!enabled && remoteServer.isRunning()) {
        await remoteServer.stop();
      }

      return { success: true, token, port: cleanPort, running: remoteServer.isRunning() };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── regenerate token ──────────────────────────────────────
  ipcMain.handle('remote-regenerate-token', async () => {
    try {
      const sa = await getSuperAdmin();
      if (!sa) return { success: false, error: 'Superadmin no encontrado.' };

      const newToken = generateToken();
      await sa.update({ remote_access_token: newToken });

      // Restart server with new token if it was running
      if (remoteServer.isRunning()) {
        await remoteServer.stop();
        await remoteServer.start(models, newToken, sa.remote_access_port || 4827);
      }

      return { success: true, token: newToken };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── get live system metrics ───────────────────────────────
  ipcMain.handle('remote-get-metrics', async () => {
    try {
      const { getMetrics } = require('../remote/metrics');
      return await getMetrics();
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── start server manually ─────────────────────────────────
  ipcMain.handle('remote-start', async () => {
    try {
      const sa = await getSuperAdmin();
      if (!sa?.remote_access_token) return { success: false, error: 'Generá un token primero.' };
      if (remoteServer.isRunning()) return { success: true, already: true };

      const result = await remoteServer.start(
        models,
        sa.remote_access_token,
        sa.remote_access_port || 4827
      );
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── stop server manually ──────────────────────────────────
  ipcMain.handle('remote-stop', async () => {
    try {
      await remoteServer.stop();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── execute whitelisted command ───────────────────────────
  ipcMain.handle('remote-exec-cmd', async (_e, { cmd }) => {
    if (typeof cmd !== 'string' || !/^[a-z][a-z0-9-]*$/.test(cmd)) {
      return { success: false, output: 'Parámetro cmd inválido' };
    }
    try {
      const { execute } = require('../remote/cmd-executor');
      return await execute(cmd);
    } catch (e) {
      return { success: false, output: e.message };
    }
  });

  // ── list available commands ───────────────────────────────
  ipcMain.handle('remote-list-commands', () => {
    const { listCommands } = require('../remote/cmd-executor');
    return listCommands();
  });
}

module.exports = { registerRemoteHandlers };
