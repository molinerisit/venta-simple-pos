'use strict';

/** Agrega cloud_id a ventas para rastrear el UUID en la nube tras sincronización. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('ventas');
    if (!cols.cloud_id) {
      await queryInterface.addColumn('ventas', 'cloud_id', {
        type: Sequelize.DataTypes.STRING(36),
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const cols = await queryInterface.describeTable('ventas');
    if (cols.cloud_id) {
      await queryInterface.removeColumn('ventas', 'cloud_id');
    }
  },
};
