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
  ipcMain.handle("get-ventas-con-factura", async () => {
    try {
      const ventasFacturadas = await Venta.findAll({
        where: { facturada: true },
        include: [
          { model: Factura, as: "factura", required: true },
          { model: Cliente, as: "cliente" },
        ],
        order: [["createdAt", "DESC"]],
      });
      return ventasFacturadas.map((v) => v.toJSON());
    } catch (error) {
      console.error("Error en [get-ventas-con-factura]:", error);
      return [];
    }
  });
}

module.exports = { registerFacturacionHandlers };