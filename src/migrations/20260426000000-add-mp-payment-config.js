'use strict';

/** Agrega mp_payment_config (JSON) al usuario admin para configurar el comportamiento
 *  de cada medio de pago (QR, débito, crédito) contra la API de Mercado Pago. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('Usuario');
    if (tableDesc.mp_payment_config) return; // idempotent
    await queryInterface.addColumn('Usuario', 'mp_payment_config', {
      type: Sequelize.DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  },
  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('Usuario');
    if (tableDesc.mp_payment_config) {
      await queryInterface.removeColumn('Usuario', 'mp_payment_config');
    }
  },
};
