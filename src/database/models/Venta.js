// src/database/models/Venta.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Venta = sequelize.define('Venta', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    metodoPago:   { type: DataTypes.STRING, allowNull: false }, // Efectivo/Débito/Crédito/QR/CtaCte
    total:        { type: DataTypes.FLOAT, allowNull: false },
    montoPagado:  { type: DataTypes.FLOAT },
    vuelto:       { type: DataTypes.FLOAT },

    recargo:        { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    montoDescuento: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },

    ClienteId:    { type: DataTypes.UUID },
    dniCliente:   { type: DataTypes.STRING },

    facturada:    { type: DataTypes.BOOLEAN, defaultValue: false },

    // ---- CAMPOS DE SYNC ELIMINADOS ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO

  }, {
    tableName: 'ventas',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['createdAt'] },        // paginación cronológica
      { fields: ['metodoPago'] },
      { fields: ['ClienteId'] },
      { fields: ['facturada'] },
      { fields: ['total'] },
      { fields: ['dniCliente'] },
      { fields: ['UsuarioId'] },

      // --- Índices de Sync Eliminados ---
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return Venta;
};