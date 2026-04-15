'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    // Guard: fresh installs already have these columns from sync().
    const desc = await queryInterface.describeTable('Usuario');

    if (!desc.config_gmail_user) {
      await queryInterface.addColumn('Usuario', 'config_gmail_user', {
        type: DataTypes.STRING, allowNull: true,
      });
    }
    if (!desc.config_gmail_pass) {
      await queryInterface.addColumn('Usuario', 'config_gmail_pass', {
        type: DataTypes.STRING, allowNull: true,
      });
    }
    if (!desc.recovery_token) {
      await queryInterface.addColumn('Usuario', 'recovery_token', {
        type: DataTypes.STRING, allowNull: true,
      });
    }
    if (!desc.recovery_token_expires) {
      await queryInterface.addColumn('Usuario', 'recovery_token_expires', {
        type: DataTypes.DATE, allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Usuario', 'config_gmail_user');
    await queryInterface.removeColumn('Usuario', 'config_gmail_pass');
    await queryInterface.removeColumn('Usuario', 'recovery_token');
    await queryInterface.removeColumn('Usuario', 'recovery_token_expires');
  },
};
