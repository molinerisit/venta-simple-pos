// src/ipc-handlers/lotes-handlers.js
const { ipcMain } = require('electron');

function registerLotesHandlers(models) {
  const { Lote, Producto } = models;

  // Listar todos los lotes con info del producto
  ipcMain.handle('get-lotes', async (_e, opts = {}) => {
    try {
      const lotes = await Lote.findAll({
        include: [{ model: Producto, as: 'producto', attributes: ['id', 'nombre', 'codigo', 'codigo_barras'] }],
        order: [['fecha_vencimiento', 'ASC']],
      });
      return lotes.map((l) => l.toJSON());
    } catch (err) {
      console.error('[lotes] get-lotes:', err);
      return [];
    }
  });

  // Listar lotes de un producto en particular
  ipcMain.handle('get-lotes-by-producto', async (_e, productoId) => {
    try {
      const lotes = await Lote.findAll({
        where: { ProductoId: productoId },
        order: [['fecha_vencimiento', 'ASC']],
      });
      return lotes.map((l) => l.toJSON());
    } catch (err) {
      console.error('[lotes] get-lotes-by-producto:', err);
      return [];
    }
  });

  // Crear lote
  ipcMain.handle('crear-lote', async (_e, data) => {
    try {
      const { ProductoId, numero_lote, cantidad, fecha_vencimiento, fecha_ingreso, notas } = data || {};
      if (!ProductoId || !fecha_vencimiento) return { success: false, message: 'Faltan campos requeridos.' };
      if (cantidad < 0) return { success: false, message: 'La cantidad no puede ser negativa.' };

      const lote = await Lote.create({
        ProductoId,
        numero_lote: numero_lote?.trim() || null,
        cantidad: Number(cantidad) || 0,
        fecha_vencimiento,
        fecha_ingreso: fecha_ingreso || new Date().toISOString().slice(0, 10),
        notas: notas?.trim() || null,
      });
      return { success: true, lote: lote.toJSON() };
    } catch (err) {
      console.error('[lotes] crear-lote:', err);
      return { success: false, message: err.message };
    }
  });

  // Actualizar lote
  ipcMain.handle('actualizar-lote', async (_e, data) => {
    try {
      const { id, numero_lote, cantidad, fecha_vencimiento, fecha_ingreso, notas } = data || {};
      if (!id) return { success: false, message: 'ID requerido.' };
      if (cantidad < 0) return { success: false, message: 'La cantidad no puede ser negativa.' };

      const lote = await Lote.findByPk(id);
      if (!lote) return { success: false, message: 'Lote no encontrado.' };

      await lote.update({
        numero_lote: numero_lote?.trim() || null,
        cantidad: Number(cantidad) || 0,
        fecha_vencimiento,
        fecha_ingreso,
        notas: notas?.trim() || null,
      });
      return { success: true, lote: lote.toJSON() };
    } catch (err) {
      console.error('[lotes] actualizar-lote:', err);
      return { success: false, message: err.message };
    }
  });

  // Eliminar lote
  ipcMain.handle('eliminar-lote', async (_e, id) => {
    try {
      const lote = await Lote.findByPk(id);
      if (!lote) return { success: false, message: 'Lote no encontrado.' };
      await lote.destroy();
      return { success: true };
    } catch (err) {
      console.error('[lotes] eliminar-lote:', err);
      return { success: false, message: err.message };
    }
  });
}

module.exports = { registerLotesHandlers };
