// src/database/models/DetalleCompra.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DetalleCompra = sequelize.define('DetalleCompra', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    cantidad:       { type: DataTypes.FLOAT, allowNull: false },
    precioUnitario: { type: DataTypes.FLOAT, allowNull: false },
    subtotal:       { type: DataTypes.FLOAT, allowNull: false },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'detalle_compras',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['CompraId'] },
      { fields: ['ProductoId'] },
      // Índices de sync eliminados
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return DetalleCompra;
};