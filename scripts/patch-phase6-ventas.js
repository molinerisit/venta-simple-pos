'use strict';
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../src/ipc-handlers/ventas-handlers.js');
let src = fs.readFileSync(filePath, 'utf-8');

// ── 6.1: Add limit/offset to get-ventas ──────────────────────────────────────
src = src.replace(
  /const \{ fechaInicio, fechaFin \} = filters \|\| \{\};/,
  'const { fechaInicio, fechaFin, limit, offset } = filters || {};'
);

// Add limit/offset to findAll — locate `order: [["createdAt", "DESC"]],` then its `});`
// Use a fixed-string replace (no regex) to be safe
const BEFORE_ORDER = '        order: [["createdAt", "DESC"]],\r\n      });\r\n      return ventas.map((v) => v.toJSON());';
const AFTER_ORDER  = '        order: [["createdAt", "DESC"]],\r\n        ...(limit != null && { limit: Number(limit) }),\r\n        ...(offset != null && { offset: Number(offset) }),\r\n      });\r\n      return ventas.map((v) => v.toJSON());';
if (!src.includes(BEFORE_ORDER)) {
  throw new Error('Could not find findAll order/close pattern in get-ventas');
}
src = src.replace(BEFORE_ORDER, AFTER_ORDER);

// ── 6.2: Add error:true to registrar-venta catch ──────────────────────────────
src = src.replace(
  'return { success: false, message: error.message || "Error al guardar la venta." };',
  'return { success: false, message: error.message || "Error al guardar la venta.", error: true };'
);

// ── 6.6: Remove busqueda-inteligente debug logs ───────────────────────────────
// Strategy: replace the ENTIRE busqueda-inteligente handler body's debug section
// with a clean version, using a precise fixed-string replace to avoid regex boundary issues.

// Pattern: the search section from "// Búsqueda inteligente" to before "// Registrar venta"
// We'll replace only the specific log lines by matching start-of-line marker using split approach.

const lines = src.split('\r\n');
const cleaned = lines.filter(line => {
  const trimmed = line.replace(/[\u00a0 \t]/g, '');
  // Remove ONLY lines that are PURELY a console.log with [BUSQUEDA] tag
  if (trimmed.startsWith('console.log(`[BUSQUEDA]') || trimmed.startsWith("console.log('[BUSQUEDA]") || trimmed.startsWith('console.log("[BUSQUEDA]')) return false;
  // Remove the "🟢 Log de inicio" comment line
  if (trimmed.startsWith('//') && trimmed.includes('Log de inicio')) return false;
  return true;
});
src = cleaned.join('\r\n');

// Clean up any triple blank lines left behind
src = src.replace(/(\r\n){4,}/g, '\r\n\r\n\r\n');

fs.writeFileSync(filePath, src, 'utf-8');

// Verify
const check = fs.readFileSync(filePath, 'utf-8');
const v = (label, cond) => console.log(`${cond ? '\u2713' : '\u2717'} ${label}`);
v('6.1 limit/offset destructure', check.includes('fechaFin, limit, offset'));
v('6.1 limit in findAll', check.includes('limit: Number(limit)'));
v('6.2 error:true in registrar-venta', check.includes('"Error al guardar la venta.", error: true'));
v('6.6 [BUSQUEDA] Recibido removed', !check.includes('[BUSQUEDA] Recibido'));
v('6.6 [BUSQUEDA] Config removed', !check.includes('[BUSQUEDA] Config de balanza'));
v('6.6 syntax check: whereClause still exists', check.includes('const whereClause = {'));
v('6.6 Op.or still exists', check.includes('[Op.or]'));

// Quick syntax check
try {
  require(filePath); // This will throw if syntax is broken — but electron is mocked
} catch(e) {
  if (e.name === 'SyntaxError') {
    console.error('SYNTAX ERROR:', e.message);
    process.exit(1);
  }
  // Other errors (electron not available) are expected
}
console.log('ventas-handlers.js patched OK');
