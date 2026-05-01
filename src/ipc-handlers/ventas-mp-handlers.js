// src/ipc-handlers/ventas-mp-handlers.js
// IPC handlers for linking Mercado Pago payments to local ventas.
const { ipcMain } = require('electron');
const { Op }      = require('sequelize');

// ─── helpers ────────────────────────────────────────────────────────────────

function computeEstadoCliente(lastPurchaseDate) {
  if (!lastPurchaseDate) return 'inactivo';
  const daysSince = (Date.now() - new Date(lastPurchaseDate).getTime()) / 86400000;
  if (daysSince <= 30)  return 'activo';
  if (daysSince <= 90)  return 'en_riesgo';
  return 'inactivo';
}

/**
 * Map a Mercado Pago payment_type_id / payment_method_id to the set of
 * compatible local metodoPago values.
 */
function mpMethodCompatible(mpPaymentTypeId, mpPaymentMethodId) {
  const type   = String(mpPaymentTypeId   || '').toLowerCase();
  const method = String(mpPaymentMethodId || '').toLowerCase();

  if (method === 'qr' || type === 'qr')                       return ['QR'];
  if (type === 'bank_transfer')                                return ['Transferencia'];
  if (type === 'credit_card')                                  return ['Crédito'];
  if (type === 'debit_card')                                   return ['Débito'];
  if (method === 'account_money')                              return ['QR', 'Transferencia'];
  return [];
}

// ─── scoring ─────────────────────────────────────────────────────────────────

/**
 * Score a local Venta candidate against a Mercado Pago payment.
 * Returns { score, reasons }.
 */
function scoreCandidate(venta, payment) {
  let score    = 0;
  const reasons = [];

  // Amount match
  const amountDiff = Math.abs((venta.total || 0) - (payment.transaction_amount || 0));
  if (amountDiff < 0.01) {
    score += 40;
    reasons.push('monto_exacto');
  }

  // Time proximity
  const paymentDate = new Date(payment.date_created);
  const ventaDate   = new Date(venta.createdAt);
  const diffMs      = Math.abs(paymentDate.getTime() - ventaDate.getTime());
  const diffMin     = diffMs / 60000;

  if (diffMin < 5) {
    score += 30;
    reasons.push('tiempo_<5min');
  } else if (diffMin < 15) {
    score += 15;
    reasons.push('tiempo_<15min');
  } else if (diffMin < 30) {
    score += 5;
    reasons.push('tiempo_<30min');
  }

  // Payment method compatibility
  const compatible = mpMethodCompatible(
    payment.payment_type_id,
    payment.payment_method_id
  );
  if (compatible.length > 0 && compatible.includes(venta.metodoPago)) {
    score += 20;
    reasons.push('metodo_compatible');
  }

  return { score, reasons };
}

// ─── register ─────────────────────────────────────────────────────────────────

function registerVentasMpHandlers(models, sequelize) {
  const { Venta, DetalleVenta, Cliente } = models;

  // ── Internal helper: recompute Cliente MP stats from linked Ventas ──────────

  async function updateClienteStats(clienteId) {
    const ventas = await Venta.findAll({
      where: { ClienteId: clienteId },
      attributes: ['total', 'createdAt'],
      raw: true,
    });

    if (!ventas.length) return;

    const totalGastado = ventas.reduce((acc, v) => acc + (v.total || 0), 0);
    const cantidad     = ventas.length;
    const dates        = ventas.map(v => new Date(v.createdAt));
    const ultimaCompra = new Date(Math.max(...dates));

    await Cliente.update(
      {
        totalCompradoMP:   totalGastado,
        cantidadComprasMP: cantidad,
        ultimaCompraMP:    ultimaCompra,
        estadoCliente:     computeEstadoCliente(ultimaCompra),
      },
      { where: { id: clienteId } }
    );
  }

  // ── match-mp-to-venta ────────────────────────────────────────────────────────
  // Receives a full MP payment object, returns ranked local venta candidates.
  //
  // payment shape (relevant fields):
  //   { id, date_created, transaction_amount, payment_type_id, payment_method_id, status }

  ipcMain.handle('match-mp-to-venta', async (_event, payment) => {
    try {
      if (!payment || !payment.date_created) {
        return { candidates: [], autoLink: null };
      }

      const paymentDate = new Date(payment.date_created);
      const windowStart = new Date(paymentDate.getTime() - 2 * 60 * 60 * 1000); // -2h
      const windowEnd   = new Date(paymentDate.getTime() + 2 * 60 * 60 * 1000); // +2h

      const ventasCandidatas = await Venta.findAll({
        where: {
          createdAt:    { [Op.between]: [windowStart, windowEnd] },
          mpPaymentId:  { [Op.is]: null },
        },
        include: [
          {
            model: DetalleVenta,
            as:    'detalles',
            attributes: ['nombreProducto', 'cantidad'],
            required: false,
          },
        ],
      });

      const scored = ventasCandidatas
        .map(venta => {
          const { score, reasons } = scoreCandidate(venta, payment);

          // Top 3 product names from detalles
          const detalles  = venta.detalles || [];
          const productos = detalles
            .slice(0, 3)
            .map(d => d.nombreProducto)
            .filter(Boolean);

          return {
            ventaId:     venta.id,
            total:       venta.total,
            metodoPago:  venta.metodoPago,
            createdAt:   venta.createdAt,
            productos,
            score,
            reasons,
          };
        })
        .filter(c => c.score >= 50)
        .sort((a, b) => b.score - a.score);

      const autoLink = scored.length > 0 && scored[0].score >= 80 ? scored[0] : null;

      return { candidates: scored, autoLink };
    } catch (err) {
      console.error('[match-mp-to-venta] Error:', err.message);
      return { candidates: [], autoLink: null };
    }
  });

  // ── link-venta-to-mp ─────────────────────────────────────────────────────────
  // Persists the link between a local venta and an MP payment.
  //
  // args: { ventaId, paymentId, paymentStatus, paymentMethod, confidence, clienteId? }

  ipcMain.handle('link-venta-to-mp', async (_event, args) => {
    const { ventaId, paymentId, paymentStatus, paymentMethod, confidence, clienteId } = args || {};

    if (!ventaId || !paymentId) {
      return { success: false, message: 'ventaId y paymentId son obligatorios.' };
    }

    try {
      const venta = await Venta.findByPk(ventaId);
      if (!venta) {
        return { success: false, message: `Venta ${ventaId} no encontrada.` };
      }

      const updatePayload = {
        mpPaymentId:         String(paymentId),
        mpTransactionStatus: paymentStatus  || null,
        mpPaymentMethod:     paymentMethod  || null,
        mpMatchedAt:         new Date(),
        mpMatchConfidence:   Number.isFinite(+confidence) ? +confidence : null,
      };

      if (clienteId) {
        updatePayload.ClienteId = clienteId;
      }

      await venta.update(updatePayload);

      // Refresh cliente stats if a cliente is linked
      const effectiveClienteId = clienteId || venta.ClienteId;
      if (effectiveClienteId) {
        await updateClienteStats(effectiveClienteId);
      }

      return { success: true, ventaId };
    } catch (err) {
      console.error('[link-venta-to-mp] Error:', err.message);
      return { success: false, message: err.message };
    }
  });

  // ── unlink-venta-from-mp ─────────────────────────────────────────────────────
  // Clears all MP fields on a venta.

  ipcMain.handle('unlink-venta-from-mp', async (_event, ventaId) => {
    if (!ventaId) return { success: false, message: 'ventaId es obligatorio.' };

    try {
      const venta = await Venta.findByPk(ventaId);
      if (!venta) return { success: false, message: `Venta ${ventaId} no encontrada.` };

      await venta.update({
        mpPaymentId:         null,
        mpTransactionStatus: null,
        mpPaymentMethod:     null,
        mpMatchedAt:         null,
        mpMatchConfidence:   null,
      });

      return { success: true };
    } catch (err) {
      console.error('[unlink-venta-from-mp] Error:', err.message);
      return { success: false, message: err.message };
    }
  });

  // ── get-linked-mp-payments ───────────────────────────────────────────────────
  // Returns a map of { [mpPaymentId]: { ventaId, confidence, clienteId } }
  // for all ventas that have an MP payment linked.

  ipcMain.handle('get-linked-mp-payments', async () => {
    try {
      const ventas = await Venta.findAll({
        where: {
          mpPaymentId: { [Op.not]: null },
        },
        attributes: ['id', 'mpPaymentId', 'mpMatchConfidence', 'ClienteId'],
        raw: true,
      });

      const result = {};
      for (const v of ventas) {
        result[v.mpPaymentId] = {
          ventaId:    v.id,
          confidence: v.mpMatchConfidence,
          clienteId:  v.ClienteId,
        };
      }

      return result;
    } catch (err) {
      console.error('[get-linked-mp-payments] Error:', err.message);
      return {};
    }
  });

  // ── get-cliente-mp-history ───────────────────────────────────────────────────
  // Returns purchase history and computed stats for a given clienteId.

  ipcMain.handle('get-cliente-mp-history', async (_event, clienteId) => {
    if (!clienteId) return null;

    try {
      const ventas = await Venta.findAll({
        where: { ClienteId: clienteId },
        include: [
          {
            model: DetalleVenta,
            as:    'detalles',
            attributes: ['nombreProducto', 'cantidad', 'subtotal'],
            required: false,
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      if (!ventas.length) return null;

      let totalGastado = 0;
      const productMap  = {}; // nombreProducto → { cantidad, subtotal }
      const methodCount = {};
      let   ultimaCompra = null;

      for (const v of ventas) {
        totalGastado += v.total || 0;

        const vDate = new Date(v.createdAt);
        if (!ultimaCompra || vDate > ultimaCompra) ultimaCompra = vDate;

        // Method frequency
        methodCount[v.metodoPago] = (methodCount[v.metodoPago] || 0) + 1;

        // Aggregate products
        for (const d of v.detalles || []) {
          const key = d.nombreProducto;
          if (!key) continue;
          if (!productMap[key]) productMap[key] = { cantidad: 0, subtotal: 0 };
          productMap[key].cantidad += d.cantidad || 0;
          productMap[key].subtotal += d.subtotal || 0;
        }
      }

      const cantidadCompras   = ventas.length;
      const ticketPromedio    = cantidadCompras > 0 ? totalGastado / cantidadCompras : 0;

      // Top 5 products by total quantity sold
      const topProductos = Object.entries(productMap)
        .sort((a, b) => b[1].cantidad - a[1].cantidad)
        .slice(0, 5)
        .map(([nombre, stats]) => ({ nombre, cantidad: stats.cantidad, subtotal: stats.subtotal }));

      // Most used payment method
      const metodoPagoPreferido = Object.entries(methodCount)
        .sort((a, b) => b[1] - a[1])
        .map(([metodo]) => metodo)[0] || null;

      return {
        clienteId,
        totalGastado,
        cantidadCompras,
        ticketPromedio,
        ultimaCompra,
        topProductos,
        metodoPagoPreferido,
      };
    } catch (err) {
      console.error('[get-cliente-mp-history] Error:', err.message);
      return null;
    }
  });
}

module.exports = { registerVentasMpHandlers };
