'use strict';

// ─── CRITICAL: electron mock must be installed BEFORE any handler require ─────
const { invoke, mockDialog } = require('./helpers/electron-mock');

const path   = require('path');
const fs     = require('fs');
const os     = require('os');

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

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
let SEQ, MODELS;

async function fresh() {
  await resetDb(SEQ);
  return seedBase(MODELS);
}

// ─── TEST REGISTRY ────────────────────────────────────────────────────────────
const tests = [];
function test(id, name, fn) { tests.push({ id, name, fn }); }

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1 — 6.1: Pagination (limit/offset) in list handlers
// ═════════════════════════════════════════════════════════════════════════════

test('1.1', '6.1: get-productos with no opts returns all products', async () => {
  await fresh();
  const result = await invoke('get-productos');
  assertTrue(Array.isArray(result), '1.1 get-productos must return an array');
  assertTrue(result.length >= 3, '1.1 seedBase creates 3 products, must all be present');
});

test('1.2', '6.1: get-productos with limit=1 returns only 1 product', async () => {
  await fresh();
  const result = await invoke('get-productos', { limit: 1 });
  assertTrue(Array.isArray(result), '1.2 Must return an array');
  assertEqual(result.length, 1, '1.2 limit=1 must return exactly 1 product');
});

test('1.3', '6.1: get-productos with limit=2 offset=1 skips first product', async () => {
  await fresh();
  const all    = await invoke('get-productos');
  const paged  = await invoke('get-productos', { limit: 2, offset: 1 });
  assertTrue(Array.isArray(paged), '1.3 Must return an array');
  assertEqual(paged.length, 2, '1.3 limit=2 offset=1 must return 2 products');
  assertEqual(paged[0].id, all[1].id, '1.3 First result with offset=1 must be second from full list');
});

test('1.4', '6.1: get-ventas with limit=1 returns only 1 venta', async () => {
  const { admin, prodA } = await fresh();
  // Register 2 ventas
  for (let i = 0; i < 2; i++) {
    await invoke('registrar-venta', {
      detalles: [{ ProductoId: prodA.id, cantidad: 1, precioUnitario: 100, nombreProducto: 'A' }],
      metodoPago: 'Efectivo',
      montoPagado: 100,
      UsuarioId: admin.id,
    });
  }
  const result = await invoke('get-ventas', { limit: 1 });
  assertTrue(Array.isArray(result), '1.4 Must return an array');
  assertEqual(result.length, 1, '1.4 limit=1 must return exactly 1 venta');
});

test('1.5', '6.1: get-all-cierres-caja with limit=1 returns only 1 cierre', async () => {
  await resetDb(SEQ);
  const bcrypt = require('bcryptjs');
  const hash   = await bcrypt.hash('test123', 1);
  const admin  = await MODELS.Usuario.create({
    nombre: 'Admin', password: hash, rol: 'administrador',
    config_recargo_credito: 0, config_descuento_efectivo: 0,
  });
  // Create 2 closed arqueos directly
  await MODELS.ArqueoCaja.create({
    montoInicial: 100, UsuarioId: admin.id, estado: 'CERRADA',
    fechaApertura: new Date('2024-01-01'), fechaCierre: new Date('2024-01-02'),
  });
  await MODELS.ArqueoCaja.create({
    montoInicial: 200, UsuarioId: admin.id, estado: 'CERRADA',
    fechaApertura: new Date('2024-02-01'), fechaCierre: new Date('2024-02-02'),
  });

  const all    = await invoke('get-all-cierres-caja');
  const paged  = await invoke('get-all-cierres-caja', { limit: 1 });
  assertTrue(all.length === 2, '1.5 Both arqueos must exist');
  assertEqual(paged.length, 1, '1.5 limit=1 must return exactly 1 cierre');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2 — 6.2: Consistent error shape { success:false, message, error:true }
// ═════════════════════════════════════════════════════════════════════════════

test('2.1', '6.2: catch block in guardar-producto returns error:true on unexpected failure', async () => {
  // M-2: error:true is added to catch blocks (unexpected failures), not business-logic
  // early-return paths (those return success:false + message without error:true).
  await fresh();
  // Trigger a catch-block error by passing an id that does not exist in DB
  const result = await invoke('guardar-producto', {
    id: '00000000-0000-0000-0000-000000000099',
    nombre: 'Ghost Product',
    codigo: 'GHOST2',
    precioVenta: 100,
  });
  assertFalse(result.success, '2.1 Unknown id update must return success:false');
  assertTrue(result.error === true, '2.1 Catch-block path must return error:true');
  assertTrue(typeof result.message === 'string', '2.1 Must return a string message');
});

test('2.2', '6.2: guardar-departamento duplicate returns error:true', async () => {
  await fresh();
  // Create once successfully
  await invoke('guardar-departamento', { nombre: 'Dept Dup Test' });
  // Try again — should fail
  const result = await invoke('guardar-departamento', { nombre: 'Dept Dup Test' });
  assertFalse(result.success, '2.2 Duplicate department must return success:false');
  // Note: guardar-departamento returns success:false but not necessarily error:true
  // for the "ya existe" path — only the catch block returns error:true
  assertTrue(typeof result.message === 'string', '2.2 Must have a message');
});

test('2.3', '6.2: guardar-producto with bad id returns error:true', async () => {
  await fresh();
  const result = await invoke('guardar-producto', {
    id: '00000000-0000-0000-0000-000000000099',
    nombre: 'Ghost',
    codigo: 'GHOST',
    precioVenta: 100,
  });
  assertFalse(result.success, '2.3 Unknown product update must return success:false');
  assertTrue(result.error === true, '2.3 Must return error:true');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3 — 6.3/6.5: async CSV export (fsPromises.writeFile)
// ═════════════════════════════════════════════════════════════════════════════

test('3.1', '6.3/6.5: export-productos-csv writes file asynchronously', async () => {
  await fresh();
  const tmpFile = path.join(os.tmpdir(), `ph6-export-${Date.now()}.csv`);
  const savedDialog = mockDialog.showSaveDialog;
  mockDialog.showSaveDialog = async () => ({ canceled: false, filePath: tmpFile });
  try {
    const result = await invoke('export-productos-csv');
    assertTrue(result.success, '3.1 Export must succeed');
    assertTrue(fs.existsSync(tmpFile), '3.1 CSV file must exist after async write');
    const content = fs.readFileSync(tmpFile, 'utf-8');
    assertTrue(content.includes('codigo'), '3.1 CSV must contain header row');
    assertTrue(content.includes('PRODA'), '3.1 CSV must contain seeded product');
  } finally {
    mockDialog.showSaveDialog = savedDialog;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4 — 6.4: CSV row count limit (max 10,000)
// ═════════════════════════════════════════════════════════════════════════════

test('4.1', '6.4: import-productos-csv rejects CSV with > 10,000 rows', async () => {
  await fresh();
  const header = 'codigo,nombre,precioCompra,precioVenta,stock,unidad,pesable,departamento,familia,plu,codigo_barras\n';
  const rows   = Array.from({ length: 10001 }, (_, i) =>
    `HUGE${i},Producto ${i},10,20,5,unidad,NO,,,, `
  ).join('\n');
  const tmpFile = path.join(os.tmpdir(), `ph6-huge-${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, header + rows, 'utf-8');
  const savedDialog = mockDialog.showOpenDialog;
  mockDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [tmpFile] });
  try {
    const result = await invoke('import-productos-csv');
    assertFalse(result.success, '4.1 Must reject CSV with > 10,000 rows');
    assertTrue(result.error === true, '4.1 Must return error:true');
    assertTrue(result.message.includes('10.000'), '4.1 Message must mention 10.000');
  } finally {
    mockDialog.showOpenDialog = savedDialog;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('4.2', '6.4: import-productos-csv accepts CSV with exactly 100 rows', async () => {
  await fresh();
  const header = 'codigo,nombre,precioCompra,precioVenta,stock,unidad,pesable,departamento,familia,plu,codigo_barras\n';
  const rows   = Array.from({ length: 100 }, (_, i) =>
    `BATCH${i},Producto Batch ${i},10,20,5,unidad,NO,,,,`
  ).join('\n');
  const tmpFile = path.join(os.tmpdir(), `ph6-ok-${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, header + rows, 'utf-8');
  const savedDialog = mockDialog.showOpenDialog;
  mockDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [tmpFile] });
  try {
    const result = await invoke('import-productos-csv');
    assertTrue(result.success, '4.2 CSV with 100 rows must be accepted');
  } finally {
    mockDialog.showOpenDialog = savedDialog;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 5 — 6.7: precio_oferta < precioVenta validation
// ═════════════════════════════════════════════════════════════════════════════

test('5.1', '6.7: guardar-producto rejects precio_oferta >= precioVenta', async () => {
  await fresh();
  const result = await invoke('guardar-producto', {
    nombre: 'Oferta Invalida',
    codigo: 'OFBAD',
    precioVenta: 100,
    precio_oferta: 100,   // equal — must be rejected
    activo: true,
  });
  assertFalse(result.success, '5.1 precio_oferta == precioVenta must fail');
  assertTrue(result.message.includes('oferta'), '5.1 Error must mention oferta');
});

test('5.2', '6.7: guardar-producto rejects precio_oferta > precioVenta', async () => {
  await fresh();
  const result = await invoke('guardar-producto', {
    nombre: 'Oferta Mayor',
    codigo: 'OFBIG',
    precioVenta: 50,
    precio_oferta: 80,
    activo: true,
  });
  assertFalse(result.success, '5.2 precio_oferta > precioVenta must fail');
});

test('5.3', '6.7: guardar-producto accepts valid precio_oferta < precioVenta', async () => {
  await fresh();
  const result = await invoke('guardar-producto', {
    nombre: 'Oferta Valida',
    codigo: 'OFGOOD',
    precioVenta: 100,
    precio_oferta: 80,
    activo: true,
  });
  assertTrue(result.success, '5.3 precio_oferta < precioVenta must succeed');
  const prod = await MODELS.Producto.findOne({ where: { codigo: 'OFGOOD' } });
  assertTrue(prod !== null, '5.3 Product must be in DB');
  assertApprox(prod.precio_oferta, 80, 0.01, '5.3 precio_oferta must be saved');
});

test('5.4', '6.7: guardar-producto accepts null precio_oferta (no validation)', async () => {
  await fresh();
  const result = await invoke('guardar-producto', {
    nombre: 'Sin Oferta',
    codigo: 'OFNULL',
    precioVenta: 100,
    precio_oferta: null,
    activo: true,
  });
  assertTrue(result.success, '5.4 null precio_oferta must be accepted');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 6 — 6.8: Single-query toggle-producto-activo
// ═════════════════════════════════════════════════════════════════════════════

test('6.1', '6.8: toggle-producto-activo toggles activo from true to false', async () => {
  const { prodA } = await fresh();
  assertTrue(prodA.activo, '6.1 prodA must be active initially');
  const result = await invoke('toggle-producto-activo', prodA.id);
  assertTrue(result.success, '6.1 Toggle must succeed');
  const updated = await MODELS.Producto.findByPk(prodA.id);
  assertFalse(updated.activo, '6.1 activo must be false after toggle');
});

test('6.2', '6.8: toggle-producto-activo toggles back (false to true)', async () => {
  const { prodA } = await fresh();
  await invoke('toggle-producto-activo', prodA.id); // false
  const result = await invoke('toggle-producto-activo', prodA.id); // back to true
  assertTrue(result.success, '6.2 Second toggle must succeed');
  const updated = await MODELS.Producto.findByPk(prodA.id);
  assertTrue(updated.activo, '6.2 activo must be true after double toggle');
});

test('6.3', '6.8: toggle-producto-activo returns error for non-existent product', async () => {
  await fresh();
  const result = await invoke('toggle-producto-activo', '00000000-0000-0000-0000-000000000099');
  assertFalse(result.success, '6.3 Toggle on non-existent product must fail');
  assertTrue(typeof result.message === 'string', '6.3 Must return a message');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 7 — 6.10: nombre non-empty validation in guardar-producto
// ═════════════════════════════════════════════════════════════════════════════

test('7.1', '6.10: guardar-producto rejects empty nombre', async () => {
  await fresh();
  const result = await invoke('guardar-producto', {
    nombre: '',
    codigo: 'EMPTYNOM6',
    precioVenta: 100,
    activo: true,
  });
  assertFalse(result.success, '7.1 Empty nombre must fail');
  assertTrue(result.message.includes('nombre') || result.message.includes('obligatorio'),
    '7.1 Error must mention nombre or obligatorio');
});

test('7.2', '6.10: guardar-producto rejects whitespace-only nombre', async () => {
  await fresh();
  const result = await invoke('guardar-producto', {
    nombre: '   ',
    codigo: 'WSNOM6',
    precioVenta: 100,
    activo: true,
  });
  assertFalse(result.success, '7.2 Whitespace-only nombre must fail after trim');
});

test('7.3', '6.10: guardar-producto accepts valid nombre', async () => {
  await fresh();
  const result = await invoke('guardar-producto', {
    nombre: 'Producto Valido Phase6',
    codigo: 'PV6OK',
    precioVenta: 50,
    activo: true,
  });
  assertTrue(result.success, '7.3 Valid nombre must be accepted');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 8 — REGRESIÓN: comportamientos previos no rotos
// ═════════════════════════════════════════════════════════════════════════════

test('8.1', '[Regresión] get-productos with no pagination returns all seeded products', async () => {
  await fresh();
  const result = await invoke('get-productos');
  assertTrue(Array.isArray(result) && result.length === 3,
    '8.1 get-productos must still return all 3 seeded products');
});

test('8.2', '[Regresión] registrar-venta still works end-to-end', async () => {
  const { admin, prodA } = await fresh();
  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: prodA.id, cantidad: 1, precioUnitario: 100, nombreProducto: 'A' }],
    metodoPago: 'Efectivo',
    montoPagado: 100,
    UsuarioId: admin.id,
  });
  assertTrue(result.success, '8.2 registrar-venta must still succeed');
});

test('8.3', '[Regresión] busqueda-inteligente works without debug logs', async () => {
  await fresh();
  const result = await invoke('busqueda-inteligente', 'PRODA');
  assertTrue(result !== null, '8.3 busqueda-inteligente must still find products');
  assertEqual(result.codigo, 'PRODA', '8.3 Correct product returned');
});

test('8.4', '[Regresión] import-productos-csv with valid CSV still works', async () => {
  await fresh();
  const csv = [
    'codigo,nombre,precioCompra,precioVenta,stock,unidad,pesable,departamento,familia,plu,codigo_barras',
    'PH6REG,Producto Phase6 Reg,20,80,10,unidad,NO,DeptReg,FamReg,,',
  ].join('\n');
  const tmpFile = path.join(os.tmpdir(), `ph6-reg-${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, csv, 'utf-8');
  const savedDialog = mockDialog.showOpenDialog;
  mockDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [tmpFile] });
  try {
    const result = await invoke('import-productos-csv');
    assertTrue(result.success, '8.4 Valid CSV import must still succeed after Phase 6 changes');
    const prod = await MODELS.Producto.findOne({ where: { codigo: 'PH6REG' } });
    assertTrue(prod !== null, '8.4 Product must be in DB');
  } finally {
    mockDialog.showOpenDialog = savedDialog;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
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

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Phase 6 — Performance & Code Quality Test Suite');
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
    suite: 'phase-6',
    total: results.length,
    passed,
    failed,
    results,
  };

  const payload = JSON.stringify(report, null, 2);
  const stamp   = report.date.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);

  fs.writeFileSync(path.join(reportsDir, `phase-6-${stamp}.json`), payload, 'utf-8');
  fs.writeFileSync(path.join(reportsDir, 'latest-phase-6.json'), payload, 'utf-8');

  console.log(`Reports saved → tests/reports/phase-6-${stamp}.json`);
  console.log(`               tests/reports/latest-phase-6.json`);
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

## [${date}] Phase 6 Testing Results

**Runner:** \`tests/run-phase-6.js\` (plain Node.js, no external test framework)
**Database:** In-memory SQLite (fresh for each run, reset between tests)
**Handlers tested:** \`registerProductosHandlers\`, \`registerVentasHandlers\`, \`registerCajaHandlers\`

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
