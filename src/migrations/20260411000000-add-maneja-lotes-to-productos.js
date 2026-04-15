'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    // Guard: fresh installs already have this column from sync().
    const desc = await queryInterface.describeTable('productos');
    if (!desc.maneja_lotes) {
      await queryInterface.addColumn('productos', 'maneja_lotes', {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('productos', 'maneja_lotes');
  },
};
