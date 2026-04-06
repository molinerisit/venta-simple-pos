// src/ipc-handlers/compras.js
const { ipcMain } = require("electron");

function registerComprasHandlers(models, sequelize) {
  const { Compra, DetalleCompra, Producto, Insumo, Proveedor } = models;

  // Helpers
  const toNum = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

  // --- COMPRA DE PRODUCTOS ---
  ipcMain.handle("registrar-compra-producto", async (_event, data) => {
    const { proveedorId, nroFactura, UsuarioId, items, pago } = data || {};
    const t = await sequelize.transaction();
    try {
      if (!proveedorId) throw new Error("Se debe seleccionar un proveedor.");
      if (!items || !items.length) throw new Error("La compra debe tener al menos un producto.");

      // Validación rápida de items
      for (const it of items) {
        if (!it?.productoId) throw new Error("Falta productoId en un ítem.");
        if (!(toNum(it.cantidad) > 0)) throw new Error("Cantidad inválida en un ítem.");
        if (!(toNum(it.costoUnitario) >= 0)) throw new Error("Costo unitario inválido en un ítem.");
      }

      const subtotal = items.reduce((acc, it) => acc + toNum(it.cantidad) * toNum(it.costoUnitario), 0);
      const descuento = toNum(pago?.descuento);
      const recargo = toNum(pago?.recargo);
      const totalCompra = subtotal - descuento + recargo;
      const montoAbonado = toNum(pago?.montoAbonado);
      const deudaGenerada = totalCompra - montoAbonado;

      let estadoPago = "Pendiente";
      if (montoAbonado >= totalCompra) estadoPago = "Pagada";
      else if (montoAbonado > 0) estadoPago = "Parcial";

      const nuevaCompra = await Compra.create(
        {
          fecha: new Date(),
          nroFactura: nroFactura || null,
          subtotal,
          descuento,
          recargo,
          total: totalCompra,
          metodoPago: pago?.metodoPago || null,
          montoAbonado,
          estadoPago,
          ProveedorId: proveedorId,
          UsuarioId,
        },
        { transaction: t }
      );

      // Inserción de detalles + actualización de stock y precios (usa increment para evitar carreras)
      for (const it of items) {
        const cantidad = toNum(it.cantidad);
        const costo = toNum(it.costoUnitario);
        await DetalleCompra.create(
          {
            cantidad,
            precioUnitario: costo,
            subtotal: cantidad * costo,
            CompraId: nuevaCompra.id,
            ProductoId: it.productoId,
          },
          { transaction: t }
        );

        // increment evita leer-modificar-grabar cuando solo cambia stock
        await Producto.increment({ stock: cantidad }, { where: { id: it.productoId }, transaction: t });
        // actualizo precios (último costo y, si corresponde, venta)
        const updates = { precioCompra: costo };
        if (it.actualizarPrecioVenta && toNum(it.nuevoPrecioVenta) > 0) {
          updates.precioVenta = toNum(it.nuevoPrecioVenta);
        }
        await Producto.update(updates, { where: { id: it.productoId }, transaction: t });
      }

      if (deudaGenerada > 0) {
        await Proveedor.increment({ deuda: deudaGenerada }, { where: { id: proveedorId }, transaction: t });
      }

      await t.commit();
      return { success: true, message: `Compra #${nuevaCompra.id} registrada con éxito.` };
    } catch (error) {
      await t.rollback();
      console.error("Error al registrar la compra de mercadería:", error);
      return { success: false, message: error.message || "Error al registrar compra." };
    }
  });

  // --- COMPRA DE INSUMOS ---
  ipcMain.handle("registrar-compra-insumos", async (_event, data) => {
    const { proveedorId, nroFactura, UsuarioId, items, pago } = data || {};
    const t = await sequelize.transaction();
    try {
      if (!proveedorId) throw new Error("Se debe seleccionar un proveedor.");
      if (!items || !items.length) throw new Error("La compra debe tener al menos un insumo.");

      for (const it of items) {
        if (!it?.insumoId) throw new Error("Falta insumoId en un ítem.");
        if (!(toNum(it.cantidad) > 0)) throw new Error("Cantidad inválida en un ítem.");
        if (!(toNum(it.costoUnitario) >= 0)) throw new Error("Costo unitario inválido en un ítem.");
      }

      const subtotal = items.reduce((acc, it) => acc + toNum(it.cantidad) * toNum(it.costoUnitario), 0);
      const descuento = toNum(pago?.descuento);
      const recargo = toNum(pago?.recargo);
      const totalCompra = subtotal - descuento + recargo;
      const montoAbonado = toNum(pago?.montoAbonado);
      const deudaGenerada = totalCompra - montoAbonado;

      let estadoPago = "Pendiente";
      if (montoAbonado >= totalCompra) estadoPago = "Pagada";
      else if (montoAbonado > 0) estadoPago = "Parcial";

      const nuevaCompra = await Compra.create(
        {
          fecha: new Date(),
          nroFactura: nroFactura || null,
          subtotal,
          descuento,
          recargo,
          total: totalCompra,
          metodoPago: pago?.metodoPago || null,
          montoAbonado,
          estadoPago,
          ProveedorId: proveedorId,
          UsuarioId,
        },
        { transaction: t }
      );

      for (const it of items) {
        const cantidad = toNum(it.cantidad);
        const costo = toNum(it.costoUnitario);

        await DetalleCompra.create(
          {
            cantidad,
            precioUnitario: costo,
            subtotal: cantidad * costo,
            CompraId: nuevaCompra.id,
            InsumoId: it.insumoId,
          },
          { transaction: t }
        );

        await Insumo.increment({ stock: cantidad }, { where: { id: it.insumoId }, transaction: t });
        await Insumo.update({ ultimoPrecioCompra: costo }, { where: { id: it.insumoId }, transaction: t });
      }

      if (deudaGenerada > 0) {
        await Proveedor.increment({ deuda: deudaGenerada }, { where: { id: proveedorId }, transaction: t });
      }

      await t.commit();
      return { success: true, message: `Compra de insumos #${nuevaCompra.id} registrada.` };
    } catch (error) {
      await t.rollback();
      console.error("Error al registrar la compra de insumos:", error);
      return { success: false, message: error.message || "Error al registrar compra de insumos." };
    }
  });
}

module.exports = { registerComprasHandlers };
