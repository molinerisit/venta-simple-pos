'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('clientes');
    if (!tableDesc.cloud_id) {
      await queryInterface.addColumn('clientes', 'cloud_id', {
        type: Sequelize.STRING(36),
        allowNull: true,
        defaultValue: null,
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('clientes', 'cloud_id');
  },
};
