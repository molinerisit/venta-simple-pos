'use strict';

/**
 * Initial schema bootstrap.
 *
 * Uses sequelize.sync() intentionally — this is the ONE place sync() is
 * allowed. It creates tables that do not yet exist and is non-destructive
 * on existing databases (no ALTER, no DROP).
 *
 * Existing installs: all tables already exist → sync() is a no-op.
 * Fresh installs:    sync() creates the full schema in dependency order.
 *
 * This migration is recorded in SequelizeMeta after first run and never
 * executed again. All future schema changes must be separate migration files.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.sync();
  },

  async down() {
    // Intentionally empty.
    // Rolling back the initial schema would destroy all data.
  },
};
