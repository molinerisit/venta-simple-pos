'use strict';

const path = require('path');
const { Sequelize } = require('sequelize');

/**
 * Creates and migrates a fresh in-memory SQLite database.
 * Loads the same models as main.js and applies all associations.
 * Safe to call once per test session; use db-reset.js between individual tests.
 */
async function setupTestDb() {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });

  await sequelize.authenticate();

  // Same PRAGMAs as production (Phase 1.1 fix)
  await sequelize.query('PRAGMA journal_mode = WAL;');
  await sequelize.query('PRAGMA foreign_keys = ON;');

  // Load models in the same order as main.js
  const modelRoot = path.resolve(__dirname, '../../src/database/models');
  const modelNames = [
    'Usuario', 'Producto', 'Proveedor', 'Venta', 'DetalleVenta', 'Cliente',
    'ProductoDepartamento', 'ProductoFamilia', 'Empleado', 'GastoFijo',
    'Factura', 'Insumo', 'Compra', 'DetalleCompra', 'InsumoDepartamento',
    'InsumoFamilia', 'MovimientoCuentaCorriente', 'ArqueoCaja',
  ];

  const models = {};
  for (const name of modelNames) {
    models[name] = require(path.join(modelRoot, `${name}.js`))(sequelize);
  }

  const { applyAssociations } = require('../../src/database/associations');
  applyAssociations(models);

  // Runs all pending migrations (creates schema + adds new columns from Phase 2)
  const { runMigrations } = require('../../src/database/migrator');
  await runMigrations(sequelize);

  return { sequelize, models };
}

module.exports = { setupTestDb };
