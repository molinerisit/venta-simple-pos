'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const tableDesc = await queryInterface.describeTable('productos');
    if (tableDesc.acceso_rapido) return; // columna ya existe, no hacer nada
    await queryInterface.addColumn('productos', 'acceso_rapido', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  },
  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('productos');
    if (!tableDesc.acceso_rapido) return;
    await queryInterface.removeColumn('productos', 'acceso_rapido');
  },
};
