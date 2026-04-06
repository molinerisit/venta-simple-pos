// src/ipc-handlers/reportes-handlers.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");

function registerReportesHandlers(models, sequelize) {
  ipcMain.handle(
    "get-rentabilidad-report",
    async (_event, { dateFrom, dateTo, familiaId, departamentoId }) => {
      try {
        const startDate = new Date(dateFrom);
        const endDate = new Date(dateTo);
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);

        // 1) Ingresos, CMV y Ganancia Bruta
        const { totalFacturado, gananciaBruta, cmv } = await calcularVentasYGanancia(
          models,
          { startDate, endDate, familiaId, departamentoId }
        );

        // 2) Gastos operativos
        const sueldos = (await models.Empleado.sum("sueldo")) || 0;

        const gastosFijos =
          (await models.GastoFijo.sum("monto", {
            where: { createdAt: { [Op.gte]: startDate, [Op.lte]: endDate } },
          })) || 0;

        const comprasproducto =
          (await models.Compra.sum("total", {
            where: { fecha: { [Op.gte]: startDate, [Op.lte]: endDate } },
          })) || 0;

        const totalGastos = sueldos + gastosFijos + comprasproducto;
        const gananciaNeta = gananciaBruta - totalGastos;

        return {
          success: true,
          report: {
            totalFacturado,
            cmv,
            gananciaBruta,
            sueldos,
            gastosFijos,
            comprasproducto,
            totalGastos,
            gananciaNeta,
          },
        };
      } catch (error) {
        console.error("Error al generar reporte de rentabilidad:", error);
        return { success: false, message: error.message };
      }
    }
  );
}

// Auxiliar compartida con dashboard (usa ALIASES correctos)
async function calcularVentasYGanancia(models, { startDate, endDate, familiaId, departamentoId }) {
  const { Venta, DetalleVenta, Producto, ProductoFamilia } = models;

  const dateWhere = { createdAt: { [Op.gte]: startDate, [Op.lte]: endDate } };
  let productIdsToFilter = null;

  if (familiaId) {
    const products = await models.Producto.findAll({
      where: { FamiliaId: familiaId },
      attributes: ["id"],
      raw: true,
    });
    productIdsToFilter = products.map((p) => p.id);
  } else if (departamentoId) {
    const products = await models.Producto.findAll({
      attributes: ["id"],
      include: [
        {
          model: ProductoFamilia,
          as: "familia",
          attributes: [],
          required: true,
          where: { DepartamentoId: departamentoId },
        },
      ],
      raw: true,
    });
    productIdsToFilter = products.map((p) => p.id);
  }

  const ventaIdsQuery = { where: dateWhere, attributes: ["id"] };
  if (productIdsToFilter && productIdsToFilter.length > 0) {
    ventaIdsQuery.include = [
      {
        model: DetalleVenta,
        as: "detalles",
        attributes: [],
        required: true,
        where: { ProductoId: { [Op.in]: productIdsToFilter } },
      },
    ];
  }

  const ventaIds = (await Venta.findAll(ventaIdsQuery)).map((v) => v.id);
  if (ventaIds.length === 0) return { totalFacturado: 0, gananciaBruta: 0, cmv: 0 };

  const totalFacturado = (await Venta.sum("total", { where: { id: { [Op.in]: ventaIds } } })) || 0;

  const detallesVenta = await DetalleVenta.findAll({
    include: [{ model: Producto, as: "producto", attributes: ["precioCompra"], required: true }],
    where: { VentaId: { [Op.in]: ventaIds } },
    raw: true,
    nest: true,
  });

  let gananciaBruta = 0;
  let cmv = 0;

  for (const d of detallesVenta) {
    const costo = Number(d.producto?.precioCompra) || 0;
    const cant = Number(d.cantidad) || 0;
    const p = Number(d.precioUnitario) || 0;
    gananciaBruta += (p - costo) * cant;
    cmv += costo * cant;
  }

  return { totalFacturado, gananciaBruta, cmv };
}

module.exports = { registerReportesHandlers };
