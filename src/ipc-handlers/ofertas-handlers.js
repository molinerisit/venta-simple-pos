// src/ipc-handlers/ofertas-handlers.js
const { ipcMain } = require('electron');
const { Op } = require('sequelize');

// Returns the ISO day-of-week for a given Date (1=Mon … 7=Sun).
function isoDay(date = new Date()) {
  const d = date.getDay(); // 0=Sun … 6=Sat
  return d === 0 ? 7 : d;
}

/**
 * Returns the active offer for a product today, or null.
 * Exported so ventas-handlers can reuse it inside transactions.
 */
async function getOfertaActiva(Oferta, productoId) {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const dayNum = isoDay();

  const ofertas = await Oferta.findAll({
    where: {
      ProductoId: productoId,
      activa: true,
      deletedAt: null,
      [Op.or]: [
        { fecha_inicio: null },
        { fecha_inicio: { [Op.lte]: today } },
      ],
      [Op.and]: [
        {
          [Op.or]: [
            { fecha_fin: null },
            { fecha_fin: { [Op.gte]: today } },
          ],
        },
      ],
    },
    raw: true,
  });

  // Filter by day of week (dias_semana is a JSON-encoded array)
  for (const o of ofertas) {
    let dias = null;
    if (o.dias_semana) {
      try { dias = JSON.parse(o.dias_semana); } catch { dias = null; }
    }
    const applies = !dias || dias.length === 0 || dias.map(Number).includes(dayNum);
    if (applies) return o;
  }
  return null;
}

/**
 * Compute the effective line subtotal applying the offer.
 * Returns { subtotal, descuento, ofertaLabel }.
 */
function calcularLineaConOferta(oferta, precioVenta, cantidad) {
  const pv = Number(precioVenta);
  const qty = Number(cantidad);

  if (!oferta) {
    return { subtotal: pv * qty, descuento: 0, ofertaLabel: null };
  }

  let subtotal, descuento, ofertaLabel;

  switch (oferta.tipo) {
    case 'porcentaje': {
      const pct = Number(oferta.valor) || 0;
      subtotal = pv * qty * (1 - pct / 100);
      descuento = pv * qty - subtotal;
      ofertaLabel = oferta.nombre || `${pct}% OFF`;
      break;
    }
    case '2x1': {
      // Pay for ceil(qty/2) units at full price
      const pagadas = Math.ceil(qty / 2);
      subtotal = pv * pagadas;
      descuento = pv * qty - subtotal;
      ofertaLabel = oferta.nombre || '2x1';
      break;
    }
    case '3x2': {
      // Pay for (qty - floor(qty/3)) units at full price
      const pagadas = qty - Math.floor(qty / 3);
      subtotal = pv * pagadas;
      descuento = pv * qty - subtotal;
      ofertaLabel = oferta.nombre || '3x2';
      break;
    }
    default: {
      subtotal = pv * qty;
      descuento = 0;
      ofertaLabel = null;
    }
  }

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    descuento: Math.round(descuento * 100) / 100,
    ofertaLabel,
  };
}

function registerOfertasHandlers(models, sequelize) {
  const { Oferta, Producto } = models;

  // ── Listar todas las ofertas (con join de producto) ──────────────
  ipcMain.handle('get-ofertas', async () => {
    try {
      const ofertas = await Oferta.findAll({
        include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigo', 'precioVenta'], paranoid: false }],
        order: [['createdAt', 'DESC']],
      });
      return ofertas.map(o => o.toJSON());
    } catch (e) {
      console.error('[ofertas] get-ofertas:', e);
      return [];
    }
  });

  // ── Oferta activa para un producto hoy ───────────────────────────
  ipcMain.handle('get-oferta-activa', async (_e, productoId) => {
    try {
      return await getOfertaActiva(Oferta, productoId);
    } catch (e) {
      console.error('[ofertas] get-oferta-activa:', e);
      return null;
    }
  });

  // ── Guardar (crear o editar) ──────────────────────────────────────
  ipcMain.handle('guardar-oferta', async (_e, data) => {
    const t = await sequelize.transaction();
    try {
      const ALLOWED = ['id', 'ProductoId', 'tipo', 'valor', 'nombre', 'dias_semana', 'activa', 'fecha_inicio', 'fecha_fin'];
      const payload = Object.fromEntries(
        Object.entries(data || {}).filter(([k]) => ALLOWED.includes(k))
      );

      if (!payload.ProductoId) throw new Error('ProductoId es obligatorio.');

      const tiposValidos = ['porcentaje', '2x1', '3x2'];
      if (!tiposValidos.includes(payload.tipo)) {
        throw new Error(`Tipo de oferta inválido: "${payload.tipo}".`);
      }
      if (payload.tipo === 'porcentaje') {
        const v = Number(payload.valor);
        if (!Number.isFinite(v) || v <= 0 || v >= 100) {
          throw new Error('El porcentaje debe ser un número entre 1 y 99.');
        }
        payload.valor = v;
      } else {
        payload.valor = null;
      }

      if (!payload.fecha_inicio) payload.fecha_inicio = null;
      if (!payload.fecha_fin)    payload.fecha_fin    = null;

      // dias_semana: store as JSON string
      if (Array.isArray(payload.dias_semana)) {
        payload.dias_semana = payload.dias_semana.length > 0
          ? JSON.stringify(payload.dias_semana.map(Number))
          : null;
      }

      if (payload.activa === undefined) payload.activa = true;

      const productoExiste = await Producto.findByPk(payload.ProductoId, { transaction: t });
      if (!productoExiste) throw new Error('El producto no existe.');

      if (payload.id) {
        const id = payload.id;
        delete payload.id;
        const [rows] = await Oferta.update(payload, { where: { id }, transaction: t });
        if (rows === 0) throw new Error('Oferta no encontrada.');
      } else {
        await Oferta.create(payload, { transaction: t });
      }

      await t.commit();
      return { success: true };
    } catch (e) {
      await t.rollback();
      console.error('[ofertas] guardar-oferta:', e);
      return { success: false, message: e.message };
    }
  });

  // ── Toggle activa ────────────────────────────────────────────────
  ipcMain.handle('toggle-oferta-activa', async (_e, ofertaId) => {
    try {
      const [rows] = await Oferta.update(
        { activa: sequelize.literal('CASE WHEN activa = 1 THEN 0 ELSE 1 END') },
        { where: { id: ofertaId } }
      );
      if (rows === 0) return { success: false, message: 'Oferta no encontrada.' };
      return { success: true };
    } catch (e) {
      console.error('[ofertas] toggle-oferta-activa:', e);
      return { success: false, message: e.message };
    }
  });

  // ── Eliminar ─────────────────────────────────────────────────────
  ipcMain.handle('eliminar-oferta', async (_e, ofertaId) => {
    try {
      const rows = await Oferta.destroy({ where: { id: ofertaId } });
      return rows > 0 ? { success: true } : { success: false, message: 'Oferta no encontrada.' };
    } catch (e) {
      console.error('[ofertas] eliminar-oferta:', e);
      return { success: false, message: e.message };
    }
  });
}

module.exports = { registerOfertasHandlers, getOfertaActiva, calcularLineaConOferta };
