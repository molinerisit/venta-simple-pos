// src/ipc-handlers/caja-handlers.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");
const { getActiveUserId } = require("./session-handlers");

function registerCajaHandlers(models, sequelize) {
  const { ArqueoCaja, MovimientoCaja, Venta, Usuario } = models;

  // -----------------------------
  // Helpers
  // -----------------------------
  const now = () => new Date();

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

  function normalizarMetodoPago(s) {
    if (!s) throw new Error('normalizarMetodoPago: metodoPago nulo o vacío.');
    const t = String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes("efectivo")) return "Efectivo";
    if (t.includes("debito"))   return "Débito";
    if (t.includes("credito"))  return "Crédito";
    if (t.includes("qr") || t.includes("mercado") || t.includes("mp")) return "QR";
    if (t.includes("transfer")) return "Transferencia";
    if (t.replace(/[\s._\-\/]/g, "").includes("ctacte")) return "CtaCte";
    throw new Error(
      `Método de pago desconocido en registro existente: "${s}". ` +
      'Solo se aceptan: Efectivo, Débito, Crédito, QR, Transferencia, CtaCte.'
    );
  }

  function agregarTotalesPorMetodo(ventas) {
    let totalEfectivo = 0, totalDebito = 0, totalCredito = 0,
        totalQR = 0, totalTransfer = 0, totalCtaCte = 0;

    for (const v of ventas) {
      const m = normalizarMetodoPago(v.metodoPago);
      const x = Number(v.total) || 0;
      if      (m === "Efectivo")     totalEfectivo += x;
      else if (m === "Débito")       totalDebito   += x;
      else if (m === "Crédito")      totalCredito  += x;
      else if (m === "QR")           totalQR       += x;
      else if (m === "Transferencia") totalTransfer += x;
      else if (m === "CtaCte")       totalCtaCte   += x;
    }
    return { totalEfectivo, totalDebito, totalCredito, totalQR, totalTransfer, totalCtaCte };
  }

  // Suma ingresos y egresos de movimientos administrativos
  function calcularMovimientos(movimientos) {
    const totalIngresosExtra = movimientos
      .filter(m => m.tipo === 'INGRESO')
      .reduce((s, m) => s + (Number(m.monto) || 0), 0);
    const totalEgresosExtra = movimientos
      .filter(m => m.tipo === 'EGRESO')
      .reduce((s, m) => s + (Number(m.monto) || 0), 0);
    return { totalIngresosExtra, totalEgresosExtra };
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

  // Abrir caja (fondo de cambio)
  ipcMain.handle("abrir-caja", async (_event, { montoInicial } = {}) => {
    try {
      const sessionUserId = getActiveUserId();
      const monto = Number(montoInicial);
      if (Number.isFinite(monto) && monto < 0) {
        return { success: false, message: "El fondo de cambio no puede ser negativo.", error: true };
      }
      const montoSafe = Number.isFinite(monto) && monto >= 0 ? monto : 0;

      const existente = await ArqueoCaja.findOne({ where: { estado: "ABIERTA" } });
      if (existente) {
        return { success: false, message: "Ya existe una caja abierta. Debe cerrarla antes de abrir una nueva." };
      }
      const nuevoArqueo = await ArqueoCaja.create({
        montoInicial: montoSafe,
        UsuarioId: sessionUserId,
      });
      return { success: true, arqueo: nuevoArqueo.toJSON() };
    } catch (error) {
      console.error("Error al abrir caja:", error);
      return { success: false, message: error.message, error: true };
    }
  });

  // Historial de cierres
  ipcMain.handle("get-all-cierres-caja", async (_event, opts) => {
    const { limit, offset } = opts || {};
    try {
      const cierres = await ArqueoCaja.findAll({
        where: { estado: "CERRADA" },
        include: [{ model: Usuario, as: "usuario", attributes: ["nombre"] }],
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

  // Pre-calcular resumen de cierre (sin cerrar)
  // Fórmula: Efectivo Esperado = Fondo Inicial + Ventas Efectivo + Ingresos Extra − Egresos
  ipcMain.handle("get-resumen-cierre", async (_event, arqueoId) => {
    try {
      const arqueo = await ArqueoCaja.findByPk(arqueoId);
      if (!arqueo) return { success: false, message: "Arqueo no encontrado." };

      const { inicio, fin } = await obtenerVentanaArqueo(arqueo);

      const [ventas, movimientos] = await Promise.all([
        Venta.findAll({
          where: { createdAt: { [Op.gte]: inicio, [Op.lt]: fin } },
          attributes: ["metodoPago", "total"],
          raw: true,
        }),
        MovimientoCaja ? MovimientoCaja.findAll({
          where: { ArqueoCajaId: arqueoId },
          order: [["createdAt", "ASC"]],
          raw: true,
        }) : Promise.resolve([]),
      ]);

      const { totalEfectivo, totalDebito, totalCredito, totalQR, totalTransfer, totalCtaCte } =
        agregarTotalesPorMetodo(ventas);

      const { totalIngresosExtra, totalEgresosExtra } = calcularMovimientos(movimientos);

      const montoEstimado =
        (Number(arqueo.montoInicial) || 0) +
        totalEfectivo +
        totalIngresosExtra -
        totalEgresosExtra;

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
          totalIngresosExtra,
          totalEgresosExtra,
          movimientos,
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

  // Cerrar caja (transaccional)
  ipcMain.handle("cerrar-caja", async (_event, { arqueoId, montoFinalReal, observaciones }) => {
    let resultado;
    try {
      await sequelize.transaction(async (t) => {
        const arqueo = await ArqueoCaja.findByPk(arqueoId, { transaction: t, lock: true });
        if (!arqueo || arqueo.estado === "CERRADA") {
          throw new Error("El arqueo no existe o ya fue cerrado.");
        }

        const fechaCierre = new Date();
        const { inicio } = await obtenerVentanaArqueo(arqueo, t);

        const [ventas, movimientos] = await Promise.all([
          Venta.findAll({
            where: { createdAt: { [Op.gte]: inicio, [Op.lt]: fechaCierre } },
            attributes: ["metodoPago", "total"],
            raw: true,
            transaction: t,
          }),
          MovimientoCaja ? MovimientoCaja.findAll({
            where: { ArqueoCajaId: arqueoId },
            raw: true,
            transaction: t,
          }) : Promise.resolve([]),
        ]);

        const { totalEfectivo, totalDebito, totalCredito, totalQR, totalTransfer, totalCtaCte } =
          agregarTotalesPorMetodo(ventas);

        const { totalIngresosExtra, totalEgresosExtra } = calcularMovimientos(movimientos);

        const montoEstimado =
          (Number(arqueo.montoInicial) || 0) +
          totalEfectivo +
          totalIngresosExtra -
          totalEgresosExtra;

        arqueo.fechaCierre            = fechaCierre;
        arqueo.totalVentasEfectivo    = totalEfectivo;
        arqueo.totalVentasDebito      = totalDebito;
        arqueo.totalVentasCredito     = totalCredito;
        arqueo.totalVentasQR          = totalQR;
        arqueo.totalVentasTransferencia = totalTransfer;
        arqueo.totalVentasCtaCte      = totalCtaCte;
        arqueo.totalIngresosExtra     = totalIngresosExtra;
        arqueo.totalEgresosExtra      = totalEgresosExtra;
        arqueo.montoFinalEstimado     = montoEstimado;
        arqueo.montoFinalReal         = Number(montoFinalReal) || 0;
        arqueo.diferencia             = (Number(montoFinalReal) || 0) - montoEstimado;
        arqueo.observaciones          = observaciones || null;
        arqueo.estado                 = "CERRADA";

        await arqueo.save({ transaction: t });
        resultado = arqueo.toJSON();
      });

      return { success: true, resultado };
    } catch (error) {
      console.error("Error al cerrar caja:", error);
      return { success: false, message: error.message, error: true };
    }
  });

  // -----------------------------
  // Movimientos administrativos
  // -----------------------------

  // Registrar ingreso o egreso de efectivo (no-venta)
  ipcMain.handle("registrar-movimiento-caja", async (_event, { arqueoId, tipo, monto, concepto, comprobante }) => {
    try {
      if (!MovimientoCaja) return { success: false, message: "Módulo no disponible." };

      const arqueo = await ArqueoCaja.findByPk(arqueoId);
      if (!arqueo || arqueo.estado !== 'ABIERTA') {
        return { success: false, message: 'No hay una caja abierta para registrar movimientos.' };
      }

      if (!['INGRESO', 'EGRESO'].includes(tipo)) {
        return { success: false, message: 'Tipo de movimiento inválido.' };
      }

      const montoNum = Number(monto);
      if (!montoNum || montoNum <= 0) {
        return { success: false, message: 'El monto debe ser mayor a cero.' };
      }

      const conceptoTrim = (concepto || '').trim();
      if (!conceptoTrim) {
        return { success: false, message: 'El concepto es obligatorio.' };
      }

      const comprobanteTrim = (comprobante || '').trim();
      if (tipo === 'EGRESO' && !comprobanteTrim) {
        return { success: false, message: 'El número de comprobante es obligatorio para egresos.' };
      }

      const mov = await MovimientoCaja.create({
        ArqueoCajaId: arqueoId,
        tipo,
        monto: montoNum,
        concepto: conceptoTrim,
        comprobante: comprobanteTrim || null,
      });

      return { success: true, movimiento: mov.toJSON() };
    } catch (error) {
      console.error("Error en 'registrar-movimiento-caja':", error);
      return { success: false, message: error.message, error: true };
    }
  });

  // Obtener movimientos de un arqueo
  ipcMain.handle("get-movimientos-caja", async (_event, arqueoId) => {
    try {
      if (!MovimientoCaja || !arqueoId) return [];
      const movimientos = await MovimientoCaja.findAll({
        where: { ArqueoCajaId: arqueoId },
        order: [['createdAt', 'ASC']],
        raw: true,
      });
      return movimientos;
    } catch (error) {
      console.error("Error en 'get-movimientos-caja':", error);
      return [];
    }
  });
}

module.exports = { registerCajaHandlers };
