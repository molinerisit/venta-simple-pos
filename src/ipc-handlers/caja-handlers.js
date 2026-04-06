// src/ipc-handlers/caja-handlers.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");

function registerCajaHandlers(models) {
  const { ArqueoCaja, Venta, Usuario } = models;

  // -----------------------------
  // Helpers
  // -----------------------------
  const now = () => new Date();

  // Dada un arqueo, calcula ventana [inicio, fin) para sumar ventas:
  // fin = próxima apertura si existe, sino fechaCierre si ya cerró, sino ahora.
  async function obtenerVentanaArqueo(arqueo) {
    const siguiente = await ArqueoCaja.findOne({
      where: { fechaApertura: { [Op.gt]: arqueo.fechaApertura } },
      order: [["fechaApertura", "ASC"]],
      attributes: ["fechaApertura"],
      raw: true,
    });
    const inicio = arqueo.fechaApertura;
    const fin = siguiente?.fechaApertura || arqueo.fechaCierre || now();
    return { inicio, fin };
  }

  function normalizarMetodoPago(s) {
    if (!s) return "";
    const t = String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (t.includes("efectivo")) return "Efectivo";
    if (t.includes("debito")) return "Debito";
    if (t.includes("credito")) return "Credito";
    if (t.includes("qr") || t.includes("mercado") || t.includes("mp")) return "QR";
    if (t.includes("transfer")) return "Transferencia";
    return s; // fallback
  }

  function agregarTotalesPorMetodo(ventas) {
    let totalEfectivo = 0,
      totalDebito = 0,
      totalCredito = 0,
      totalQR = 0,
      totalTransfer = 0;

    for (const v of ventas) {
      const m = normalizarMetodoPago(v.metodoPago);
      const x = Number(v.total) || 0;
      if (m === "Efectivo") totalEfectivo += x;
      else if (m === "Debito") totalDebito += x;
      else if (m === "Credito") totalCredito += x;
      else if (m === "QR") totalQR += x;
      else if (m === "Transferencia") totalTransfer += x;
    }
    return { totalEfectivo, totalDebito, totalCredito, totalQR, totalTransfer };
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
      return { error: error.message };
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
      return { success: false, message: error.message };
    }
  });

  // Historial de cierres (listado)
  ipcMain.handle("get-all-cierres-caja", async () => {
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
          montoEstimado,
          desde: inicio,
          hasta: fin,
        },
      };
    } catch (error) {
      console.error("Error en 'get-resumen-cierre':", error);
      return { success: false, message: error.message };
    }
  });

  // Cerrar caja
  ipcMain.handle("cerrar-caja", async (_event, { arqueoId, montoFinalReal, observaciones }) => {
    try {
      const arqueo = await ArqueoCaja.findByPk(arqueoId);
      if (!arqueo || arqueo.estado === "CERRADA") {
        return { success: false, message: "El arqueo no existe o ya fue cerrado." };
      }

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
      } = agregarTotalesPorMetodo(ventas);

      const montoEstimado = (Number(arqueo.montoInicial) || 0) + totalEfectivo;

      arqueo.fechaCierre = now();
      arqueo.totalVentasEfectivo = totalEfectivo;
      arqueo.totalVentasDebito = totalDebito;
      arqueo.totalVentasCredito = totalCredito;
      arqueo.totalVentasQR = totalQR;
      arqueo.montoFinalEstimado = montoEstimado;
      arqueo.montoFinalReal = Number(montoFinalReal) || 0;
      arqueo.diferencia = (Number(montoFinalReal) || 0) - montoEstimado;
      arqueo.observaciones = observaciones || null;
      arqueo.estado = "CERRADA";

      await arqueo.save();

      return { success: true, resultado: arqueo.toJSON() };
    } catch (error) {
      console.error("Error al cerrar caja:", error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = { registerCajaHandlers };
