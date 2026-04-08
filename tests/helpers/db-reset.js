'use strict';

/**
 * Deletes all rows from every user table.
 * Called between individual tests to prevent state leaks.
 * Uses raw SQL with FK checks disabled to avoid ordering constraints.
 */
async function resetDb(sequelize) {
  await sequelize.query('PRAGMA foreign_keys = OFF');

  const [tables] = await sequelize.query(
    `SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name NOT IN ('SequelizeMeta', 'sqlite_sequence')`
  );

  for (const { name } of tables) {
    await sequelize.query(`DELETE FROM "${name}"`);
  }

  await sequelize.query('PRAGMA foreign_keys = ON');
}

module.exports = { resetDb };
