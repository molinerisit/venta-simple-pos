'use strict';

// ─── CRITICAL: electron mock must be installed BEFORE any handler require ─────
const { invoke, mockDialog } = require('./helpers/electron-mock');

const path = require('path');
const fs   = require('fs');

const { setupTestDb } = require('./helpers/db-setup');
const { resetDb }     = require('./helpers/db-reset');
const { seedBase }    = require('./helpers/seed');
const {
  assertEqual, assertTrue, assertFalse, assertApprox,
} = require('./helpers/assertions');

// ─── HANDLER REGISTRATION (after mock) ────────────────────────────────────────
const { registerProductosHandlers } = require('../src/ipc-handlers/productos-handlers');
const { registerVentasHandlers }    = require('../src/ipc-handlers/ventas-handlers');
const { registerCajaHandlers }      = require('../src/ipc-handlers/caja-handlers');
const { registerSessionHandlers, clearSession } = require('../src/ipc-handlers/session-handlers');

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
let SEQ, MODELS;

async function fresh() {
  await resetDb(SEQ);
  return seedBase(MODELS);
}

/**
 * Asserts that calling fn() throws a Sequelize ValidationError.
 * Returns the error so callers can inspect it further.
 */
async function assertValidationError(fn, label) {
  try {
    await fn();
    throw new Error(`${label}: expected a ValidationError but no error was thrown`);
  } catch (err) {
    if (err.name === 'SequelizeValidationError') return err;
    throw err; // re-throw unexpected errors
  }
}

// ─── TEST REGISTRY ────────────────────────────────────────────────────────────
const tests = [];
function test(id, name, fn) { tests.push({ id, name, fn }); }

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1 — 5.1: Producto ORM validators
// ═════════════════════════════════════════════════════════════════════════════

test('1.1', '5.1: Producto rejects negative stock', async () => {
  await fresh();
  await assertValidationError(
    () => MODELS.Producto.create({
      codigo: 'NEGSTOCK',
      nombre: 'Stock Negativo',
      stock: -1,
      precioVenta: 100,
      activo: true,
    }),
    '1.1'
  );
});

test('1.2', '5.1: Producto rejects negative precioVenta', async () => {
  await fresh();
  await assertValidationError(
    () => MODELS.Producto.create({
      codigo: 'NEGPV',
      nombre: 'Precio Negativo',
      stock: 5,
      precioVenta: -0.01,
      activo: true,
    }),
    '1.2'
  );
});

test('1.3', '5.1: Producto rejects negative precioCompra', async () => {
  await fresh();
  await assertValidationError(
    () => MODELS.Producto.create({
      codigo: 'NEGPC',
      nombre: 'Compra Negativa',
      stock: 5,
      precioCompra: -5,
      precioVenta: 100,
      activo: true,
    }),
    '1.3'
  );
});

test('1.4', '5.1: Producto rejects empty nombre', async () => {
  await fresh();
  await assertValidationError(
    () => MODELS.Producto.create({
      codigo: 'EMPTYNOM',
      nombre: '',
      stock: 5,
      precioVenta: 100,
      activo: true,
    }),
    '1.4'
  );
});

test('1.5', '5.1: Producto accepts valid values (zero stock, zero prices)', async () => {
  await fresh();
  const prod = await MODELS.Producto.create({
    codigo: 'VALID5A',
    nombre: 'Producto Valido',
    stock: 0,
    precioCompra: 0,
    precioVenta: 0,
    activo: true,
  });
  assertTrue(prod.id !== undefined, '1.5 Valid product must be created');
  assertApprox(prod.stock, 0, 0.001, '1.5 Stock must be 0');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2 — 5.2: DetalleVenta ORM validators
// Uses .build().validate() to test validators without DB FK constraints
// ═════════════════════════════════════════════════════════════════════════════

test('2.1', '5.2: DetalleVenta rejects cantidad = 0', async () => {
  const instance = MODELS.DetalleVenta.build({
    nombreProducto: 'Test',
    cantidad: 0,
    precioUnitario: 100,
    subtotal: 0,
  });
  try {
    await instance.validate();
    throw new Error('2.1: expected ValidationError for cantidad=0 but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'cantidad'),
      '2.1 ValidationError must be on the cantidad field'
    );
  }
});

test('2.2', '5.2: DetalleVenta rejects negative cantidad', async () => {
  const instance = MODELS.DetalleVenta.build({
    nombreProducto: 'Test',
    cantidad: -1,
    precioUnitario: 100,
    subtotal: 100,
  });
  try {
    await instance.validate();
    throw new Error('2.2: expected ValidationError for cantidad<0 but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'cantidad'),
      '2.2 ValidationError must be on the cantidad field'
    );
  }
});

test('2.3', '5.2: DetalleVenta rejects negative precioUnitario', async () => {
  const instance = MODELS.DetalleVenta.build({
    nombreProducto: 'Test',
    cantidad: 1,
    precioUnitario: -0.01,
    subtotal: 100,
  });
  try {
    await instance.validate();
    throw new Error('2.3: expected ValidationError for precioUnitario<0 but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'precioUnitario'),
      '2.3 ValidationError must be on the precioUnitario field'
    );
  }
});

test('2.4', '5.2: DetalleVenta rejects negative subtotal', async () => {
  const instance = MODELS.DetalleVenta.build({
    nombreProducto: 'Test',
    cantidad: 1,
    precioUnitario: 100,
    subtotal: -1,
  });
  try {
    await instance.validate();
    throw new Error('2.4: expected ValidationError for subtotal<0 but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'subtotal'),
      '2.4 ValidationError must be on the subtotal field'
    );
  }
});

test('2.5', '5.2: DetalleVenta accepts valid minimums (cantidad=0.001, precio=0, subtotal=0)', async () => {
  const instance = MODELS.DetalleVenta.build({
    nombreProducto: 'Valido',
    cantidad: 0.001,
    precioUnitario: 0,
    subtotal: 0,
  });
  // Should not throw
  await instance.validate();
  assertTrue(true, '2.5 Valid DetalleVenta must pass validation');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3 — 5.3: Venta ORM validators
// Uses .build().validate() for validator isolation
// ═════════════════════════════════════════════════════════════════════════════

test('3.1', '5.3: Venta rejects negative total', async () => {
  const instance = MODELS.Venta.build({
    metodoPago: 'Efectivo',
    total: -1,
    montoPagado: 0,
  });
  try {
    await instance.validate();
    throw new Error('3.1: expected ValidationError for total<0 but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'total'),
      '3.1 ValidationError must be on the total field'
    );
  }
});

test('3.2', '5.3: Venta rejects null montoPagado', async () => {
  const instance = MODELS.Venta.build({
    metodoPago: 'Efectivo',
    total: 100,
    montoPagado: null,
  });
  try {
    await instance.validate();
    throw new Error('3.2: expected ValidationError for montoPagado=null but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'montoPagado'),
      '3.2 ValidationError must be on the montoPagado field'
    );
  }
});

test('3.3', '5.3: Venta accepts total=0 and montoPagado=0', async () => {
  const instance = MODELS.Venta.build({
    metodoPago: 'Efectivo',
    total: 0,
    montoPagado: 0,
  });
  await instance.validate();
  assertTrue(true, '3.3 Venta with total=0 and montoPagado=0 must pass validation');
});

test('3.4', '5.3: Venta rejects invalid metodoPago', async () => {
  // Regression: isIn validator from Phase 2.1 must still be active
  const instance = MODELS.Venta.build({
    metodoPago: 'Bitcoin',
    total: 100,
    montoPagado: 100,
  });
  try {
    await instance.validate();
    throw new Error('3.4: expected ValidationError for invalid metodoPago but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'metodoPago'),
      '3.4 ValidationError must be on the metodoPago field'
    );
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4 — 5.4: ArqueoCaja ORM validators
// ═════════════════════════════════════════════════════════════════════════════

test('4.1', '5.4: ArqueoCaja rejects negative montoInicial', async () => {
  await fresh();
  const { admin } = await seedBase(MODELS).catch(() => ({ admin: null }));
  // Use build+validate to avoid needing a real UsuarioId
  const instance = MODELS.ArqueoCaja.build({
    montoInicial: -100,
    estado: 'ABIERTA',
    UsuarioId: '00000000-0000-0000-0000-000000000000',
  });
  try {
    await instance.validate();
    throw new Error('4.1: expected ValidationError for montoInicial<0 but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'montoInicial'),
      '4.1 ValidationError must be on the montoInicial field'
    );
  }
});

test('4.2', '5.4: ArqueoCaja rejects negative montoFinalReal', async () => {
  const instance = MODELS.ArqueoCaja.build({
    montoInicial: 0,
    montoFinalReal: -50,
    estado: 'ABIERTA',
    UsuarioId: '00000000-0000-0000-0000-000000000000',
  });
  try {
    await instance.validate();
    throw new Error('4.2: expected ValidationError for montoFinalReal<0 but none thrown');
  } catch (err) {
    if (err.name !== 'SequelizeValidationError') throw err;
    assertTrue(
      err.errors.some(e => e.path === 'montoFinalReal'),
      '4.2 ValidationError must be on the montoFinalReal field'
    );
  }
});

test('4.3', '5.4: ArqueoCaja accepts null montoFinalReal (allowNull:true)', async () => {
  const instance = MODELS.ArqueoCaja.build({
    montoInicial: 500,
    montoFinalReal: null,
    estado: 'ABIERTA',
    UsuarioId: '00000000-0000-0000-0000-000000000000',
  });
  await instance.validate();
  assertTrue(true, '4.3 null montoFinalReal must be accepted (allowNull:true)');
});

test('4.4', '5.4: ArqueoCaja accepts montoInicial=0', async () => {
  const instance = MODELS.ArqueoCaja.build({
    montoInicial: 0,
    estado: 'ABIERTA',
    UsuarioId: '00000000-0000-0000-0000-000000000000',
  });
  await instance.validate();
  assertTrue(true, '4.4 montoInicial=0 must be accepted (min:0 is inclusive)');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 5 — REGRESIÓN: comportamientos existentes no rotos
// ═════════════════════════════════════════════════════════════════════════════

test('5.1', '[Regresión] seedBase creates Producto and ArqueoCaja without validation errors', async () => {
  await resetDb(SEQ);
  const { prodA, arqueo } = await seedBase(MODELS);
  assertTrue(prodA.id !== undefined, '5.1 Producto A must be created by seedBase');
  assertTrue(arqueo.id !== undefined, '5.1 ArqueoCaja must be created by seedBase');
  assertApprox(prodA.stock, 10, 0.001, '5.1 prodA stock must be 10');
  assertApprox(arqueo.montoInicial, 1000, 0.01, '5.1 arqueo montoInicial must be 1000');
});

test('5.2', '[Regresión] registrar-venta end-to-end still works after model changes', async () => {
  const { admin, prodA } = await fresh();

  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: prodA.id, cantidad: 2, precioUnitario: 100, nombreProducto: 'Producto A' }],
    metodoPago: 'Efectivo',
    montoPagado: 200,
    UsuarioId: admin.id,
  });

  assertTrue(result.success, '5.2 registrar-venta must succeed after Phase 5 changes');
  assertApprox(result.datosRecibo.total, 200, 0.01, '5.2 Total must be 200');
});

test('5.3', '[Regresión] guardar-producto still works with valid data', async () => {
  await fresh();

  const result = await invoke('guardar-producto', {
    nombre: 'Producto Phase5 Reg',
    codigo: 'P5REG',
    precioVenta: 150,
    precioCompra: 70,
    stock: 20,
    activo: true,
  });

  assertTrue(result.success, '5.3 guardar-producto must succeed with valid data');
  const prod = await MODELS.Producto.findOne({ where: { codigo: 'P5REG' } });
  assertTrue(prod !== null, '5.3 Product must be persisted in DB');
  assertApprox(prod.precioVenta, 150, 0.01, '5.3 precioVenta must be 150');
});

test('5.4', '[Regresión] abrir-caja still works via IPC after model changes', async () => {
  // Reset to clean state — do NOT call seedBase (it creates an open arqueo which
  // would cause abrir-caja to return "ya existe una caja abierta")
  await resetDb(SEQ);
  const bcrypt = require('bcryptjs');
  const hash   = await bcrypt.hash('test123', 1);
  const admin  = await MODELS.Usuario.create({
    nombre: 'Admin Test',
    password: hash,
    rol: 'administrador',
    config_recargo_credito: 0,
    config_descuento_efectivo: 0,
  });

  const loginResult = await invoke('login-attempt', { nombre: 'Admin Test', password: 'test123' });
  assertTrue(loginResult.success, '5.4 login must succeed before abrir-caja');

  const abrirResult = await invoke('abrir-caja', { montoInicial: 500 });
  assertTrue(abrirResult.success, '5.4 abrir-caja must succeed with no open caja');

  const arqueo = await MODELS.ArqueoCaja.findOne({
    where: { UsuarioId: admin.id, estado: 'ABIERTA' },
  });
  assertTrue(arqueo !== null, '5.4 ArqueoCaja must exist in DB');
  assertApprox(arqueo.montoInicial, 500, 0.01, '5.4 montoInicial must be 500');
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

  registerProductosHandlers(MODELS, SEQ);
  registerVentasHandlers(MODELS, SEQ);
  registerCajaHandlers(MODELS, SEQ);
  registerSessionHandlers(MODELS, SEQ, () => {}, () => {});

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Phase 5 — Model Constraints Test Suite');
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
    suite: 'phase-5',
    total: results.length,
    passed,
    failed,
    results,
  };

  const payload = JSON.stringify(report, null, 2);
  const stamp   = report.date.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);

  fs.writeFileSync(path.join(reportsDir, `phase-5-${stamp}.json`), payload, 'utf-8');
  fs.writeFileSync(path.join(reportsDir, 'latest-phase-5.json'), payload, 'utf-8');

  console.log(`Reports saved → tests/reports/phase-5-${stamp}.json`);
  console.log(`               tests/reports/latest-phase-5.json`);
}

function appendTestLog(results, passed, failed) {
  const logPath = path.resolve(__dirname, '../docs/refactor-log.md');
  const date    = new Date().toISOString().slice(0, 10);

  const failLines = results
    .filter(r => r.status === 'FAIL')
    .map(r => `- **${r.id} ${r.name}**: ${r.error.split('\n')[0]}`)
    .join('\n');

  const resultTable = results
    .map(r => `| ${r.id} | ${r.name} | ${r.status === 'PASS' ? '✅' : '❌'} |`)
    .join('\n');

  const section = `
---

## [${date}] Phase 5 Testing Results

**Runner:** \`tests/run-phase-5.js\` (plain Node.js, no external test framework)
**Database:** In-memory SQLite (fresh for each run, reset between tests)
**Models tested:** \`Producto\`, \`DetalleVenta\`, \`Venta\`, \`ArqueoCaja\`

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
