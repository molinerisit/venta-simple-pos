// src/remote/api-router.js
// REST API v1 — the backbone of the web panel ecosystem.
// All routes require Bearer token auth except /ping.
'use strict';

const express = require('express');
const { getMetrics } = require('./metrics');
const { execute, listCommands } = require('./cmd-executor');

/**
 * Creates and returns the Express router with all API v1 routes.
 * @param {object} models     - Sequelize models
 * @param {string} validToken - The bearer token that must match
 */
function createApiRouter(models, validToken) {
  const router = express.Router();

  // ── Auth middleware ──────────────────────────────────────────
  function auth(req, res, next) {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || token !== validToken) {
      return res.status(401).json({ error: 'Token inválido o ausente.' });
    }
    next();
  }

  // ── Helpers ──────────────────────────────────────────────────
  const ok  = (res, data)    => res.json({ success: true,  data });
  const err = (res, msg, code = 400) => res.status(code).json({ success: false, error: msg });

  // ════════════════════════════════════════════════════════════
  // PING — sin auth (health check desde web panel o monitoreo)
  // ════════════════════════════════════════════════════════════
  router.get('/ping', (_req, res) => {
    res.json({ status: 'ok', app: 'VentaSimple', version: '1.0.0', ts: new Date().toISOString() });
  });

  // ════════════════════════════════════════════════════════════
  // SISTEMA
  // ════════════════════════════════════════════════════════════
  router.get('/status', auth, async (_req, res) => {
    try {
      const metrics = await getMetrics();
      ok(res, metrics);
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.get('/system/commands', auth, (_req, res) => {
    ok(res, listCommands());
  });

  router.post('/system/cmd', auth, async (req, res) => {
    const { cmd } = req.body || {};
    if (!cmd) return err(res, 'Falta el campo "cmd".');
    try {
      const result = await execute(cmd);
      ok(res, result);
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  // ════════════════════════════════════════════════════════════
  // PRODUCTOS
  // ════════════════════════════════════════════════════════════
  router.get('/productos', auth, async (req, res) => {
    try {
      const { limit = 500, offset = 0, updatedSince } = req.query;
      const where = {};
      if (updatedSince) where.updatedAt = { [require('sequelize').Op.gte]: new Date(updatedSince) };

      const items = await models.Producto.findAll({
        where,
        attributes: ['id','nombre','codigoBarras','precioVenta','precioCosto',
                     'stock','unidad','activo','updatedAt'],
        limit: Math.min(Number(limit), 2000),
        offset: Number(offset),
        order: [['updatedAt','DESC']],
        raw: true,
      });
      ok(res, { count: items.length, items });
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.put('/productos/:id', auth, async (req, res) => {
    try {
      const prod = await models.Producto.findByPk(req.params.id);
      if (!prod) return err(res, 'Producto no encontrado.', 404);

      const allowed = ['nombre','precioVenta','precioCosto','stock','activo'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }
      await prod.update(updates);
      ok(res, prod.toJSON());
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  // Bulk upsert by barcode (for web panel price sync)
  router.post('/productos/sync', auth, async (req, res) => {
    try {
      const items = req.body?.items;
      if (!Array.isArray(items)) return err(res, '"items" debe ser un array.');
      const results = { updated: 0, notFound: [] };
      for (const item of items) {
        if (!item.codigoBarras) continue;
        const prod = await models.Producto.findOne({ where: { codigoBarras: String(item.codigoBarras) } });
        if (!prod) { results.notFound.push(item.codigoBarras); continue; }
        const allowed = ['precioVenta','precioCosto','stock','nombre','activo'];
        const updates = {};
        for (const k of allowed) if (item[k] !== undefined) updates[k] = item[k];
        await prod.update(updates);
        results.updated++;
      }
      ok(res, results);
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  // ════════════════════════════════════════════════════════════
  // VENTAS
  // ════════════════════════════════════════════════════════════
  router.get('/ventas', auth, async (req, res) => {
    try {
      const { desde, hasta, limit = 200 } = req.query;
      const { Op } = require('sequelize');
      const where = {};
      if (desde || hasta) {
        where.createdAt = {};
        if (desde) where.createdAt[Op.gte] = new Date(desde);
        if (hasta) where.createdAt[Op.lte] = new Date(hasta);
      }
      const ventas = await models.Venta.findAll({
        where,
        attributes: ['id','total','metodoPago','createdAt'],
        order: [['createdAt','DESC']],
        limit: Math.min(Number(limit), 1000),
        raw: true,
      });
      ok(res, { count: ventas.length, items: ventas });
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  router.get('/ventas/resumen', auth, async (req, res) => {
    try {
      const { Op, fn, col, literal } = require('sequelize');
      const hoy = new Date(); hoy.setHours(0,0,0,0);
      const [total, hoyCount] = await Promise.all([
        models.Venta.sum('total'),
        models.Venta.count({ where: { createdAt: { [Op.gte]: hoy } } }),
      ]);
      ok(res, { totalHistorico: total || 0, ventasHoy: hoyCount });
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  // ════════════════════════════════════════════════════════════
  // CLIENTES
  // ════════════════════════════════════════════════════════════
  router.get('/clientes', auth, async (req, res) => {
    try {
      const clientes = await models.Cliente.findAll({
        attributes: ['id','nombre','dni','telefono','email','updatedAt'],
        order: [['nombre','ASC']],
        raw: true,
      });
      ok(res, { count: clientes.length, items: clientes });
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  // ════════════════════════════════════════════════════════════
  // CONFIG DEL NEGOCIO (solo lectura)
  // ════════════════════════════════════════════════════════════
  router.get('/config/negocio', auth, async (_req, res) => {
    try {
      const admin = await models.Usuario.findOne({
        where: { rol: 'administrador' },
        attributes: ['nombre_negocio','slogan_negocio','footer_ticket'],
        raw: true,
      });
      ok(res, admin || {});
    } catch (e) {
      err(res, e.message, 500);
    }
  });

  return router;
}

module.exports = { createApiRouter };
