'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    // Guard: fresh installs already have the table created by sync() in the
    // initial migration. Only create the table when it doesn't exist yet.
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('ofertas')) {
      await queryInterface.createTable('ofertas', {
        id:          { type: DataTypes.UUID, primaryKey: true, allowNull: false },
        ProductoId:  { type: DataTypes.UUID, allowNull: false,
                       references: { model: 'productos', key: 'id' },
                       onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        tipo:        { type: DataTypes.STRING, allowNull: false },
        valor:       { type: DataTypes.FLOAT, allowNull: true },
        nombre:      { type: DataTypes.STRING, allowNull: true },
        dias_semana: { type: DataTypes.STRING, allowNull: true },
        activa:      { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
        fecha_inicio:{ type: DataTypes.DATEONLY, allowNull: true },
        fecha_fin:   { type: DataTypes.DATEONLY, allowNull: true },
        createdAt:   { type: DataTypes.DATE, allowNull: false },
        updatedAt:   { type: DataTypes.DATE, allowNull: false },
        deletedAt:   { type: DataTypes.DATE, allowNull: true },
      });

      // Indexes are only needed if we just created the table; sync() already
      // added them on fresh installs.
      try { await queryInterface.addIndex('ofertas', ['ProductoId']); } catch (_) {}
      try { await queryInterface.addIndex('ofertas', ['activa']);      } catch (_) {}
      try { await queryInterface.addIndex('ofertas', ['fecha_fin']);   } catch (_) {}
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ofertas');
  },
};
