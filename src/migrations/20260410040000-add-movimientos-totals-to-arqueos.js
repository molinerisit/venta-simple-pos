'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const tableDesc = await queryInterface.describeTable('arqueos_caja');
    if (!tableDesc.totalIngresosExtra) {
      await queryInterface.addColumn('arqueos_caja', 'totalIngresosExtra', {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      });
    }
    if (!tableDesc.totalEgresosExtra) {
      await queryInterface.addColumn('arqueos_caja', 'totalEgresosExtra', {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('arqueos_caja');
    if (tableDesc.totalIngresosExtra) {
      await queryInterface.removeColumn('arqueos_caja', 'totalIngresosExtra');
    }
    if (tableDesc.totalEgresosExtra) {
      await queryInterface.removeColumn('arqueos_caja', 'totalEgresosExtra');
    }
  },
};
