// src/database/models/DetalleVenta.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DetalleVenta = sequelize.define('DetalleVenta', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    nombreProducto: { type: DataTypes.STRING, allowNull: false },
    cantidad:       { type: DataTypes.FLOAT, allowNull: false },
    precioUnitario: { type: DataTypes.FLOAT, allowNull: false },
    subtotal:       { type: DataTypes.FLOAT, allowNull: false },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'detalles_venta',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['VentaId'] },
      { fields: ['ProductoId'] },
      { fields: ['nombreProducto'] },
      // Índices de sync eliminados
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return DetalleVenta;
};