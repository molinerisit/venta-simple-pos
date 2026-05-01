const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "MpSyncLog",
    {
      paymentId: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
      clienteId: { type: DataTypes.STRING(36), allowNull: true },
      syncedAt:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    { tableName: "mp_sync_log", timestamps: false }
  );
};
