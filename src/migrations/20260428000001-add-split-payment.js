'use strict';

/** Agrega pagos_split (JSON) a ventas para soportar pago con dos medios. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = await queryInterface.describeTable('ventas');
    if (!cols.pagos_split) {
      await queryInterface.addColumn('ventas', 'pagos_split', {
        type: Sequelize.DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }
  },
  async down(queryInterface) {
    const cols = await queryInterface.describeTable('ventas');
    if (cols.pagos_split) {
      await queryInterface.removeColumn('ventas', 'pagos_split');
    }
  },
};
