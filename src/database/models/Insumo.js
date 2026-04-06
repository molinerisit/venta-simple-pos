// src/database/models/Insumo.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Insumo = sequelize.define('Insumo', {
    id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    nombre: { type: DataTypes.STRING, allowNull: false, unique: true },
    stock:  { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    unidad: { type: DataTypes.STRING, allowNull: true },
    ultimoPrecioCompra: { type: DataTypes.FLOAT, allowNull: true },

    InsumoDepartamentoId: { type: DataTypes.UUID, allowNull: true },
    InsumoFamiliaId:      { type: DataTypes.UUID, allowNull: true },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'insumos',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['nombre'] },
      { fields: ['InsumoDepartamentoId'] },
      { fields: ['InsumoFamiliaId'] },
      // Índices de sync eliminados
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return Insumo;
};