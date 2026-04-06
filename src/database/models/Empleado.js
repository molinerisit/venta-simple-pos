// src/database/models/Empleado.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Empleado = sequelize.define('Empleado', {
    id:      { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nombre:  { type: DataTypes.STRING, allowNull: false },
    funcion: { type: DataTypes.STRING, allowNull: true },
    sueldo:  { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'empleados',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['nombre'] },
      { fields: ['funcion'] },
      // Índices de sync eliminados
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return Empleado;
};