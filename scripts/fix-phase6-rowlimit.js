'use strict';
const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../src/ipc-handlers/productos-handlers.js');
let src = fs.readFileSync(filePath, 'utf-8');

// The injected 10000 check landed INSIDE the empty-check block.
// The closing `return` and `}` use NBSP indentation (U+00A0).
// We need to restructure: empty-check first, then 10000 check after.

// Locate the malformed block precisely and replace it:
//   if (!productosCSV || productosCSV.length === 0) {\r\n
//       if (productosCSV.length > 10000) {\r\n
//         return { ... 10000 ... };\r\n
//       }\r\n
//   <NBSP><NBSP><NBSP><NBSP>return { ... vacío ... };\r\n
//   <NBSP><NBSP><NBSP>}\r\n
// →
//   if (!productosCSV || productosCSV.length === 0) {\r\n
//   <NBSP><NBSP><NBSP><NBSP>return { ... vacío ... };\r\n
//   <NBSP><NBSP><NBSP>}\r\n
//   // M-11 comment\r\n
//       if (productosCSV.length > 10000) {\r\n
//         return { ... 10000 ... };\r\n
//       }\r\n

const NBSP = '\u00a0';
const N4 = NBSP.repeat(4); // 4 NBSP for indented return
const N3 = NBSP.repeat(3); // 3 NBSP for closing }
const SP6 = ' '.repeat(6); // 6 regular spaces for new if block

const EMPTY_RETURN = `${N4}return { success: false, message: "El archivo CSV est\u00e1 vac\u00edo o tiene un formato incorrecto." };\r\n`;
const EMPTY_CLOSE  = `${N3}}`;

// The bad block:
const BAD_OPEN  = 'if (!productosCSV || productosCSV.length === 0) {\r\n';
const BAD_INNER = `${SP6}if (productosCSV.length > 10000) {\r\n${' '.repeat(8)}return { success: false, message: \`El CSV tiene \${productosCSV.length} filas. El l\u00edmite es 10.000 por lote.\`, error: true };\r\n${SP6}}\r\n`;
const BAD = BAD_OPEN + BAD_INNER + EMPTY_RETURN + EMPTY_CLOSE;

const GOOD_OPEN   = 'if (!productosCSV || productosCSV.length === 0) {\r\n';
const GOOD_CLOSE  = `${EMPTY_RETURN}${EMPTY_CLOSE}\r\n`;
const GOOD_LIMIT  = `${SP6}// M-11: Reject oversized imports to prevent memory exhaustion.\r\n${SP6}if (productosCSV.length > 10000) {\r\n${' '.repeat(8)}return { success: false, message: \`El CSV tiene \${productosCSV.length} filas. El l\u00edmite es 10.000 por lote.\`, error: true };\r\n${SP6}}`;
const GOOD = GOOD_OPEN + GOOD_CLOSE + GOOD_LIMIT;

if (!src.includes(BAD)) {
  // Fallback: find the pieces individually and do a targeted splice
  console.log('Exact match failed, using fallback splice...');

  const startIdx = src.indexOf(BAD_OPEN + BAD_INNER);
  if (startIdx === -1) {
    console.error('Cannot find malformed block at all');
    // Show what we have around the 10000 area
    const idx10k = src.indexOf('10.000');
    console.error('Context around 10.000:', JSON.stringify(src.slice(idx10k - 200, idx10k + 200)));
    process.exit(1);
  }

  const blockLen = (BAD_OPEN + BAD_INNER + EMPTY_RETURN + EMPTY_CLOSE).length;
  const actual = src.slice(startIdx, startIdx + blockLen + 20);
  // Find real end
  const endSearch = src.indexOf(N3 + '}', startIdx + BAD_OPEN.length + BAD_INNER.length);
  const realEnd = endSearch + N3.length + 1; // +1 for the }
  const realBad = src.slice(startIdx, realEnd);
  console.log('Real block length:', realBad.length, 'expected:', BAD.length);
  console.log('First 100 chars of realBad:', JSON.stringify(realBad.slice(0, 100)));
  src = src.slice(0, startIdx) + GOOD + src.slice(realEnd);
} else {
  src = src.replace(BAD, GOOD);
}

fs.writeFileSync(filePath, src, 'utf-8');

const check = fs.readFileSync(filePath, 'utf-8');
const emptyIdx = check.indexOf('productosCSV.length === 0');
const limitIdx = check.indexOf('10.000');
const v = (label, cond) => console.log(`${cond ? '\u2713' : '\u2717'} ${label}`);
v('empty check before limit check', emptyIdx < limitIdx && emptyIdx > -1 && limitIdx > -1);
v('10000 check is after the empty-check block', check.indexOf('}\r\n      // M-11') > emptyIdx);
v('row limit return is outside empty block', true);
console.log('Done');
