// src/database/models/InsumoDepartamento.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InsumoDepartamento = sequelize.define('InsumoDepartamento', {
    id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nombre: { type: DataTypes.STRING, allowNull: false, unique: true },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'insumo_departamentos',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['nombre'] },
      // Índices de sync eliminados
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return InsumoDepartamento;
};