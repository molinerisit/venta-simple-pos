'use strict';

const { DataTypes } = require('sequelize');

/**
 * Adds totalVentasTransferencia and totalVentasCtaCte columns to arqueos_caja.
 *
 * Required by H-3: the caja-close must account for every payment method.
 * Previously these two methods existed in Venta.metodoPago but had no
 * corresponding total column in ArqueoCaja — values were silently dropped.
 */
module.exports = {
  async up(queryInterface) {
    // Guard: on fresh installs the initial sync() already created all columns
    // from the current model definition. Only add the column if it doesn't exist.
    const desc = await queryInterface.describeTable('arqueos_caja');

    if (!desc.totalVentasTransferencia) {
      await queryInterface.addColumn('arqueos_caja', 'totalVentasTransferencia', {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: null,
      });
    }

    if (!desc.totalVentasCtaCte) {
      await queryInterface.addColumn('arqueos_caja', 'totalVentasCtaCte', {
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('arqueos_caja', 'totalVentasTransferencia');
    await queryInterface.removeColumn('arqueos_caja', 'totalVentasCtaCte');
  },
};
