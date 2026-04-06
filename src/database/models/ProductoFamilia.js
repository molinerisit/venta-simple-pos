// src/database/models/ProductoFamilia.js (CORREGIDO)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProductoFamilia = sequelize.define('ProductoFamilia', {
    id:     { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nombre: { type: DataTypes.STRING, allowNull: false },

    // ↓↓↓ AÑADE ESTE BLOQUE COMPLETO ↓↓↓
    DepartamentoId: {
      type: DataTypes.UUID,
      allowNull: true, // o false, si siempre debe tener uno
      references: {
        model: 'ProductoDepartamento', // Asegúrate que coincida con el tableName del modelo Departamento
        key: 'id'
      }
    }
    // ↑↑↑ FIN DEL BLOQUE AÑADIDO ↑↑↑
    
  }, {
    tableName: 'ProductoFamilia',
    freezeTableName: true,   
    timestamps: true,
    paranoid: true,
    indexes: [
      // Ahora este índice funcionará porque "ve" las dos columnas
      { unique: true, fields: ['DepartamentoId', 'nombre'] },
      
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return ProductoFamilia;
};