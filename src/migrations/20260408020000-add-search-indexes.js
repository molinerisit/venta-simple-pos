'use strict';

/**
 * M-4: Add non-unique indexes on productos.codigo_barras and productos.plu.
 *
 * These indexes were removed when the columns were changed from unique to
 * non-unique (to allow null values and duplicates). Without them,
 * busqueda-inteligente performs full table scans on every barcode scan.
 *
 * addIndex with ifNotExists: true — safe to run on both fresh installs
 * (where sync() created no indexes) and existing installs.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('productos', ['codigo_barras'], {
      name: 'productos_codigo_barras',
      unique: false,
      // SQLite does not natively support IF NOT EXISTS on indexes via queryInterface,
      // so we catch the "already exists" error and treat it as a no-op.
    }).catch((err) => {
      if (!err.message.includes('already exists')) throw err;
    });

    await queryInterface.addIndex('productos', ['plu'], {
      name: 'productos_plu',
      unique: false,
    }).catch((err) => {
      if (!err.message.includes('already exists')) throw err;
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('productos', 'productos_codigo_barras').catch(() => {});
    await queryInterface.removeIndex('productos', 'productos_plu').catch(() => {});
  },
};
