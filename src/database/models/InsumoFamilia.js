// src/database/models/InsumoFamilia.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InsumoFamilia = sequelize.define('InsumoFamilia', {
    id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nombre: { type: DataTypes.STRING, allowNull: false },
    InsumoDepartamentoId: { type: DataTypes.UUID, allowNull: false },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'insumo_familias',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['InsumoDepartamentoId'] },
      { unique: true, fields: ['InsumoDepartamentoId', 'nombre'] },
      // Índices de sync eliminados
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return InsumoFamilia;
};