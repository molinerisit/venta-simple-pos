# Refactor Log — Venta Simple POS

> One entry per executed fix. Ordered chronologically.
> Each entry references the finding ID and the plan step it resolves.

---

## [2026-04-07] Phase 1.1 — PRAGMA fix

**Finding:** H-1a
**Plan step:** 1.1
**File:** `main.js:230–238`
**Status:** ✅ Done

### Problem

All five SQLite PRAGMA directives were concatenated inside a single `sequelize.query()` template literal. The `sqlite3` Node.js driver calls `sqlite3_prepare()` + `sqlite3_step()` internally, which compiles and executes only the first statement in the string. Everything after the first semicolon was silently discarded — no error, no warning.

Result: only `PRAGMA journal_mode = WAL` was ever applied. The four remaining PRAGMAs — including `PRAGMA foreign_keys = ON` — had **never been executed** on any installation.

### Change

Replaced the single multi-statement query with five separate `await sequelize.query()` calls, one per PRAGMA.

```diff
-   await sequelize.query(`
-     PRAGMA journal_mode = WAL;
-     PRAGMA synchronous = NORMAL;
-     PRAGMA temp_store = MEMORY;
-     PRAGMA cache_size = -20000;
-     PRAGMA foreign_keys = ON;
-   `);
+   await sequelize.query("PRAGMA journal_mode = WAL;");
+   await sequelize.query("PRAGMA synchronous = NORMAL;");
+   await sequelize.query("PRAGMA temp_store = MEMORY;");
+   await sequelize.query("PRAGMA cache_size = -20000;");
+   await sequelize.query("PRAGMA foreign_keys = ON;");
```

### Impact

- `PRAGMA foreign_keys = ON` is now enforced for every connection. Referential integrity violations will be rejected at the DB level.
- WAL mode, synchronous = NORMAL, and memory temp store are now actually applied.
- No data modified. PRAGMAs are connection-scoped settings — no schema change, no migration required.

### Verification

```sql
PRAGMA foreign_keys;  -- expected: 1
PRAGMA journal_mode;  -- expected: wal
```

---

## [2026-04-07] Phase 1.2 — DB path fix

**Finding:** H-1b
**Plan step:** 1.2
**File:** `main.js:216–218`
**Status:** ✅ Done

### Change
Replaced `path.join(__dirname, "database.sqlite")` with `app.isPackaged ? app.getPath("userData") : __dirname`.

### Reason
`__dirname` resolves inside the read-only ASAR bundle in a packaged build — the DB file cannot be created or written there.

### Validation
In dev: DB file appears next to `main.js`. In packaged build: DB file appears in `%APPDATA%/<appName>/database.sqlite`.

---

## [2026-04-07] Phase 1.3 — Remove `sequelize.sync()`

**Finding:** H-1c
**Plan step:** 1.3
**File:** `main.js:292–316` (removed), `main.js:294–295` (replacement)
**Status:** ✅ Done

### Change
Removed the entire `sync()` block (including its `PRAGMA foreign_keys = OFF/ON` guards). Replaced with `await runMigrations(sequelize)`.

### Reason
`sync()` without `alter` cannot evolve existing schemas. The migration system (1.4) handles both fresh installs and schema evolution.

### Validation
App boots, `SequelizeMeta` table is created, initial migration is recorded. No subsequent `sync()` call exists in `main.js`.

---

## [2026-04-07] Phase 1.4 — Basic migration system (Umzug)

**Finding:** H-1c
**Plan step:** 1.4
**Files created:** `src/database/migrator.js`, `src/migrations/20260407000000-initial-schema.js`
**Status:** ✅ Done

### Change
- `src/database/migrator.js`: reads `src/migrations/[0-9]*.js` files via `fs.readdirSync`, builds Umzug instance with `SequelizeStorage`, calls `umzug.up()`.
- `20260407000000-initial-schema.js`: calls `queryInterface.sequelize.sync()` once — non-destructive bootstrap for both fresh and existing installs.

### Reason
`umzug` was already in `dependencies` (v3.8.2) and previously referenced in commented-out code. `SequelizeStorage` tracks applied migrations in the `SequelizeMeta` table so each migration runs exactly once.

### Validation
- Fresh install: all tables created by the initial migration.
- Existing install: `sync()` inside initial migration finds all tables already present — no-op. Migration recorded in `SequelizeMeta`, never runs again.
- Future schema changes: add a new `src/migrations/YYYYMMDDHHMMSS-description.js` file.

### Notes
Migration files must start with a digit and export `{ up(queryInterface), down(queryInterface) }`. The `down` of the initial migration is intentionally empty — rolling it back would destroy all data.

---

## [2026-04-07] Phase 2.1 — `metodoPago` allowlist end-to-end

**Finding:** H-3
**Plan step:** 2.1
**Files:** `src/database/models/Venta.js`, `src/ipc-handlers/ventas-handlers.js`, `src/ipc-handlers/caja-handlers.js`, `src/database/models/ArqueoCaja.js`, `src/migrations/20260407010000-add-payment-totals-to-arqueos.js`
**Status:** ✅ Done

### Problem

`metodoPago` was a free-form string with no validation at any layer:

1. `Venta.js` model: `{ type: DataTypes.STRING, allowNull: false }` — any string accepted.
2. `normalizarMetodoPago` in `caja-handlers.js`: `return s` fallback silently excluded unknown values from daily totals. `CtaCte` was never matched (no branch for it). Return values used "Debito"/"Credito" (no accents) while canonical values have accents.
3. `agregarTotalesPorMetodo`: checked for "Debito"/"Credito" (matching the above), but had no bucket for "Transferencia" sales stored with the correct canonical name, and no bucket at all for "CtaCte".
4. `ArqueoCaja` model and table: no `totalVentasTransferencia` or `totalVentasCtaCte` columns — these payment methods were never stored in arqueo records.
5. `ventas-handlers.js` `createSaleTx`: no validation of `metodoPago` before `Venta.create`.

### Change

**`Venta.js`** — Added ORM-level validate:
```diff
-metodoPago: { type: DataTypes.STRING, allowNull: false },
+metodoPago: {
+  type: DataTypes.STRING,
+  allowNull: false,
+  validate: {
+    isIn: [['Efectivo', 'Débito', 'Crédito', 'QR', 'Transferencia', 'CtaCte']],
+  },
+},
```

**`ventas-handlers.js`** — Added allowlist check before `Venta.create`:
```js
const METODOS_PAGO_VALIDOS = ['Efectivo', 'Débito', 'Crédito', 'QR', 'Transferencia', 'CtaCte'];
if (!METODOS_PAGO_VALIDOS.includes(metodoPago)) {
  throw new Error(`Método de pago inválido: "${metodoPago}". Valores permitidos: ...`);
}
```

**`caja-handlers.js`** — `normalizarMetodoPago`: return values aligned to canonical names (with accents), CtaCte branch added, fallback changed from `return s` to `throw`:
```diff
-if (t.includes("debito")) return "Debito";
-if (t.includes("credito")) return "Credito";
-return s; // fallback
+if (t.includes("debito")) return "Débito";
+if (t.includes("credito")) return "Crédito";
+if (t.replace(/[\s._\-\/]/g, "").includes("ctacte")) return "CtaCte";
+throw new Error(`Método de pago desconocido en registro existente: "${s}".`);
```

**`caja-handlers.js`** — `agregarTotalesPorMetodo`: comparisons updated to canonical names, `totalCtaCte` bucket added. `get-resumen-cierre` response now includes `totalCtaCte`.

**`ArqueoCaja.js`** + **migration** — `totalVentasTransferencia` and `totalVentasCtaCte` columns added to model and table. `cerrar-caja` now assigns both.

### Impact

- Any `metodoPago` outside the allowlist is rejected at two independent layers (handler + ORM).
- `CtaCte` and `Transferencia` sales are now included in arqueo totals.
- Existing records with accent variants (e.g. "Debito") are correctly normalized at read time.
- The `return s` silent data-loss path is eliminated.

### Edge Cases Covered

- Legacy "Debito"/"Credito" (no accent) → matched via NFD normalization → mapped to canonical names.
- "CtaCte", "cta cte", "cta.cte" → all matched via normalized string comparison.
- Empty/null metodoPago → throws (was previously returning `""` silently).

---

## [2026-04-07] Phase 2.2 — Server-side price & quantity validation

**Finding:** H-2
**Plan step:** 2.2
**File:** `src/ipc-handlers/ventas-handlers.js` (function `createSaleTx`)
**Status:** ✅ Done

### Problem

`createSaleTx` trusted the renderer entirely for two critical financial inputs:

1. **Prices**: `subtotal` was computed from `it.precioUnitario` (renderer-supplied). An attacker or buggy frontend could submit `precioUnitario: 0.01` for any product.
2. **Quantities**: `Number(item.cantidad || 0)` defaulted to 0; no check that `cantidad > 0`. A negative quantity would inflate stock.
3. **Stock**: `Producto.increment({ stock: -cantidad })` ran without first checking `producto.stock >= cantidad`. Stock could go negative.

### Change

**Before** (simplified):
```js
let subtotal = 0;
for (const it of detalles) {
  subtotal += Number(it.precioUnitario || 0) * Number(it.cantidad || 0);
}
// ...
for (const item of detalles) {
  const cantidad = Number(item.cantidad || 0);
  const pUnit = Number(item.precioUnitario || 0); // renderer price trusted
  // no stock check
  await Producto.increment({ stock: -cantidad }, ...);
}
```

**After**:
```js
// Pass 1: validate quantities, fetch DB prices, check stock
const resolvedItems = [];
for (const item of detalles) {
  const cantidad = Number(item.cantidad);
  if (!Number.isFinite(cantidad) || cantidad <= 0)
    throw new Error(`Cantidad inválida para "${item.nombreProducto}": debe ser mayor que cero.`);

  if (isManual) {
    const pUnit = Number(item.precioUnitario);
    if (!Number.isFinite(pUnit) || pUnit < 0) throw new Error(...);
    resolvedItems.push({ ..., pUnit, isManual: true });
  } else {
    const producto = await Producto.findByPk(item.ProductoId, { transaction: t });
    if (!producto) throw new Error(`Producto ${item.ProductoId} no encontrado.`);
    if (producto.stock < cantidad)
      throw new Error(`Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}.`);
    const pUnit = producto.precio_oferta != null ? producto.precio_oferta : producto.precioVenta;
    resolvedItems.push({ ..., pUnit, isManual: false });
  }
}

// Authoritative subtotal computed from DB prices only
let subtotal = 0;
for (const r of resolvedItems) subtotal += r.pUnit * r.cantidad;

// Pass 2 (after Venta.create): decrement stock using already-checked values
for (const { item, cantidad, pUnit, isManual } of resolvedItems) {
  // ... bulkCreate detail rows, increment stock
}
```

### Impact

- `precioUnitario` from the renderer is ignored for all DB-backed products. Price is always fetched from `producto.precio_oferta ?? producto.precioVenta` inside the transaction.
- Manual items (PLU or ad-hoc) still use the renderer price (no DB record exists for them), but `precioUnitario >= 0` is enforced.
- Negative stock is impossible: the stock check throws before any decrement.
- Receipt (`datosRecibo.items`) now reflects the authoritative charged prices.

### Edge Cases Covered

- `cantidad = 0` → throws.
- `cantidad = -1` → throws.
- `precioUnitario = -5` for manual item → throws.
- Product deleted between cart load and checkout → throws "no encontrado".
- Stock exactly equal to cantidad → allowed (results in 0 stock after).
- Stock less than cantidad by any amount → throws with product name and available count.

---

## [2026-04-07] Phase 2.3 — Transactional `cerrar-caja`

**Finding:** H-4
**Plan step:** 2.3
**File:** `src/ipc-handlers/caja-handlers.js`
**Status:** ✅ Done

### Problem

`cerrar-caja` had three sequential non-transactional DB operations:

1. `ArqueoCaja.findByPk(arqueoId)` — read arqueo state.
2. `Venta.findAll(...)` — compute totals.
3. `arqueo.save()` — write result.

A venta registered between steps 2 and 3 would be excluded from the stored totals. Also, two different `now()` calls were used: once to compute the query window (`fin`) and once to assign `fechaCierre` — these could produce different timestamps.

`caja-handlers.js` received only `models`, not `sequelize`, so wrapping in a transaction required a signature change.

### Change

```diff
-function registerCajaHandlers(models) {
+function registerCajaHandlers(models, sequelize) {
```

`main.js` handler registry was already configured with `needsSequelize: true` for `caja-handlers`.

`obtenerVentanaArqueo` updated to accept an optional `t` parameter and forward it to its internal `findOne`.

`cerrar-caja` rewritten:

```diff
-const arqueo = await ArqueoCaja.findByPk(arqueoId);
-const { inicio, fin } = await obtenerVentanaArqueo(arqueo);
-const ventas = await Venta.findAll({ where: { ...fin... } });
-// ... compute ...
-arqueo.fechaCierre = now();
-await arqueo.save();
+await sequelize.transaction(async (t) => {
+  const arqueo = await ArqueoCaja.findByPk(arqueoId, { transaction: t, lock: true });
+  const fechaCierre = new Date(); // single timestamp
+  const { inicio } = await obtenerVentanaArqueo(arqueo, t);
+  const ventas = await Venta.findAll({
+    where: { createdAt: { [Op.gte]: inicio, [Op.lt]: fechaCierre } },
+    transaction: t,
+  });
+  // ... compute ...
+  arqueo.fechaCierre = fechaCierre;
+  await arqueo.save({ transaction: t });
+  resultado = arqueo.toJSON();
+});
```

### Impact

- All reads and the write are atomic: SQLite write lock prevents concurrent modification during close.
- `fechaCierre` is a single `new Date()` value used both as the query upper bound and the stored timestamp — no split-brain between the two.
- Any `cerrar-caja` error rolls back the transaction; the arqueo remains `ABIERTA`.

---

## [2026-04-07] Phase 2.4 — Remove `stock` from CSV `updateOnDuplicate`

**Finding:** H-6
**Plan step:** 2.4
**File:** `src/ipc-handlers/productos-handlers.js` (handler `import-productos-csv`)
**Status:** ✅ Done

### Problem

`Producto.bulkCreate` with `updateOnDuplicate` including `'stock'` meant that a price-only CSV import would overwrite all existing stock values with whatever the CSV contained (typically `0` or empty). This was a silent destructive operation — the user importing prices had no way to know their inventory counts were being zeroed.

### Change

```diff
 updateOnDuplicate: [
-  'nombre', 'precioCompra', 'precioVenta', 'stock', 'unidad',
+  'nombre', 'precioCompra', 'precioVenta', 'unidad',
   'pesable', 'plu', 'codigo_barras', 'DepartamentoId', 'FamiliaId', 'activo'
 ],
```

### Impact

- Existing products: their `stock` is never touched during a CSV import.
- New products (INSERT path, no conflict on `codigo`): `stock` from the CSV is still applied because `updateOnDuplicate` only affects the UPDATE branch of upsert.
- If a dedicated stock-update import is needed in the future, it must be a separate flow with an explicit user confirmation step.

---

## [2026-04-07] Phase 2.5 — Detect 0-row UPDATE in `guardar-producto`

**Finding:** H-8
**Plan step:** 2.5
**File:** `src/ipc-handlers/productos-handlers.js` (handler `guardar-producto`)
**Status:** ✅ Done

### Problem

```js
await models.Producto.update(payload, { where: { id: productoId }, transaction: t });
await t.commit();
return { success: true }; // returned even if 0 rows were updated
```

If `productoId` did not match any row (e.g. stale UI, deleted product, wrong ID), the handler silently returned `{ success: true }` with no data change. The transaction was committed for a no-op.

### Change

```diff
-await models.Producto.update(payload, { where: { id: productoId }, transaction: t });
+const [affectedRows] = await models.Producto.update(payload, {
+  where: { id: productoId },
+  transaction: t,
+});
+if (affectedRows === 0) {
+  throw new Error(`Producto con id ${productoId} no encontrado.`);
+}
```

The `throw` inside the `try` block triggers the existing `catch → t.rollback()` path. The caller receives `{ success: false, message: "Producto con id ... no encontrado." }`.

### Impact

- Silent ghost-updates are impossible. The caller always knows whether the update applied.
- The transaction is rolled back on failure, leaving the DB unchanged.
- Edge case: if `productoId` is valid but the payload has no differing fields, Sequelize may return `affectedRows = 0` on some drivers. SQLite's behavior is to return 1 if the row matched the WHERE clause regardless of value changes, so this is not an issue here.
