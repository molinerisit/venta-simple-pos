// src/remote/server.js
// Embedded HTTP + WebSocket server for remote management and web panel sync.
// Starts/stops on demand based on admin config.
'use strict';

const http    = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { getMetrics } = require('./metrics');
const { createApiRouter } = require('./api-router');

let httpServer  = null;
let wss         = null;
let metricsLoop = null;
let _models     = null;
let _token      = null;
let _port       = 4827;

/** Broadcast a JSON message to all connected WebSocket clients */
function broadcast(data) {
  if (!wss) return;
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1 /* OPEN */) client.send(payload);
  });
}

/** Start the remote server */
async function start(models, token, port = 4827) {
  if (httpServer) return { success: true, already: true };

  _models = models;
  _token  = token;
  _port   = port;

  const app = express();

  app.use(express.json({ limit: '2mb' }));

  // CORS — allow any origin (web panel can be hosted anywhere)
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    next();
  });
  app.options('*', (_req, res) => res.sendStatus(204));

  // Mount API router
  app.use('/api/v1', createApiRouter(models, token));

  // 404 fallback
  app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  httpServer = http.createServer(app);

  // WebSocket — real-time metrics stream
  wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    // Authenticate via ?token= query param or first message
    const url    = new URL(req.url, `http://localhost`);
    const tkn    = url.searchParams.get('token') || '';
    if (tkn !== token) {
      ws.close(4401, 'Unauthorized');
      return;
    }

    console.log(`[REMOTE] WS conectado: ${req.socket.remoteAddress}`);

    // Send immediate snapshot
    getMetrics().then(m => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'metrics', data: m })));

    ws.on('close', () => console.log('[REMOTE] WS desconectado'));
    ws.on('error', (e) => console.error('[REMOTE] WS error:', e.message));
  });

  // Broadcast metrics every 5 seconds to all WS clients
  metricsLoop = setInterval(async () => {
    if (!wss || wss.clients.size === 0) return;
    try {
      const m = await getMetrics();
      broadcast({ type: 'metrics', data: m });
    } catch (_) {}
  }, 5000);

  return new Promise((resolve) => {
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`[REMOTE] Servidor activo en http://0.0.0.0:${port}`);
      resolve({ success: true, port });
    });

    httpServer.on('error', (e) => {
      console.error('[REMOTE] Error al iniciar servidor:', e.message);
      httpServer = null;
      wss = null;
      clearInterval(metricsLoop);
      resolve({ success: false, error: e.message });
    });
  });
}

/** Stop the remote server */
function stop() {
  return new Promise((resolve) => {
    clearInterval(metricsLoop);
    metricsLoop = null;

    if (wss) {
      wss.clients.forEach(c => c.terminate());
      wss.close();
      wss = null;
    }

    if (httpServer) {
      httpServer.close(() => {
        httpServer = null;
        console.log('[REMOTE] Servidor detenido.');
        resolve({ success: true });
      });
    } else {
      resolve({ success: true });
    }
  });
}

function isRunning()     { return !!httpServer; }
function connectedClients() { return wss ? wss.clients.size : 0; }
function getPort()       { return _port; }

module.exports = { start, stop, isRunning, connectedClients, getPort, broadcast };
