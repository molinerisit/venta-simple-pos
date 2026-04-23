'use strict';

// Adds nombre_normalizado (accent-free, lowercase) to productos.
// A unique index is created on this column to prevent duplicate product names.
// Before applying, we detect and log any existing duplicates so the app
// doesn't crash silently — duplicates must be resolved manually if present.

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('productos');
    if (tableDesc.nombre_normalizado) return; // idempotent

    await queryInterface.addColumn('productos', 'nombre_normalizado', {
      type: Sequelize.DataTypes.STRING,
      allowNull: true,
    });

    // Populate from existing data
    const [rows] = await queryInterface.sequelize.query(
      'SELECT id, nombre FROM productos WHERE deletedAt IS NULL'
    );
    for (const row of rows) {
      const norm = normalize(row.nombre);
      await queryInterface.sequelize.query(
        'UPDATE productos SET nombre_normalizado = ? WHERE id = ?',
        { replacements: [norm, row.id] }
      );
    }

    // Detect duplicates before adding unique index
    const [dups] = await queryInterface.sequelize.query(`
      SELECT nombre_normalizado, COUNT(*) as cnt
      FROM productos
      WHERE deletedAt IS NULL AND nombre_normalizado IS NOT NULL
      GROUP BY nombre_normalizado
      HAVING cnt > 1
    `);
    if (dups.length > 0) {
      console.warn('[migration] Productos con nombre duplicado detectados (el índice unique NO se aplicará hasta que se resuelvan):');
      dups.forEach(d => console.warn(' -', d.nombre_normalizado, '(', d.cnt, 'registros)'));
      // Skip unique index to avoid crashing existing installations with dupes.
      return;
    }

    await queryInterface.addIndex('productos', ['nombre_normalizado'], {
      unique: true,
      name: 'productos_nombre_normalizado_unique',
      where: { deletedAt: null },
    });
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex('productos', 'productos_nombre_normalizado_unique');
    } catch (_) {}
    const tableDesc = await queryInterface.describeTable('productos');
    if (tableDesc.nombre_normalizado) {
      await queryInterface.removeColumn('productos', 'nombre_normalizado');
    }
  },
};
