// src/ipc-handlers/ventas-handlers.js (Limpiado)
const { ipcMain } = require("electron");
const { Op } = require("sequelize");

// ELIMINADO: const { generarFacturaAFIP } = require("../services/afip-service");
// ELIMINADO: const { findPaymentByReference } = require("../services/mercadoPago-Service");
// (El servicio de MP fue integrado en el handler de MP)

function registerVentasHandlers(models, sequelize) {
  const { Producto, Venta, DetalleVenta, Cliente, Usuario, Factura } = models;

  // --- Utilidad: crear venta en transacción (para reuso) ---
  const createSaleTx = async (ventaData, t) => {
    const {
      detalles,
      metodoPago,
      ClienteId,
      dniCliente,
      UsuarioId,
      montoPagado,
      // externalReference, // Ya no se usa aquí
    } = ventaData;

    if (!detalles || detalles.length === 0) throw new Error("No hay items en la venta.");

    let subtotal = 0;
    for (const it of detalles) {
      subtotal += Number(it.precioUnitario || 0) * Number(it.cantidad || 0);
    }

    const adminConfig = await Usuario.findOne({
      where: { rol: "administrador" },
      transaction: t,
      raw: true,
    });
    const recargoPorcentaje = Number(adminConfig?.config_recargo_credito || 0);
    const descEfPorcentaje = Number(adminConfig?.config_descuento_efectivo || 0);

    let cliente = null;
    if (ClienteId) {
      cliente = await Cliente.findByPk(ClienteId, { transaction: t });
    } else if (dniCliente) {
      [cliente] = await Cliente.findOrCreate({
        where: { dni: dniCliente },
        defaults: { nombre: "Cliente Ocasional", descuento: 0 },
        transaction: t,
      });
    }

    let descCliente = 0;
    if (cliente && Number(cliente.descuento) > 0) {
      descCliente = subtotal * (Number(cliente.descuento) / 100);
    }
    let descEfectivo = 0;
    if (metodoPago === "Efectivo" && descEfPorcentaje > 0) {
      descEfectivo = (subtotal - descCliente) * (descEfPorcentaje / 100);
    }
    const descuentoTotal = descCliente + descEfectivo;

    const totalTrasDesc = subtotal - descuentoTotal;

    const recargo = metodoPago === "Crédito" ? totalTrasDesc * (recargoPorcentaje / 100) : 0;

    const totalFinal = totalTrasDesc + recargo;

    const montoPagadoFinal = metodoPago === "Efectivo" ? Number(montoPagado || 0) : totalFinal;
    const vuelto = metodoPago === "Efectivo" ? montoPagadoFinal - totalFinal : 0;

    if (metodoPago === "Efectivo" && montoPagadoFinal < totalFinal) {
      throw new Error("El monto pagado es insuficiente.");
    }

    const venta = await Venta.create(
      {
        metodoPago,
        total: totalFinal,
        montoPagado: montoPagadoFinal,
        vuelto: vuelto > 0 ? vuelto : 0,
        dniCliente,
        montoDescuento: descuentoTotal,
        recargo,
        UsuarioId,
        ClienteId: cliente ? cliente.id : null,
        facturada: false,
      },
      { transaction: t }
    );

    const detallesRows = [];
    for (const item of detalles) {
      const cantidad = Number(item.cantidad || 0);
      const pUnit = Number(item.precioUnitario || 0);
      detallesRows.push({
        VentaId: venta.id,
        ProductoId: item.ProductoId,
        cantidad,
        precioUnitario: pUnit,
        subtotal: cantidad * pUnit,
        nombreProducto: item.nombreProducto,
      });

      if (item.ProductoId && !String(item.ProductoId).startsWith("manual-")) {
        await Producto.increment(
          { stock: -cantidad },
          { where: { id: item.ProductoId }, transaction: t }
        );
      }
    }
    if (detallesRows.length) {
      await DetalleVenta.bulkCreate(detallesRows, { transaction: t });
    }
    
    // --- Lógica de consulta de MP eliminada de aquí ---
    // (El front-end se encarga de consultar el pago usando el externalReference)

    return {
      venta,
      datosRecibo: {
        items: detalles,
        total: totalFinal,
        descuento: descuentoTotal,
        recargo,
        metodoPago,
        montoPagado: montoPagadoFinal,
        vuelto: vuelto > 0 ? vuelto : 0,
        dniCliente,
      },
      // datosPagoMP (eliminado de esta respuesta)
    };
  };

  // Listado de ventas (Sin cambios)
  ipcMain.handle("get-ventas", async (_event, filters) => {
    try {
      const { fechaInicio, fechaFin } = filters || {};
      const whereClause = {};
      if (fechaInicio && fechaFin) {
        whereClause.createdAt = {
          [Op.between]: [new Date(fechaInicio), new Date(fechaFin)],
        };
      }
      const ventas = await Venta.findAll({
        where: whereClause,
        include: [
          {
            model: DetalleVenta,
            as: "detalles",
            include: [{ model: Producto, as: "producto", paranoid: false }],
          },
          { model: Cliente, as: "cliente", attributes: ["nombre", "apellido", "dni"] },
          { model: Usuario, as: "usuario", attributes: ["nombre"] },
          { model: Factura, as: "factura" },
        ],
        order: [["createdAt", "DESC"]],
      });
      return ventas.map((v) => v.toJSON());
    } catch (error) {
      console.error("Error al obtener ventas:", error);
      return [];
    }
  });

  // Búsqueda inteligente (Reescrito para no usar config_balanza_conexion)
// Búsqueda inteligente (Reescrito para no usar config_balanza_conexion)
  ipcMain.handle("busqueda-inteligente", async (_event, texto) => {
    if (!texto) return null;
    
    // 🟢 Log de inicio
    console.log(`[BUSQUEDA] Recibido: ${texto}`);

    try {
      const admin = await Usuario.findOne({ where: { rol: "administrador" }, raw: true });

      // ==========================================================
      // 🟢 INICIO DE LA CORRECCIÓN
      // 'admin.config_balanza' es un STRING, no un objeto. ¡Hay que parsearlo!
      // ==========================================================
      let cfg = null;
      if (admin && admin.config_balanza && typeof admin.config_balanza === 'string') {
        try {
          cfg = JSON.parse(admin.config_balanza);
          console.log("[BUSQUEDA] Config de balanza parseada:", cfg);
        } catch (e) {
          console.error("[BUSQUEDA] Error parseando config_balanza:", e);
          cfg = null;
        }
      } else if (admin && admin.config_balanza) {
        // Ya era un objeto, (por si acaso)
        cfg = admin.config_balanza;
        console.log("[BUSQUEDA] Config de balanza leída (ya era objeto):", cfg);
      } else {
        console.log("[BUSQUEDA] No se encontró config_balanza en el admin.");
      }
      // ==========================================================
      // 🟢 FIN DE LA CORRECCIÓN
      // ==========================================================


      // Si es código de balanza
      // (Esta lógica ahora SÍ va a funcionar)
      if (cfg?.prefijo && String(texto).startsWith(cfg.prefijo) && cfg.codigo_inicio) {
        console.log("[BUSQUEDA] Detectado código de balanza.");
        const ci = Number(cfg.codigo_inicio) - 1;
        const vi = Number(cfg.valor_inicio) - 1;
        const codigoProducto = String(texto).substring(ci, ci + Number(cfg.codigo_longitud));
        const valorStr = String(texto).substring(vi, vi + Number(cfg.valor_longitud));
        const valor = parseFloat(valorStr) / (Number(cfg.valor_divisor) || 1);

        console.log(`[BUSQUEDA] Buscando PLU: ${codigoProducto}`);
        
        // Buscamos por PLU y que sea pesable
        const producto = await Producto.findOne({ 
          where: { 
            plu: codigoProducto,
            pesable: true // 🟢 Añadimos esta verificación por seguridad
          } 
        });

        if (producto) {
          console.log(`[BUSQUEDA] Producto encontrado: ${producto.nombre}`);
          const pj = producto.toJSON();
          if (cfg.tipo_valor === "peso") {
            pj.cantidad = valor;
          } else {
            pj.cantidad = 1;
            pj.precioVenta = valor; // Sobrescribe precio si es por monto
          }
          return pj;
        } else {
          console.log(`[BUSQUEDA] PLU ${codigoProducto} no encontrado en la base de datos.`);
        }
      }

      // Si no, buscar por barcode exacto o nombre like
      console.log("[BUSQUEDA] Falló búsqueda por PLU. Buscando por código/nombre...");
      const whereClause = {
        [Op.or]: [
          { codigo_barras: String(texto) },
          // 🟢 AGREGADO: Buscar también por el campo 'codigo'
          { codigo: String(texto) }, 
          { nombre: { [Op.like]: `%${String(texto)}%` } },
        ],
      };
      const producto = await Producto.findOne({ where: whereClause });
      
      if(producto) {
        console.log(`[BUSQUEDA] Producto encontrado por código/nombre: ${producto.nombre}`);
      } else {
        console.log("[BUSQUEDA] No se encontró producto por ningún método.");
      }
      
      return producto ? producto.toJSON() : null;
    } catch (error) {
      console.error("Error en búsqueda inteligente:", error);
      return null;
    }
  });

  // Registrar venta
  ipcMain.handle("registrar-venta", async (_event, ventaData) => {
    const t = await sequelize.transaction();
    try {
      const { venta, datosRecibo } = await createSaleTx(ventaData, t);
      await t.commit();
      return {
        success: true,
        ventaId: venta.id,
        message: `Venta #${venta.id} registrada.`,
        datosRecibo,
      };
    } catch (error) {
      await t.rollback();
      console.error("Error al registrar la venta:", error);
      return { success: false, message: error.message || "Error al guardar la venta." };
    }
  });

  // --- ELIMINADO: registrar-venta-y-facturar ---
  // ipcMain.handle("registrar-venta-y-facturar", ...)
  
}

module.exports = { registerVentasHandlers };