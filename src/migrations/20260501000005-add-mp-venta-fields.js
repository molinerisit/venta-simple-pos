'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('ventas');

    if (!cols.mpPaymentId) {
      await queryInterface.addColumn('ventas', 'mpPaymentId', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!cols.mpTransactionStatus) {
      await queryInterface.addColumn('ventas', 'mpTransactionStatus', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!cols.mpPaymentMethod) {
      await queryInterface.addColumn('ventas', 'mpPaymentMethod', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }

    if (!cols.mpMatchedAt) {
      await queryInterface.addColumn('ventas', 'mpMatchedAt', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }

    if (!cols.mpMatchConfidence) {
      await queryInterface.addColumn('ventas', 'mpMatchConfidence', {
        type: Sequelize.FLOAT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('ventas', 'mpPaymentId');
    await queryInterface.removeColumn('ventas', 'mpTransactionStatus');
    await queryInterface.removeColumn('ventas', 'mpPaymentMethod');
    await queryInterface.removeColumn('ventas', 'mpMatchedAt');
    await queryInterface.removeColumn('ventas', 'mpMatchConfidence');
  },
};
