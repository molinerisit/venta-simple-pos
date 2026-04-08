'use strict';

const path = require('path');
const fs = require('fs');
const { Umzug, SequelizeStorage } = require('umzug');

/**
 * Runs all pending migrations in ascending order.
 * Migration files must:
 *   - Live in src/migrations/
 *   - Start with a digit (e.g. 20260407000000-description.js)
 *   - Export { up(queryInterface), down(queryInterface) }
 *
 * Applied migrations are tracked in the `SequelizeMeta` table.
 * Safe to call on every boot — already-applied migrations are skipped.
 */
async function runMigrations(sequelize) {
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.js') && /^\d/.test(f))
    .sort()
    .map((f) => path.join(migrationsDir, f));

  const umzug = new Umzug({
    migrations: migrationFiles.map((migPath) => ({
      name: path.basename(migPath, '.js'),
      up: async () => require(migPath).up(sequelize.getQueryInterface()),
      down: async () => require(migPath).down(sequelize.getQueryInterface()),
    })),
    storage: new SequelizeStorage({ sequelize }),
    logger: console,
  });

  await umzug.up();
}

module.exports = { runMigrations };
