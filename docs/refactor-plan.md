# Refactor Plan — Venta Simple POS

**Based on:** Consolidated audit findings v2.0
**Date:** 2026-04-07

> Fixes are ordered by dependency and business impact.
> A fix earlier in the list may be required for a later fix to be meaningful.

---

## Phase 1 — Infrastructure (must be fixed before anything else)

These three issues affect the correctness of every other fix. Deploying model-level validations or migrations while `sync()` is broken and PRAGMAs are silently failing is meaningless.

---

### 1.1 Fix PRAGMA execution `main.js:230–242` `[H-1a]`

**Problem:** Multiple PRAGMA statements in a single `sequelize.query()` call — only the first is executed.

**Fix:** Execute each PRAGMA in a separate `sequelize.query()` call, or use a `sequelize.dialect.connectionManager` hook to run them on every new connection.

```js
// Replace the single concatenated call with:
await sequelize.query("PRAGMA journal_mode = WAL;");
await sequelize.query("PRAGMA synchronous = NORMAL;");
await sequelize.query("PRAGMA temp_store = MEMORY;");
await sequelize.query("PRAGMA cache_size = -64000;");
await sequelize.query("PRAGMA foreign_keys = ON;");
```

**Verification:** After fix, `SELECT * FROM pragma_journal_mode;` should return `wal`, and `PRAGMA foreign_keys;` should return `1`.

---

### 1.2 Fix database file path `main.js:216` `[H-1b]`

**Problem:** `path.join(__dirname, "database.sqlite")` resolves to the read-only ASAR bundle in a packaged app.

**Fix:**
```js
const dbPath = app.isPackaged
  ? path.join(app.getPath("userData"), "database.sqlite")
  : path.join(__dirname, "database.sqlite");
```

---

### 1.3 Implement a migration system `main.js:313–318` `[H-1c]`

**Problem:** `sequelize.sync()` cannot evolve an existing schema. New columns and constraints are never applied to installed instances.

**Fix:** Replace `sequelize.sync()` with [Umzug](https://github.com/sequelize/umzug) or equivalent. Create migration files for every schema change going forward. The immediate required migrations are:

| Migration | Required by |
|---|---|
| Add `totalVentasTransferencia FLOAT` to `arqueos_caja` | H-3c |
| Add `ArqueoCajaId UUID` to `ventas` (optional, see Phase 3) | Architecture |
| Add non-unique indexes on `productos.codigo_barras`, `productos.plu` | M-4 |
| Add `CHECK (stock >= 0)` to `productos` | H-2 |

Until a migration system is in place, any schema fix in the model layer is invisible to existing installations.

---

## Phase 2 — Financial Integrity (highest business impact)

These fixes prevent financial data from being created incorrectly. They must follow Phase 1 because some require schema changes.

---

### 2.1 Enforce `metodoPago` allowlist end-to-end `[H-3]`

**Problem:** Any string is stored as `metodoPago`; unrecognized values are silently excluded from daily totals.

**Fix — Step 1:** Add `validate: { isIn: [['Efectivo', 'Débito', 'Crédito', 'QR', 'Transferencia', 'CtaCte']] }` to `Venta.metodoPago` in the model. Sequelize will reject invalid values before any insert.

**Fix — Step 2:** Extend `normalizarMetodoPago` in `caja-handlers.js` to cover `CtaCte` and throw (or log an alert) on any value that falls through to the `return s` fallback.

**Fix — Step 3:** Add `totalVentasTransferencia FLOAT` and `totalVentasCtaCte FLOAT` columns to `ArqueoCaja` (via migration). Assign them in `cerrar-caja`.

**Fix — Step 4:** In `ventas-handlers.js`, validate `metodoPago` against the allowlist before `Venta.create`.

---

### 2.2 Validate sale prices and quantities server-side `[H-2]`

**Problem:** `precioUnitario` and `cantidad` are trusted from the renderer. Negative quantities inflate stock; arbitrary prices are committed.

**Fix — Prices:** In `createSaleTx`, fetch `Producto.findByPk(item.ProductoId)` within the transaction for each non-manual item. Use `producto.precio_oferta ?? producto.precioVenta` as the authoritative price. Reject if the renderer price deviates by more than an acceptable tolerance (or override it).

**Fix — Quantities:** Validate `cantidad > 0` before the loop. Throw if any `cantidad <= 0`.

**Fix — Stock:** Before `Producto.increment({ stock: -cantidad })`, check `producto.stock >= cantidad`. Throw with a business error if insufficient.

```js
// Add before Producto.increment:
const producto = await Producto.findByPk(item.ProductoId, { transaction: t });
if (!producto) throw new Error(`Producto ${item.ProductoId} no encontrado.`);
if (producto.stock < cantidad) throw new Error(`Stock insuficiente para ${producto.nombre}.`);
```

---

### 2.3 Make `cerrar-caja` transactional `[H-4]`

**Problem:** Sales registered between the `Venta.findAll` and `arqueo.save()` are excluded from stored totals.

**Fix:** Wrap the entire close operation in a single `sequelize.transaction()`. Lock the arqueo row during the transaction (SQLite table-level write lock is sufficient). Use a single `now()` call stored as a variable for both the query window and `fechaCierre`.

```js
await sequelize.transaction(async (t) => {
  const arqueo = await ArqueoCaja.findByPk(arqueoId, { transaction: t, lock: true });
  const fechaCierre = new Date(); // single timestamp
  const ventas = await Venta.findAll({
    where: { createdAt: { [Op.gte]: inicio, [Op.lt]: fechaCierre } },
    transaction: t
  });
  // ... compute totals ...
  arqueo.fechaCierre = fechaCierre;
  await arqueo.save({ transaction: t });
});
```

---

### 2.4 Remove `stock` from CSV `updateOnDuplicate` `[H-6]`

**Problem:** A price-only CSV import overwrites all stock values with `0`.

**Fix:** Remove `'stock'` from the `updateOnDuplicate` array. If stock updates via CSV are needed, implement a separate "update stock only" import flow with an explicit user confirmation step.

```js
updateOnDuplicate: ['nombre', 'precioCompra', 'precioVenta', 'unidad', 'pesable', 'plu', 'codigo_barras', 'DepartamentoId', 'FamiliaId', 'activo']
// 'stock' removed
```

---

### 2.5 Fix `guardar-producto` UPDATE to detect 0 rows affected `[H-8]`

**Problem:** UPDATE returns `{ success: true }` when no row matches the provided `productoId`.

**Fix:**
```js
const [affectedRows] = await models.Producto.update(payload, {
  where: { id: productoId },
  transaction: t
});
if (affectedRows === 0) {
  await t.rollback();
  return { success: false, message: "Producto no encontrado." };
}
```

---

## Phase 3 — Security

---

### 3.1 Fix `app://` protocol path traversal `[H-5a]` `main.js:422–434`

```js
const resolved = path.resolve(requestedPath);
const allowedRoot = path.resolve(app.getPath("userData"));
const publicRoot = path.resolve(path.join(__dirname, "public"));

if (!resolved.startsWith(allowedRoot) && !resolved.startsWith(publicRoot)) {
  callback({ error: -10 }); // NET_ERR_ACCESS_DENIED
  return;
}
callback({ path: resolved });
```

---

### 3.2 Fix `import-productos-csv` arbitrary file read `[H-5b]` `productos-handlers.js:311`

**Fix:** Move the dialog call inside the import handler so the file path never crosses the IPC boundary.

```js
ipcMain.handle("import-productos-csv", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePaths[0]) return { success: false, message: "Cancelado." };
  const fileContent = await fsPromises.readFile(filePaths[0], 'utf-8');
  // ...
});
```

Remove the separate `show-open-dialog` IPC handler for CSV import (it is no longer needed).

---

### 3.3 Whitelist fields in `guardar-producto` `[M-7]` `productos-handlers.js:98–156`

```js
const ALLOWED_FIELDS = ['nombre', 'codigo', 'codigo_barras', 'plu', 'stock',
  'precioCompra', 'precioVenta', 'precio_oferta', 'unidad', 'pesable', 'activo',
  'imagen_url', 'fecha_fin_oferta', 'fecha_vencimiento', 'DepartamentoId', 'FamiliaId'];

const payload = Object.fromEntries(
  Object.entries(productoData).filter(([k]) => ALLOWED_FIELDS.includes(k))
);
```

---

## Phase 4 — Data Integrity

---

### 4.1 Make CSV import fully atomic `[H-7]` `productos-handlers.js:343–401`

Move all `findOrCreate` calls inside the `sequelize.transaction()` block. Pass `transaction: t` to every DB call in the import loop.

```js
await sequelize.transaction(async (t) => {
  for (const prod of productosCSV) {
    const [depto] = await ProductoDepartamento.findOrCreate({
      where: { nombre: nombreDepto },
      defaults: { nombre: nombreDepto },
      transaction: t  // ← was null
    });
    // ...
  }
  await Producto.bulkCreate(productosParaGuardar, {
    updateOnDuplicate: [...],
    transaction: t
  });
});
```

---

### 4.2 Add `activo: true` filter to `busqueda-inteligente` `[M-6]`

```js
// In the fallback findOne:
const whereClause = {
  activo: true,   // ← add this
  [Op.or]: [
    { codigo_barras: String(texto) },
    { codigo: String(texto) },
    { nombre: { [Op.like]: `%${String(texto)}%` } },
  ],
};
```

Also add `activo: true` to the PLU lookup in the scale barcode branch.

---

### 4.3 Add indexes for `codigo_barras` and `plu` `[M-4]` `Producto.js:36–46`

Add non-unique indexes back via migration (they were removed because they conflicted with `unique: true`, but since both fields are now `unique: false`, non-unique indexes are safe):

```js
{ fields: ['codigo_barras'] },
{ fields: ['plu'] },
```

---

### 4.4 Cache admin config in `busqueda-inteligente` `[M-5]`

At handler registration time, load the admin config once and cache it. Provide an invalidation mechanism (e.g., reload on `config-updated` IPC event).

```js
let cachedAdminConfig = null;

ipcMain.handle("config-updated", async () => {
  cachedAdminConfig = null;
});

// In busqueda-inteligente:
if (!cachedAdminConfig) {
  cachedAdminConfig = await Usuario.findOne({ where: { rol: "administrador" }, raw: true });
}
const admin = cachedAdminConfig;
```

---

### 4.5 Validate `DepartamentoId` existence in `guardar-familia` `[M-12]`

```js
const depto = await ProductoDepartamento.findByPk(DepartamentoId);
if (!depto) return { success: false, message: "El departamento no existe." };
```

---

## Phase 5 — Model Constraints

Add Sequelize validators to models. These are ORM-layer guards that provide defense-in-depth but do NOT replace Phase 2 handler-level fixes.

---

### 5.1 `Producto.js`

```js
stock:       { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0 } },
precioVenta: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0 } },
precioCompra:{ type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0 } },
nombre:      { type: DataTypes.STRING, allowNull: false, validate: { notEmpty: true } },
```

---

### 5.2 `DetalleVenta.js`

```js
cantidad:       { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0.001 } },
precioUnitario: { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
subtotal:       { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
```

---

### 5.3 `Venta.js`

```js
total:       { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
montoPagado: { type: DataTypes.FLOAT, allowNull: false },
metodoPago:  {
  type: DataTypes.STRING,
  allowNull: false,
  validate: { isIn: [['Efectivo', 'Débito', 'Crédito', 'QR', 'Transferencia', 'CtaCte']] }
},
```

---

### 5.4 `ArqueoCaja.js`

```js
montoInicial:   { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
montoFinalReal: { type: DataTypes.FLOAT, allowNull: true,  validate: { min: 0 } },
```

---

## Phase 6 — Performance and Code Quality

Address after all integrity and security fixes are complete.

| # | Fix | Finding |
|---|---|---|
| 6.1 | Add `limit` + `offset` to `get-ventas`, `get-productos`, `get-all-cierres-caja` | M-1 |
| 6.2 | Return `{ success: false, message, error: true }` from all catch blocks | M-2 |
| 6.3 | Replace `fs.readFileSync`/`writeFileSync` with `fsPromises` in CSV handlers | M-10 |
| 6.4 | Add row count limit on CSV import (e.g., max 10,000 rows per batch) | M-11 |
| 6.5 | Replace `fs.writeFileSync` in export with `fsPromises.writeFile` (already imported) | L-series |
| 6.6 | Remove debug `console.log` / `JSON.stringify` from production paths | L-7 |
| 6.7 | Add `precio_oferta < precioVenta` validation in `guardar-producto` | L-2 |
| 6.8 | Replace SELECT + UPDATE in `toggle-producto-activo` with single-query toggle | L-4 |
| 6.9 | Add initialization guard in macOS `activate` event handler | L-10 |
| 6.10 | Add `nombre` non-empty validation in `guardar-producto` | L-8 |

---

## Summary Table

| Phase | Focus | Findings | Risk if skipped |
|---|---|---|---|
| 1 | Infrastructure | H-1a, H-1b, H-1c | All other fixes may not reach production schema |
| 2 | Financial integrity | H-2, H-3, H-4, H-6, H-8 | Sale records, inventory, closing totals permanently incorrect |
| 3 | Security | H-5a, H-5b, M-7 | Arbitrary file read, internal field injection |
| 4 | Data integrity | H-7, M-4, M-5, M-6, M-12 | Orphaned data, wrong product at scan, non-atomic import |
| 5 | Model constraints | All model files | No defense-in-depth if handler validation is bypassed |
| 6 | Performance + quality | M-1, M-2, M-10, M-11, L-series | Degraded UX at scale, invisible errors |
