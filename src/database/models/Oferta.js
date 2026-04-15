// src/database/models/Oferta.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Oferta = sequelize.define('Oferta', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    ProductoId: { type: DataTypes.UUID, allowNull: false },

    // 'porcentaje' | '2x1' | '3x2'
    tipo: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [['porcentaje', '2x1', '3x2']] },
    },

    // Solo para tipo='porcentaje': el % de descuento (ej: 20 = 20% off)
    valor: { type: DataTypes.FLOAT, allowNull: true },

    // Etiqueta visible (ej: "Oferta del lunes", "Semana del queso")
    nombre: { type: DataTypes.STRING, allowNull: true },

    // JSON array de números de día ISO (1=lunes … 7=domingo).
    // null o '[]' → aplica todos los días.
    dias_semana: { type: DataTypes.STRING, allowNull: true },

    activa: { type: DataTypes.BOOLEAN, defaultValue: true },

    fecha_inicio: { type: DataTypes.DATEONLY, allowNull: true },
    fecha_fin:    { type: DataTypes.DATEONLY, allowNull: true },

  }, {
    tableName: 'ofertas',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['ProductoId'] },
      { fields: ['activa'] },
      { fields: ['tipo'] },
      { fields: ['fecha_fin'] },
    ],
  });

  return Oferta;
};
