'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('Usuario');
    if (tableDesc.direccion_negocio) return; // idempotent
    await queryInterface.addColumn('Usuario', 'direccion_negocio', {
      type: Sequelize.DataTypes.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('Usuario');
    if (tableDesc.direccion_negocio) {
      await queryInterface.removeColumn('Usuario', 'direccion_negocio');
    }
  },
};
