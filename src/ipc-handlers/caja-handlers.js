// src/ipc-handlers/caja-handlers.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");

function registerCajaHandlers(models, sequelize) {
  const { ArqueoCaja, Venta, Usuario } = models;

  // -----------------------------
  // Helpers
  // -----------------------------
  const now = () => new Date();

  // Dada un arqueo, calcula ventana [inicio, fin) para sumar ventas:
  // fin = próxima apertura si existe, sino fechaCierre si ya cerró, sino ahora.
  // t is an optional Sequelize transaction (used inside cerrar-caja to avoid phantom reads).
  async function obtenerVentanaArqueo(arqueo, t = null) {
    const siguiente = await ArqueoCaja.findOne({
      where: { fechaApertura: { [Op.gt]: arqueo.fechaApertura } },
      order: [["fechaApertura", "ASC"]],
      attributes: ["fechaApertura"],
      raw: true,
      transaction: t,
    });
    const inicio = arqueo.fechaApertura;
    const fin = siguiente?.fechaApertura || arqueo.fechaCierre || now();
    return { inicio, fin };
  }

  // H-3: Maps stored metodoPago strings to canonical allowlist values.
  // Handles legacy data with accent variations (e.g. "Debito" → "Débito").
  // Throws on any value that cannot be recognized — silent exclusion from
  // totals is a financial error and must not be allowed.
  function normalizarMetodoPago(s) {
    if (!s) throw new Error('normalizarMetodoPago: metodoPago nulo o vacío.');
    const t = String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes("efectivo")) return "Efectivo";
    if (t.includes("debito")) return "Débito";
    if (t.includes("credito")) return "Crédito";
    if (t.includes("qr") || t.includes("mercado") || t.includes("mp")) return "QR";
    if (t.includes("transfer")) return "Transferencia";
    if (t.replace(/[\s._\-\/]/g, "").includes("ctacte")) return "CtaCte";
    throw new Error(
      `Método de pago desconocido en registro existente: "${s}". ` +
      'Solo se aceptan: Efectivo, Débito, Crédito, QR, Transferencia, CtaCte.'
    );
  }

  // H-3: Aggregates sale totals by canonical payment method.
  // Now includes Transferencia and CtaCte (previously missing from totals).
  function agregarTotalesPorMetodo(ventas) {
    let totalEfectivo = 0,
      totalDebito = 0,
      totalCredito = 0,
      totalQR = 0,
      totalTransfer = 0,
      totalCtaCte = 0;

    for (const v of ventas) {
      const m = normalizarMetodoPago(v.metodoPago);
      const x = Number(v.total) || 0;
      if (m === "Efectivo") totalEfectivo += x;
      else if (m === "Débito") totalDebito += x;
      else if (m === "Crédito") totalCredito += x;
      else if (m === "QR") totalQR += x;
      else if (m === "Transferencia") totalTransfer += x;
      else if (m === "CtaCte") totalCtaCte += x;
    }
    return { totalEfectivo, totalDebito, totalCredito, totalQR, totalTransfer, totalCtaCte };
  }

  // -----------------------------
  // Estado de caja
  // -----------------------------
  ipcMain.handle("get-estado-caja", async () => {
    try {
      const cajaAbierta = await ArqueoCaja.findOne({
        where: { estado: "ABIERTA" },
        order: [["fechaApertura", "DESC"]],
        raw: true,
      });
      return { cajaAbierta: cajaAbierta || null };
    } catch (error) {
      console.error("Error al obtener estado de caja:", error);
      return { success: false, message: error.message, error: true };
    }
  });

  // Abrir caja
  ipcMain.handle("abrir-caja", async (_event, { montoInicial, usuarioId }) => {
    try {
      const existente = await ArqueoCaja.findOne({ where: { estado: "ABIERTA" } });
      if (existente) {
        return {
          success: false,
          message: "Ya existe una caja abierta. Debe cerrarla antes de abrir una nueva.",
        };
      }
      const nuevoArqueo = await ArqueoCaja.create({
        montoInicial: Number(montoInicial) || 0,
        UsuarioId: usuarioId,
      });
      return { success: true, arqueo: nuevoArqueo.toJSON() };
    } catch (error) {
      console.error("Error al abrir caja:", error);
      return { success: false, message: error.message, error: true };
    }
  });

  // Historial de cierres (listado) — M-1: supports optional limit/offset pagination
  ipcMain.handle("get-all-cierres-caja", async (_event, opts) => {
    const { limit, offset } = opts || {};
    try {
      const cierres = await ArqueoCaja.findAll({
        where: { estado: "CERRADA" },
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["nombre"],
          },
        ],
        order: [["fechaCierre", "DESC"]],
        ...(limit != null && { limit: Number(limit) }),
        ...(offset != null && { offset: Number(offset) }),
      });
      return cierres.map((c) => c.toJSON());
    } catch (error) {
      console.error("Error en 'get-all-cierres-caja':", error);
      return [];
    }
  });

  // Pre-calcular resumen de cierre (sin cerrar aún)
  ipcMain.handle("get-resumen-cierre", async (_event, arqueoId) => {
    try {
      const arqueo = await ArqueoCaja.findByPk(arqueoId);
      if (!arqueo) return { success: false, message: "Arqueo no encontrado." };

      const { inicio, fin } = await obtenerVentanaArqueo(arqueo);

      const ventas = await Venta.findAll({
        where: { createdAt: { [Op.gte]: inicio, [Op.lt]: fin } },
        attributes: ["metodoPago", "total"],
        raw: true,
      });

      const {
        totalEfectivo,
        totalDebito,
        totalCredito,
        totalQR,
        totalTransfer,
        totalCtaCte,
      } = agregarTotalesPorMetodo(ventas);

      const montoEstimado = (Number(arqueo.montoInicial) || 0) + totalEfectivo;

      return {
        success: true,
        resumen: {
          montoInicial: Number(arqueo.montoInicial) || 0,
          totalEfectivo,
          totalDebito,
          totalCredito,
          totalQR,
          totalTransfer,
          totalCtaCte,
          montoEstimado,
          desde: inicio,
          hasta: fin,
        },
      };
    } catch (error) {
      console.error("Error en 'get-resumen-cierre':", error);
      return { success: false, message: error.message, error: true };
    }
  });

  // H-4: cerrar-caja is now fully transactional.
  // All reads (arqueo, ventas) and the final write (arqueo.save) run inside a
  // single transaction with a single timestamp. This eliminates the race where
  // a venta registered between Venta.findAll and arqueo.save would be excluded
  // from the stored totals.
  ipcMain.handle("cerrar-caja", async (_event, { arqueoId, montoFinalReal, observaciones }) => {
    let resultado;
    try {
      await sequelize.transaction(async (t) => {
        const arqueo = await ArqueoCaja.findByPk(arqueoId, { transaction: t, lock: true });
        if (!arqueo || arqueo.estado === "CERRADA") {
          throw new Error("El arqueo no existe o ya fue cerrado.");
        }

        // Single timestamp used for both the query window and fechaCierre.
        // Prevents the split-brain where two different "now()" calls produce
        // slightly different cutoffs.
        const fechaCierre = new Date();

        const { inicio } = await obtenerVentanaArqueo(arqueo, t);

        const ventas = await Venta.findAll({
          where: { createdAt: { [Op.gte]: inicio, [Op.lt]: fechaCierre } },
          attributes: ["metodoPago", "total"],
          raw: true,
          transaction: t,
        });

        const {
          totalEfectivo,
          totalDebito,
          totalCredito,
          totalQR,
          totalTransfer,
          totalCtaCte,
        } = agregarTotalesPorMetodo(ventas);

        const montoEstimado = (Number(arqueo.montoInicial) || 0) + totalEfectivo;

        arqueo.fechaCierre = fechaCierre;
        arqueo.totalVentasEfectivo = totalEfectivo;
        arqueo.totalVentasDebito = totalDebito;
        arqueo.totalVentasCredito = totalCredito;
        arqueo.totalVentasQR = totalQR;
        arqueo.totalVentasTransferencia = totalTransfer;
        arqueo.totalVentasCtaCte = totalCtaCte;
        arqueo.montoFinalEstimado = montoEstimado;
        arqueo.montoFinalReal = Number(montoFinalReal) || 0;
        arqueo.diferencia = (Number(montoFinalReal) || 0) - montoEstimado;
        arqueo.observaciones = observaciones || null;
        arqueo.estado = "CERRADA";

        await arqueo.save({ transaction: t });
        resultado = arqueo.toJSON();
      });

      return { success: true, resultado };
    } catch (error) {
      console.error("Error al cerrar caja:", error);
      return { success: false, message: error.message, error: true };
    }
  });
}

module.exports = { registerCajaHandlers };
