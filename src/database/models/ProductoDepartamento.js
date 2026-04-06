// src/database/models/ProductoDepartamento.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProductoDepartamento = sequelize.define('ProductoDepartamento', {
    id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nombre: { type: DataTypes.STRING, allowNull: false, unique: true },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'ProductoDepartamento',
    freezeTableName: true,   
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['nombre'] },
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
      // Índices de sync eliminados
    ]
  });

  return ProductoDepartamento;
};