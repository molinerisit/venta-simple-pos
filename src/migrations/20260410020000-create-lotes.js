'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('lotes', {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
      ProductoId: { type: DataTypes.UUID, allowNull: false, references: { model: 'productos', key: 'id' }, onDelete: 'CASCADE' },
      numero_lote: { type: DataTypes.STRING, allowNull: true },
      cantidad: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      fecha_vencimiento: { type: DataTypes.DATEONLY, allowNull: false },
      fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: false },
      notas: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex('lotes', ['ProductoId']);
    await queryInterface.addIndex('lotes', ['fecha_vencimiento']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('lotes');
  },
};
