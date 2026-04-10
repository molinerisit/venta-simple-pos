'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('arqueos_caja', 'totalIngresosExtra', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0,
    });
    await queryInterface.addColumn('arqueos_caja', 'totalEgresosExtra', {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('arqueos_caja', 'totalIngresosExtra');
    await queryInterface.removeColumn('arqueos_caja', 'totalEgresosExtra');
  },
};
