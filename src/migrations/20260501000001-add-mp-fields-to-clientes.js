'use strict';

// Adds MP-enrichment fields to clientes and makes dni nullable.
// SQLite does not support ALTER COLUMN, so the table is recreated.
module.exports = {
  async up(queryInterface) {
    const cols = await queryInterface.describeTable('clientes');
    if (cols.email) return; // Already migrated

    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.sequelize.query(`
        CREATE TABLE clientes_v2 (
          id                 TEXT     NOT NULL PRIMARY KEY,
          dni                TEXT     UNIQUE,
          nombre             TEXT,
          apellido           TEXT,
          descuento          REAL     NOT NULL DEFAULT 0,
          deuda              REAL     NOT NULL DEFAULT 0,
          email              TEXT     UNIQUE,
          telefono           TEXT,
          origenCliente      TEXT     NOT NULL DEFAULT 'manual',
          mercadoPagoPayerId TEXT     UNIQUE,
          primeraCompraMP    DATETIME,
          ultimaCompraMP     DATETIME,
          totalCompradoMP    REAL     NOT NULL DEFAULT 0,
          cantidadComprasMP  INTEGER  NOT NULL DEFAULT 0,
          ultimoMedioPago    TEXT,
          paymentStats       TEXT,
          createdAt          DATETIME NOT NULL,
          updatedAt          DATETIME NOT NULL,
          deletedAt          DATETIME
        )
      `, { transaction: t });

      await queryInterface.sequelize.query(`
        INSERT INTO clientes_v2
          (id, dni, nombre, apellido, descuento, deuda, createdAt, updatedAt, deletedAt)
        SELECT id, dni, nombre, apellido, descuento, deuda, createdAt, updatedAt, deletedAt
        FROM clientes
      `, { transaction: t });

      await queryInterface.sequelize.query(`DROP TABLE clientes`, { transaction: t });
      await queryInterface.sequelize.query(`ALTER TABLE clientes_v2 RENAME TO clientes`, { transaction: t });
    });

    const addIdx = (fields, name) =>
      queryInterface.addIndex('clientes', fields, { name, unique: false }).catch((e) => {
        if (!e.message.toLowerCase().includes('already exists')) throw e;
      });

    await addIdx(['nombre'],             'clientes_nombre');
    await addIdx(['apellido'],           'clientes_apellido');
    await addIdx(['deuda'],              'clientes_deuda');
    await addIdx(['updatedAt'],          'clientes_updated_at');
    await addIdx(['deletedAt'],          'clientes_deleted_at');
    await addIdx(['mercadoPagoPayerId'], 'clientes_mp_payer_id');
    await addIdx(['email'],              'clientes_email_idx');
  },

  async down() {
    // Not safely reversible without knowing which clients originated from MP
  },
};
