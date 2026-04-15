'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    // Guard: fresh installs already have this column from sync().
    const desc = await queryInterface.describeTable('Usuario');
    if (!desc.email) {
      await queryInterface.addColumn('Usuario', 'email', {
        type: DataTypes.STRING,
        allowNull: true,
      });
    }
  },
  async down(queryInterface) {
    await queryInterface.removeColumn('Usuario', 'email');
  },
};
