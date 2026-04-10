'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('movimientos_caja', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      ArqueoCajaId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'arqueos_caja', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      tipo: {
        type: Sequelize.ENUM('INGRESO', 'EGRESO'),
        allowNull: false,
      },
      monto: {
        type: Sequelize.FLOAT,
        allowNull: false,
      },
      concepto: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      comprobante: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('movimientos_caja', ['ArqueoCajaId']);
    await queryInterface.addIndex('movimientos_caja', ['tipo']);
    await queryInterface.addIndex('movimientos_caja', ['createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('movimientos_caja');
  },
};
