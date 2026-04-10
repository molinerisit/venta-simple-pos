// src/ipc-handlers/insumos-handlers.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");

function registerInsumosHandlers(models, sequelize) {
  const { Insumo, InsumoDepartamento, InsumoFamilia } = models;

  // W3-M1: Added default limit of 500 to prevent unbounded query.
  ipcMain.handle("get-insumos", async (_event, opts) => {
    try {
      const filtro = typeof opts === 'string' ? opts : opts?.filtro;
      const limit = Math.min(500, Math.max(1, parseInt(opts?.limit) || 500));
      const offset = Math.max(0, parseInt(opts?.offset) || 0);
      const where = filtro ? { nombre: { [Op.like]: `%${String(filtro).trim()}%` } } : undefined;
      const insumos = await Insumo.findAll({
        where,
        include: [
          { model: InsumoDepartamento, as: "departamento", attributes: ["nombre"] },
          { model: InsumoFamilia, as: "familia", attributes: ["nombre"] },
        ],
        order: [["nombre", "ASC"]],
        limit,
        offset,
      });
      return insumos.map((i) => {
        const j = i.toJSON();
        return {
          ...j,
          departamentoNombre: j.departamento?.nombre,
          familiaNombre: j.familia?.nombre,
        };
      });
    } catch (error) {
      console.error("Error en get-insumos:", error);
      return [];
    }
  });

  ipcMain.handle("get-insumo-by-id", async (_event, insumoId) => {
    if (!insumoId) return null;
    try {
      const insumo = await Insumo.findByPk(insumoId, {
        include: [
          { model: InsumoDepartamento, as: "departamento" },
          { model: InsumoFamilia, as: "familia" },
        ],
      });
      return insumo ? insumo.toJSON() : null;
    } catch (error) {
      console.error("Error en get-insumo-by-id:", error);
      return null;
    }
  });

  // W3-H4: Explicit field allowlist — renderer cannot inject arbitrary columns.
  // W3-H5: affectedRows check on update — silent no-op replaced with clear error.
  const INSUMO_ALLOWED_FIELDS = [
    'nombre', 'stock', 'precioCompra', 'precioVenta', 'unidad',
    'InsumoDepartamentoId', 'InsumoFamiliaId', 'activo',
  ];

  ipcMain.handle("guardar-insumo", async (_event, data) => {
    try {
      const nombre = String(data?.nombre || "").trim();
      if (!nombre) return { success: false, message: "El nombre es obligatorio." };

      // Build payload from allowlist only
      const payload = Object.fromEntries(
        Object.entries(data || {}).filter(([k]) => INSUMO_ALLOWED_FIELDS.includes(k))
      );
      payload.nombre = nombre;

      const insumoId = data?.id;
      if (insumoId) {
        const [affectedRows] = await Insumo.update(payload, { where: { id: insumoId } });
        if (affectedRows === 0) {
          return { success: false, message: "Insumo no encontrado." };
        }
      } else {
        await Insumo.create(payload);
      }

      return { success: true };
    } catch (error) {
      console.error("Error en guardar-insumo:", error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("eliminar-insumo", async (_event, insumoId) => {
    try {
      const result = await Insumo.destroy({ where: { id: insumoId } });
      return result > 0 ? { success: true } : { success: false, message: "Insumo no encontrado." };
    } catch (error) {
      console.error("Error en eliminar-insumo:", error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("get-insumo-clasificaciones", async () => {
    try {
      const [departamentos, familias] = await Promise.all([
        InsumoDepartamento.findAll({ order: [["nombre", "ASC"]], raw: true }),
        InsumoFamilia.findAll({ order: [["nombre", "ASC"]], raw: true }),
      ]);
      return { departamentos, familias };
    } catch (error) {
      console.error("Error en get-insumo-clasificaciones:", error);
      return { departamentos: [], familias: [] };
    }
  });

  ipcMain.handle("guardar-insumo-departamento", async (_event, data) => {
    try {
      const nombre = String(data?.nombre || "").trim();
      if (!nombre) return { success: false, message: "Nombre requerido." };
      const nuevo = await InsumoDepartamento.create({ nombre });
      return { success: true, message: "Departamento creado.", data: nuevo.toJSON() };
    } catch (error) {
      console.error("Error en guardar-insumo-departamento:", error);
      return { success: false, message: "El nombre ya existe o es inválido." };
    }
  });

  // W3-L4: Validate InsumoDepartamentoId exists before creating family.
  ipcMain.handle("guardar-insumo-familia", async (_event, data) => {
    try {
      const nombre = String(data?.nombre || "").trim();
      const depId = data?.InsumoDepartamentoId;
      if (!nombre || !depId) return { success: false, message: "Nombre y departamento requeridos." };

      const deptoExiste = await InsumoDepartamento.findByPk(depId);
      if (!deptoExiste) {
        return { success: false, message: "El departamento de insumo no existe." };
      }

      const nueva = await InsumoFamilia.create({ nombre, InsumoDepartamentoId: depId });
      return { success: true, message: "Familia creada.", data: nueva.toJSON() };
    } catch (error) {
      console.error("Error en guardar-insumo-familia:", error);
      return { success: false, message: "El nombre ya existe o es inválido." };
    }
  });
}

module.exports = { registerInsumosHandlers };
