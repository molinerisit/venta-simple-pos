// src/database/models/ArqueoCaja.js (Limpiado)
const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ArqueoCaja = sequelize.define(
    "ArqueoCaja",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

      fechaApertura: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      // Phase 5.4 — ORM-layer validators (defense-in-depth)
      montoInicial:  { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
      fechaCierre:   { type: DataTypes.DATE, allowNull: true },
      montoFinalEstimado: { type: DataTypes.FLOAT, allowNull: true },
      montoFinalReal:     { type: DataTypes.FLOAT, allowNull: true, validate: { min: 0 } },
      diferencia:         { type: DataTypes.FLOAT, allowNull: true },

      totalVentasEfectivo:      { type: DataTypes.FLOAT, allowNull: true },
      totalVentasDebito:        { type: DataTypes.FLOAT, allowNull: true },
      totalVentasCredito:       { type: DataTypes.FLOAT, allowNull: true },
      totalVentasQR:            { type: DataTypes.FLOAT, allowNull: true },
      totalVentasTransferencia: { type: DataTypes.FLOAT, allowNull: true },
      totalVentasCtaCte:        { type: DataTypes.FLOAT, allowNull: true },

      observaciones: { type: DataTypes.TEXT, allowNull: true },
      estado: { type: DataTypes.ENUM("ABIERTA", "CERRADA"), defaultValue: "ABIERTA" },

      UsuarioId: { type: DataTypes.UUID, allowNull: false },

      // ---- sync/multi-tenant (ELIMINADOS) ----
      // cloud_tenant_id: ELIMINADO
      // cloud_id:          ELIMINADO
      // dirty:             ELIMINADO
    },
    {
      tableName: "arqueos_caja",
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ["UsuarioId"] },
        { fields: ["fechaApertura"] },
        { fields: ["fechaCierre"] },
        { fields: ["estado"] },
        // Índices de sync eliminados
        { fields: ["updatedAt"] },
        { fields: ["deletedAt"] },
      ],
    }
  );

  return ArqueoCaja;
};