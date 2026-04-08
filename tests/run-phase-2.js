'use strict';

// ─── CRITICAL: electron mock must be installed BEFORE any handler require ─────
const { invoke, mockDialog } = require('./helpers/electron-mock');

const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const crypto = require('crypto');

const { setupTestDb }  = require('./helpers/db-setup');
const { resetDb }      = require('./helpers/db-reset');
const { seedBase }     = require('./helpers/seed');
const {
  assertEqual, assertNotEqual, assertTrue, assertFalse, assertGte, assertApprox,
} = require('./helpers/assertions');

// ─── HANDLER REGISTRATION (after mock) ────────────────────────────────────────
const { registerVentasHandlers }    = require('../src/ipc-handlers/ventas-handlers');
const { registerCajaHandlers }      = require('../src/ipc-handlers/caja-handlers');
const { registerProductosHandlers } = require('../src/ipc-handlers/productos-handlers');

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
let SEQ, MODELS;

/**
 * Formats a JS Date to the string format Sequelize uses when storing DATE
 * fields in SQLite: "YYYY-MM-DD HH:mm:ss.SSS +00:00"
 * Using toISOString() gives "T" separator and "Z" suffix which causes
 * SQLite string comparisons with Sequelize-formatted values to fail
 * ('T' > ' ' in ASCII, so raw ISO strings sort as greater than Sequelize strings).
 */
function toSqliteDate(date) {
  return date.toISOString().replace('T', ' ').replace('Z', ' +00:00');
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** shorthand: reset + seed */
async function fresh() {
  await resetDb(SEQ);
  return seedBase(MODELS);
}

/** Sell one unit of a product; returns the invoke result. */
function sell(prodId, qty, metodo, userId, montoPagado) {
  return invoke('registrar-venta', {
    detalles: [{ ProductoId: prodId, cantidad: qty, precioUnitario: 999, nombreProducto: 'test' }],
    metodoPago: metodo,
    montoPagado: montoPagado ?? qty * 9999,
    UsuarioId: userId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const tests = [];
function test(id, name, fn) { tests.push({ id, name, fn }); }

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1 — VENTAS (integridad financiera crítica)
// ═════════════════════════════════════════════════════════════════════════════

test('1.1', 'Manipulación de precio rechazada', async () => {
  const { admin, prodA } = await fresh();

  // Attacker sends precioUnitario=0.01 for a product worth 100 in DB
  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: prodA.id, cantidad: 1, precioUnitario: 0.01, nombreProducto: 'Producto A' }],
    metodoPago: 'Efectivo',
    montoPagado: 200,
    UsuarioId: admin.id,
  });

  assertTrue(result.success, '1.1 Venta should succeed');

  // Backend must use DB price (100), NOT the renderer-supplied 0.01
  assertApprox(result.datosRecibo.total, 100, 0.01,
    '1.1 Total must equal DB price 100, not attacker value 0.01');
  assertNotEqual(result.datosRecibo.total, 0.01,
    '1.1 Total must NOT be the attacker-supplied price');

  // Verify the stored DetalleVenta also uses DB price
  const detalle = await MODELS.DetalleVenta.findOne({ where: { VentaId: result.ventaId } });
  assertApprox(detalle.precioUnitario, 100, 0.01,
    '1.1 Stored precioUnitario must be DB price (100)');
  assertNotEqual(detalle.precioUnitario, 0.01,
    '1.1 Stored precioUnitario must NOT be 0.01');
});

test('1.2', 'Stock insuficiente rechazado', async () => {
  const { admin, prodB } = await fresh();
  // prodB: stock=1, intento vender 2

  const result = await sell(prodB.id, 2, 'Efectivo', admin.id, 200);

  assertFalse(result.success, '1.2 Sale should fail: stock=1 < cantidad=2');
  assertTrue(
    typeof result.message === 'string' && result.message.toLowerCase().includes('stock'),
    '1.2 Error message must mention stock'
  );

  // Stock must be unchanged
  const prod = await MODELS.Producto.findByPk(prodB.id);
  assertApprox(prod.stock, 1, 0.001, '1.2 Stock must remain 1 after rejected sale');

  // No Venta record should exist
  const count = await MODELS.Venta.count();
  assertEqual(count, 0, '1.2 No Venta record should have been created');
});

test('1.3', 'Cantidad negativa rechazada (stock negativo exploit)', async () => {
  const { admin, prodA } = await fresh();
  const stockBefore = 10; // from seed

  // Send cantidad=-5 which would inflate stock if allowed
  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: prodA.id, cantidad: -5, precioUnitario: 100, nombreProducto: 'Producto A' }],
    metodoPago: 'Efectivo',
    montoPagado: 0,
    UsuarioId: admin.id,
  });

  assertFalse(result.success, '1.3 Negative cantidad should be rejected');

  // Stock must be unchanged (no inflation)
  const prod = await MODELS.Producto.findByPk(prodA.id);
  assertApprox(prod.stock, stockBefore, 0.001, '1.3 Stock must not change after negative cantidad attempt');

  // No Venta record
  assertEqual(await MODELS.Venta.count(), 0, '1.3 No Venta created');
});

test('1.4', 'metodoPago inválido rechazado', async () => {
  const { admin, prodA } = await fresh();

  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: prodA.id, cantidad: 1, precioUnitario: 100, nombreProducto: 'Producto A' }],
    metodoPago: 'BitcoinMagico',
    montoPagado: 100,
    UsuarioId: admin.id,
  });

  assertFalse(result.success, '1.4 Invalid metodoPago should be rejected');
  assertTrue(
    typeof result.message === 'string' && result.message.includes('BitcoinMagico'),
    '1.4 Error message should name the invalid value'
  );

  // No Venta, no stock change
  assertEqual(await MODELS.Venta.count(), 0, '1.4 No Venta created for invalid metodoPago');
  const prod = await MODELS.Producto.findByPk(prodA.id);
  assertApprox(prod.stock, 10, 0.001, '1.4 Stock must be unchanged');
});

test('1.5', 'Producto inexistente rechazado (sin side effects)', async () => {
  const { admin } = await fresh();
  const fakeId = crypto.randomUUID();

  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: fakeId, cantidad: 1, precioUnitario: 100, nombreProducto: 'Fantasma' }],
    metodoPago: 'Efectivo',
    montoPagado: 100,
    UsuarioId: admin.id,
  });

  assertFalse(result.success, '1.5 Sale for non-existent product should fail');
  assertEqual(await MODELS.Venta.count(), 0, '1.5 No Venta created');
  assertEqual(await MODELS.DetalleVenta.count(), 0, '1.5 No DetalleVenta created');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2 — CAJA (consistencia temporal y por método)
// ═════════════════════════════════════════════════════════════════════════════

test('2.1', 'Cierre de caja: totales coinciden exactamente con ventas registradas', async () => {
  const { admin, prodA, arqueo } = await fresh();

  // Register 3 Efectivo sales of 1 unit each → total per sale = 100
  for (let i = 0; i < 3; i++) {
    const r = await sell(prodA.id, 1, 'Efectivo', admin.id, 100);
    assertTrue(r.success, `2.1 Sale ${i + 1}/3 should succeed`);
  }

  const close = await invoke('cerrar-caja', {
    arqueoId: arqueo.id,
    montoFinalReal: 1300,
    observaciones: null,
  });

  assertTrue(close.success, '2.1 cerrar-caja should succeed');
  assertEqual(close.resultado.estado, 'CERRADA', '2.1 Arqueo must be CERRADA');

  // The stored totalVentasEfectivo must equal exactly 3 × 100
  assertApprox(close.resultado.totalVentasEfectivo, 300, 0.01,
    '2.1 totalVentasEfectivo must be 300 (3 × 100)');

  // Other methods must be 0 (or null — treat null as 0)
  assertApprox(close.resultado.totalVentasDebito   ?? 0, 0, 0.01, '2.1 totalVentasDebito must be 0');
  assertApprox(close.resultado.totalVentasCredito  ?? 0, 0, 0.01, '2.1 totalVentasCredito must be 0');
  assertApprox(close.resultado.totalVentasQR       ?? 0, 0, 0.01, '2.1 totalVentasQR must be 0');
  assertApprox(close.resultado.totalVentasTransferencia ?? 0, 0, 0.01, '2.1 totalVentasTransferencia must be 0');
  assertApprox(close.resultado.totalVentasCtaCte   ?? 0, 0, 0.01, '2.1 totalVentasCtaCte must be 0');
});

test('2.2', 'Todos los métodos de pago quedan reflejados en el arqueo', async () => {
  const { admin, prodA, arqueo } = await fresh();

  // Sell different quantities so each method gets a distinct total:
  //   Efectivo:1×100=100 | Débito:2×100=200 | Crédito:3×100=300
  //   Transferencia:1×100=100... same as Efectivo, use qty=4 → 400
  //   CtaCte:  qty=1 but stock is now 10-1-2-3=4 (already sold 6), qty=1→100, remaining stock=3
  // Actually simpler: use quantities 1,2,3,1,1 → totals 100,200,300,100,100
  // They share values but we verify each bucket separately.
  const scenarios = [
    { metodo: 'Efectivo',      qty: 1 },  // total = 100
    { metodo: 'Débito',        qty: 2 },  // total = 200
    { metodo: 'Crédito',       qty: 3 },  // total = 300 (stock: 10→9→7→4)
    { metodo: 'Transferencia', qty: 1 },  // total = 100 (stock: 4→3)
    { metodo: 'CtaCte',        qty: 1 },  // total = 100 (stock: 3→2)
  ];

  for (const { metodo, qty } of scenarios) {
    const r = await sell(prodA.id, qty, metodo, admin.id, qty * 100);
    assertTrue(r.success, `2.2 Sale with ${metodo} should succeed`);
  }

  const close = await invoke('cerrar-caja', {
    arqueoId: arqueo.id,
    montoFinalReal: 2800,
    observaciones: null,
  });

  assertTrue(close.success, '2.2 cerrar-caja should succeed');
  const r = close.resultado;
  assertApprox(r.totalVentasEfectivo,           100, 0.01, '2.2 Efectivo total = 100');
  assertApprox(r.totalVentasDebito,             200, 0.01, '2.2 Débito total = 200');
  assertApprox(r.totalVentasCredito,            300, 0.01, '2.2 Crédito total = 300');
  assertApprox(r.totalVentasTransferencia ?? 0, 100, 0.01, '2.2 Transferencia total = 100');
  assertApprox(r.totalVentasCtaCte        ?? 0, 100, 0.01, '2.2 CtaCte total = 100');
});

test('2.3', 'Valores de metodoPago legacy normalizados y contabilizados', async () => {
  const { admin, arqueo } = await fresh();

  // Insert ventas directly via raw SQL to bypass ORM validation.
  // These represent records that may exist in DB before Phase 2.
  //
  // IMPORTANT: use toSqliteDate(new Date()) — the current time at insertion —
  // NOT arqueo.fechaApertura + offset. The cerrar-caja handler sets
  // fechaCierre = new Date() at call time (milliseconds from now), so any
  // future timestamp beyond that would fall OUTSIDE the [apertura, fechaCierre)
  // window and be excluded from totals. The actual now() is always within the
  // window as long as it is between when the arqueo was opened and when
  // cerrar-caja is called.
  const ventaTime = toSqliteDate(new Date());

  const legacyVentas = [
    // "Debito" (no accent) → normalizarMetodoPago → "Débito"
    { id: crypto.randomUUID(), mp: 'Debito',  total: 100 },
    // "Credito" (no accent) → "Crédito"
    { id: crypto.randomUUID(), mp: 'Credito', total: 200 },
    // "cta cte" (space, lowercase) → after strip-spaces → "ctacte" → "CtaCte"
    { id: crypto.randomUUID(), mp: 'cta cte', total: 50 },
  ];

  for (const v of legacyVentas) {
    await SEQ.query(
      `INSERT INTO ventas
         (id, metodoPago, total, montoPagado, vuelto, recargo, montoDescuento, facturada, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 0, 0, 0, 0, ?, ?)`,
      { replacements: [v.id, v.mp, v.total, v.total, ventaTime, ventaTime] }
    );
  }

  const close = await invoke('cerrar-caja', {
    arqueoId: arqueo.id,
    montoFinalReal: 350,
    observaciones: null,
  });

  assertTrue(close.success, '2.3 cerrar-caja must succeed with legacy metodoPago values');
  const r = close.resultado;
  assertApprox(r.totalVentasDebito,        100, 0.01, '2.3 "Debito" → Débito bucket');
  assertApprox(r.totalVentasCredito,       200, 0.01, '2.3 "Credito" → Crédito bucket');
  assertApprox(r.totalVentasCtaCte ?? 0,    50, 0.01, '2.3 "cta cte" → CtaCte bucket');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3 — PRODUCTOS (integridad de datos)
// ═════════════════════════════════════════════════════════════════════════════

test('3.1', 'CSV import no sobreescribe stock existente', async () => {
  await fresh(); // prodA has stock=10

  // Write a CSV that contains prodA with stock=0
  const csvContent = [
    'codigo,nombre,precioCompra,precioVenta,stock,unidad,pesable,departamento,familia,plu,codigo_barras',
    'PRODA,Producto A Updated,40,110,0,unidad,NO,,,,',
  ].join('\n');

  const tmpFile = path.join(os.tmpdir(), `test-${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, csvContent, 'utf-8');

  // H-5b: import-productos-csv no longer accepts a file path from the renderer.
  // Override the dialog mock to return the test file path, simulating user file selection.
  const savedDialog = mockDialog.showOpenDialog;
  mockDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [tmpFile] });

  try {
    const result = await invoke('import-productos-csv');
    assertTrue(result.success, '3.1 CSV import should succeed');

    const prod = await MODELS.Producto.findOne({ where: { codigo: 'PRODA' } });

    // Stock must NOT have been overwritten with 0
    assertApprox(prod.stock, 10, 0.001,
      '3.1 Stock must remain 10 — CSV import must not overwrite existing stock');

    // Price update should have been applied (the non-stock fields)
    assertApprox(prod.precioVenta, 110, 0.01, '3.1 precioVenta should be updated to 110');
  } finally {
    mockDialog.showOpenDialog = savedDialog; // restore default mock
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('3.2', 'Update con ID inexistente retorna success:false', async () => {
  await fresh();
  const fakeId = crypto.randomUUID();

  const result = await invoke('guardar-producto', {
    id: fakeId,
    codigo: 'GHOST',
    nombre: 'No existe',
    precioVenta: 0,
    precioCompra: 0,
    stock: 0,
  });

  assertFalse(result.success, '3.2 Update with non-existent ID must return success:false');
  assertTrue(
    typeof result.message === 'string' && result.message.length > 0,
    '3.2 Must include an error message'
  );
});

test('3.3', 'Update con mismos datos no produce error', async () => {
  const { prodA } = await fresh();

  // Re-save prodA with identical data
  const result = await invoke('guardar-producto', {
    id: prodA.id,
    codigo: 'PRODA',
    nombre: 'Producto A',
    precioVenta: 100,
    precioCompra: 0,
    stock: 10,
    activo: true,
  });

  assertTrue(result.success, '3.3 Re-saving same data should succeed without error');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4 — REGRESIÓN RÁPIDA
// ═════════════════════════════════════════════════════════════════════════════

test('4.1', '[Regresión] Venta normal con Efectivo', async () => {
  const { admin, prodA } = await fresh();

  const result = await sell(prodA.id, 2, 'Efectivo', admin.id, 200);
  assertTrue(result.success, '4.1 Normal sale should succeed');
  assertApprox(result.datosRecibo.total, 200, 0.01, '4.1 Total = 2 × 100 = 200');

  const prod = await MODELS.Producto.findByPk(prodA.id);
  assertApprox(prod.stock, 8, 0.001, '4.1 Stock decremented correctly: 10 - 2 = 8');
});

test('4.2', '[Regresión] Caja abre y cierra sin error', async () => {
  const { admin } = await fresh();

  const estadoResult = await invoke('get-estado-caja', undefined);
  assertTrue(estadoResult.cajaAbierta !== null, '4.2 Caja should be open after seedBase');

  const closeResult = await invoke('cerrar-caja', {
    arqueoId: estadoResult.cajaAbierta.id,
    montoFinalReal: 1000,
    observaciones: null,
  });

  assertTrue(closeResult.success, '4.2 Caja close should succeed');
  assertEqual(closeResult.resultado.estado, 'CERRADA', '4.2 Estado must be CERRADA');

  // After close, no open caja
  const estadoAfter = await invoke('get-estado-caja', undefined);
  assertEqual(estadoAfter.cajaAbierta, null, '4.2 No open caja after close');
});

test('4.3', '[Regresión] Stock baja correctamente en venta de múltiples ítems', async () => {
  const { admin, prodA, prodB } = await fresh();

  const result = await invoke('registrar-venta', {
    detalles: [
      { ProductoId: prodA.id, cantidad: 3, precioUnitario: 999, nombreProducto: 'Producto A' },
      { ProductoId: prodB.id, cantidad: 1, precioUnitario: 999, nombreProducto: 'Producto B' },
    ],
    metodoPago: 'Débito',
    montoPagado: 450,
    UsuarioId: admin.id,
  });

  assertTrue(result.success, '4.3 Multi-item sale should succeed');

  const pa = await MODELS.Producto.findByPk(prodA.id);
  const pb = await MODELS.Producto.findByPk(prodB.id);
  assertApprox(pa.stock, 7,  0.001, '4.3 Producto A stock: 10 - 3 = 7');
  assertApprox(pb.stock, 0, 0.001, '4.3 Producto B stock: 1 - 1 = 0');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE BONUS — Ventas concurrentes (límite de stock)
// ═════════════════════════════════════════════════════════════════════════════

test('B.1', '[BONUS] 15 ventas concurrentes con stock=10 — stock no va negativo', async () => {
  await resetDb(SEQ);
  const passwordHash = require('bcryptjs').hashSync('x', 1);
  const admin = await MODELS.Usuario.create({
    nombre: 'Admin Bonus', password: passwordHash,
    rol: 'administrador', config_recargo_credito: 0, config_descuento_efectivo: 0,
  });
  // Use a dedicated product with stock=10
  const prod = await MODELS.Producto.create({
    codigo: 'BONUS1', nombre: 'Bonus Product', stock: 10, precioVenta: 100, activo: true,
  });

  // Fire 15 concurrent sale requests, each for qty=1
  // SQLite serializes writes, but the pre-check (findByPk) may read stale stock.
  // This test documents whether the Phase 2 fix is sufficient for concurrent load.
  const CONCURRENCY = 15;
  const promises = Array.from({ length: CONCURRENCY }, () =>
    invoke('registrar-venta', {
      detalles: [{ ProductoId: prod.id, cantidad: 1, precioUnitario: 999, nombreProducto: 'Bonus' }],
      metodoPago: 'Efectivo',
      montoPagado: 100,
      UsuarioId: admin.id,
    }).catch(err => ({ success: false, message: err.message }))
  );

  const results = await Promise.all(promises);
  const successes = results.filter(r => r.success).length;
  const failures  = results.filter(r => !r.success).length;

  console.log(`       Concurrency=${CONCURRENCY}, initial stock=10`);
  console.log(`       Results → Successes: ${successes}, Failures: ${failures}`);

  const finalProd = await MODELS.Producto.findByPk(prod.id);
  console.log(`       Final stock: ${finalProd.stock}`);

  // CRITICAL assertion: stock must never go below zero
  assertGte(finalProd.stock, 0,
    `B.1 Stock went negative (${finalProd.stock}). ` +
    'Phase 2 stock check is vulnerable to concurrent reads before commit. ' +
    'Fix: use UPDATE ... WHERE stock >= N and check affectedRows.'
  );

  // Sanity: total resolved promises == CONCURRENCY
  assertEqual(successes + failures, CONCURRENCY, 'B.1 All promises must resolve');
});

// ═════════════════════════════════════════════════════════════════════════════
// RUNNER
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  // ── Setup ──────────────────────────────────────────────────────────────────
  try {
    ({ sequelize: SEQ, models: MODELS } = await setupTestDb());
  } catch (err) {
    console.error('FATAL: Could not set up test database:', err.message);
    process.exit(1);
  }

  registerVentasHandlers(MODELS, SEQ);
  registerCajaHandlers(MODELS, SEQ);
  registerProductosHandlers(MODELS, SEQ);

  // ── Run ────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Phase 2 — Financial Integrity Test Suite');
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
      // Indent error lines so they don't look like test lines
      err.message.split('\n').forEach(line => console.log(`       ${line}`));
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log('\n──────────────────────────────────────────────────────');
  console.log(`TOTAL: ${results.length}`);
  console.log(`PASS:  ${passed}`);
  console.log(`FAIL:  ${failed}`);
  console.log('──────────────────────────────────────────────────────\n');

  // ── Persist JSON reports ───────────────────────────────────────────────────
  saveReports(results, passed, failed);

  // ── Append to refactor-log.md ──────────────────────────────────────────────
  await appendTestLog(results, passed, failed);

  process.exit(failed > 0 ? 1 : 0);
}

function saveReports(results, passed, failed) {
  const reportsDir = path.resolve(__dirname, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const report = {
    date: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    results,
  };

  const payload = JSON.stringify(report, null, 2);

  // Timestamped archive: phase-2-YYYYMMDDTHHMMSS.json
  const stamp = report.date.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);
  const stampedPath = path.join(reportsDir, `phase-2-${stamp}.json`);
  fs.writeFileSync(stampedPath, payload, 'utf-8');

  // Latest pointer — always overwritten
  fs.writeFileSync(path.join(reportsDir, 'latest.json'), payload, 'utf-8');

  console.log(`Reports saved → tests/reports/phase-2-${stamp}.json`);
  console.log(`               tests/reports/latest.json`);
}

async function appendTestLog(results, passed, failed) {
  const logPath = path.resolve(__dirname, '../docs/refactor-log.md');
  const date = new Date().toISOString().slice(0, 10);

  const failLines = results
    .filter(r => r.status === 'FAIL')
    .map(r => `- **${r.id} ${r.name}**: ${r.error.split('\n')[0]}`)
    .join('\n');

  const resultTable = results
    .map(r => `| ${r.id} | ${r.name} | ${r.status === 'PASS' ? '✅' : '❌'} |`)
    .join('\n');

  const concurrentNote = results.find(r => r.id === 'B.1' && r.status === 'FAIL')
    ? '\n**B.1 analysis:** The bonus concurrent test failed because the Phase 2 stock check ' +
      '(`findByPk → check → increment`) is not atomic under concurrent load. ' +
      'Two requests can both read the same stock value before either commits, ' +
      'both pass the check, then both decrement — driving stock negative. ' +
      'Fix (Phase 6 candidate): replace the read-check-increment pattern with ' +
      '`UPDATE productos SET stock = stock - N WHERE id = ? AND stock >= N` ' +
      'and verify `affectedRows > 0`.'
    : (results.find(r => r.id === 'B.1' && r.status === 'PASS')
        ? '\n**B.1 note:** Concurrent test passed. SQLite\'s write serialization prevented ' +
          'negative stock in this run, but the read-check-decrement pattern remains ' +
          'theoretically vulnerable under higher concurrency. Consider atomic UPDATE fix.'
        : '');

  const section = `
---

## [${date}] Phase 2 Testing Results

**Runner:** \`tests/run-phase-2.js\` (plain Node.js, no external test framework)
**Database:** In-memory SQLite (fresh for each run, reset between tests)
**Handlers tested:** real production code — no mocks for business logic

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
${concurrentNote}
`;

  try {
    fs.appendFileSync(logPath, section, 'utf-8');
    console.log(`Test results appended to docs/refactor-log.md`);
  } catch (err) {
    console.error('Warning: could not update refactor-log.md:', err.message);
  }
}

main().catch(err => {
  console.error('FATAL error in test runner:', err);
  process.exit(1);
});
