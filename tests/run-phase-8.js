'use strict';

// ─── CRITICAL: electron mock must be installed BEFORE any handler require ─────
const { invoke } = require('./helpers/electron-mock');

const path = require('path');
const fs   = require('fs');

const { setupTestDb } = require('./helpers/db-setup');
const { resetDb }     = require('./helpers/db-reset');
const { seedBase }    = require('./helpers/seed');
const { assertEqual, assertTrue, assertFalse } = require('./helpers/assertions');

// ─── HANDLER REGISTRATION (after mock) ────────────────────────────────────────
const { registerSessionHandlers, clearSession, getActiveUserId } = require('../src/ipc-handlers/session-handlers');
const { registerClientesHandlers }       = require('../src/ipc-handlers/clientes-handlers');
const { registerProveedoresHandlers }    = require('../src/ipc-handlers/proveedores-handlers');
const { registerCtascorrientesHandlers } = require('../src/ipc-handlers/ctascorrientes-handlers');
const { registerInsumosHandlers }        = require('../src/ipc-handlers/insumos-handlers');
const { registerCajaHandlers }           = require('../src/ipc-handlers/caja-handlers');
const { registerVentasHandlers }         = require('../src/ipc-handlers/ventas-handlers');
const { registerFacturacionHandlers }    = require('../src/ipc-handlers/facturacion-handlers');
const { registerDashboardHandlers }      = require('../src/ipc-handlers/dashboard-handlers');
const { registerReportesHandlers }       = require('../src/ipc-handlers/registerReportesHandlers');

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
let SEQ, MODELS;

async function fresh() {
  await resetDb(SEQ);
  return seedBase(MODELS);
}

// Helper: login as a user (session-handlers must be registered)
async function loginAs(userId) {
  clearSession();
  const user = await MODELS.Usuario.scope('withPassword').findByPk(userId);
  if (!user) throw new Error('loginAs: user not found ' + userId);
  const result = await invoke('login-attempt', { nombre: user.nombre, password: 'test123' });
  if (!result.success) throw new Error('loginAs failed: ' + result.message);
}

// ─── TEST REGISTRY ────────────────────────────────────────────────────────────
const tests = [];
function test(id, name, fn) { tests.push({ id, name, fn }); }

// =============================================================================
// SUITE 1 — 8.1: Session guard on financial mutation handlers (W3-H6, W3-H7)
// =============================================================================

test('1.1', '8.1: registrar-pago-cliente fails without active session', async () => {
  const { admin } = await fresh();
  clearSession();

  const cliente = await MODELS.Cliente.create({
    nombre: 'Cliente Deuda', dni: '11111111', deuda: 500,
  });

  const result = await invoke('registrar-pago-cliente', {
    clienteId: cliente.id, monto: 100, concepto: 'Pago test',
  });
  assertFalse(result.success, '1.1 Payment without session must fail');
  assertTrue(
    result.message.toLowerCase().includes('sesi') || result.message.toLowerCase().includes('activa'),
    '1.1 Message must mention session'
  );
});

test('1.2', '8.1: registrar-pago-cliente succeeds with active session', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);

  const cliente = await MODELS.Cliente.create({
    nombre: 'Cliente Deuda2', dni: '22222222', deuda: 500,
  });

  const result = await invoke('registrar-pago-cliente', {
    clienteId: cliente.id, monto: 100, concepto: 'Pago test',
  });
  assertTrue(result.success, '1.2 Payment with valid session must succeed');

  const updated = await MODELS.Cliente.findByPk(cliente.id);
  assertEqual(Number(updated.deuda), 400, '1.2 Debt must be reduced by 100');
});

test('1.3', '8.1: registrar-abono-proveedor fails without active session', async () => {
  await fresh();
  clearSession();

  const prov = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov Deuda', deuda: 1000 });

  const result = await invoke('registrar-abono-proveedor', {
    proveedorId: prov.id, monto: 200,
  });
  assertFalse(result.success, '1.3 Abono without session must fail');
  assertTrue(
    result.message.toLowerCase().includes('sesi') || result.message.toLowerCase().includes('activa'),
    '1.3 Message must mention session'
  );
});

test('1.4', '8.1: abrir-caja uses session userId, ignores renderer-supplied usuarioId', async () => {
  const { admin } = await fresh();
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash('test123', 1);
  const otherUser = await MODELS.Usuario.create({
    nombre: 'OtherUser8', password: hash, rol: 'empleado',
  });

  await loginAs(admin.id);

  // Close existing open arqueo
  const existing = await MODELS.ArqueoCaja.findOne({ where: { estado: 'ABIERTA' } });
  if (existing) {
    await existing.update({ estado: 'CERRADA', fechaCierre: new Date() });
  }

  // Pass a fake usuarioId — must be ignored
  const result = await invoke('abrir-caja', {
    montoInicial: 500,
    usuarioId: otherUser.id,
  });
  assertTrue(result.success, '1.4 abrir-caja must succeed with active session');

  const arqueo = await MODELS.ArqueoCaja.findByPk(result.arqueo.id);
  assertEqual(arqueo.UsuarioId, admin.id, '1.4 UsuarioId must match session, not renderer value');
});

// =============================================================================
// SUITE 2 — 8.2: guardar-insumo allowlist + affectedRows (W3-H4, W3-H5)
// =============================================================================

test('2.1', '8.2: guardar-insumo update on non-existent ID returns success:false', async () => {
  await fresh();
  const result = await invoke('guardar-insumo', {
    id: '00000000-0000-0000-0000-000000000099',
    nombre: 'Ghost Insumo',
  });
  assertFalse(result.success, '2.1 Update on missing insumo must return success:false');
  assertTrue(typeof result.message === 'string', '2.1 Must include a message');
});

test('2.2', '8.2: guardar-insumo create works with valid data', async () => {
  await fresh();
  const result = await invoke('guardar-insumo', { nombre: 'Aceite de oliva' });
  assertTrue(result.success, '2.2 Valid insumo create must succeed');
  const found = await MODELS.Insumo.findOne({ where: { nombre: 'Aceite de oliva' } });
  assertTrue(found !== null, '2.2 Insumo must be persisted in DB');
});

test('2.3', '8.2: guardar-insumo update with allowed fields succeeds', async () => {
  await fresh();
  const insumo = await MODELS.Insumo.create({ nombre: 'Harina', activo: true });

  const result = await invoke('guardar-insumo', {
    id: insumo.id,
    nombre: 'Harina Integral',
    activo: false,
  });
  assertTrue(result.success, '2.3 Update with allowed fields must succeed');
  const updated = await MODELS.Insumo.findByPk(insumo.id);
  assertEqual(updated.nombre, 'Harina Integral', '2.3 nombre must be updated');
});

test('2.4', '8.2: guardar-insumo rejects empty nombre', async () => {
  await fresh();
  const result = await invoke('guardar-insumo', { nombre: '' });
  assertFalse(result.success, '2.4 Empty nombre must fail');
  assertTrue(result.message.includes('obligatorio') || result.message.includes('nombre'),
    '2.4 Message must mention nombre or obligatorio');
});

// =============================================================================
// SUITE 3 — 8.3: Default limits on unbounded list handlers
// =============================================================================

test('3.1', '8.3: get-clientes returns bounded result by default', async () => {
  await fresh();
  await MODELS.Cliente.create({ nombre: 'C1', dni: '10000001' });
  await MODELS.Cliente.create({ nombre: 'C2', dni: '10000002' });
  const result = await invoke('get-clientes');
  assertTrue(Array.isArray(result), '3.1 get-clientes must return an array');
  assertEqual(result.length, 2, '3.1 Must return the 2 created clients');
});

test('3.2', '8.3: get-clientes respects limit=1', async () => {
  await fresh();
  await MODELS.Cliente.create({ nombre: 'CA', dni: '20000001' });
  await MODELS.Cliente.create({ nombre: 'CB', dni: '20000002' });
  const result = await invoke('get-clientes', { limit: 1 });
  assertTrue(Array.isArray(result), '3.2 Must return array');
  assertEqual(result.length, 1, '3.2 limit=1 must return exactly 1 client');
});

test('3.3', '8.3: get-insumos returns bounded result by default', async () => {
  await fresh();
  await MODELS.Insumo.create({ nombre: 'Sal' });
  await MODELS.Insumo.create({ nombre: 'Pimienta' });
  const result = await invoke('get-insumos');
  assertTrue(Array.isArray(result), '3.3 get-insumos must return array');
  assertEqual(result.length, 2, '3.3 Must return 2 insumos');
});

test('3.4', '8.3: get-insumos respects limit=1', async () => {
  await fresh();
  await MODELS.Insumo.create({ nombre: 'InsumoX' });
  await MODELS.Insumo.create({ nombre: 'InsumoY' });
  const result = await invoke('get-insumos', { limit: 1 });
  assertTrue(Array.isArray(result), '3.4 Must return array');
  assertEqual(result.length, 1, '3.4 limit=1 must return exactly 1 insumo');
});

test('3.5', '8.3: get-ventas enforces default limit', async () => {
  const { admin, prodA } = await fresh();
  for (let i = 0; i < 3; i++) {
    await invoke('registrar-venta', {
      detalles: [{ ProductoId: prodA.id, cantidad: 1, precioUnitario: 100, nombreProducto: 'A' }],
      metodoPago: 'Efectivo',
      montoPagado: 100,
      UsuarioId: admin.id,
    });
    // restore stock between iterations
    await MODELS.Producto.update({ stock: 100 }, { where: { id: prodA.id } });
  }

  const result = await invoke('get-ventas');
  assertTrue(Array.isArray(result), '3.5 get-ventas must return array');
  assertTrue(result.length <= 200, '3.5 Default limit must not exceed 200');
  assertTrue(result.length >= 3, '3.5 Must include the 3 registered sales');
});

// =============================================================================
// SUITE 4 — 8.4: descuento upper bound in guardar-cliente (W3-M6)
// =============================================================================

test('4.1', '8.4: guardar-cliente rejects descuento > 100', async () => {
  await fresh();
  const result = await invoke('guardar-cliente', {
    nombre: 'Cliente Alto Desc', dni: '30000001', descuento: 150,
  });
  assertFalse(result.success, '4.1 descuento=150 must fail');
  assertTrue(
    result.message.includes('descuento') || result.message.includes('100'),
    '4.1 Message must mention descuento or 100'
  );
});

test('4.2', '8.4: guardar-cliente rejects descuento < 0', async () => {
  await fresh();
  const result = await invoke('guardar-cliente', {
    nombre: 'Cliente Neg Desc', dni: '30000002', descuento: -5,
  });
  assertFalse(result.success, '4.2 descuento=-5 must fail');
});

test('4.3', '8.4: guardar-cliente accepts descuento: 100', async () => {
  await fresh();
  const result = await invoke('guardar-cliente', {
    nombre: 'Cliente Full Desc', dni: '30000003', descuento: 100,
  });
  assertTrue(result.success, '4.3 descuento=100 must be accepted');
});

test('4.4', '8.4: guardar-cliente accepts descuento: 0', async () => {
  await fresh();
  const result = await invoke('guardar-cliente', {
    nombre: 'Cliente Zero Desc', dni: '30000004', descuento: 0,
  });
  assertTrue(result.success, '4.4 descuento=0 must be accepted');
});

// =============================================================================
// SUITE 5 — 8.5: Field allowlist in guardar-proveedor (W3-M7)
// =============================================================================

test('5.1', '8.5: guardar-proveedor create works with valid nombreEmpresa', async () => {
  await fresh();
  const result = await invoke('guardar-proveedor', {
    proveedorData: { nombreEmpresa: 'Distribuidora SA', telefono: '123456' },
    productoIds: [],
    insumoIds: [],
  });
  assertTrue(result.success, '5.1 Valid proveedor create must succeed');
  const found = await MODELS.Proveedor.findOne({ where: { nombreEmpresa: 'Distribuidora SA' } });
  assertTrue(found !== null, '5.1 Proveedor must be in DB');
});

test('5.2', '8.5: guardar-proveedor cannot overwrite deuda via payload injection', async () => {
  await fresh();
  const prov = await MODELS.Proveedor.create({ nombreEmpresa: 'Prov Deuda Test', deuda: 5000 });

  const result = await invoke('guardar-proveedor', {
    proveedorData: { id: prov.id, nombreEmpresa: 'Prov Deuda Updated', deuda: 0 },
    productoIds: [],
    insumoIds: [],
  });
  assertTrue(result.success, '5.2 Update must succeed (deuda field stripped by allowlist)');

  const updated = await MODELS.Proveedor.findByPk(prov.id);
  assertEqual(Number(updated.deuda), 5000, '5.2 deuda must remain 5000 — allowlist strips injected value');
  assertEqual(updated.nombreEmpresa, 'Prov Deuda Updated', '5.2 nombreEmpresa must be updated');
});

test('5.3', '8.5: guardar-proveedor rejects missing nombreEmpresa', async () => {
  await fresh();
  const result = await invoke('guardar-proveedor', {
    proveedorData: { telefono: '999' },
    productoIds: [],
    insumoIds: [],
  });
  assertFalse(result.success, '5.3 Missing nombreEmpresa must fail');
});

// =============================================================================
// SUITE 6 — 8.6: Date validation in dashboard and reportes (W3-M4, W3-M5)
// =============================================================================

test('6.1', '8.6: get-dashboard-stats with garbage dateFrom returns success:false', async () => {
  await fresh();
  const result = await invoke('get-dashboard-stats', {
    dateFrom: 'not-a-date',
    dateTo: '2026-01-31',
  });
  assertFalse(result.success, '6.1 Invalid dateFrom must return success:false');
  assertTrue(
    result.message.toLowerCase().includes('fecha') || result.message.toLowerCase().includes('date'),
    '6.1 Message must mention fecha or date'
  );
});

test('6.2', '8.6: get-dashboard-stats with garbage dateTo returns success:false', async () => {
  await fresh();
  const result = await invoke('get-dashboard-stats', {
    dateFrom: '2026-01-01',
    dateTo: 'not-a-date',
  });
  assertFalse(result.success, '6.2 Invalid dateTo must return success:false');
});

test('6.3', '8.6: get-dashboard-stats with valid dates returns success:true', async () => {
  await fresh();
  const result = await invoke('get-dashboard-stats', {
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
  });
  assertTrue(result.success, '6.3 Valid dates must return success:true');
  assertTrue(result.stats !== undefined, '6.3 stats must be present');
});

test('6.4', '8.6: get-rentabilidad-report with invalid dates returns success:false', async () => {
  await fresh();
  const result = await invoke('get-rentabilidad-report', {
    dateFrom: 'bad',
    dateTo: 'bad',
  });
  assertFalse(result.success, '6.4 Invalid dates in report must fail');
});

test('6.5', '8.6: get-rentabilidad-report with valid dates returns success:true', async () => {
  await fresh();
  const result = await invoke('get-rentabilidad-report', {
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
  });
  assertTrue(result.success, '6.5 Valid dates in rentabilidad report must succeed');
  assertTrue(result.report !== undefined, '6.5 report must be present');
});

// =============================================================================
// SUITE 7 — 8.7: Negative montoInicial guard in abrir-caja (W3-L6)
// =============================================================================

test('7.1', '8.7: abrir-caja rejects negative montoInicial', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);

  const existing = await MODELS.ArqueoCaja.findOne({ where: { estado: 'ABIERTA' } });
  if (existing) {
    await existing.update({ estado: 'CERRADA', fechaCierre: new Date() });
  }

  const result = await invoke('abrir-caja', { montoInicial: -500 });
  assertFalse(result.success, '7.1 Negative montoInicial must fail');
  assertTrue(
    result.message.toLowerCase().includes('negativo') || result.message.toLowerCase().includes('monto'),
    '7.1 Message must mention negativo or monto'
  );
});

test('7.2', '8.7: abrir-caja accepts montoInicial: 0', async () => {
  const { admin } = await fresh();
  await loginAs(admin.id);

  const existing = await MODELS.ArqueoCaja.findOne({ where: { estado: 'ABIERTA' } });
  if (existing) {
    await existing.update({ estado: 'CERRADA', fechaCierre: new Date() });
  }

  const result = await invoke('abrir-caja', { montoInicial: 0 });
  assertTrue(result.success, '7.2 montoInicial=0 must be accepted');
});

// =============================================================================
// SUITE 8 — 8.8: InsumoDepartamentoId existence check (W3-L4)
// =============================================================================

test('8.1', '8.8: guardar-insumo-familia with invalid InsumoDepartamentoId returns clear error', async () => {
  await fresh();
  const result = await invoke('guardar-insumo-familia', {
    nombre: 'Lacteos',
    InsumoDepartamentoId: '00000000-0000-0000-0000-000000000099',
  });
  assertFalse(result.success, '8.1 Invalid dept ID must fail');
  assertTrue(
    result.message.toLowerCase().includes('departamento'),
    '8.1 Message must mention departamento'
  );
});

test('8.2', '8.8: guardar-insumo-familia with valid InsumoDepartamentoId succeeds', async () => {
  await fresh();
  const deptResult = await invoke('guardar-insumo-departamento', { nombre: 'Alimentos' });
  assertTrue(deptResult.success, '8.2 Department must be created first');

  const result = await invoke('guardar-insumo-familia', {
    nombre: 'Lacteos',
    InsumoDepartamentoId: deptResult.data.id,
  });
  assertTrue(result.success, '8.2 Valid dept ID must succeed');
});

// =============================================================================
// SUITE 9 — Regression tests
// =============================================================================

test('9.1', '[Regression] guardar-cliente create still works', async () => {
  await fresh();
  const result = await invoke('guardar-cliente', {
    nombre: 'Juan', apellido: 'Perez', dni: '40000001', descuento: 10,
  });
  assertTrue(result.success, '9.1 guardar-cliente create must still work');
});

test('9.2', '[Regression] eliminar-cliente still works', async () => {
  await fresh();
  const cliente = await MODELS.Cliente.create({ nombre: 'ToDelete', dni: '50000001' });
  const result = await invoke('eliminar-cliente', cliente.id);
  assertTrue(result.success, '9.2 eliminar-cliente must still work');
});

test('9.3', '[Regression] get-clientes returns seeded clients', async () => {
  await fresh();
  await MODELS.Cliente.create({ nombre: 'Reg1', dni: '60000001' });
  const result = await invoke('get-clientes');
  assertTrue(Array.isArray(result) && result.length === 1,
    '9.3 get-clientes must return 1 client after fresh()');
});

test('9.4', '[Regression] guardar-proveedor create end-to-end still works', async () => {
  await fresh();
  const result = await invoke('guardar-proveedor', {
    proveedorData: { nombreEmpresa: 'Reg Proveedor' },
    productoIds: [],
    insumoIds: [],
  });
  assertTrue(result.success, '9.4 guardar-proveedor must still work');
});

test('9.5', '[Regression] registrar-venta still works end-to-end', async () => {
  const { admin, prodA } = await fresh();
  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: prodA.id, cantidad: 1, precioUnitario: 100, nombreProducto: 'A' }],
    metodoPago: 'Efectivo',
    montoPagado: 100,
    UsuarioId: admin.id,
  });
  assertTrue(result.success, '9.5 registrar-venta must still work');
});

test('9.6', '[Regression] get-insumos returns all insumos (no filter)', async () => {
  await fresh();
  await MODELS.Insumo.create({ nombre: 'Vinagre' });
  const result = await invoke('get-insumos');
  assertTrue(Array.isArray(result), '9.6 get-insumos must return array');
  assertTrue(result.length >= 1, '9.6 Must include the created insumo');
});

test('9.7', '[Regression] get-ctacte-resumen returns totals', async () => {
  await fresh();
  const result = await invoke('get-ctacte-resumen');
  assertTrue(result.success, '9.7 get-ctacte-resumen must succeed');
  assertTrue('totalDeudaClientes' in result.data, '9.7 Must have totalDeudaClientes');
});

// =============================================================================
// RUNNER
// =============================================================================

async function main() {
  try {
    ({ sequelize: SEQ, models: MODELS } = await setupTestDb());
  } catch (err) {
    console.error('FATAL: Could not set up test database:', err.message);
    process.exit(1);
  }

  registerSessionHandlers(MODELS, SEQ);
  registerClientesHandlers(MODELS);
  registerProveedoresHandlers(MODELS, SEQ);
  registerCtascorrientesHandlers(MODELS, SEQ);
  registerInsumosHandlers(MODELS, SEQ);
  registerCajaHandlers(MODELS, SEQ);
  registerVentasHandlers(MODELS, SEQ);
  registerFacturacionHandlers(MODELS);
  registerDashboardHandlers(MODELS, SEQ);
  registerReportesHandlers(MODELS, SEQ);

  console.log('\n======================================================');
  console.log('  Phase 8 -- Wave 3 Security & Quality Test Suite');
  console.log('======================================================\n');

  const results = [];
  for (const t of tests) {
    try {
      await t.fn();
      results.push({ id: t.id, name: t.name, status: 'PASS', error: null });
      console.log('[PASS] ' + t.id + ' ' + t.name);
    } catch (err) {
      results.push({ id: t.id, name: t.name, status: 'FAIL', error: err.message });
      console.log('[FAIL] ' + t.id + ' ' + t.name);
      err.message.split('\n').forEach(line => console.log('       ' + line));
    }
  }

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed  = results.filter(r => r.status === 'FAIL').length;

  console.log('\n------------------------------------------------------');
  console.log('TOTAL: ' + results.length);
  console.log('PASS:  ' + passed);
  console.log('FAIL:  ' + failed);
  console.log('------------------------------------------------------\n');

  saveReports(results, passed, failed);
  appendTestLog(results, passed, failed);

  process.exit(failed > 0 ? 1 : 0);
}

function saveReports(results, passed, failed) {
  const reportsDir = path.resolve(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    date: new Date().toISOString(),
    suite: 'phase-8',
    total: results.length,
    passed,
    failed,
    results,
  };

  const payload = JSON.stringify(report, null, 2);
  const stamp   = report.date.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);

  fs.writeFileSync(path.join(reportsDir, 'phase-8-' + stamp + '.json'), payload, 'utf-8');
  fs.writeFileSync(path.join(reportsDir, 'latest-phase-8.json'), payload, 'utf-8');

  console.log('Reports saved -> tests/reports/phase-8-' + stamp + '.json');
  console.log('               tests/reports/latest-phase-8.json');
}

function appendTestLog(results, passed, failed) {
  const logPath = path.resolve(__dirname, '../docs/refactor-log.md');
  const date    = new Date().toISOString().slice(0, 10);

  const failLines = results
    .filter(r => r.status === 'FAIL')
    .map(r => '- **' + r.id + ' ' + r.name + '**: ' + r.error.split('\n')[0])
    .join('\n');

  const resultTable = results
    .map(r => '| ' + r.id + ' | ' + r.name + ' | ' + (r.status === 'PASS' ? 'PASS' : 'FAIL') + ' |')
    .join('\n');

  const section = [
    '',
    '---',
    '',
    '## [' + date + '] Phase 8 Testing Results',
    '',
    '**Runner:** `tests/run-phase-8.js` (plain Node.js, no external test framework)',
    '**Database:** In-memory SQLite (fresh for each run, reset between tests)',
    '**Handlers tested:** clientes, proveedores, ctascorrientes, insumos, caja, ventas, facturacion, dashboard, reportes',
    '',
    '### Results',
    '',
    '| Test | Name | Status |',
    '|------|------|--------|',
    resultTable,
    '',
    '### Summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    '| Total  | ' + results.length + ' |',
    '| Pass   | ' + passed + ' |',
    '| Fail   | ' + failed + ' |',
    '',
    failed > 0 ? '### Failures\n\n' + failLines : '### All tests passed',
  ].join('\n');

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
