// src/database/models/MovimientoCaja.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MovimientoCaja = sequelize.define('MovimientoCaja', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ArqueoCajaId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    tipo: {
      type: DataTypes.ENUM('INGRESO', 'EGRESO'),
      allowNull: false,
    },
    monto: {
      type: DataTypes.FLOAT,
      allowNull: false,
      validate: { min: 0.01 },
    },
    // Quién lo dejó / para qué (obligatorio en ambos tipos)
    concepto: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    // Nº de factura o comprobante (obligatorio en EGRESO)
    comprobante: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  }, {
    tableName: 'movimientos_caja',
    timestamps: true,
    indexes: [
      { fields: ['ArqueoCajaId'] },
      { fields: ['tipo'] },
      { fields: ['createdAt'] },
    ],
  });

  return MovimientoCaja;
};
