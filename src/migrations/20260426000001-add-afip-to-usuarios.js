'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDesc = await queryInterface.describeTable('Usuario');
    const cols = [
      { name: 'facturacion_activa', def: { type: Sequelize.DataTypes.BOOLEAN, allowNull: true, defaultValue: false } },
      { name: 'afip_cuit',         def: { type: Sequelize.DataTypes.STRING,  allowNull: true, defaultValue: null } },
      { name: 'afip_pto_vta',      def: { type: Sequelize.DataTypes.INTEGER, allowNull: true, defaultValue: null } },
      { name: 'afip_cert_path',    def: { type: Sequelize.DataTypes.STRING,  allowNull: true, defaultValue: null } },
      { name: 'afip_key_path',     def: { type: Sequelize.DataTypes.STRING,  allowNull: true, defaultValue: null } },
    ];
    for (const col of cols) {
      if (!tableDesc[col.name]) {
        await queryInterface.addColumn('Usuario', col.name, col.def);
      }
    }
  },
  async down(queryInterface) {
    const tableDesc = await queryInterface.describeTable('Usuario');
    const cols = ['facturacion_activa','afip_cuit','afip_pto_vta','afip_cert_path','afip_key_path'];
    for (const name of cols) {
      if (tableDesc[name]) await queryInterface.removeColumn('Usuario', name);
    }
  },
};
