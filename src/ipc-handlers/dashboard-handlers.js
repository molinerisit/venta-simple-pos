const { ipcMain } = require("electron");
const { Op } = require("sequelize");

function registerDashboardHandlers(models, sequelize) {
  
  // 1. Obtener Estadísticas Principales
  ipcMain.handle("get-dashboard-stats", async (_event, { dateFrom, dateTo, familiaId, departamentoId }) => {
    try {
      // W3-M4: Validate dates before use — Invalid Date produces NaN in all queries.
      const startDate = new Date(dateFrom);
      const endDate = new Date(dateTo);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return { success: false, message: "Fechas inválidas. Proporcione dateFrom y dateTo válidos." };
      }
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);

      const dateWhere = { createdAt: { [Op.gte]: startDate, [Op.lte]: endDate } };

      // --- FILTRADO DE PRODUCTOS ---
      const productFilterWhere = { activo: true };
      
      // Aplicamos filtros individualmente
      if (departamentoId) {
        productFilterWhere.DepartamentoId = departamentoId;
      }
      if (familiaId) {
        productFilterWhere.FamiliaId = familiaId;
      }

      const productsInFilter = await models.Producto.findAll({
        where: productFilterWhere,
        attributes: ["id", "nombre", "stock"],
        raw: true,
      });
      const productIdsToFilter = productsInFilter.map((p) => p.id);


      // --- BÚSQUEDA DE VENTAS ---
      const ventaIdsQuery = { where: dateWhere, attributes: ["id"] };
      
      // Si hay filtros de catálogo activos
      if (departamentoId || familiaId) {
        if (productIdsToFilter.length === 0) {
            // Si el filtro no trajo productos, no hay ventas posibles
            ventaIdsQuery.where = { id: null }; 
        } else {
            // Filtramos ventas que contengan esos productos
            ventaIdsQuery.include = [
              {
                model: models.DetalleVenta,
                as: "detalles",
                attributes: [],
                required: true,
                where: { ProductoId: { [Op.in]: productIdsToFilter } },
              },
            ];
        }
      }
      
      const ventaIds = (await models.Venta.findAll(ventaIdsQuery)).map((v) => v.id);

      // --- MANEJO DE PERÍODO VACÍO ---
      if (ventaIds.length === 0) {
        const inactiveProducts = productsInFilter.filter(p => p.stock > 0);
        return {
          success: true,
          stats: {
            totalFacturado: 0,
            numeroVentas: 0,
            ticketPromedio: 0,
            gananciaBruta: 0,
            margenGanancia: 0,
            ventasPorDia: [],
            totalFacturadoAnterior: 0,
            totalComprasproducto: 0,
            totalGastosFijos: 0,
            fullSalesRanking: [],
            inactiveProducts: inactiveProducts,
            salesByCatalog: [],
            salesByHour: [],
            salesByPaymentMethod: [],
          },
        };
      }

      // --- TOTALES ---
      const ventasPeriodo = await models.Venta.findAll({ where: { id: { [Op.in]: ventaIds } }, raw: true });
      const totalFacturado = ventasPeriodo.reduce((sum, v) => sum + (v.total || 0), 0);
      const numeroVentas = ventasPeriodo.length;
      const ticketPromedio = numeroVentas > 0 ? totalFacturado / numeroVentas : 0;
      
      // --- GANANCIA ---
      const detalles = await models.DetalleVenta.findAll({
        include: [{ model: models.Producto, as: "producto", attributes: ["precioCompra"], required: true }],
        where: { VentaId: { [Op.in]: ventaIds } },
        raw: true,
        nest: true,
      });
      const gananciaBruta = detalles.reduce((sum, d) => {
        const costo = Number(d.producto?.precioCompra) || 0;
        const precio = Number(d.precioUnitario) || 0;
        const cant = Number(d.cantidad) || 0;
        return sum + (precio - costo) * cant;
      }, 0);
      const margenGanancia = totalFacturado > 0 ? (gananciaBruta / totalFacturado) * 100 : 0;


      // --- RANKING COMPLETO ---
      const fullSalesRanking = await models.DetalleVenta.findAll({
        where: { VentaId: { [Op.in]: ventaIds } },
        attributes: [
          "ProductoId",
          [sequelize.fn("SUM", sequelize.col("cantidad")), "total_cantidad"],
          [sequelize.fn("SUM", sequelize.col("subtotal")), "total_facturado_producto"],
          [
            sequelize.literal('SUM(DetalleVenta.subtotal) - SUM(DetalleVenta.cantidad * "producto"."precioCompra")'),
            'total_ganancia'
          ]
        ],
        include: [
          {
            model: models.Producto,
            as: "producto",
            attributes: ["nombre", "stock", "precioCompra"],
            required: true,
          },
        ],
        group: ["ProductoId", "producto.id", "producto.nombre", "producto.stock", "producto.precioCompra"],
        order: [[sequelize.literal("total_cantidad"), "DESC"]],
        raw: true,
        nest: true,
      });

      // --- INACTIVOS ---
      const soldProductIds = new Set(fullSalesRanking.map(p => p.ProductoId));
      const inactiveProducts = productsInFilter.filter(p => !soldProductIds.has(p.id) && p.stock > 0);

      // --- SERIE TEMPORAL ---
      const ventasPorDia = await models.Venta.findAll({
        attributes: [
          [sequelize.fn("DATE", sequelize.col("createdAt")), "fecha"],
          [sequelize.fn("SUM", sequelize.col("total")), "total_diario"],
        ],
        where: { id: { [Op.in]: ventaIds } },
        group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
        order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
        raw: true,
      });

      // --- POR CATÁLOGO ---
      const salesByCatalog = await models.DetalleVenta.findAll({
        where: { VentaId: { [Op.in]: ventaIds } },
        attributes: [[sequelize.fn("SUM", sequelize.col("subtotal")), "total_catalogo"]],
        include: [
          {
            model: models.Producto,
            as: "producto",
            attributes: [],
            required: true,
            include: [
              { model: models.ProductoFamilia, as: "familia", attributes: ["nombre"], required: false },
              { model: models.ProductoDepartamento, as: "departamento", attributes: ["nombre"], required: false }
            ]
          }
        ],
        group: ["producto.familia.id", "producto.familia.nombre", "producto.departamento.id", "producto.departamento.nombre"],
        order: [[sequelize.literal("total_catalogo"), "DESC"]],
        raw: true,
        nest: true,
      });

      // --- POR HORA (SQLite Compatible) ---
      const salesByHour = await models.Venta.findAll({
        where: { id: { [Op.in]: ventaIds } },
        attributes: [
          [sequelize.fn("strftime", "%H", sequelize.col("createdAt")), "hora"], 
          [sequelize.fn("SUM", sequelize.col("total")), "total_por_hora"],
        ],
        group: ["hora"],
        order: [["hora", "ASC"]],
        raw: true,
      });

      // --- POR MÉTODO DE PAGO ---
      const salesByPaymentMethod = await models.Venta.findAll({
        where: { id: { [Op.in]: ventaIds } },
        attributes: [
          "metodoPago",
          [sequelize.fn("SUM", sequelize.col("total")), "total_por_metodo"],
        ],
        group: ["metodoPago"],
        order: [[sequelize.literal("total_por_metodo"), "DESC"]],
        raw: true,
      });


      // --- PERIODO ANTERIOR & OTROS ---
      const diffDias = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      const prevStart = new Date(startDate); prevStart.setDate(prevStart.getDate() - diffDias);
      const prevEnd = new Date(startDate); prevEnd.setDate(prevEnd.getDate() - 1);
      
      const ventaIdsAnterioresQuery = { where: { createdAt: { [Op.gte]: prevStart, [Op.lte]: prevEnd } }, attributes: ["id"] };
      if (departamentoId || familiaId) {
        if (productIdsToFilter.length === 0) {
            ventaIdsAnterioresQuery.where = { id: null };
        } else {
            ventaIdsAnterioresQuery.include = [{ model: models.DetalleVenta, as: "detalles", attributes: [], required: true, where: { ProductoId: { [Op.in]: productIdsToFilter } } }];
        }
      }
      const ventaIdsAnteriores = (await models.Venta.findAll(ventaIdsAnterioresQuery)).map((v) => v.id);
      const totalFacturadoAnterior = (await models.Venta.sum("total", { where: { id: { [Op.in]: ventaIdsAnteriores } } })) || 0;
      
      const totalComprasproducto = (await models.Compra.sum("total", { where: { fecha: { [Op.gte]: startDate, [Op.lte]: endDate } } })) || 0;
      // W3-L5: Apply the same date window to gastos fijos — previously summed all time.
      const totalGastosFijos = (await models.GastoFijo.sum("monto", { where: { createdAt: { [Op.gte]: startDate, [Op.lte]: endDate } } })) || 0;

      return {
        success: true,
        stats: {
          totalFacturado, numeroVentas, ticketPromedio, gananciaBruta, margenGanancia,
          ventasPorDia, totalFacturadoAnterior, totalComprasproducto, totalGastosFijos,
          fullSalesRanking: fullSalesRanking || [],
          inactiveProducts: inactiveProducts || [],
          salesByCatalog: salesByCatalog || [],
          salesByHour: salesByHour || [],
          salesByPaymentMethod: salesByPaymentMethod || [],
        },
      };
    } catch (error) {
      console.error("Error al obtener estadísticas del dashboard:", error);
      return { success: false, message: error.message };
    }
  });

  // 👇 --- ¡AQUÍ ESTABAN FALTANDO ESTOS HANDLERS! --- 👇
  
  // 2. Listar Departamentos (Para el filtro)
  ipcMain.handle("get-departamentos", async () => {
    try {
      // Asumiendo que tu modelo se llama ProductoDepartamento
      // Si se llama 'Departamento', cambia esto.
      const deptos = await models.ProductoDepartamento.findAll({ 
        order: [['nombre', 'ASC']],
        raw: true 
      });
      return deptos;
    } catch (error) {
      console.error("Error obteniendo departamentos:", error);
      return [];
    }
  });

  // 3. Listar Familias (Para el filtro)
  ipcMain.handle("get-familias", async () => {
    try {
      // Asumiendo que tu modelo se llama ProductoFamilia
      const familias = await models.ProductoFamilia.findAll({
        order: [['nombre', 'ASC']],
        raw: true
      });
      return familias;
    } catch (error) {
      console.error("Error obteniendo familias:", error);
      return [];
    }
  });
}

module.exports = { registerDashboardHandlers };