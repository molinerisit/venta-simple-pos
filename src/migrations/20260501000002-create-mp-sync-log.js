'use strict';

// Tracks which MP payment IDs have already been synced to a cliente.
// Used to make syncMercadoPagoPayersToClientes idempotent.
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('mp_sync_log')) return;

    await queryInterface.createTable('mp_sync_log', {
      paymentId: {
        type: Sequelize.DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      clienteId: {
        type: Sequelize.DataTypes.STRING(36),
        allowNull: true,
      },
      syncedAt: {
        type: Sequelize.DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("(datetime('now'))"),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mp_sync_log').catch(() => {});
  },
};
