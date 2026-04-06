// src/database/models/MovimientoCuentaCorriente.js (Limpiado)
'use strict';
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MovimientoCuentaCorriente = sequelize.define('MovimientoCuentaCorriente', {
    id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    fecha: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    tipo:  { type: DataTypes.ENUM('DEBITO', 'CREDITO'), allowNull: false },
    monto: { type: DataTypes.FLOAT, allowNull: false },
    concepto:      { type: DataTypes.STRING, allowNull: true },
    saldoAnterior: { type: DataTypes.FLOAT, allowNull: false },
    saldoNuevo:    { type: DataTypes.FLOAT, allowNull: false },

    ClienteId: { type: DataTypes.UUID, allowNull: true },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'movimientos_cuenta_corriente',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['ClienteId'] },
      { fields: ['fecha'] },
      { fields: ['tipo'] },
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
      // Índices de sync eliminados
    ]
  });

  return MovimientoCuentaCorriente;
};