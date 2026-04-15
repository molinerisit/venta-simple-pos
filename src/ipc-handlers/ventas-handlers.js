// src/ipc-handlers/ventas-handlers.js (Limpiado)
const { ipcMain } = require("electron");
const { Op } = require("sequelize");
const { getOfertaActiva, calcularLineaConOferta } = require("./ofertas-handlers");

// ELIMINADO: const { generarFacturaAFIP } = require("../services/afip-service");
// ELIMINADO: const { findPaymentByReference } = require("../services/mercadoPago-Service");
// (El servicio de MP fue integrado en el handler de MP)

// M-5: Module-level cache for admin config used in busqueda-inteligente.
// Invalidated via "config-updated" IPC event.
let _cachedAdminConfig = null;

function registerVentasHandlers(models, sequelize) {
  const { Producto, Venta, DetalleVenta, Cliente, Usuario, Factura, Oferta } = models;

  // Strict allowlist for metodoPago. Any value outside this set is rejected.
  const METODOS_PAGO_VALIDOS = ['Efectivo', 'Débito', 'Crédito', 'QR', 'Transferencia', 'CtaCte'];

  // --- Utilidad: crear venta en transacción (para reuso) ---
  const createSaleTx = async (ventaData, t) => {
    const {
      detalles,
      metodoPago,
      ClienteId,
      dniCliente,
      UsuarioId,
      montoPagado,
    } = ventaData;

    if (!detalles || detalles.length === 0) throw new Error("No hay items en la venta.");

    // H-3: Reject any metodoPago not in the strict allowlist. Never auto-correct.
    if (!METODOS_PAGO_VALIDOS.includes(metodoPago)) {
      throw new Error(
        `Método de pago inválido: "${metodoPago}". Valores permitidos: ${METODOS_PAGO_VALIDOS.join(', ')}.`
      );
    }

    // H-2: Resolve authoritative prices from DB for every non-manual item.
    // The renderer-supplied precioUnitario is ignored for DB-backed products.
    // Quantities must be > 0. Stock must be sufficient before any decrement.
    const resolvedItems = [];
    for (const item of detalles) {
      const cantidad = Number(item.cantidad);
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error(
          `Cantidad inválida para "${item.nombreProducto || item.ProductoId}": debe ser mayor que cero.`
        );
      }

      const isManual = !item.ProductoId || String(item.ProductoId).startsWith("manual-");

      if (isManual) {
        const pUnit = Number(item.precioUnitario);
        if (!Number.isFinite(pUnit) || pUnit < 0) {
          throw new Error(`Precio inválido para ítem manual "${item.nombreProducto}".`);
        }
        resolvedItems.push({ item, cantidad, pUnit, isManual: true });
      } else {
        const producto = await Producto.findByPk(item.ProductoId, { transaction: t });
        if (!producto) throw new Error(`Producto ${item.ProductoId} no encontrado.`);
        if (producto.stock < cantidad) {
          throw new Error(
            `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}, solicitado: ${cantidad}.`
          );
        }
        // Check for dynamic offer first, then legacy precio_oferta field.
        const ofertaActiva = Oferta ? await getOfertaActiva(Oferta, producto.id) : null;
        const precioBase = producto.precioVenta;
        resolvedItems.push({ item, cantidad, pUnit: precioBase, isManual: false, ofertaActiva });
      }
    }

    // Compute subtotal from authoritative server-side prices only, applying offers.
    // W5-F2: Round each line to 2 decimal places to prevent float drift on weighted products.
    let subtotal = 0;
    for (const r of resolvedItems) {
      const { subtotal: lineSub } = calcularLineaConOferta(r.ofertaActiva || null, r.pUnit, r.cantidad);
      r.lineSubtotal = lineSub;
      subtotal += lineSub;
    }
    subtotal = Math.round(subtotal * 100) / 100;

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

    // Build detail rows and decrement stock using already-resolved data.
    const detallesRows = [];
    for (const { item, cantidad, pUnit, isManual, lineSubtotal, ofertaActiva } of resolvedItems) {
      const lineSub = lineSubtotal !== undefined ? lineSubtotal : cantidad * pUnit;
      detallesRows.push({
        VentaId: venta.id,
        ProductoId: isManual ? null : item.ProductoId,
        cantidad,
        precioUnitario: pUnit,
        subtotal: lineSub,
        nombreProducto: item.nombreProducto,
      });
      if (!isManual) {
        await Producto.increment(
          { stock: -cantidad },
          { where: { id: item.ProductoId }, transaction: t }
        );
      }
    }
    if (detallesRows.length) {
      await DetalleVenta.bulkCreate(detallesRows, { transaction: t });
    }

    return {
      venta,
      datosRecibo: {
        // Return authoritative prices so the receipt reflects what was actually charged.
        items: resolvedItems.map(({ item, cantidad, pUnit, lineSubtotal, ofertaActiva }) => {
          const { ofertaLabel } = calcularLineaConOferta(ofertaActiva || null, pUnit, cantidad);
          return {
            ...item,
            precioUnitario: pUnit,
            subtotal: lineSubtotal !== undefined ? lineSubtotal : cantidad * pUnit,
            ofertaLabel,
          };
        }),
        total: totalFinal,
        descuento: descuentoTotal,
        recargo,
        metodoPago,
        montoPagado: montoPagadoFinal,
        vuelto: vuelto > 0 ? vuelto : 0,
        dniCliente,
      },
    };
  };

  // Listado de ventas
  // W3-M2: Enforce a default limit of 200 when neither limit nor offset is supplied,
  // to prevent unbounded full-table scans with heavy includes on large installations.
  ipcMain.handle("get-ventas", async (_event, filters) => {
    try {
      const { fechaInicio, fechaFin } = filters || {};
      // Use caller-supplied limit/offset when provided; default to limit=200, offset=0.
      const limit = filters?.limit != null ? Number(filters.limit) : 200;
      const offset = filters?.offset != null ? Number(filters.offset) : 0;
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
        limit,
        offset,
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

    try {
      // M-5: Use cached admin config — avoids a DB query on every barcode scan.
      if (!_cachedAdminConfig) {
        _cachedAdminConfig = await Usuario.findOne({ where: { rol: "administrador" }, raw: true });
      }
      const admin = _cachedAdminConfig;

      // ==========================================================
      // 🟢 INICIO DE LA CORRECCIÓN
      // 'admin.config_balanza' es un STRING, no un objeto. ¡Hay que parsearlo!
      // ==========================================================
      let cfg = null;
      if (admin && admin.config_balanza && typeof admin.config_balanza === 'string') {
        try {
          cfg = JSON.parse(admin.config_balanza);
        } catch (e) {
          console.error("[BUSQUEDA] Error parseando config_balanza:", e);
          cfg = null;
        }
      } else if (admin && admin.config_balanza) {
        // Ya era un objeto, (por si acaso)
        cfg = admin.config_balanza;
      } else {
      }
      // ==========================================================
      // 🟢 FIN DE LA CORRECCIÓN
      // ==========================================================


      // Si es código de balanza
      // (Esta lógica ahora SÍ va a funcionar)
      if (cfg?.prefijo && String(texto).startsWith(cfg.prefijo) && cfg.codigo_inicio) {
        const ci = Number(cfg.codigo_inicio) - 1;
        const vi = Number(cfg.valor_inicio) - 1;
        const codigoProducto = String(texto).substring(ci, ci + Number(cfg.codigo_longitud));
        const valorStr = String(texto).substring(vi, vi + Number(cfg.valor_longitud));
        const valor = parseFloat(valorStr) / (Number(cfg.valor_divisor) || 1);

        
        // Buscamos por PLU y que sea pesable
        const producto = await Producto.findOne({
          where: {
            plu: codigoProducto,
            pesable: true,
            activo: true,  // M-6: exclude inactive products from all searches
          },
        });

        if (producto) {
          const pj = producto.toJSON();
          if (cfg.tipo_valor === "peso") {
            pj.cantidad = valor;
          } else {
            pj.cantidad = 1;
            pj.precioVenta = valor; // Sobrescribe precio si es por monto
          }
          if (Oferta) pj.ofertaActiva = await getOfertaActiva(Oferta, pj.id);
          return pj;
        } else {
        }
      }

      // Paso 1: coincidencia exacta por codigo_barras o codigo (siempre tiene prioridad)
      let producto = await Producto.findOne({
        where: {
          activo: true,
          [Op.or]: [
            { codigo_barras: String(texto) },
            { codigo: String(texto) },
          ],
        },
      });

      // Paso 2: solo si no hubo match exacto, buscar por nombre
      if (!producto) {
        producto = await Producto.findOne({
          where: {
            activo: true,
            nombre: { [Op.like]: `%${String(texto)}%` },
          },
        });
      }

      if (!producto) return null;
      const pj = producto.toJSON();
      if (Oferta) {
        pj.ofertaActiva = await getOfertaActiva(Oferta, pj.id);
      }
      return pj;
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
      return { success: false, message: error.message || "Error al guardar la venta.", error: true };
    }
  });

  // --- ELIMINADO: registrar-venta-y-facturar ---
  // ipcMain.handle("registrar-venta-y-facturar", ...)
  
  // M-5: Invalidate admin config cache when settings are saved.
  // The renderer must invoke "config-updated" after any admin config change.
  ipcMain.handle("config-updated", async () => {
    _cachedAdminConfig = null;
  });

}

module.exports = { registerVentasHandlers };