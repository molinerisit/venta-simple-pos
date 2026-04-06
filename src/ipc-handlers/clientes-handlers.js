// src/ipc-handlers/clientes.js
const { ipcMain } = require("electron");
const { Op } = require("sequelize");

function registerClientesHandlers(models) {
  const { Cliente } = models;

  // Normaliza DNI: quita espacios y caracteres no numéricos
  const normDni = (dni) => String(dni || "").replace(/\D+/g, "").trim();

  // Lista completa (para pantallas pequeñas). Para grandes volúmenes, mejor usar paginado.
  ipcMain.handle("get-clientes", async () => {
    try {
      return await Cliente.findAll({
        attributes: ["id", "dni", "nombre", "apellido", "descuento", "deuda", "createdAt", "updatedAt"],
        order: [["nombre", "ASC"]],
        raw: true,
      });
    } catch (error) {
      console.error("Error al obtener clientes:", error);
      return [];
    }
  });

  // Búsqueda paginada y por texto (opcional) — útil para grillas grandes
  ipcMain.handle("search-clientes", async (_event, { q = "", page = 1, pageSize = 50 } = {}) => {
    try {
      const where = {};
      const term = String(q || "").trim();
      if (term) {
        const like = `%${term}%`;
        where[Op.or] = [
          { nombre: { [Op.like]: like } },
          { apellido: { [Op.like]: like } },
          { dni: { [Op.like]: like } },
        ];
      }
      page = Math.max(1, parseInt(page));
      pageSize = Math.min(200, Math.max(1, parseInt(pageSize)));

      const { rows, count } = await Cliente.findAndCountAll({
        where,
        attributes: ["id", "dni", "nombre", "apellido", "descuento", "deuda", "createdAt", "updatedAt"],
        order: [["nombre", "ASC"]],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        raw: true,
      });

      return { items: rows, total: count, page, pageSize };
    } catch (error) {
      console.error("Error en search-clientes:", error);
      return { items: [], total: 0, page: 1, pageSize: 50 };
    }
  });

  // Handler clave para Caja: buscar por DNI
  ipcMain.handle("get-cliente-by-dni", async (_event, dni) => {
    const clean = normDni(dni);
    if (!clean) return null;
    try {
      const cliente = await Cliente.findOne({
        where: { dni: clean },
        attributes: ["id", "dni", "nombre", "apellido", "descuento", "deuda"],
        raw: true,
      });
      return cliente;
    } catch (error) {
      console.error("Error al buscar cliente por DNI:", error);
      return null;
    }
  });

  // Crear/Actualizar cliente
  ipcMain.handle("guardar-cliente", async (_event, clienteData) => {
    try {
      const { id } = clienteData || {};
      const dni = normDni(clienteData?.dni);
      const nombre = String(clienteData?.nombre || "").trim();
      const apellido = String(clienteData?.apellido || "").trim() || null;
      const descuento = Number.isFinite(+clienteData?.descuento) ? +clienteData.descuento : 0;

      if (!dni || !nombre) {
        return { success: false, message: "El DNI y el Nombre son obligatorios." };
      }

      const payload = { dni, nombre, apellido, descuento };

      if (id) {
        const found = await Cliente.findByPk(id);
        if (!found) return { success: false, message: "El cliente a actualizar no fue encontrado." };

        // Si cambiaron el DNI, validá que no choque con otro
        if (found.dni !== dni) {
          const dup = await Cliente.findOne({ where: { dni }, attributes: ["id"], raw: true });
          if (dup) return { success: false, message: "El DNI ingresado ya existe." };
        }
        await found.update(payload);
      } else {
        await Cliente.create(payload);
      }

      return { success: true };
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError") {
        return { success: false, message: "El DNI ingresado ya existe." };
      }
      console.error("Error al guardar cliente:", error);
      return { success: false, message: "Ocurrió un error inesperado al guardar el cliente." };
    }
  });

  // Eliminar
  ipcMain.handle("eliminar-cliente", async (_event, clienteId) => {
    try {
      const result = await Cliente.destroy({ where: { id: clienteId } });
      return result > 0
        ? { success: true }
        : { success: false, message: "No se encontró el cliente para eliminar." };
    } catch (error) {
      console.error("Error al eliminar cliente:", error);
      return { success: false, message: "Error en la base de datos." };
    }
  });
}

module.exports = { registerClientesHandlers };
