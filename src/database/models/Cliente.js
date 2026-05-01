const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Cliente = sequelize.define(
    "Cliente",
    {
      id:       { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      dni:      { type: DataTypes.STRING, allowNull: true, unique: true },
      nombre:   { type: DataTypes.STRING },
      apellido: { type: DataTypes.STRING, allowNull: true },
      descuento:{ type: DataTypes.FLOAT, defaultValue: 0 },
      deuda:    { type: DataTypes.FLOAT, defaultValue: 0 },

      // Mercado Pago enrichment
      email:              { type: DataTypes.STRING, allowNull: true, unique: true },
      telefono:           { type: DataTypes.STRING, allowNull: true },
      origenCliente:      { type: DataTypes.STRING(20), defaultValue: 'manual' },
      mercadoPagoPayerId: { type: DataTypes.STRING, allowNull: true, unique: true },
      primeraCompraMP:    { type: DataTypes.DATE, allowNull: true },
      ultimaCompraMP:     { type: DataTypes.DATE, allowNull: true },
      totalCompradoMP:    { type: DataTypes.FLOAT, defaultValue: 0 },
      cantidadComprasMP:  { type: DataTypes.INTEGER, defaultValue: 0 },
      ultimoMedioPago:    { type: DataTypes.STRING, allowNull: true },
      paymentStats: {
        type: DataTypes.TEXT,
        allowNull: true,
        get() {
          const raw = this.getDataValue('paymentStats');
          return raw
            ? JSON.parse(raw)
            : { qr: 0, transferencia: 0, tarjeta: 0, dineroCuenta: 0, otro: 0 };
        },
        set(val) {
          this.setDataValue('paymentStats', val ? JSON.stringify(val) : null);
        },
      },
    },
    {
      tableName: "clientes",
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ["nombre"] },
        { fields: ["apellido"] },
        { fields: ["deuda"] },
        { fields: ["updatedAt"] },
        { fields: ["deletedAt"] },
        { fields: ["mercadoPagoPayerId"] },
        { fields: ["email"] },
      ],
    }
  );

  return Cliente;
};
