'use strict';

const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('movimientos_caja', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      ArqueoCajaId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'arqueos_caja', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      tipo: {
        type: DataTypes.ENUM('INGRESO', 'EGRESO'),
        allowNull: false,
      },
      monto: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
      concepto: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      comprobante: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });

    await queryInterface.addIndex('movimientos_caja', ['ArqueoCajaId']);
    await queryInterface.addIndex('movimientos_caja', ['tipo']);
    await queryInterface.addIndex('movimientos_caja', ['createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('movimientos_caja');
  },
};
