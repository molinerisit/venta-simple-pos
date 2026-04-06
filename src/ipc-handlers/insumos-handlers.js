// src/ipc-handlers/insumos-handlers.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");

function registerInsumosHandlers(models, sequelize) {
  const { Insumo, InsumoDepartamento, InsumoFamilia } = models;

  ipcMain.handle("get-insumos", async (_event, filtro) => {
    try {
      const where = filtro ? { nombre: { [Op.like]: `%${String(filtro).trim()}%` } } : undefined;
      const insumos = await Insumo.findAll({
        where,
        include: [
          { model: InsumoDepartamento, as: "departamento", attributes: ["nombre"] },
          { model: InsumoFamilia, as: "familia", attributes: ["nombre"] },
        ],
        order: [["nombre", "ASC"]],
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

  ipcMain.handle("guardar-insumo", async (_event, data) => {
    try {
      const nombre = String(data?.nombre || "").trim();
      if (!nombre) return { success: false, message: "El nombre es obligatorio." };

      const payload = { ...data, nombre };
      if (payload.id) await Insumo.update(payload, { where: { id: payload.id } });
      else await Insumo.create(payload);

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

  ipcMain.handle("guardar-insumo-familia", async (_event, data) => {
    try {
      const nombre = String(data?.nombre || "").trim();
      const depId = data?.InsumoDepartamentoId;
      if (!nombre || !depId) return { success: false, message: "Nombre y departamento requeridos." };

      const nueva = await InsumoFamilia.create({ nombre, InsumoDepartamentoId: depId });
      return { success: true, message: "Familia creada.", data: nueva.toJSON() };
    } catch (error) {
      console.error("Error en guardar-insumo-familia:", error);
      return { success: false, message: "El nombre ya existe o es inválido." };
    }
  });
}

module.exports = { registerInsumosHandlers };
