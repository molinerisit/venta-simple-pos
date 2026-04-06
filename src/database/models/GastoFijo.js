// src/database/models/GastoFijo.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const GastoFijo = sequelize.define('GastoFijo', {
    id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nombre: { type: DataTypes.STRING, allowNull: false, unique: true },
    monto:  { type: DataTypes.FLOAT,  allowNull: false, defaultValue: 0 },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'gastos_fijos',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['nombre'] }, 
      // Índices de sync eliminados
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return GastoFijo;
};