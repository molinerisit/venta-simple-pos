// src/database/models/Lote.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Lote = sequelize.define('Lote', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    ProductoId: { type: DataTypes.UUID, allowNull: false },

    numero_lote: { type: DataTypes.STRING, allowNull: true },

    cantidad:    { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, validate: { min: 0 } },

    fecha_vencimiento: { type: DataTypes.DATEONLY, allowNull: false },

    fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: false },

    notas: { type: DataTypes.TEXT, allowNull: true },

  }, {
    tableName: 'lotes',
    timestamps: true,
    indexes: [
      { fields: ['ProductoId'] },
      { fields: ['fecha_vencimiento'] },
    ],
  });

  return Lote;
};
