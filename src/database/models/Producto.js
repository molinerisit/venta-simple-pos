// src/database/models/Producto.js (CORREGIDO)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Producto = sequelize.define('Producto', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    // 🟢 'codigo' será la clave única para import/export
    codigo: { type: DataTypes.STRING, allowNull: false, unique: true },
    nombre: { type: DataTypes.STRING, allowNull: false }, // 🟢 Ya no es único
    
    // Tus campos FLOAT (¡están perfectos!)
    stock:  { type: DataTypes.FLOAT, defaultValue: 0 },
    unidad: { type: DataTypes.STRING, defaultValue: 'unidad' },
    precioCompra: { type: DataTypes.FLOAT, defaultValue: 0 },
    precioVenta:  { type: DataTypes.FLOAT, defaultValue: 0 },
    precio_oferta:  { type: DataTypes.FLOAT, allowNull: true },

    // 🟢 'codigo_barras' y 'plu' ahora pueden ser nulos y no son únicos
    codigo_barras: { type: DataTypes.STRING, allowNull: true, unique: false },
    plu:           { type: DataTypes.STRING, allowNull: true, unique: false },

    imagen_url:       { type: DataTypes.STRING },
    fecha_fin_oferta: { type: DataTypes.DATEONLY },
    fecha_vencimiento: { type: DataTypes.DATEONLY, allowNull: true },
    activo:  { type: DataTypes.BOOLEAN, defaultValue: true },
    pesable: { type: DataTypes.BOOLEAN, defaultValue: false },

    DepartamentoId: { type: DataTypes.UUID, allowNull: true },
    FamiliaId:      { type: DataTypes.UUID, allowNull: true },

  }, {
    tableName: 'productos',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['nombre'] },
      // 🟢 'codigo' es el nuevo índice único principal
      // { fields: ['codigo_barras'] }, // Eliminamos índices únicos conflictivos
      // { fields: ['plu'] },
      { fields: ['activo'] },
      { fields: ['DepartamentoId'] },
      { fields: ['FamiliaId'] },
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return Producto;
};