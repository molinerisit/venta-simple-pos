'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const exists = await queryInterface.describeTable('catalog_cache').catch(() => null);
    if (exists) return;
    await queryInterface.createTable('catalog_cache', {
      barcode:        { type: Sequelize.DataTypes.STRING(60), primaryKey: true },
      canonical_name: { type: Sequelize.DataTypes.STRING },
      department:     { type: Sequelize.DataTypes.STRING },
      family:         { type: Sequelize.DataTypes.STRING },
      brand:          { type: Sequelize.DataTypes.STRING },
      unit:           { type: Sequelize.DataTypes.STRING },
      size:           { type: Sequelize.DataTypes.STRING },
      confidence:     { type: Sequelize.DataTypes.FLOAT, defaultValue: 0 },
      sources_count:  { type: Sequelize.DataTypes.INTEGER, defaultValue: 0 },
      miss:           { type: Sequelize.DataTypes.BOOLEAN, defaultValue: false },
      cached_at:      { type: Sequelize.DataTypes.DATE },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('catalog_cache').catch(() => {});
  },
};
