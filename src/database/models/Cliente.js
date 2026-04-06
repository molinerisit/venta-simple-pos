// src/database/models/Cliente.js (Limpiado)
const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Cliente = sequelize.define(
    "Cliente",
    {
      id:   { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      dni:      { type: DataTypes.STRING, allowNull: false, unique: true },
      nombre:   { type: DataTypes.STRING },
      apellido: { type: DataTypes.STRING, allowNull: true },
      descuento:{ type: DataTypes.FLOAT, defaultValue: 0 },
      deuda:    { type: DataTypes.FLOAT, defaultValue: 0 },

      // ---- sync/multi-tenant (ELIMINADOS) ----
      // cloud_tenant_id: ELIMINADO
      // cloud_id:          ELIMINADO
      // dirty:             ELIMINADO
    },
    {
      tableName: "clientes",
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ["dni"] },
        { fields: ["nombre"] },
        { fields: ["apellido"] },
        { fields: ["deuda"] },
        // Índices de sync eliminados
        { fields: ["updatedAt"] },
        { fields: ["deletedAt"] },
      ],
    }
  );

  return Cliente;
};