// src/database/models/Factura.js (Limpiado)
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Factura = sequelize.define('Factura', {
    id:       { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    cae:      { type: DataTypes.STRING, allowNull: false },
    caeVto:   { type: DataTypes.DATEONLY, allowNull: false },
    tipoComp: { type: DataTypes.INTEGER, allowNull: false },
    ptoVta:   { type: DataTypes.INTEGER, allowNull: false },
    nroComp:  { type: DataTypes.INTEGER, allowNull: false },
    docTipo:  { type: DataTypes.INTEGER },
    docNro:   { type: DataTypes.STRING },
    impTotal: { type: DataTypes.FLOAT, allowNull: false },

    // ---- sync/multi-tenant (ELIMINADOS) ----
    // cloud_tenant_id: ELIMINADO
    // cloud_id:          ELIMINADO
    // dirty:             ELIMINADO
  }, {
    tableName: 'facturas',
    timestamps: true,
    paranoid: true,
    indexes: [
      { fields: ['caeVto'] },
      { fields: ['docNro'] },
      { unique: true, fields: ['tipoComp', 'ptoVta', 'nroComp'] },
      // Índices de sync eliminados
      { fields: ['updatedAt'] },
      { fields: ['deletedAt'] },
    ]
  });

  return Factura;
};