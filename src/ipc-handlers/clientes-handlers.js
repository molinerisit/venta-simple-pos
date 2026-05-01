// src/ipc-handlers/clientes-handlers.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");

function registerClientesHandlers(models) {
  const { Cliente, MpSyncLog } = models;

  const normDni = (dni) => String(dni || "").replace(/\D+/g, "").trim();

  // ─── helpers ────────────────────────────────────────────────────────────────

  function normalizePaymentMethod(tx) {
    const desc    = String(tx.description || tx.external_reference || '').toUpperCase();
    const methodId = String(tx.payment_method_id || '').toLowerCase();
    const typeId   = String(tx.payment_type_id   || '').toLowerCase();

    if (desc.includes('QR') || (methodId === 'account_money' && desc.includes('QR'))) return 'qr';
    if (typeId === 'bank_transfer')                         return 'transferencia';
    if (typeId === 'credit_card' || typeId === 'debit_card') return 'tarjeta';
    if (methodId === 'account_money')                       return 'dineroCuenta';
    return 'otro';
  }

  function normalizePayer(tx) {
    const payer = tx.payer || {};
    if (payer.first_name && String(payer.first_name).trim()) {
      const displayName = [payer.first_name, payer.last_name]
        .filter(Boolean).map(s => String(s).trim()).join(' ');
      return { displayName, email: payer.email || null, payerId: String(payer.id || '') };
    }
    if (payer.email) {
      const prefix = payer.email.split('@')[0];
      const cleaned = prefix
        .replace(/[._\-]/g, ' ')
        .replace(/\s+\d+$/, '')
        .split(' ').filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ').trim();
      return { displayName: cleaned || 'Cliente', email: payer.email, payerId: String(payer.id || '') };
    }
    return { displayName: 'Cliente sin identificar', email: null, payerId: String(payer.id || '') };
  }

  // ─── List / Search ───────────────────────────────────────────────────────────

  ipcMain.handle("get-clientes", async (_event, opts) => {
    try {
      const limit  = Math.min(500, Math.max(1, parseInt(opts?.limit)  || 500));
      const offset = Math.max(0, parseInt(opts?.offset) || 0);
      return await Cliente.findAll({
        attributes: [
          "id", "dni", "nombre", "apellido", "descuento", "deuda",
          "email", "telefono", "origenCliente", "mercadoPagoPayerId",
          "ultimaCompraMP", "totalCompradoMP", "cantidadComprasMP",
          "createdAt", "updatedAt",
        ],
        order: [["nombre", "ASC"]],
        limit,
        offset,
        raw: true,
      });
    } catch (error) {
      console.error("Error al obtener clientes:", error);
      return [];
    }
  });

  ipcMain.handle("search-clientes", async (_event, { q = "", page = 1, pageSize = 50 } = {}) => {
    try {
      const where = {};
      const term  = String(q || "").trim();
      if (term) {
        const like = `%${term}%`;
        where[Op.or] = [
          { nombre:   { [Op.like]: like } },
          { apellido: { [Op.like]: like } },
          { dni:      { [Op.like]: like } },
          { email:    { [Op.like]: like } },
        ];
      }
      page     = Math.max(1, parseInt(page));
      pageSize = Math.min(200, Math.max(1, parseInt(pageSize)));

      const { rows, count } = await Cliente.findAndCountAll({
        where,
        attributes: ["id", "dni", "nombre", "apellido", "descuento", "deuda", "email", "origenCliente", "createdAt", "updatedAt"],
        order: [["nombre", "ASC"]],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        raw: true,
      });
      return { items: rows, total: count, page, pageSize };
    } catch (error) {
      console.error("Error en search-clientes:", error);
      return { items: [], total: 0, page: 1, pageSize: 50 };
    }
  });

  ipcMain.handle("get-cliente-by-id", async (_event, id) => {
    if (!id) return null;
    try {
      const c = await Cliente.findByPk(id, { raw: true });
      return c || null;
    } catch (error) {
      console.error("Error en get-cliente-by-id:", error);
      return null;
    }
  });

  ipcMain.handle("get-cliente-by-dni", async (_event, dni) => {
    const clean = normDni(dni);
    if (!clean) return null;
    try {
      return await Cliente.findOne({
        where: { dni: clean },
        attributes: ["id", "dni", "nombre", "apellido", "descuento", "deuda"],
        raw: true,
      });
    } catch (error) {
      console.error("Error al buscar cliente por DNI:", error);
      return null;
    }
  });

  // ─── Create / Update ────────────────────────────────────────────────────────

  ipcMain.handle("guardar-cliente", async (_event, clienteData) => {
    try {
      const { id } = clienteData || {};
      const origen     = String(clienteData?.origenCliente || 'manual');
      const nombre     = String(clienteData?.nombre    || "").trim();
      const apellido   = String(clienteData?.apellido  || "").trim() || null;
      const descuento  = Number.isFinite(+clienteData?.descuento) ? +clienteData.descuento : 0;
      const email      = String(clienteData?.email    || "").trim() || null;
      const telefono   = String(clienteData?.telefono || "").trim() || null;
      const dni        = normDni(clienteData?.dni) || null;

      if (!nombre) {
        return { success: false, message: "El Nombre es obligatorio." };
      }
      // DNI required only for manual origin
      if (origen === 'manual' && !dni) {
        return { success: false, message: "El DNI es obligatorio para clientes manuales." };
      }
      if (descuento < 0 || descuento > 100) {
        return { success: false, message: "El descuento debe estar entre 0 y 100." };
      }

      const payload = { nombre, apellido, descuento, email, telefono, origenCliente: origen };
      if (dni) payload.dni = dni;

      if (id) {
        const found = await Cliente.findByPk(id);
        if (!found) return { success: false, message: "El cliente a actualizar no fue encontrado." };

        if (dni && found.dni !== dni) {
          const dup = await Cliente.findOne({ where: { dni }, attributes: ["id"], raw: true });
          if (dup) return { success: false, message: "El DNI ingresado ya existe." };
        }
        if (email && found.email !== email) {
          const dup = await Cliente.findOne({ where: { email }, attributes: ["id"], raw: true });
          if (dup) return { success: false, message: "El email ingresado ya existe." };
        }
        await found.update(payload);
      } else {
        if (email) {
          const dup = await Cliente.findOne({ where: { email }, attributes: ["id"], raw: true });
          if (dup) return { success: false, message: "El email ingresado ya existe." };
        }
        await Cliente.create(payload);
      }

      return { success: true };
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError") {
        const field = error.fields?.dni ? "DNI" : error.fields?.email ? "email" : "dato";
        return { success: false, message: `El ${field} ingresado ya existe.` };
      }
      console.error("Error al guardar cliente:", error);
      return { success: false, message: "Ocurrió un error inesperado al guardar el cliente." };
    }
  });

  ipcMain.handle("eliminar-cliente", async (_event, clienteId) => {
    try {
      const result = await Cliente.destroy({ where: { id: clienteId } });
      return result > 0
        ? { success: true }
        : { success: false, message: "No se encontró el cliente para eliminar." };
    } catch (error) {
      console.error("Error al eliminar cliente:", error);
      return { success: false, message: "Error en la base de datos." };
    }
  });

  // ─── Mercado Pago integration ────────────────────────────────────────────────

  // Returns maps for quick lookup: byPayerId and byEmail → clienteId
  ipcMain.handle("get-mp-known-payers", async () => {
    try {
      const clientes = await Cliente.findAll({
        where: {
          [Op.or]: [
            { mercadoPagoPayerId: { [Op.not]: null } },
            { email: { [Op.not]: null } },
          ],
        },
        attributes: ["id", "mercadoPagoPayerId", "email"],
        raw: true,
      });

      const byPayerId = {};
      const byEmail   = {};
      for (const c of clientes) {
        if (c.mercadoPagoPayerId) byPayerId[c.mercadoPagoPayerId] = c.id;
        if (c.email)              byEmail[c.email.toLowerCase()]  = c.id;
      }
      return { byPayerId, byEmail };
    } catch (error) {
      console.error("Error en get-mp-known-payers:", error);
      return { byPayerId: {}, byEmail: {} };
    }
  });

  // Create a single client from an MP transaction (user initiated, from modal)
  ipcMain.handle("guardar-cliente-desde-mp", async (_event, data) => {
    try {
      const nombre    = String(data?.nombre    || "").trim();
      const email     = String(data?.email     || "").trim() || null;
      const telefono  = String(data?.telefono  || "").trim() || null;
      const dni       = normDni(data?.dni) || null;
      const descuento = Number.isFinite(+data?.descuento) ? +data.descuento : 0;
      const payerId   = String(data?.mercadoPagoPayerId || "").trim() || null;

      if (!nombre) return { success: false, message: "El nombre es obligatorio." };
      if (descuento < 0 || descuento > 100) return { success: false, message: "El descuento debe estar entre 0 y 100." };

      // Check for existing
      let existing = null;
      if (payerId) existing = await Cliente.findOne({ where: { mercadoPagoPayerId: payerId }, raw: true });
      if (!existing && email) existing = await Cliente.findOne({ where: { email }, raw: true });

      if (existing) return { success: false, exists: true, clienteId: existing.id };

      const payload = {
        nombre, apellido: null, email, telefono, descuento,
        origenCliente: 'mercado_pago',
        mercadoPagoPayerId: payerId,
        primeraCompraMP: new Date(),
        ultimaCompraMP:  new Date(),
      };
      if (dni) payload.dni = dni;

      const created = await Cliente.create(payload);
      return { success: true, clienteId: created.id };
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError") {
        return { success: false, message: "Ya existe un cliente con ese DNI, email o ID de Mercado Pago." };
      }
      console.error("Error en guardar-cliente-desde-mp:", error);
      return { success: false, message: "Error inesperado al guardar el cliente." };
    }
  });

  // Bulk sync: process all approved/authorized transactions into clientes
  ipcMain.handle("sync-mp-to-clientes", async (_event, transactions) => {
    if (!Array.isArray(transactions)) return { success: false, message: "Datos inválidos." };

    let created = 0;
    let updated = 0;
    const errors = [];

    const eligible = transactions.filter(tx =>
      tx.id && ['approved', 'authorized'].includes(tx.status)
    );

    for (const tx of eligible) {
      try {
        const paymentId = String(tx.id);

        // Idempotency check
        if (MpSyncLog) {
          const already = await MpSyncLog.findByPk(paymentId);
          if (already) continue;
        }

        const payer   = normalizePayer(tx);
        const medio   = normalizePaymentMethod(tx);
        const txDate  = tx.date_created ? new Date(tx.date_created) : new Date();
        const amount  = tx.transaction_amount || 0;

        // Find existing cliente
        let cliente = null;
        if (payer.payerId) {
          cliente = await Cliente.findOne({ where: { mercadoPagoPayerId: payer.payerId } });
        }
        if (!cliente && payer.email) {
          cliente = await Cliente.findOne({ where: { email: payer.email } });
        }

        if (cliente) {
          // Update stats
          const stats = cliente.paymentStats;
          if (stats[medio] !== undefined) stats[medio] += 1;
          else stats.otro += 1;

          await cliente.update({
            ultimaCompraMP:   txDate,
            totalCompradoMP:  (cliente.totalCompradoMP || 0) + amount,
            cantidadComprasMP:(cliente.cantidadComprasMP || 0) + 1,
            ultimoMedioPago:  medio,
            paymentStats:     stats,
            ...(payer.payerId && !cliente.mercadoPagoPayerId ? { mercadoPagoPayerId: payer.payerId } : {}),
            ...(payer.email && !cliente.email ? { email: payer.email } : {}),
          });
          updated++;
        } else {
          // Create new cliente
          const newStats = { qr: 0, transferencia: 0, tarjeta: 0, dineroCuenta: 0, otro: 0 };
          if (newStats[medio] !== undefined) newStats[medio] = 1;
          else newStats.otro = 1;

          const newCliente = {
            nombre:             payer.displayName,
            email:              payer.email,
            origenCliente:      'mercado_pago',
            mercadoPagoPayerId: payer.payerId || null,
            primeraCompraMP:    txDate,
            ultimaCompraMP:     txDate,
            totalCompradoMP:    amount,
            cantidadComprasMP:  1,
            ultimoMedioPago:    medio,
            paymentStats:       newStats,
            descuento:          0,
          };

          const c = await Cliente.create(newCliente);
          cliente = c;
          created++;
        }

        // Record in sync log
        if (MpSyncLog && cliente) {
          await MpSyncLog.upsert({ paymentId, clienteId: cliente.id, syncedAt: new Date() });
        }
      } catch (err) {
        console.error(`[sync-mp-to-clientes] Error en payment ${tx.id}:`, err.message);
        errors.push({ paymentId: tx.id, error: err.message });
      }
    }

    return { success: true, created, updated, errors };
  });
}

module.exports = { registerClientesHandlers };
