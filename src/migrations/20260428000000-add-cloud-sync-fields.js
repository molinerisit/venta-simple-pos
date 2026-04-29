'use strict';

/** Agrega cloud_id a productos y proveedores para rastrear el UUID en la nube.
 *  Necesario para sincronización bidireccional desktop↔cloud. */
module.exports = {
  async up(queryInterface, Sequelize) {
    const prodCols = await queryInterface.describeTable('productos');
    if (!prodCols.cloud_id) {
      await queryInterface.addColumn('productos', 'cloud_id', {
        type: Sequelize.DataTypes.STRING(36),
        allowNull: true,
        defaultValue: null,
      });
    }

    const provCols = await queryInterface.describeTable('proveedores');
    if (!provCols.cloud_id) {
      await queryInterface.addColumn('proveedores', 'cloud_id', {
        type: Sequelize.DataTypes.STRING(36),
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface) {
    const prodCols = await queryInterface.describeTable('productos');
    if (prodCols.cloud_id) {
      await queryInterface.removeColumn('productos', 'cloud_id');
    }
    const provCols = await queryInterface.describeTable('proveedores');
    if (provCols.cloud_id) {
      await queryInterface.removeColumn('proveedores', 'cloud_id');
    }
  },
};
