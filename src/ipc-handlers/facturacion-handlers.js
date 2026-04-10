// src/ipc-handlers/facturacion-handlers.js (Limpiado)
const { ipcMain } = require("electron");
// const { generarFacturaAFIP } = require("../services/afip-service"); // ELIMINADO

function registerFacturacionHandlers(models) {
  const { Venta, Cliente, Factura } = models; // Se mantiene Venta, Cliente, Factura

  // --- ELIMINADO ---
  // La función ipcMain.handle("facturar-venta", ...) fue eliminada
  // ya que requería conexión a internet con AFIP.
  // ---

  // Historial de ventas facturadas (Se mantiene, es una lectura local)
  // W3-H8: Added default limit of 200 to prevent unbounded full-table scan.
  ipcMain.handle("get-ventas-con-factura", async (_event, opts) => {
    try {
      const limit = Math.min(200, Math.max(1, parseInt(opts?.limit) || 200));
      const offset = Math.max(0, parseInt(opts?.offset) || 0);
      const ventasFacturadas = await Venta.findAll({
        where: { facturada: true },
        include: [
          { model: Factura, as: "factura", required: true },
          { model: Cliente, as: "cliente" },
        ],
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });
      return ventasFacturadas.map((v) => v.toJSON());
    } catch (error) {
      console.error("Error en [get-ventas-con-factura]:", error);
      return [];
    }
  });
}

module.exports = { registerFacturacionHandlers };