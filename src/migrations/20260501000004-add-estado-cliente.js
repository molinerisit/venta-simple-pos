'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('clientes');
    if (!cols.estadoCliente) {
      await queryInterface.addColumn('clientes', 'estadoCliente', {
        type: Sequelize.STRING(20),
        allowNull: true,
        defaultValue: 'activo',
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('clientes', 'estadoCliente');
  },
};
