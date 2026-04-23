'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('usuarios');
    if (tableDesc.direccion_negocio) return; // idempotent
    await queryInterface.addColumn('usuarios', 'direccion_negocio', {
      type: Sequelize.DataTypes.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('usuarios');
    if (tableDesc.direccion_negocio) {
      await queryInterface.removeColumn('usuarios', 'direccion_negocio');
    }
  },
};
