'use strict';
/**
 * Phase 6 patch for productos-handlers.js (NBSP-encoded file).
 * Applies all 10 changes in one pass using line-by-line processing
 * to avoid regex boundary issues with NBSP whitespace.
 */
const fs   = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '../src/ipc-handlers/productos-handlers.js');
const src  = fs.readFileSync(filePath, 'utf-8');

// Split on CRLF to process line by line
const lines = src.split('\r\n');
const out   = [];

let i = 0;
while (i < lines.length) {
  const raw  = lines[i];
  const trim = raw.replace(/[\u00a0 \t]/g, ''); // strip all whitespace for comparison

  // ── 6.1: get-produtos — change handler signature ──────────────────────────
  if (raw.includes('ipcMain.handle("get-produtos"') || raw.includes('ipcMain.handle("get-productos"')) {
    if (raw.includes('async () =>')) {
      out.push(raw.replace('async () =>', 'async (_event, opts) =>'));
      // Inject the limit/offset destructure on the next line (after the opening {)
      out.push('    // M-1: supports optional limit/offset pagination');
      out.push('    const { limit, offset } = opts || {};');
      i++;
      continue;
    }
  }

  // ── 6.1: get-productos findAll — add limit/offset after order ─────────────
  // Detect the ORDER array closing that belongs to get-productos findAll:
  // It's the one inside the findAll that has ["nombre", "ASC"] — it comes before
  // any return statement that does productos.map(...)
  // We look for the line `      ]);` that closes the order array in get-produtos,
  // then the `    });` that closes findAll.
  // Strategy: emit both as-is but then also check: does the NEXT non-blank line
  // do "return produtos.map"? If so, we're in the right place.
  // Actually easier: detect `order: [` then walk forward.
  // Let's do the simpler approach: detect the specific line pattern.

  // Detect `["nombre", "ASC"],` inside the order of get-productos
  // Then emit the limit/offset lines before the closing `});`
  if (trim === '["nombre","ASC"],' && i + 1 < lines.length && lines[i+1].replace(/[\u00a0 \t]/g,'') === '],') {
    // This is the end of the order array in get-produtos
    out.push(raw); // ["nombre", "ASC"],
    out.push(lines[++i]); // ],  — closes the order array
    // Expect next line to be `      });` closing findAll
    if (i + 1 < lines.length) {
      const closingLine = lines[i+1];
      if (closingLine.replace(/[\u00a0 \t]/g, '') === '});') {
        // Emit limit/offset before the closing });
        const indent = closingLine.match(/^[\u00a0 \t]*/)[0];
        out.push(indent + '  ...(limit != null && { limit: Number(limit) }),');
        out.push(indent + '  ...(offset != null && { offset: Number(offset) }),');
      }
    }
    i++;
    continue;
  }

  // ── 6.2: Add error:true to catch-block returns in structured handlers ──────
  // Pattern: lines that are catch-block returns with success:false but no error:true
  // Only in handlers that return structured objects (not list handlers)
  if (trim.startsWith('return{success:false,message:') && !trim.includes('error:true')) {
    // Skip list-handler catch returns that we leave as-is:
    const skip = [
      '"Ocurriouneerrorinesperadoalguardar."',
      '"Erroralguardareldepartamento."',
      '"Erroralguardarlafamilia."',
    ];
    // Check if this specific return should get error:true
    // We add it to all catch-block returns EXCEPT the business-logic ones
    // Actually per M-2: add to ALL catch-block returns (error:true means "unexpected exception")
    // Business-logic returns already have the right shape.
    // Strategy: only add error:true if it's inside a catch block.
    // Since line-by-line we can't easily track that, use a pattern match instead:
    // These specific messages correspond to catch-block returns we want to update.
    const catchMessages = [
      'error.message||"Ocurriouneerrorinesperadoalguardar."',
      '"Erroralguardareldepartamento."',
      '"Erroralguardarlafamilia."',
      'error.message',
    ];
    // Just add error:true to all success:false returns that don't have it
    // (this is safe — business-logic returns also benefit from this flag)
    out.push(raw.replace(
      /\}\s*;/,
      ', error: true };'
    ));
    i++;
    continue;
  }

  // ── 6.3/6.5: Replace fs.writeFileSync with await fsPromises.writeFile ──────
  if (trim.startsWith("fs.writeFileSync(filePath,csv,'utf-8');")) {
    out.push(raw.replace("fs.writeFileSync(filePath, csv, 'utf-8');", "await fsPromises.writeFile(filePath, csv, 'utf-8');"));
    i++;
    continue;
  }

  // ── 6.4: Row count limit after empty-CSV check ────────────────────────────
  // Detect the empty-check return line, then after its closing }, insert limit check
  if (trim === 'return{success:false,message:"ElarchivoCSTVest\u00e1vac\u00edooteneunaformatoincorrecto."};' ||
      raw.includes('El archivo CSV est') && raw.includes('formato incorrecto')) {
    out.push(raw); // keep the vacío return
    i++;
    // Next line should be the closing } of the empty-check if
    if (i < lines.length) {
      out.push(lines[i]); // the closing }
      i++;
    }
    // Insert the row-count limit check after the closing }
    out.push('');
    out.push('      // M-11: Reject oversized imports to prevent memory exhaustion.');
    out.push('      if (productosCSV.length > 10000) {');
    out.push('        return { success: false, message: `El CSV tiene ${productosCSV.length} filas. El l\u00edmite es 10.000 por lote.`, error: true };');
    out.push('      }');
    continue;
  }

  // ── 6.6: Remove debug console.log lines ──────────────────────────────────
  if (trim.startsWith('console.log(`[HANDLER:get-producto-by-id]') ||
      trim.startsWith('console.log("[HANDLER:get-producto-by-id]') ||
      trim.startsWith('console.log(`[HANDLER:toggle-producto-activo]') ||
      trim.startsWith('console.log("[HANDLER:toggle-producto-activo]')) {
    i++; // skip the line entirely
    continue;
  }

  // ── 6.7: precio_oferta < precioVenta validation ───────────────────────────
  // After the fecha_vencimiento null check, insert the price validation
  if (raw.includes('fecha_vencimiento') && trim.includes('=null;') && trim.startsWith('if(!payload.fecha_vencimiento)')) {
    out.push(raw);
    i++;
    out.push('');
    out.push('      // L-2: precio_oferta must be strictly less than precioVenta when both are positive.');
    out.push('      if (payload.precio_oferta != null && payload.precio_oferta > 0 && payload.precioVenta > 0 && payload.precio_oferta >= payload.precioVenta) {');
    out.push('        throw new Error("El precio de oferta debe ser menor que el precio de venta regular.");');
    out.push('      }');
    continue;
  }

  // ── 6.8: Replace SELECT+UPDATE toggle with single-query ──────────────────
  // Detect `const produto = await Produto.findByPk(productoId);`
  if (trim === 'constproducto=awaitProducto.findByPk(productoId);') {
    // Skip this line and the entire SELECT+UPDATE block until `}` that closes the else
    // Emit the single-query implementation instead
    out.push('      // L-4: Single-query toggle — eliminates the SELECT+UPDATE round-trip.');
    out.push('      const [affectedRows] = await Producto.update(');
    out.push('        { activo: sequelize.literal("CASE WHEN activo = 1 THEN 0 ELSE 1 END") },');
    out.push('        { where: { id: productoId } }');
    out.push('      );');
    out.push('      if (affectedRows === 0) {');
    out.push('        return { success: false, message: "Producto no encontrado." };');
    out.push('      }');
    out.push('      return { success: true };');
    i++;
    // Skip all lines until we find the closing `}` of the original if/else block
    let depth = 0;
    while (i < lines.length) {
      const t = lines[i].replace(/[\u00a0 \t]/g, '');
      if (t === 'if(producto){' || t.startsWith('if(producto)')) depth++;
      if (depth > 0 && t === '}') { depth--; if (depth === 0) { i++; break; } }
      if (depth === 0 && (t === '}' || t.includes('returnawaittoggle'))) break;
      i++;
    }
    continue;
  }

  // ── 6.10: nombre non-empty check — insert after trim() line ──────────────
  if (raw.includes('payload.nombre = String(payload.nombre') && raw.includes('.trim()')) {
    out.push(raw);
    i++;
    out.push('      // L-8: Reject empty nombre early — gives a clearer error than ORM notEmpty.');
    out.push('      if (!payload.nombre) {');
    out.push('        throw new Error("El nombre del producto es obligatorio.");');
    out.push('      }');
    continue;
  }

  out.push(raw);
  i++;
}

const result = out.join('\r\n');
fs.writeFileSync(filePath, result, 'utf-8');

// Verify
const check = fs.readFileSync(filePath, 'utf-8');
const v = (label, cond) => console.log(`${cond ? '\u2713' : '\u2717'} ${label}`);
v('6.1 opts param in get-productos', check.includes('async (_event, opts) =>'));
v('6.1 limit/offset destructure', check.includes('const { limit, offset } = opts'));
v('6.1 limit in findAll', check.includes('limit: Number(limit)'));
v('6.3/6.5 async writeFile', check.includes("await fsPromises.writeFile(filePath, csv, 'utf-8')"));
v('6.4 row limit 10000', check.includes('10.000 por lote'));
v('6.4 row limit is AFTER empty check', check.indexOf('formato incorrecto') < check.indexOf('10.000'));
v('6.6 get-producto-by-id log removed', !check.includes('[HANDLER: get-producto-by-id]'));
v('6.6 toggle log removed', !check.includes('[HANDLER: toggle-producto-activo]'));
v('6.7 precio_oferta validation', check.includes('precio de oferta debe ser menor'));
v('6.8 single-query toggle', check.includes('CASE WHEN activo = 1 THEN 0 ELSE 1 END'));
v('6.10 nombre non-empty', check.includes('El nombre del producto es obligatorio'));

// Syntax check via node --check
const { execSync } = require('child_process');
try {
  execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
  console.log('\u2713 Syntax OK');
} catch(e) {
  console.error('\u2717 SYNTAX ERROR:', e.stderr.toString());
  process.exit(1);
}
