'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const desc = await queryInterface.describeTable('Usuario');
    if (!desc.remote_access_enabled) {
      await queryInterface.addColumn('Usuario', 'remote_access_enabled', {
        type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false,
      });
    }
    if (!desc.remote_access_port) {
      await queryInterface.addColumn('Usuario', 'remote_access_port', {
        type: DataTypes.INTEGER, allowNull: true, defaultValue: 4827,
      });
    }
    if (!desc.remote_access_token) {
      await queryInterface.addColumn('Usuario', 'remote_access_token', {
        type: DataTypes.STRING, allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Usuario', 'remote_access_enabled');
    await queryInterface.removeColumn('Usuario', 'remote_access_port');
    await queryInterface.removeColumn('Usuario', 'remote_access_token');
  },
};
