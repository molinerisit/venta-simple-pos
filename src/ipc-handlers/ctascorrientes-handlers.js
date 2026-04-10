// src/ipc-handlers/ctascorrientes-handlers.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");
const { getActiveUserId } = require("./session-handlers");

function registerCtascorrientesHandlers(models, sequelize) {
  const { Cliente, Proveedor, MovimientoCuentaCorriente } = models;

  // --- Clientes con deuda > 0 (paginado opcional) ---
  ipcMain.handle("get-clientes-con-deuda", async (_e, { page = 1, pageSize = 100 } = {}) => {
    try {
      page = Math.max(1, parseInt(page));
      pageSize = Math.min(500, Math.max(1, parseInt(pageSize)));

      const { rows, count } = await Cliente.findAndCountAll({
        where: { deuda: { [Op.gt]: 0 } },
        order: [
          ["apellido", "ASC"],
          ["nombre", "ASC"],
        ],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        raw: true,
      });
      return { success: true, data: rows, total: count, page, pageSize };
    } catch (error) {
      console.error("Error al obtener clientes con deuda:", error);
      return { success: false, message: error.message };
    }
  });

  // --- Proveedores con deuda > 0 ---
  // W3-H3: Added default limit of 500 to prevent unbounded query.
  ipcMain.handle("get-proveedores-con-deuda", async (_e, { limit = 500 } = {}) => {
    try {
      const safeLimit = Math.min(500, Math.max(1, parseInt(limit) || 500));
      const proveedores = await Proveedor.findAll({
        where: { deuda: { [Op.gt]: 0 } },
        order: [["nombreEmpresa", "ASC"]],
        limit: safeLimit,
        raw: true,
      });
      return { success: true, data: proveedores };
    } catch (error) {
      console.error("Error al obtener proveedores con deuda:", error);
      return { success: false, message: error.message };
    }
  });

  // --- Resumen rápido (totales) ---
  ipcMain.handle("get-ctacte-resumen", async () => {
    try {
      const totalClientes = await Cliente.sum("deuda");
      const totalProveedores = await Proveedor.sum("deuda");
      return {
        success: true,
        data: {
          totalDeudaClientes: totalClientes || 0,
          totalDeudaProveedores: totalProveedores || 0,
        },
      };
    } catch (error) {
      console.error("Error en resumen ctas ctes:", error);
      return { success: false, message: error.message };
    }
  });

  // --- Registrar pago de un cliente (disminuye deuda del cliente) ---
  // W3-H6: Session guard — requires active server-side session before mutating financial data.
  ipcMain.handle("registrar-pago-cliente", async (_event, { clienteId, monto, concepto }) => {
    if (!getActiveUserId()) return { success: false, message: "Sesión no activa." };
    const t = await sequelize.transaction();
    try {
      const m = Number(monto);
      if (!clienteId || !(m > 0)) throw new Error("Datos de pago inválidos.");
      // W3-L7: Truncate concepto to 500 chars to prevent unbounded data storage.
      const conceptoSafe = concepto ? String(concepto).slice(0, 500) : "Pago en caja";

      const cliente = await Cliente.findByPk(clienteId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!cliente) throw new Error("Cliente no encontrado.");

      const saldoAnterior = Number(cliente.deuda) || 0;
      const by = Math.min(saldoAnterior, m); // no bajar de cero
      const saldoNuevo = Math.max(0, saldoAnterior - by);

      // Actualizar atómicamente
      await Cliente.update(
        { deuda: saldoNuevo },
        { where: { id: cliente.id }, transaction: t }
      );

      // Registrar movimiento si el modelo existe
      if (MovimientoCuentaCorriente) {
        await MovimientoCuentaCorriente.create(
          {
            fecha: new Date(),
            tipo: "CREDITO", // pago que reduce deuda
            monto: by,
            concepto: conceptoSafe,
            saldoAnterior,
            saldoNuevo,
            ClienteId: cliente.id,
          },
          { transaction: t }
        );
      }

      await t.commit();
      return { success: true, message: "Pago registrado con éxito." };
    } catch (error) {
      await t.rollback();
      console.error("Error al registrar pago de cliente:", error);
      return { success: false, message: error.message };
    }
  });

  // --- Registrar abono a proveedor (disminuye deuda con proveedor) ---
  // W3-H6: Session guard — requires active server-side session before mutating financial data.
  ipcMain.handle("registrar-abono-proveedor", async (_event, { proveedorId, monto, concepto }) => {
    if (!getActiveUserId()) return { success: false, message: "Sesión no activa." };
    const t = await sequelize.transaction();
    try {
      const m = Number(monto);
      if (!proveedorId || !(m > 0)) throw new Error("Datos de abono inválidos.");

      const prov = await Proveedor.findByPk(proveedorId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!prov) throw new Error("Proveedor no encontrado.");

      const saldoAnterior = Number(prov.deuda) || 0;
      const by = Math.min(saldoAnterior, m);
      const saldoNuevo = Math.max(0, saldoAnterior - by);

      await Proveedor.update(
        { deuda: saldoNuevo },
        { where: { id: prov.id }, transaction: t }
      );

      // (Si tuvieses una tabla de movimientos para proveedores, registrala acá)

      await t.commit();
      return { success: true, message: "Abono registrado con éxito." };
    } catch (error) {
      await t.rollback();
      console.error("Error al registrar abono a proveedor:", error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = { registerCtascorrientesHandlers };
