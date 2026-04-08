'use strict';

// ─── CRITICAL: electron mock must be installed BEFORE any handler require ─────
const { invoke, mockDialog, registeredHandlers } = require('./helpers/electron-mock');

const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');

const { setupTestDb }  = require('./helpers/db-setup');
const { resetDb }      = require('./helpers/db-reset');
const { seedBase }     = require('./helpers/seed');
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

// ─── PATH CONTAINMENT HELPER (mirrors main.js H-5a fix exactly) ───────────────
// This function is a direct copy of the algorithm used in main.js so that
// the test validates the algorithm in isolation without requiring main.js.
// If the algorithm in main.js is changed, this must be updated to match.
function resolveAndCheck(roots, rawUrl) {
  try {
    for (const root of roots) {
      const resolved = path.resolve(path.join(root, rawUrl));
      const isContained = resolved === root || resolved.startsWith(root + path.sep);
      if (isContained && fs.existsSync(resolved)) return { serviced: true, resolvedPath: resolved };
    }
    return { serviced: false, error: -10 };
  } catch {
    return { serviced: false, error: -10 };
  }
}

// ─── TEST REGISTRY ────────────────────────────────────────────────────────────
const tests = [];
function test(id, name, fn) { tests.push({ id, name, fn }); }

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1 — H-5a: Path containment algorithm (app:// protocol)
// Mirrors the exact fix applied to main.js. Tests use a real temp directory
// so fs.existsSync behaves correctly.
// ═════════════════════════════════════════════════════════════════════════════

let tmpPublicRoot, tmpUserDataRoot, tmpSafeFile, tmpImageFile;

function setupProtocolFixture() {
  // Create a temp directory tree that simulates public/ and userData/
  tmpPublicRoot   = path.join(os.tmpdir(), `ph3-public-${Date.now()}`);
  tmpUserDataRoot = path.join(os.tmpdir(), `ph3-userdata-${Date.now()}`);

  fs.mkdirSync(path.join(tmpPublicRoot, 'js'), { recursive: true });
  fs.mkdirSync(path.join(tmpPublicRoot, 'images'), { recursive: true });
  fs.mkdirSync(path.join(tmpUserDataRoot, 'images', 'productos'), { recursive: true });

  tmpSafeFile  = path.join(tmpPublicRoot, 'js', 'app.js');
  tmpImageFile = path.join(tmpUserDataRoot, 'images', 'productos', 'producto_123.png');

  fs.writeFileSync(tmpSafeFile,  'console.log("app");', 'utf-8');
  fs.writeFileSync(tmpImageFile, Buffer.alloc(8).fill(0x89)); // dummy PNG header
}

function teardownProtocolFixture() {
  try { fs.rmSync(tmpPublicRoot,   { recursive: true, force: true }); } catch (_) {}
  try { fs.rmSync(tmpUserDataRoot, { recursive: true, force: true }); } catch (_) {}
}

test('1.1', 'H-5a: path traversal básico bloqueado', () => {
  const roots  = [tmpPublicRoot, tmpUserDataRoot];
  const result = resolveAndCheck(roots, '../../sensitive-file.txt');
  assertFalse(result.serviced, '1.1 Traversal ../../ must be blocked — file outside roots');
  assertEqual(result.error, -10, '1.1 Must return error -10 (ACCESS_DENIED)');
});

test('1.2', 'H-5a: prefix spoofing sin separador bloqueado', () => {
  // Without path.sep guard, a path like "public_evil" could pass a naive
  // startsWith("/tmp/ph3-public") check because it shares the prefix.
  // The fix requires startsWith(root + path.sep) — this test validates that.
  const fakeEvilRoot = tmpPublicRoot + '_evil';
  fs.mkdirSync(fakeEvilRoot, { recursive: true });
  const evilFile = path.join(fakeEvilRoot, 'secret.txt');
  fs.writeFileSync(evilFile, 'secret', 'utf-8');

  try {
    // URL: "../ph3-public_evil-<ts>/secret.txt" relative to publicRoot
    const relativeUp = path.relative(tmpPublicRoot, evilFile);
    const result = resolveAndCheck([tmpPublicRoot, tmpUserDataRoot], relativeUp);
    assertFalse(result.serviced, '1.2 File in sibling directory must not be served');
    assertEqual(result.error, -10, '1.2 Must return error -10');
  } finally {
    try { fs.rmSync(fakeEvilRoot, { recursive: true, force: true }); } catch (_) {}
  }
});

test('1.3', 'H-5a: URL malformada retorna ACCESS_DENIED (fail-closed)', () => {
  // decodeURI('%') throws URIError — the try/catch must catch it and deny.
  const roots = [tmpPublicRoot, tmpUserDataRoot];
  // Simulate what decodeURI('%') does by passing a rawUrl that throws
  // We test by calling the function with a url that after decodeURI would be malformed.
  // Since resolveAndCheck receives the already-decoded url, we simulate the
  // fail-closed path by temporarily breaking path.resolve via a non-string.
  const result = resolveAndCheck(roots, null); // null causes path.join to throw
  assertFalse(result.serviced, '1.3 Malformed URL must be fail-closed');
  assertEqual(result.error, -10, '1.3 Must return error -10');
});

test('1.4', 'H-5a: path legítimo en public/ es servido', () => {
  const roots  = [tmpPublicRoot, tmpUserDataRoot];
  const result = resolveAndCheck(roots, 'js/app.js');
  assertTrue(result.serviced, '1.4 Legitimate file in public/ must be served');
  assertEqual(result.resolvedPath, tmpSafeFile, '1.4 Resolved path must equal the known safe file');
});

test('1.5', 'H-5a: path legítimo en userData/ es servido', () => {
  const roots  = [tmpPublicRoot, tmpUserDataRoot];
  const result = resolveAndCheck(roots, 'images/productos/producto_123.png');
  assertTrue(result.serviced, '1.5 Legitimate file in userData/ must be served');
  assertEqual(result.resolvedPath, tmpImageFile, '1.5 Resolved path must equal the known image file');
});

test('1.6', 'H-5a: archivo inexistente retorna ACCESS_DENIED (no exception)', () => {
  const roots  = [tmpPublicRoot, tmpUserDataRoot];
  const result = resolveAndCheck(roots, 'js/nonexistent.js');
  assertFalse(result.serviced, '1.6 Non-existent file must not be served');
  assertEqual(result.error, -10, '1.6 Must return error -10');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2 — H-5b: CSV import IPC surface
// ═════════════════════════════════════════════════════════════════════════════

test('2.1', 'H-5b: show-open-dialog no está registrado en IPC', () => {
  const handler = registeredHandlers['show-open-dialog'];
  assertEqual(handler, undefined,
    '2.1 "show-open-dialog" channel must NOT be registered — it was an attack surface');
});

test('2.2', 'H-5b: import-productos-csv ignora cualquier argumento del renderer', async () => {
  // Default mockDialog returns { canceled: true } — simulates no user selection.
  // The handler should use the dialog result, NOT any argument passed by the renderer.
  const result = await invoke('import-productos-csv', 'C:/Windows/System32/drivers/etc/hosts');
  // The handler opens dialog internally → mock returns canceled → returns early.
  // If it had used the renderer argument, it would have tried to read the system file.
  assertFalse(result.success, '2.2 Must return success:false when dialog is canceled');
  assertEqual(result.message, 'Importación cancelada.',
    '2.2 Message must indicate dialog was canceled, not a file-read error');
});

test('2.3', 'H-5b: cancelación del dialog no produce error visible', async () => {
  // Dialog returns canceled — handler must return gracefully, not throw.
  const result = await invoke('import-productos-csv');
  assertFalse(result.success, '2.3 Canceled import must return success:false');
  assertEqual(result.message, 'Importación cancelada.', '2.3 Message must be cancellation notice');
});

test('2.4', 'H-5b: flujo completo de import con dialog interno', async () => {
  await fresh();

  const csvContent = [
    'codigo,nombre,precioCompra,precioVenta,stock,unidad,pesable,departamento,familia,plu,codigo_barras',
    'SEC3NEW,Producto Nuevo Phase3,30,90,5,unidad,NO,,,,',
  ].join('\n');

  const tmpFile = path.join(os.tmpdir(), `ph3-csv-${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, csvContent, 'utf-8');

  const savedDialog = mockDialog.showOpenDialog;
  mockDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [tmpFile] });

  try {
    const result = await invoke('import-productos-csv');
    assertTrue(result.success, '2.4 Import must succeed when dialog returns valid file');
    assertTrue(
      typeof result.message === 'string' && result.message.includes('1'),
      '2.4 Message must report 1 processed product'
    );

    const prod = await MODELS.Producto.findOne({ where: { codigo: 'SEC3NEW' } });
    assertTrue(prod !== null, '2.4 Product must exist in DB after import');
    assertApprox(prod.precioVenta, 90, 0.01, '2.4 precioVenta must be 90');
  } finally {
    mockDialog.showOpenDialog = savedDialog;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3 — M-7: Field allowlist en guardar-producto
// ═════════════════════════════════════════════════════════════════════════════

test('3.1', 'M-7: campos de sistema (createdAt/updatedAt) son descartados', async () => {
  const { prodA } = await fresh();

  // Read the original createdAt before the attack attempt
  const original = await MODELS.Producto.findByPk(prodA.id);
  const originalCreatedAt = original.createdAt.getTime();

  // Attempt to overwrite createdAt with epoch via injected field
  const result = await invoke('guardar-producto', {
    id: prodA.id,
    codigo: 'PRODA',
    nombre: 'Producto A Modificado',
    precioVenta: 100,
    precioCompra: 0,
    stock: 10,
    createdAt: new Date(0).toISOString(), // epoch — must be stripped
    updatedAt: new Date(0).toISOString(), // epoch — must be stripped
  });

  assertTrue(result.success, '3.1 Update must succeed even with injected fields in payload');

  const updated = await MODELS.Producto.findByPk(prodA.id);

  // createdAt must NOT have been overwritten with epoch
  assertTrue(
    updated.createdAt.getTime() >= originalCreatedAt,
    '3.1 createdAt must not be overwritten — injected field must have been stripped'
  );
  // nombre must have been updated (valid field)
  assertEqual(updated.nombre, 'Producto A Modificado', '3.1 Valid field (nombre) must be updated');
});

test('3.2', 'M-7: campos de otros modelos son descartados', async () => {
  const { prodA } = await fresh();

  // Inject fields that belong to other models or don't exist in Producto
  const result = await invoke('guardar-producto', {
    id: prodA.id,
    codigo: 'PRODA',
    nombre: 'Producto A',
    precioVenta: 100,
    precioCompra: 0,
    stock: 10,
    rol: 'administrador',        // Usuario field
    UserId: crypto.randomUUID(), // foreign key to another model
    password: 'hacked',          // Usuario field
    isAdmin: true,               // non-existent field
    ArqueoCajaId: crypto.randomUUID(), // foreign key to ArqueoCaja
  });

  // Must not throw or fail — injected fields are silently stripped
  assertTrue(result.success,
    '3.2 Update must succeed — injected fields from other models must be silently stripped');
});

test('3.3', 'M-7: prototype pollution attempt no causa error', async () => {
  const { prodA } = await fresh();

  // __proto__ and constructor are not in ALLOWED_FIELDS and must be stripped
  const malicious = {
    id: prodA.id,
    codigo: 'PRODA',
    nombre: 'Producto A',
    precioVenta: 100,
    precioCompra: 0,
    stock: 10,
  };
  // Add non-enumerable-safe pollution keys via bracket notation
  malicious['__proto__']   = { isAdmin: true };
  malicious['constructor'] = { prototype: { isAdmin: true } };

  const result = await invoke('guardar-producto', malicious);
  assertTrue(result.success, '3.3 Prototype pollution keys must be stripped without error');

  // Verify global Object.prototype was not polluted
  assertFalse(({}).isAdmin === true, '3.3 Object.prototype must not be polluted');
});

test('3.4', 'M-7: payload null retorna error controlado (no crash)', async () => {
  const result = await invoke('guardar-producto', null);
  assertFalse(result.success, '3.4 null payload must return success:false');
  assertTrue(typeof result.message === 'string' && result.message.length > 0,
    '3.4 Must return a descriptive error message');
});

test('3.5', 'M-7: todos los campos del allowlist funcionan en create', async () => {
  await fresh();

  const result = await invoke('guardar-producto', {
    // no id → CREATE path
    nombre: 'Producto Allowlist Test',
    codigo: 'ALW-001',
    codigo_barras: '7790001234567',
    plu: '999',
    stock: 25,
    precioCompra: 80,
    precioVenta: 150,
    precio_oferta: null,
    unidad: 'kg',
    pesable: true,
    activo: true,
    fecha_fin_oferta: null,
    fecha_vencimiento: null,
    DepartamentoId: null,
    FamiliaId: null,
  });

  assertTrue(result.success, '3.5 Create with all allowed fields must succeed');

  const prod = await MODELS.Producto.findOne({ where: { codigo: 'ALW-001' } });
  assertTrue(prod !== null, '3.5 Product must be in DB after create');
  assertApprox(prod.stock, 25, 0.001, '3.5 stock must be 25');
  assertApprox(prod.precioVenta, 150, 0.01, '3.5 precioVenta must be 150');
  assertEqual(prod.unidad, 'kg', '3.5 unidad must be kg');
  assertTrue(prod.pesable === true || prod.pesable === 1, '3.5 pesable must be true');
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4 — REGRESIÓN: comportamientos críticos de Phase 2 no rotos
// ═════════════════════════════════════════════════════════════════════════════

test('4.1', '[Regresión] Venta normal sigue funcionando', async () => {
  const { admin, prodA } = await fresh();

  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: prodA.id, cantidad: 2, precioUnitario: 999, nombreProducto: 'Producto A' }],
    metodoPago: 'Efectivo',
    montoPagado: 200,
    UsuarioId: admin.id,
  });

  assertTrue(result.success, '4.1 Normal sale must still work after Phase 3 changes');
  assertApprox(result.datosRecibo.total, 200, 0.01, '4.1 Total = 2 × 100 (DB price)');

  const prod = await MODELS.Producto.findByPk(prodA.id);
  assertApprox(prod.stock, 8, 0.001, '4.1 Stock must be decremented: 10 - 2 = 8');
});

test('4.2', '[Regresión] metodoPago inválido sigue siendo rechazado', async () => {
  const { admin, prodA } = await fresh();

  const result = await invoke('registrar-venta', {
    detalles: [{ ProductoId: prodA.id, cantidad: 1, precioUnitario: 100, nombreProducto: 'Producto A' }],
    metodoPago: 'CriptoMoneda',
    montoPagado: 100,
    UsuarioId: admin.id,
  });

  assertFalse(result.success, '4.2 Invalid metodoPago must still be rejected');
});

test('4.3', '[Regresión] CSV import sigue sin pisar stock', async () => {
  await fresh(); // prodA: stock=10

  const csv = [
    'codigo,nombre,precioCompra,precioVenta,stock,unidad,pesable,departamento,familia,plu,codigo_barras',
    'PRODA,Producto A Regresion,40,110,0,unidad,NO,,,,',
  ].join('\n');

  const tmpFile = path.join(os.tmpdir(), `ph3-reg-${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, csv, 'utf-8');

  const savedDialog = mockDialog.showOpenDialog;
  mockDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [tmpFile] });

  try {
    const result = await invoke('import-productos-csv');
    assertTrue(result.success, '4.3 CSV import must succeed');

    const prod = await MODELS.Producto.findOne({ where: { codigo: 'PRODA' } });
    assertApprox(prod.stock, 10, 0.001, '4.3 Stock must remain 10 — CSV import must not overwrite');
    assertApprox(prod.precioVenta, 110, 0.01, '4.3 precioVenta must be updated to 110');
  } finally {
    mockDialog.showOpenDialog = savedDialog;
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

test('4.4', '[Regresión] guardar-producto update con ID inexistente retorna success:false', async () => {
  await fresh();

  const result = await invoke('guardar-producto', {
    id: crypto.randomUUID(),
    codigo: 'GHOST',
    nombre: 'No existe',
    precioVenta: 0,
    precioCompra: 0,
    stock: 0,
  });

  assertFalse(result.success, '4.4 Update with non-existent ID must return success:false');
});

// ═════════════════════════════════════════════════════════════════════════════
// RUNNER
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  // ── Fixture setup ──────────────────────────────────────────────────────────
  setupProtocolFixture();

  // ── DB setup ───────────────────────────────────────────────────────────────
  try {
    ({ sequelize: SEQ, models: MODELS } = await setupTestDb());
  } catch (err) {
    teardownProtocolFixture();
    console.error('FATAL: Could not set up test database:', err.message);
    process.exit(1);
  }

  registerProductosHandlers(MODELS, SEQ);
  registerVentasHandlers(MODELS, SEQ);
  registerCajaHandlers(MODELS, SEQ);

  // ── Run ────────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Phase 3 — Security Test Suite');
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

  // ── Cleanup ────────────────────────────────────────────────────────────────
  teardownProtocolFixture();

  // ── Summary ────────────────────────────────────────────────────────────────
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
    suite: 'phase-3',
    total: results.length,
    passed,
    failed,
    results,
  };

  const payload = JSON.stringify(report, null, 2);
  const stamp   = report.date.replace(/[-:]/g, '').replace('T', 'T').slice(0, 15);

  fs.writeFileSync(path.join(reportsDir, `phase-3-${stamp}.json`), payload, 'utf-8');
  fs.writeFileSync(path.join(reportsDir, 'latest-phase-3.json'), payload, 'utf-8');

  console.log(`Reports saved → tests/reports/phase-3-${stamp}.json`);
  console.log(`               tests/reports/latest-phase-3.json`);
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

## [${date}] Phase 3 Testing Results

**Runner:** \`tests/run-phase-3.js\` (plain Node.js, no external test framework)
**Database:** In-memory SQLite (fresh for each run, reset between tests)
**Handlers tested:** real production code — \`registerProductosHandlers\`, \`registerVentasHandlers\`, \`registerCajaHandlers\`

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
  teardownProtocolFixture();
  console.error('FATAL error in test runner:', err);
  process.exit(1);
});
