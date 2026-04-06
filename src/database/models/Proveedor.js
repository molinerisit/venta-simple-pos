// src/database/models/Proveedor.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Proveedor = sequelize.define('Proveedor', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    nombreEmpresa:    { type: DataTypes.STRING, allowNull: false, unique: true },
    nombreRepartidor: { type: DataTypes.STRING },

    tipo: { type: DataTypes.ENUM('producto', 'insumos', 'ambos'), allowNull: false, defaultValue: 'producto' },

    telefono: { type: DataTypes.STRING },

    diasReparto:  { type: DataTypes.STRING },
    limitePedido: { type: DataTypes.STRING },

    deuda: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'proveedores',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['nombreEmpresa'] },
      { fields: ['tipo'] },
      { fields: ['deuda'] },
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
      // Índices de sync eliminados
    ]
  });

  return Proveedor;
};