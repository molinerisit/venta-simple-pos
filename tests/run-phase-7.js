'use strict';

// ─── CRITICAL: electron mock must be installed BEFORE any handler require ─────
const { invoke, registeredHandlers } = require('./helpers/electron-mock');

const path = require('path');
const fs   = require('fs');

const { setupTestDb } = require('./helpers/db-setup');
const { resetDb }     = require('./helpers/db-reset');
const { seedBase }    = require('./helpers/seed');
const { assertEqual, assertTrue, assertFalse } = require('./helpers/assertions');

// ─── HANDLER REGISTRATION (after mock) ────────────────────────────────────────
const { registerSessionHandlers, clearSession, getActiveUserId, _resetLoginAttempts } = require('../src/ipc-handlers/session-handlers');
const { registerConfigHandlers }      = require('../src/ipc-handlers/config-handlers');
const { registerComprasHandlers }     = require('../src/ipc-handlers/compras-handlers');
const { registerAdminHandlers }       = require('../src/ipc-handlers/admin-handlers');
const { registerMercadoPagoHandlers } = require('../src/ipc-handlers/mercadoPago-handlers');

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
let SEQ, MODELS;

async function fresh() {
  await resetDb(SEQ);
  return seedBase(MODELS);
}

// ─── TEST REGISTRY ────────────────────────────────────────────────────────────
const tests = [];
function test(id, name, fn) { tests.push({ id, name, fn }); }

// helper: simulate a logged-in session by directly setting activeUserId
// We do this by calling the real login handler
async function loginAs(userId) {
  // Directly manipulate module state via clearSession + re-assignment trick:
  // We register a synthetic session by relying on the exported setter pattern.
  // Since getActiveUserId() reads the module-level var and clearSession() resets it,
  // we use a dummy login that goes through the handler.
  clearSession();
  // Patch: directly write to the module-private var via the login handler
  // by creating a temporary mock user entry.
  // Simpler: exploit that registerSessionHandlers stores userId when login-attempt succeeds.
  // We call login-attempt with the user's actual credentials from the DB.
  const user = await MODELS.Usuario.scope('withPassword').findByPk(userId);
  if (!user) throw new Error('loginAs: user not found ' + userId);
  // Re-invoke login-attempt (handler already registered)
  const result = await invoke('login-attempt', { nombre: user.nombre, password: 'test123' });
  if (!result.success) throw new Error('loginAs failed: ' + result.message);
}

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1 — I-1: Session invalidation on logout
// ═════════════════════════════════════════════════════════════════════════════

test('1.1', 'I-1: clearSession sets activeUserId to null', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  assertTrue(getActiveUserId() !== null, '1.1 activeUserId must be set after login');
  clearSession();
  assertEqual(getActiveUserId(), null, '1.1 activeUserId must be null after clearSession');
});

test('1.2', 'I-1: get-user-session returns null after clearSession', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  clearSession();
  const session = await invoke('get-user-session');
  assertEqual(session, null, '1.2 get-user-session must return null after clearSession');
});

test('1.3', 'I-1: get-user-session returns user after login', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const session = await invoke('get-user-session');
  assertTrue(session !== null, '1.3 session must not be null after login');
  assertEqual(session.id, admin.id, '1.3 session.id must match logged-in user');
});

test('1.4', 'I-1: re-login after logout returns new user', async () => {
  const { admin } = await fresh();
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('test123', 1);
  const user2 = await MODELS.Usuario.create({ nombre: 'User2', password: hash, rol: 'empleado' });

  await loginAs(admin.id);
  clearSession();
  await loginAs(user2.id);
  assertEqual(getActiveUserId(), user2.id, '1.4 activeUserId must match user2 after re-login');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2 — S-3: get-user-session response field allowlist
// ═════════════════════════════════════════════════════════════════════════════

test('2.1', 'S-3: get-user-session does NOT expose mp_access_token', async () => {
  const { admin } = await fresh();
  await MODELS.Usuario.update({ mp_access_token: 'secret-token-123' }, { where: { id: admin.id } });
  await loginAs(admin.id);
  const session = await invoke('get-user-session');
  assertTrue(session !== null, '2.1 session must not be null');
  assertEqual(session.mp_access_token, undefined, '2.1 mp_access_token must not be in session response');
});

test('2.2', 'S-3: get-user-session does NOT expose password', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const session = await invoke('get-user-session');
  assertEqual(session.password, undefined, '2.2 password must not be in session response');
});

test('2.3', 'S-3: get-user-session returns required fields (id, nombre, rol, permisos)', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const session = await invoke('get-user-session');
  assertTrue(session.id !== undefined, '2.3 id must be in session');
  assertTrue(session.nombre !== undefined, '2.3 nombre must be in session');
  assertTrue(session.rol !== undefined, '2.3 rol must be in session');
});

test('2.4', 'S-3: get-admin-config does NOT expose mp_access_token', async () => {
  const { admin } = await fresh();
  await MODELS.Usuario.update({ mp_access_token: 'admin-secret' }, { where: { id: admin.id } });
  const config = await invoke('get-admin-config');
  assertTrue(config !== null, '2.4 config must not be null');
  assertEqual(config.mp_access_token, undefined, '2.4 mp_access_token must not be in admin config');
});

test('2.5', 'S-3: get-admin-config returns UI-required fields', async () => {
  const { admin } = await fresh();
  await MODELS.Usuario.update({ config_recargo_credito: 5, nombre_negocio: 'Mi Negocio' }, { where: { id: admin.id } });
  const config = await invoke('get-admin-config');
  assertTrue(config !== null, '2.5 config must not be null');
  assertTrue(config.config_recargo_credito !== undefined, '2.5 config_recargo_credito must be present');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3 — I-2: Range validation for config_recargo_credito / config_descuento_efectivo
// ═════════════════════════════════════════════════════════════════════════════

test('3.1', 'I-2: save-general-config rejects recargoCredito: -1', async () => {
  await fresh();
  const result = await invoke('save-general-config', { recargoCredito: -1, descuentoEfectivo: 0 });
  assertFalse(result.success, '3.1 negative recargoCredito must be rejected');
  assertTrue(typeof result.message === 'string', '3.1 must return a message');
});

test('3.2', 'I-2: save-general-config rejects recargoCredito: 101', async () => {
  await fresh();
  const result = await invoke('save-general-config', { recargoCredito: 101, descuentoEfectivo: 0 });
  assertFalse(result.success, '3.2 recargoCredito > 100 must be rejected');
});

test('3.3', 'I-2: save-general-config rejects descuentoEfectivo: 150', async () => {
  await fresh();
  const result = await invoke('save-general-config', { recargoCredito: 0, descuentoEfectivo: 150 });
  assertFalse(result.success, '3.3 descuentoEfectivo > 100 must be rejected');
});

test('3.4', 'I-2: save-general-config accepts boundary recargoCredito: 100, descuentoEfectivo: 0', async () => {
  await fresh();
  const result = await invoke('save-general-config', { recargoCredito: 100, descuentoEfectivo: 0, redondeo: false });
  assertTrue(result.success, '3.4 boundary value 100 must be accepted');
});

test('3.5', 'I-2: save-general-config accepts boundary recargoCredito: 0, descuentoEfectivo: 100', async () => {
  await fresh();
  const result = await invoke('save-general-config', { recargoCredito: 0, descuentoEfectivo: 100, redondeo: false });
  assertTrue(result.success, '3.5 boundary value 100 for descuentoEfectivo must be accepted');
});

test('3.6', 'I-2: saved value is persisted correctly', async () => {
  const { admin } = await fresh();
  await invoke('save-general-config', { recargoCredito: 15, descuentoEfectivo: 5, redondeo: false });
  const updated = await MODELS.Usuario.findByPk(admin.id, { raw: true });
  assertEqual(updated.config_recargo_credito, 15, '3.6 recargoCredito must be saved as 15');
  assertEqual(updated.config_descuento_efectivo, 5, '3.6 descuentoEfectivo must be saved as 5');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4 — I-3: actualizarPrecioVenta server-side validation
// ═════════════════════════════════════════════════════════════════════════════

async function setupCompraBase() {
  const { admin, prodA } = await fresh();
  await loginAs(admin.id);
  const proveedor = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov Test', deuda: 0 });
  return { admin, prodA, proveedor };
}

test('4.1', 'I-3: purchase rejects nuevoPrecioVenta below costoUnitario', async () => {
  const { prodA, proveedor } = await setupCompraBase();
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{
      productoId: prodA.id,
      cantidad: 1,
      costoUnitario: 50,
      actualizarPrecioVenta: true,
      nuevoPrecioVenta: 30, // below costo
    }],
    pago: { descuento: 0, recargo: 0, montoAbonado: 50, metodoPago: 'Efectivo' },
  });
  assertFalse(result.success, '4.1 nuevoPrecioVenta < costoUnitario must be rejected');
  assertTrue(result.message.includes('costo'), '4.1 error must mention costo');
});

test('4.2', 'I-3: purchase rejects nuevoPrecioVenta = 0', async () => {
  const { prodA, proveedor } = await setupCompraBase();
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{
      productoId: prodA.id,
      cantidad: 1,
      costoUnitario: 50,
      actualizarPrecioVenta: true,
      nuevoPrecioVenta: 0,
    }],
    pago: { descuento: 0, recargo: 0, montoAbonado: 50, metodoPago: 'Efectivo' },
  });
  assertFalse(result.success, '4.2 nuevoPrecioVenta = 0 must be rejected');
});

test('4.3', 'I-3: purchase rejects nuevoPrecioVenta > 100x costoUnitario', async () => {
  const { prodA, proveedor } = await setupCompraBase();
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{
      productoId: prodA.id,
      cantidad: 1,
      costoUnitario: 10,
      actualizarPrecioVenta: true,
      nuevoPrecioVenta: 9999, // >100x costo
    }],
    pago: { descuento: 0, recargo: 0, montoAbonado: 10, metodoPago: 'Efectivo' },
  });
  assertFalse(result.success, '4.3 nuevoPrecioVenta > 100x costo must be rejected');
});

test('4.4', 'I-3: valid actualizarPrecioVenta updates precioVenta in DB', async () => {
  const { prodA, proveedor } = await setupCompraBase();
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{
      productoId: prodA.id,
      cantidad: 2,
      costoUnitario: 50,
      actualizarPrecioVenta: true,
      nuevoPrecioVenta: 80, // valid: >= costo and <= 100x costo
    }],
    pago: { descuento: 0, recargo: 0, montoAbonado: 100, metodoPago: 'Efectivo' },
  });
  assertTrue(result.success, '4.4 valid price update must succeed');
  const updated = await MODELS.Producto.findByPk(prodA.id);
  assertEqual(updated.precioVenta, 80, '4.4 precioVenta must be 80 after update');
});

test('4.5', 'I-3: actualizarPrecioVenta: false leaves precioVenta unchanged', async () => {
  const { prodA, proveedor } = await setupCompraBase();
  const originalPrice = prodA.precioVenta; // 100
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{
      productoId: prodA.id,
      cantidad: 1,
      costoUnitario: 50,
      actualizarPrecioVenta: false,
      nuevoPrecioVenta: 200,
    }],
    pago: { descuento: 0, recargo: 0, montoAbonado: 50, metodoPago: 'Efectivo' },
  });
  assertTrue(result.success, '4.5 purchase without price update must succeed');
  const updated = await MODELS.Producto.findByPk(prodA.id);
  assertEqual(updated.precioVenta, originalPrice, '4.5 precioVenta must remain unchanged');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 5 — I-4: mp:refund-payment amount guard
// ═════════════════════════════════════════════════════════════════════════════

// For MP tests we mock doFetch by registering a spy via module override
// Since we can't easily intercept the internal function, we verify the
// handler's early-return behavior (before it would call resolveActiveMpContext).

test('5.1', 'I-4: mp:refund-payment with amount: 0 returns ok:false immediately', async () => {
  await fresh();
  const result = await invoke('mp:refund-payment', { paymentId: '123', amount: 0 });
  assertFalse(result.ok, '5.1 amount:0 must return ok:false');
  assertTrue(result.error.includes('positive'), '5.1 error must mention positive');
});

test('5.2', 'I-4: mp:refund-payment with amount: null returns ok:false', async () => {
  await fresh();
  const result = await invoke('mp:refund-payment', { paymentId: '123', amount: null });
  assertFalse(result.ok, '5.2 amount:null must return ok:false');
});

test('5.3', 'I-4: mp:refund-payment with amount: -50 returns ok:false', async () => {
  await fresh();
  const result = await invoke('mp:refund-payment', { paymentId: '123', amount: -50 });
  assertFalse(result.ok, '5.3 amount:-50 must return ok:false');
});

test('5.4', 'I-4: mp:refund-payment with amount: undefined returns ok:false', async () => {
  await fresh();
  const result = await invoke('mp:refund-payment', { paymentId: '123', amount: undefined });
  assertFalse(result.ok, '5.4 amount:undefined must return ok:false');
});

test('5.5', 'I-4: mp:refund-payment with valid amount passes validation (may fail on no token)', async () => {
  await fresh();
  const result = await invoke('mp:refund-payment', { paymentId: '123', amount: 100 });
  // At this point it should fail at resolveActiveMpContext (no admin mp_access_token)
  // but NOT with the "amount must be positive" error — it proceeds past I-4 guard.
  assertTrue(result.error !== 'amount must be a positive number',
    '5.5 valid amount must pass the guard (may fail later for other reasons)');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 6 — S-1: Server-side admin role authorization
// ═════════════════════════════════════════════════════════════════════════════

test('6.1', 'S-1: save-user denied when no active session', async () => {
  await fresh();
  clearSession();
  const result = await invoke('save-user', { nombre: 'Hacker', password: 'pass', rol: 'administrador' });
  assertFalse(result.success, '6.1 save-user with no session must be denied');
  assertTrue(result.message.includes('Acceso'), '6.1 message must mention access denied');
});

test('6.2', 'S-1: save-user denied for non-admin session', async () => {
  const { admin } = await fresh();
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('test123', 1);
  const empleado = await MODELS.Usuario.create({ nombre: 'Empleado1', password: hash, rol: 'empleado' });
  await loginAs(empleado.id);
  const result = await invoke('save-user', { nombre: 'Nueva Persona', password: 'pass', rol: 'empleado' });
  assertFalse(result.success, '6.2 non-admin session must be denied');
  assertTrue(result.message.includes('Acceso'), '6.2 must say Acceso denegado');
});

test('6.3', 'S-1: save-user allowed for admin session', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const result = await invoke('save-user', { nombre: 'NuevoEmpleado', password: 'pass123', rol: 'empleado' });
  assertTrue(result.success, '6.3 admin session must be able to create user');
});

test('6.4', 'S-1: save-user rejects invalid rol (not in allowlist)', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const result = await invoke('save-user', { nombre: 'HackerUser', password: 'pass123', rol: 'superadmin' });
  assertFalse(result.success, '6.4 rol not in allowlist must be rejected');
  assertTrue(result.message.toLowerCase().includes('rol') || result.message.toLowerCase().includes('inválido'),
    '6.4 message must mention invalid rol');
});

test('6.5', 'S-1: delete-user denied when no active session', async () => {
  const { admin } = await fresh();
  clearSession();
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('test123', 1);
  const target = await MODELS.Usuario.create({ nombre: 'Target', password: hash, rol: 'empleado' });
  const result = await invoke('delete-user', target.id);
  assertFalse(result.success, '6.5 delete-user with no session must be denied');
});

test('6.6', 'S-1: delete-user denied for non-admin session', async () => {
  const { admin } = await fresh();
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('test123', 1);
  const empleado = await MODELS.Usuario.create({ nombre: 'EmpDelTest', password: hash, rol: 'empleado' });
  const target = await MODELS.Usuario.create({ nombre: 'TargetDel', password: hash, rol: 'empleado' });
  await loginAs(empleado.id);
  const result = await invoke('delete-user', target.id);
  assertFalse(result.success, '6.6 non-admin delete-user must be denied');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 7 — S-2: UsuarioId from session, not renderer
// ═════════════════════════════════════════════════════════════════════════════

test('7.1', 'S-2: registrar-compra-producto uses session userId, ignores renderer UsuarioId', async () => {
  const { admin, prodA } = await fresh();
  await loginAs(admin.id);
  const proveedor = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov S2', deuda: 0 });
  const fakeId = '00000000-0000-0000-0000-000000000099';
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    UsuarioId: fakeId, // renderer tries to spoof
    items: [{ productoId: prodA.id, cantidad: 1, costoUnitario: 20 }],
    pago: { descuento: 0, recargo: 0, montoAbonado: 20, metodoPago: 'Efectivo' },
  });
  assertTrue(result.success, '7.1 purchase must succeed');
  const compra = await MODELS.Compra.findOne({ order: [['createdAt','DESC']] });
  assertEqual(compra.UsuarioId, admin.id, '7.1 Compra.UsuarioId must be admin.id from session, not fakeId');
});

test('7.2', 'S-2: registrar-compra-producto fails with no active session', async () => {
  await fresh();
  clearSession();
  const proveedor = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov NoSes', deuda: 0 });
  const prodA = await MODELS.Producto.findOne({ where: { codigo: 'PRODA' } });
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{ productoId: prodA.id, cantidad: 1, costoUnitario: 20 }],
    pago: { descuento: 0, recargo: 0, montoAbonado: 20, metodoPago: 'Efectivo' },
  });
  assertFalse(result.success, '7.2 purchase with no session must fail');
  assertTrue(result.message.includes('Sesión'), '7.2 message must mention session');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 8 — B-3: discount/recargo validation
// ═════════════════════════════════════════════════════════════════════════════

test('8.1', 'B-3: purchase rejects descuento > subtotal', async () => {
  const { prodA } = await fresh();
  const { admin } = { admin: await MODELS.Usuario.findOne({ where: { rol: 'administrador' } }) };
  await loginAs(admin.id);
  const proveedor = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov B3', deuda: 0 });
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{ productoId: prodA.id, cantidad: 1, costoUnitario: 100 }],
    pago: { descuento: 10000, recargo: 0, montoAbonado: 0, metodoPago: 'Efectivo' },
  });
  assertFalse(result.success, '8.1 descuento > subtotal must be rejected');
  assertTrue(result.message.includes('descuento'), '8.1 error must mention descuento');
});

test('8.2', 'B-3: purchase rejects negative recargo', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const proveedor = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov B3b', deuda: 0 });
  const prodA = await MODELS.Producto.findOne({ where: { codigo: 'PRODA' } });
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{ productoId: prodA.id, cantidad: 1, costoUnitario: 100 }],
    pago: { descuento: 0, recargo: -50, montoAbonado: 50, metodoPago: 'Efectivo' },
  });
  assertFalse(result.success, '8.2 negative recargo must be rejected');
});

test('8.3', 'B-3: purchase with descuento = subtotal succeeds', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const proveedor = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov B3c', deuda: 0 });
  const prodA = await MODELS.Producto.findOne({ where: { codigo: 'PRODA' } });
  // subtotal = 100, descuento = 100 → totalCompra = 0
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{ productoId: prodA.id, cantidad: 1, costoUnitario: 100 }],
    pago: { descuento: 100, recargo: 0, montoAbonado: 0, metodoPago: 'Efectivo' },
  });
  assertTrue(result.success, '8.3 descuento == subtotal must be accepted (total=0)');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 9B — B-4: Login attempt cooldown (brute-force protection)
// ═════════════════════════════════════════════════════════════════════════════

test('9b.1', 'B-4: 5 failed attempts trigger lockout on 6th attempt', async () => {
  const { admin } = await fresh();
  _resetLoginAttempts('Admin Test');
  // 5 failures
  for (let i = 0; i < 5; i++) {
    await invoke('login-attempt', { nombre: 'Admin Test', password: 'wrong' });
  }
  // 6th attempt must be blocked (within the 60s window)
  const result = await invoke('login-attempt', { nombre: 'Admin Test', password: 'test123' });
  assertFalse(result.success, '9b.1 6th attempt must be blocked after 5 failures');
  assertTrue(result.message.toLowerCase().includes('bloqueada') || result.message.toLowerCase().includes('intente'),
    '9b.1 message must indicate lockout');
});

test('9b.2', 'B-4: successful login after 4 failures clears counter', async () => {
  const { admin } = await fresh();
  _resetLoginAttempts('Admin Test');
  // 4 failures (below threshold)
  for (let i = 0; i < 4; i++) {
    await invoke('login-attempt', { nombre: 'Admin Test', password: 'wrong' });
  }
  // Successful login clears counter
  const ok = await invoke('login-attempt', { nombre: 'Admin Test', password: 'test123' });
  assertTrue(ok.success, '9b.2 login must succeed after 4 failures');
  // Next failure should not immediately lock (counter was cleared)
  await invoke('login-attempt', { nombre: 'Admin Test', password: 'wrong' });
  const stillOk = await invoke('login-attempt', { nombre: 'Admin Test', password: 'test123' });
  assertTrue(stillOk.success, '9b.2 login must still work after 1 failure post-reset');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 9C — B-7: save-business-info size limit
// ═════════════════════════════════════════════════════════════════════════════

test('9c.1', 'B-7: save-business-info rejects oversized logoBase64', async () => {
  await fresh();
  const oversized = 'A'.repeat(Math.ceil(5 * 1024 * 1024 / 0.75) + 1);
  const result = await invoke('save-business-info', { nombre: 'Test', slogan: '', footer: '', logoBase64: oversized });
  assertFalse(result.success, '9c.1 oversized logo must be rejected');
  assertTrue(result.message.includes('tamaño') || result.message.includes('máximo'),
    '9c.1 message must mention size limit');
});

test('9c.2', 'B-7: save-business-info without logo still works', async () => {
  await fresh();
  const result = await invoke('save-business-info', { nombre: 'Mi Negocio', slogan: 'Slogan', footer: 'Footer' });
  assertTrue(result.success, '9c.2 save without logo must succeed');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 9D — B-8: Batched minor validations
// ═════════════════════════════════════════════════════════════════════════════

test('9d.1', 'B-8a: save-user rejects password shorter than 6 chars', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const result = await invoke('save-user', { nombre: 'ShortPass', password: 'abc', rol: 'empleado' });
  assertFalse(result.success, '9d.1 password < 6 chars must be rejected');
  assertTrue(result.message.includes('6') || result.message.includes('contraseña'),
    '9d.1 message must mention password length');
});

test('9d.2', 'B-8b: save-gasto-fijo rejects negative monto', async () => {
  await fresh();
  const result = await invoke('save-gasto-fijo', { nombre: 'Gasto Negativo', monto: -100 });
  assertFalse(result.success, '9d.2 negative monto must be rejected');
  assertTrue(result.message.includes('negativo'), '9d.2 message must mention negative');
});

test('9d.3', 'B-8b: save-gasto-fijo accepts monto: 0', async () => {
  await fresh();
  const result = await invoke('save-gasto-fijo', { nombre: 'Gasto Cero', monto: 0 });
  assertTrue(result.success, '9d.3 zero monto must be accepted');
});

test('9d.4', 'B-8c: save-empleado rejects negative sueldo', async () => {
  await fresh();
  const result = await invoke('save-empleado', { nombre: 'Empleado Neg', sueldo: -5000 });
  assertFalse(result.success, '9d.4 negative sueldo must be rejected');
  assertTrue(result.message.includes('negativo'), '9d.4 message must mention negative');
});

test('9d.5', 'B-8c: save-empleado accepts sueldo: 0', async () => {
  await fresh();
  const result = await invoke('save-empleado', { nombre: 'Empleado Voluntario', sueldo: 0 });
  assertTrue(result.success, '9d.5 zero sueldo must be accepted');
});

test('9d.6', 'B-8k: login-attempt ignores payload.username (must use payload.nombre)', async () => {
  const { admin } = await fresh();
  _resetLoginAttempts('Admin Test');
  // Sending username instead of nombre must not authenticate (B-8k standardizes on nombre)
  const result = await invoke('login-attempt', { username: 'Admin Test', password: 'test123' });
  assertFalse(result.success, '9d.6 username field (not nombre) must not authenticate after B-8k');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 9 — Regression: previous functionality still works
// ═════════════════════════════════════════════════════════════════════════════

test('9.1', '[Regresión] login-attempt still authenticates correctly', async () => {
  const { admin } = await fresh();
  clearSession();
  const result = await invoke('login-attempt', { nombre: 'Admin Test', password: 'test123' });
  assertTrue(result.success, '9.1 login must still work');
  assertEqual(getActiveUserId(), admin.id, '9.1 activeUserId must be set after login');
});

test('9.2', '[Regresión] save-general-config with valid values (10, 5) still works', async () => {
  await fresh();
  const result = await invoke('save-general-config', { recargoCredito: 10, descuentoEfectivo: 5, redondeo: false });
  assertTrue(result.success, '9.2 valid config save must still succeed');
});

test('9.3', '[Regresión] save-user with valid admin rol still works', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);
  const result = await invoke('save-user', { nombre: 'TestAdminRol', password: 'pass123', rol: 'administrador' });
  assertTrue(result.success, '9.3 creating user with administrador rol must still work');
});

test('9.4', '[Regresión] registrar-compra-producto end-to-end still works', async () => {
  const { admin, prodA } = await fresh();
  await loginAs(admin.id);
  const proveedor = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov Reg', deuda: 0 });
  const stockBefore = prodA.stock;
  const result = await invoke('registrar-compra-producto', {
    proveedorId: proveedor.id,
    items: [{ productoId: prodA.id, cantidad: 3, costoUnitario: 40 }],
    pago: { descuento: 0, recargo: 0, montoAbonado: 120, metodoPago: 'Efectivo' },
  });
  assertTrue(result.success, '9.4 basic purchase must still succeed');
  const updated = await MODELS.Producto.findByPk(prodA.id);
  assertEqual(updated.stock, stockBefore + 3, '9.4 stock must increment by 3');
});

// ═════════════════════════════════════════════════════════════════════════════
// RUNNER
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    ({ sequelize: SEQ, models: MODELS } = await setupTestDb());
  } catch (err) {
    console.error('FATAL: Could not set up test database:', err.message);
    process.exit(1);
  }

  // Register handlers (order matters — session must be first for I-1 tests)
  registerSessionHandlers(MODELS, SEQ, () => null, () => null);
  registerConfigHandlers(MODELS, SEQ);
  registerComprasHandlers(MODELS, SEQ);
  registerAdminHandlers(MODELS);
  registerMercadoPagoHandlers(MODELS);

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Phase 7 — Wave-2 Security & Authorization Test Suite');
  console.log('══════════════════════════════════════════════════════\n');

  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ id: t.id, name: t.name, status: 'PASS', error: null });
      console.log(`[PASS] ${t.id} ${t.name}`);
    } catch (err) {
      results.push({ id: t.id, name: t.name, status: 'FAIL', error: err.message });
      console.log(`[FAIL] ${t.id} ${t.name}`);
      err.message.split('\n').forEach(line => console.log(`       ${line}`));
    }
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed  = results.filter(r => r.status === 'FAIL').length;

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`TOTAL: ${results.length}`);
  console.log(`PASS:  ${passed}`);
  console.log(`FAIL:  ${failed}`);
  console.log('──────────────────────────────────────────────────────\n');

  saveReports(results, passed, failed);
  appendTestLog(results, passed, failed);

  process.exit(failed > 0 ? 1 : 0);
}

function saveReports(results, passed, failed) {
  const reportsDir = path.resolve(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    date: new Date().toISOString(),
    suite: 'phase-7',
    total: results.length,
    passed,
    failed,
    results,
  };

  const payload = JSON.stringify(report, null, 2);
  const stamp   = report.date.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);

  fs.writeFileSync(path.join(reportsDir, `phase-7-${stamp}.json`), payload, 'utf-8');
  fs.writeFileSync(path.join(reportsDir, 'latest-phase-7.json'), payload, 'utf-8');

  console.log(`Reports saved → tests/reports/phase-7-${stamp}.json`);
  console.log(`               tests/reports/latest-phase-7.json`);
}

function appendTestLog(results, passed, failed) {
  const logPath = path.resolve(__dirname, '../docs/refactor-log.md');
  const date    = new Date().toISOString().slice(0, 10);

  const resultTable = results
    .map(r => `| ${r.id} | ${r.name} | ${r.status === 'PASS' ? '✅' : '❌'} |`)
    .join('\n');

  const failLines = results
    .filter(r => r.status === 'FAIL')
    .map(r => `- **${r.id} ${r.name}**: ${r.error.split('\n')[0]}`)
    .join('\n');

  const section = `
---

## [${date}] Phase 7 Testing Results — Wave-2 Security Fixes

**Runner:** \`tests/run-phase-7.js\` (plain Node.js, no external test framework)
**Database:** In-memory SQLite (fresh for each run, reset between tests)
**Handlers tested:** session, config, compras, admin

### Results

| Test | Name | Status |
|------|------|--------|
${resultTable}

### Summary

| Metric | Count |
|--------|-------|
| Total  | ${results.length} |
| Pass   | ${passed} |
| Fail   | ${failed} |

${failed > 0 ? `### Failures\n\n${failLines}` : '### All tests passed ✅'}
`;

  try {
    fs.appendFileSync(logPath, section, 'utf-8');
    console.log('Test results appended to docs/refactor-log.md');
  } catch (err) {
    console.error('Warning: could not update refactor-log.md:', err.message);
  }
}

main().catch(err => {
  console.error('FATAL error in test runner:', err);
  process.exit(1);
});
