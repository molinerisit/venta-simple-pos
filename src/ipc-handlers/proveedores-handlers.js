// src/ipc-handlers/proveedores-handlers.js (VERSIÓN FINAL Y ROBUSTA)
const { ipcMain } = require("electron");

function registerProveedoresHandlers(models, sequelize) {
  const { Proveedor, Producto, Insumo } = models;

  // Explicit allowlist for proveedor fields that the renderer may set.
  // W3-M7: Prevents mass-assignment of protected fields (deuda, createdAt, etc.)
  const PROVEEDOR_ALLOWED_FIELDS = [
    'nombreEmpresa', 'telefono', 'email', 'direccion', 'cuit', 'contacto', 'notas',
  ];

  // Lista principal
  // W3-H2: Added default limit of 500 to prevent unbounded query.
  ipcMain.handle("get-proveedores", async (_event, opts) => {
    try {
      const limit = Math.min(500, Math.max(1, parseInt(opts?.limit) || 500));
      const offset = Math.max(0, parseInt(opts?.offset) || 0);
      return await Proveedor.findAll({ order: [["nombreEmpresa", "ASC"]], limit, offset, raw: true });
    } catch (error) {
      console.error("Error en get-proveedores:", error);
      return [];
    }
  });

  // Detalle por ID (para edición)
  ipcMain.handle("get-proveedor-by-id", async (_event, proveedorId) => {
    if (!proveedorId) return null;
    try {
      const proveedor = await Proveedor.findByPk(proveedorId, {
        include: [
          { model: Producto, as: "productos", attributes: ["id"], through: { attributes: [] } },
          { model: Insumo, as: "insumos", attributes: ["id"], through: { attributes: [] } },
        ],
      });
      if (!proveedor) return null;

      const data = proveedor.toJSON();
      data.productoIds = (data.productos || []).map((p) => p.id);
      data.insumoIds = (data.insumos || []).map((i) => i.id);
      delete data.productos;
      delete data.insumos;
      return data;
    } catch (error) {
      console.error("Error en get-proveedor-by-id:", error);
      return null;
    }
  });

  // Crear/Actualizar proveedor + relaciones
  ipcMain.handle("guardar-proveedor", async (_event, data) => {
    const { proveedorData, productoIds, insumoIds } = data || {};
    const t = await sequelize.transaction();
    try {
      if (!proveedorData || !proveedorData.nombreEmpresa) {
        await t.rollback();
        return { success: false, message: "Falta nombre de empresa." };
      }

      // W3-M7: Strip protected fields — only allowlisted keys forwarded to ORM.
      const safePayload = Object.fromEntries(
        Object.entries(proveedorData).filter(([k]) => PROVEEDOR_ALLOWED_FIELDS.includes(k))
      );

      let proveedor;
      if (proveedorData.id) {
        proveedor = await Proveedor.findByPk(proveedorData.id, { transaction: t });
        if (!proveedor) {
          await t.rollback();
          return { success: false, message: "El proveedor a editar no existe." };
        }
        await proveedor.update(safePayload, { transaction: t });
      } else {
        proveedor = await Proveedor.create(safePayload, { transaction: t });
      }

      await proveedor.setProductos(productoIds || [], { transaction: t });
      await proveedor.setInsumos(insumoIds || [], { transaction: t });

      await t.commit();
      return { success: true };
    } catch (error) {
      await t.rollback();
      console.error("Error al guardar proveedor:", error);
      return { success: false, message: `Error al guardar: ${error.message}` };
    }
  });

  // Eliminar proveedor
  ipcMain.handle("eliminar-proveedor", async (_event, proveedorId) => {
    if (!proveedorId) return { success: false, message: "ID inválido." };
    try {
      const result = await Proveedor.destroy({ where: { id: proveedorId } });
      if (result > 0) return { success: true };
      return { success: false, message: "No se encontró el proveedor para eliminar." };
    } catch (error) {
      console.error("Error al eliminar proveedor:", error);
      if (error.name === "SequelizeForeignKeyConstraintError") {
        return { success: false, message: "No se puede eliminar un proveedor con compras asociadas." };
      }
      return { success: false, message: `Error al eliminar: ${error.message}` };
    }
  });

  // Catálogo para combos
  ipcMain.handle("get-productos-insumos", async () => {
    try {
      const [productos, insumos] = await Promise.all([
        Producto.findAll({ attributes: ["id", "nombre"], order: [["nombre", "ASC"]], raw: true }),
        Insumo.findAll({ attributes: ["id", "nombre"], order: [["nombre", "ASC"]], raw: true }),
      ]);
      return { productos, insumos };
    } catch (error) {
      console.error("Error al obtener productos e insumos:", error);
      return { productos: [], insumos: [] };
    }
  });
}

module.exports = { registerProveedoresHandlers };
