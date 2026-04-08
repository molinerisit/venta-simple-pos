'use strict';

const bcrypt = require('bcryptjs');

/**
 * Inserts the standard baseline required by most Phase 2 tests:
 *
 *   - 1 admin user  (config_recargo_credito=0, config_descuento_efectivo=0)
 *   - Producto A    (stock=10, precioVenta=100)
 *   - Producto B    (stock=1,  precioVenta=50)
 *   - Producto C    (stock=0,  precioVenta=200)
 *   - 1 open ArqueoCaja (montoInicial=1000)
 *
 * Returns all created instances.
 * Call resetDb() before each test, then seedBase() to get a clean slate.
 */
async function seedBase(models) {
  // rounds=1 is deliberately low — only for test speed, never in production
  const passwordHash = await bcrypt.hash('test123', 1);

  const admin = await models.Usuario.create({
    nombre: 'Admin Test',
    password: passwordHash,
    rol: 'administrador',
    config_recargo_credito: 0,
    config_descuento_efectivo: 0,
  });

  const prodA = await models.Producto.create({
    codigo: 'PRODA',
    nombre: 'Producto A',
    stock: 10,
    precioVenta: 100,
    activo: true,
  });

  const prodB = await models.Producto.create({
    codigo: 'PRODB',
    nombre: 'Producto B',
    stock: 1,
    precioVenta: 50,
    activo: true,
  });

  const prodC = await models.Producto.create({
    codigo: 'PRODC',
    nombre: 'Producto C',
    stock: 0,
    precioVenta: 200,
    activo: true,
  });

  const arqueo = await models.ArqueoCaja.create({
    montoInicial: 1000,
    UsuarioId: admin.id,
    estado: 'ABIERTA',
  });

  return { admin, prodA, prodB, prodC, arqueo };
}

module.exports = { seedBase };
