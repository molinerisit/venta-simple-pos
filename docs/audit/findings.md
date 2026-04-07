# Audit Findings — Venta Simple POS

> **Scope:** `main.js` — application entry point, DB initialization, IPC registration, window management
> **Date:** 2026-04-06
> **Status:** Open

---

## [HIGH] Multiple PRAGMA statements silently fail in single query call

**File:** `main.js:230–242`

**Description:**
Multiple SQLite PRAGMA directives (`journal_mode`, `synchronous`, `temp_store`, `cache_size`, `foreign_keys`) are concatenated into a single `sequelize.query()` call. The underlying `sqlite3` Node.js driver uses `sqlite3_prepare` + `sqlite3_step`, which processes only the **first statement**. All subsequent PRAGMAs are silently ignored.

**Impact:** High

**Justification:**
WAL mode (`journal_mode = WAL`) is critical for crash safety and concurrent read performance. More critically, `PRAGMA foreign_keys = ON` being silently skipped means referential integrity is **not enforced at the database level**, despite being explicitly intended. This is an invisible failure — no error is thrown, no log is emitted, and the system behaves as if the settings were applied.

---

## [HIGH] Database file stored in `__dirname` — write-blocked in packaged app

**File:** `main.js:216`

**Description:**
The SQLite database path is resolved as `path.join(__dirname, "database.sqlite")`. In a packaged Electron application (ASAR bundle), `__dirname` resolves inside the read-only app bundle. The SQLite file cannot be created or written there, causing `sequelize.authenticate()` to fail at startup.

**Impact:** High

**Justification:**
This works in development (project folder is writable) but is a deploy-blocking failure in any packaged build. The correct location is `app.getPath("userData")`, the OS-designated writable directory for application data. Any production deployment would crash on first launch with a filesystem permission error.

---

## [HIGH] `app://` custom protocol handler vulnerable to path traversal

**File:** `main.js:422–434`

**Description:**
The custom `app://` protocol handler decodes the request URL with `decodeURI()` and passes it directly to `path.join()` before serving the resulting file. No check is performed to verify that the resolved path is contained within the intended `public/` or `userData/` directories. `path.join()` normalizes but does not sanitize `../` sequences, allowing requests like `app://../../../sensitive-file` to escape the intended root.

**Impact:** High

**Justification:**
Any file accessible to the OS user account can be served to renderer-side code. In a POS context this includes configuration files, credentials, and other application data. A path containment guard (verifying the resolved path starts with the allowed root using `path.resolve` + `startsWith`) is absent.

---

## [HIGH] `sequelize.sync()` without migrations — schema changes silently ignored

**File:** `main.js:313–318`

**Description:**
The migration system has been commented out and replaced with `await sequelize.sync()` (no options). `sync()` without `{ alter: true }` or `{ force: true }` only creates tables that do not yet exist. It never modifies existing columns, adds indexes, or updates constraints on a live database.

**Impact:** High

**Justification:**
Any model change deployed to an existing installation — new column, renamed field, added foreign key — will have no effect on the schema. This leads to silent runtime errors or missing data that are difficult to diagnose in production. The application has no reliable path for schema evolution beyond a clean install.

---

## [MEDIUM] `models` accessed in `activate` event without initialization guard

**File:** `main.js:572–586`

**Description:**
The macOS `activate` event handler calls `models.Usuario.findOne(...)` unconditionally. If `app.on("ready")` throws an error and reaches `app.quit()`, the `models` variable remains `undefined`. Clicking the dock icon after a failed startup triggers `activate`, resulting in an unhandled `TypeError: Cannot read properties of undefined`.

**Impact:** Medium

**Justification:**
On macOS, `activate` fires independently of the application's initialization state. Without a guard (`if (!models) return;`), this is a reproducible crash path after any init failure, compounding an already-failed startup with an additional unhandled exception.

---

---

> **Scope:** `src/ipc-handlers/ventas-handlers.js` — sale registration, product search, stock management
> **Date:** 2026-04-07
> **Status:** Open

---

## [HIGH] `precioUnitario` accepted from renderer — no server-side price validation

**File:** `ventas-handlers.js:27, 91`

**Description:**
All price computations in `createSaleTx` use `it.precioUnitario` sourced directly from the IPC payload (`ventaData.detalles`). The main process never queries the actual product price from the database. A renderer process that sends a manipulated `precioUnitario` (e.g., `0.01`) will produce a committed sale at that price — no validation, no rejection.

**Steps to reproduce:**
Send `registrar-venta` via IPC with `detalles[0].precioUnitario = 0.01` for a product whose DB price is 1000.

**Expected:** Sale rejected or price overridden from DB.
**Actual:** Sale committed at the injected price; stock decremented; receipt issued.

**Impact:** High — financial integrity of every sale is dependent on renderer-side data. Exploitable by any process that can emit IPC messages (compromised renderer, injected script in webview).

**Possible cause:** Business logic co-located with IPC handler without a separate service layer that re-reads authoritative prices.

---

## [HIGH] Stock decrement has no floor guard — negative stock is possible

**File:** `ventas-handlers.js:102–106`

**Description:**
`Producto.increment({ stock: -cantidad }, { where: { id: item.ProductoId }, transaction: t })` unconditionally subtracts `cantidad` from the current stock. There is no pre-check that `stock >= cantidad` and no database constraint preventing negative values.

**Steps to reproduce:**
Register a sale for 10 units of a product whose current stock is 2. Increment executes; stock becomes -8.

**Expected:** Sale blocked with "stock insuficiente" error.
**Actual:** Stock persists as a negative number; inventory data is silently corrupted.

**Impact:** High — inventory reports become unreliable; reorder calculations and stock alerts will produce incorrect results.

**Possible cause:** `Producto.increment` does not support a conditional WHERE clause like `stock >= cantidad` in the ORM call; an explicit prior check is required.

---

## [MEDIUM] `busqueda-inteligente` performs a full admin config DB query on every call

**File:** `ventas-handlers.js:172`

**Description:**
Every invocation of the `busqueda-inteligente` handler executes `Usuario.findOne({ where: { rol: "administrador" } })` to retrieve scale configuration. In a POS workflow this handler fires on every barcode scan or search keystroke, generating a redundant DB round-trip on each call.

**Impact:** Medium — unnecessary load on SQLite; measurable latency on scan-heavy workflows (e.g., scale-integrated products).

**Possible cause:** No in-memory caching of admin config; config is not passed as a parameter at handler registration time.

---

## [MEDIUM] `get-ventas` has no pagination or result limit

**File:** `ventas-handlers.js:142–156`

**Description:**
When no `fechaInicio`/`fechaFin` filters are provided, `Venta.findAll` returns all records with full eager-loaded associations (`DetalleVenta`, `Producto`, `Cliente`, `Usuario`, `Factura`). On a mature installation with thousands of sales this loads the entire dataset into memory and serializes it across IPC.

**Steps to reproduce:**
Call `get-ventas` with `filters = {}` after a year of operation.

**Expected:** Paginated response with a configurable page size.
**Actual:** All rows returned; potential memory spike and IPC payload in the megabytes.

**Impact:** Medium — performance degradation proportional to database size; can cause UI freeze on the renderer side during deserialization.

---

## [MEDIUM] Float arithmetic used for all monetary calculations

**File:** `ventas-handlers.js:27–67`

**Description:**
All price, discount, surcharge, and total computations use standard JavaScript `Number` (IEEE 754 double-precision). Operations such as `subtotal += Number(it.precioUnitario) * Number(it.cantidad)` accumulate floating-point rounding errors. Examples: `0.1 * 3 === 0.30000000000000004`, `1.005 * 100 !== 100.5`.

**Impact:** Medium — totals displayed and persisted can differ from the mathematically correct value. Compounding over a day's transactions, the discrepancy will appear in cash-drawer reconciliation.

**Possible cause:** No integer-based arithmetic (e.g., working in centavos) or decimal library (e.g., `decimal.js`) is used.

---

## [MEDIUM] `get-ventas` returns `[]` on error — error invisible to caller

**File:** `ventas-handlers.js:157–160`

**Description:**
The `catch` block of `get-ventas` logs the error to console and returns an empty array. The renderer receives `[]` and has no way to distinguish between "no sales exist" and "the query failed". Transient DB errors or model failures are silently swallowed.

**Impact:** Medium — UI shows an empty sales list during a real DB failure, giving the operator incorrect information and no prompt to investigate.

---

## [LOW] `Op.like` with leading wildcard disables SQLite index on product name

**File:** `ventas-handlers.js:241`

**Description:**
The fallback search query uses `{ nombre: { [Op.like]: '%${texto}%' } }`. A leading `%` wildcard forces SQLite to perform a full table scan on `Producto.nombre` regardless of any index present on that column.

**Impact:** Low — acceptable on small inventories; becomes a measurable bottleneck as the product catalogue grows beyond ~5,000 rows.

---

## [LOW] Division by zero in scale barcode parser when `valor_divisor = 0`

**File:** `ventas-handlers.js:207`

**Description:**
`const valor = parseFloat(valorStr) / (Number(cfg.valor_divisor) || 1)` uses `|| 1` as a fallback, which correctly handles `null`/`undefined` but **not `0`** — `Number(0) || 1` evaluates to `1` only because `0` is falsy. However, if `valor_divisor` is the string `"0"`, `Number("0")` is `0`, which is falsy, so `|| 1` does apply. The guard is coincidentally correct for string `"0"` but misleading; a stored numeric `0` would also be caught by the falsy check. No explicit guard or validation error is raised.

**Impact:** Low — misleading guard logic; will silently use a divisor of `1` instead of surfacing a misconfiguration.

---

## [LOW] `metodoPago` accepted without allowlist validation

**File:** `ventas-handlers.js:74`

**Description:**
The `metodoPago` field from the renderer is persisted to `Venta.metodoPago` without validation against an allowed set (e.g., `["Efectivo", "Crédito", "Débito", "MercadoPago"]`). Any arbitrary string can be stored, breaking downstream report grouping and payment reconciliation logic.

**Impact:** Low — data quality issue; queries that filter or group by `metodoPago` will silently miss unrecognized values.

---

---

> **Scope:** `src/database/models/Venta.js`, `DetalleVenta.js`, `Producto.js` — model definitions, constraints, validations, indexes
> **Date:** 2026-04-07
> **Status:** Open

---

## [HIGH] `Producto.stock` has no constraint at any layer — negative stock is fully unprotected

**File:** `Producto.js:13`

**Description:**
`stock: { type: DataTypes.FLOAT, defaultValue: 0 }` — no `allowNull: false`, no `validate: { min: 0 }`, no SQLite `CHECK` constraint. The previously reported handler-level finding (ventas-handlers.js:102–106) is **confirmed unmitigated at every layer**:

- Handler: no pre-decrement stock check
- Model: no `validate: { min: 0 }` or `beforeUpdate` hook
- Database: no `CHECK (stock >= 0)` constraint (SQLite DDL not injected; Sequelize does not generate CHECK constraints from FLOAT type)

**Cross-layer verdict:** ZERO protection. Stock going negative requires no exploit — it is the normal behavior on oversell.

**Impact:** High — confirmed. Previous severity stands.

---

## [HIGH] `DetalleVenta.cantidad` allows zero and negative values — stock can be inflated via negative quantity

**File:** `DetalleVenta.js:9`

**Description:**
`cantidad: { type: DataTypes.FLOAT, allowNull: false }` — no `validate: { min: 0.001 }` or equivalent. The handler in `createSaleTx` does `Producto.increment({ stock: -cantidad })`. If `cantidad` arrives from the renderer as a negative number (e.g., `-5`), the increment becomes `stock += 5` — stock is silently inflated. No layer prevents this.

**Steps to reproduce:**
Send `registrar-venta` with `detalles[0].cantidad = -5`. A sale is committed, a `DetalleVenta` row with `cantidad = -5` is written, and the referenced product's stock increases by 5.

**Expected:** Validation error or rejection.
**Actual:** Silent stock inflation; negative-quantity line item persisted; subtotal computed as a negative value.

**Impact:** High — inventory manipulation is possible via a single malformed IPC call; negative-total sales can be constructed if `precioUnitario` remains positive.

---

## [HIGH] `DetalleVenta.precioUnitario` has no model-level validation — price trust finding confirmed unmitigated

**File:** `DetalleVenta.js:10`

**Description:**
`precioUnitario: { type: DataTypes.FLOAT, allowNull: false }` — only constraint is NOT NULL. No `validate: { min: 0 }`, no hook comparing against `Producto.precioVenta`. The previously reported handler-level finding (ventas-handlers.js:27, 91) is **confirmed unmitigated at the model level**. There is no compensating validation anywhere in the stack.

**Cross-layer verdict:** The renderer is the sole source of truth for the price of every item in every sale. The model accepts any float, including 0 and negative values.

**Impact:** High — confirmed. The previous finding's severity stands; there is no safety net below the handler.

---

## [HIGH] `Venta.metodoPago` has no enum or allowlist at any layer

**File:** `Venta.js:8`

**Description:**
`metodoPago: { type: DataTypes.STRING, allowNull: false }` — only constraint is NOT NULL. The comment `// Efectivo/Débito/Crédito/QR/CtaCte` documents intent but is not enforced. No `validate: { isIn: [['Efectivo', 'Débito', 'Crédito', 'QR', 'CtaCte']] }`. No Sequelize `ENUM` type. Previously reported as LOW (ventas-handlers.js:74); **upgraded to MEDIUM** because the model provides no fallback constraint, meaning arbitrary strings reach permanent storage.

**Impact:** Medium (upgraded from LOW) — any string reaches the database; report queries that `GROUP BY metodoPago` or filter on known values will silently miss unrecognized entries. Financial reconciliation by payment method becomes unreliable as data accumulates.

---

## [MEDIUM] `Venta.montoPagado` is nullable — sales can be committed without a recorded payment amount

**File:** `Venta.js:10`

**Description:**
`montoPagado: { type: DataTypes.FLOAT }` — `allowNull` not set, which defaults to `true` in Sequelize. A `Venta` row can be inserted with `montoPagado = NULL`. The handler sets `montoPagadoFinal` only for Efectivo (line 65) and defaults non-cash to `totalFinal`, but the model does not enforce this.

**Impact:** Medium — any code path that creates a `Venta` without setting `montoPagado` (current or future handlers) produces a row with NULL in a field that reports, cash-drawer reconciliation, and receipts treat as a number. Silent data quality issue.

---

## [MEDIUM] `Venta.total` has no minimum value constraint — zero or negative totals can be persisted

**File:** `Venta.js:9`

**Description:**
`total: { type: DataTypes.FLOAT, allowNull: false }` — NOT NULL is the only constraint. No `validate: { min: 0.01 }`. Combined with the negative-`cantidad` finding (DetalleVenta), a crafted sale payload can produce a `totalFinal` of 0 or below, which the handler does not reject and the model does not block.

**Impact:** Medium — zero-value sales pass financial totals, end-of-day summaries, and are issued receipts. A negative total is mathematically valid under the current stack.

---

## [MEDIUM] `codigo_barras` and `plu` are non-unique — `findOne` on barcode/PLU is non-deterministic

**File:** `Producto.js:20–21`

**Description:**
Both fields are `allowNull: true, unique: false`. Comment confirms this was an intentional change: `// 🟢 'codigo_barras' y 'plu' ahora pueden ser nulos y no son únicos`. The `busqueda-inteligente` handler calls `Producto.findOne({ where: { plu, pesable: true } })` and `Producto.findOne({ where: { [Op.or]: [{ codigo_barras }, ...] } })`. When multiple products share a barcode or PLU, SQLite returns the first match in insertion order (no `ORDER BY`). The result is non-deterministic as rows are updated or deleted over time.

**Impact:** Medium — incorrect product may be loaded at the POS during a scan, causing a sale to be registered for the wrong item. Affects both pricing and stock.

---

## [MEDIUM] Indexes on `codigo_barras` and `plu` were removed — barcode lookup is a full table scan

**File:** `Producto.js:36–46`

**Description:**
The original index definitions for `codigo_barras` and `plu` are commented out: `// { fields: ['codigo_barras'] }, // Eliminamos índices únicos conflictivos`. No replacement non-unique index was added. `busqueda-inteligente` runs `Producto.findOne({ where: { codigo_barras: texto } })` and `findOne({ where: { plu: codigoProducto } })`, both of which now perform full table scans on `productos`.

**Impact:** Medium — in a POS scenario with thousands of products, every barcode scan triggers a full scan of the products table. Compounded with the existing `LIKE %texto%` full scan and the admin config query, a single `busqueda-inteligente` call can generate 3 full table scans.

---

## [MEDIUM] Inactive products (`activo = false`) are not filtered in `busqueda-inteligente`

**File:** `Producto.js:26`, `ventas-handlers.js:236–244`

**Description:**
`activo: { type: DataTypes.BOOLEAN, defaultValue: true }` exists on the model. Paranoid soft-delete (`deletedAt`) is correctly excluded by Sequelize by default. However, `activo = false` is a separate logical state — a product can be deactivated without being deleted. The `busqueda-inteligente` handler's fallback query (`Producto.findOne({ where: { [Op.or]: [...] } })`) has no `activo: true` filter. Inactive products can be scanned and added to sales.

**Impact:** Medium — products intentionally disabled (discontinued, out of season, price under review) can be sold. This is a business logic violation that the data model enables but does not prevent.

---

## [LOW] `DetalleVenta.subtotal` is a stored computed value with no integrity check

**File:** `DetalleVenta.js:11`

**Description:**
`subtotal: { type: DataTypes.FLOAT, allowNull: false }` is pre-computed by the handler as `cantidad * pUnit` and inserted directly. There is no `beforeCreate` hook or `validate` function that asserts `subtotal === cantidad * precioUnitario`. The value is frozen at insert time. If the handler logic changes or bugs are introduced, subtotals can silently diverge from the product of their own quantity × unit price fields within the same row.

**Impact:** Low — within the current codebase, the computation is straightforward and consistent. Risk increases as the codebase changes without a model-level assertion.

---

## [LOW] `Venta.UsuarioId` is not declared as a field in the model — managed entirely by association

**File:** `Venta.js:30–42` (indexes block references `UsuarioId`; no field definition exists)

**Description:**
The `indexes` array includes `{ fields: ['UsuarioId'] }` and the handler passes `UsuarioId` to `Venta.create()`. But no `UsuarioId: { type: DataTypes.UUID }` field is defined in the model body. Sequelize adds FK columns via associations (a `Venta.belongsTo(Usuario)` call adds the column). If the association is defined after `sync()` runs, or if the association is removed while the index definition remains, the index references a non-existent column and `sync()` throws or silently skips it.

**Impact:** Low — currently functional if associations are registered before `sync()`. Creates a latent fragility: the field is invisible in the model definition but depended upon by both indexes and the handler.

---

## [LOW] `precio_oferta` has no constraint relative to `precioVenta` — offer prices can exceed regular prices

**File:** `Producto.js:17`

**Description:**
`precio_oferta: { type: DataTypes.FLOAT, allowNull: true }` — no validation that `precio_oferta < precioVenta`. No hook. A product can be configured with an offer price higher than its regular price. The renderer presumably displays `precio_oferta` as a discount, so a higher offer price would silently overcharge customers.

**Impact:** Low — depends on how the renderer selects which price to display; a model-level guard would catch operator data-entry errors.

---

## [LOW] All monetary fields stored as `FLOAT` — rounding drift is a full-stack issue, not just handler-level

**File:** `Venta.js:9–14`, `DetalleVenta.js:10–11`, `Producto.js:15–17`

**Description:**
Every monetary field across all three models uses `DataTypes.FLOAT` (IEEE 754 double). The previously reported float arithmetic finding (ventas-handlers.js:27–67) is now confirmed to extend to the storage layer. Values computed with rounding error are persisted as-is; there is no rounding step on insert or on read. Reads re-introduce the same imprecision. Over a day's worth of transactions, the stored totals can diverge from what a decimal-precision calculation would produce.

**Impact:** Low to Medium — daily cash reconciliation reports generated by summing stored `FLOAT` totals will carry accumulated error. Severity escalates proportionally with transaction volume.

---

---

> **Scope:** `src/ipc-handlers/productos-handlers.js` — product CRUD, CSV import/export, category management
> **Date:** 2026-04-07
> **Status:** Open

---

## [HIGH] `import-productos-csv` reads arbitrary file path supplied by renderer

**File:** `productos-handlers.js:311–313`

**Description:**
The `import-productos-csv` IPC handler receives `filePath` as a parameter directly from the renderer process and passes it immediately to `fs.readFileSync(filePath, 'utf-8')`. There is no validation that the path was returned by a prior `showOpenDialog` call, no containment check, and no allowlist of safe directories. The renderer controls the path entirely.

The intended flow is: renderer calls `show-open-dialog` → gets a path → passes it to `import-productos-csv`. However, both calls are independent IPC invocations and the main process has no way to verify the path came from the dialog. A compromised renderer (or any process that can emit IPC messages) can supply any path readable by the OS user account.

**Steps to reproduce:**
Call `import-productos-csv` via IPC with `filePath = "C:/Users/<user>/AppData/Roaming/<app>/database.sqlite"` or any other sensitive file. `fs.readFileSync` will read it. PapaParse will attempt to parse it as CSV; non-CSV content will produce an empty `data` array, but the file contents will have been read into memory.

**Expected:** Path validated against a known safe directory before read.
**Actual:** Arbitrary file read; any file accessible to the OS user can be consumed by the main process.

**Impact:** High — this is a second path traversal vulnerability in the application, complementing the `app://` protocol finding in `main.js`. In a POS context with local user data, the database file itself, configuration files, and OS credential stores are all within reach.

**Possible cause:** File dialog path and import handler are two separate IPC channels; no session token or signed path is used to bind the dialog result to the import call.

---

## [HIGH] CSV import creates departments and families outside the transaction — orphaned data on partial failure

**File:** `productos-handlers.js:343–368`, `392–401`

**Description:**
The `import-productos-csv` handler processes rows in a loop. For each row, it calls `ProductoDepartamento.findOrCreate({ ..., transaction: null })` and `ProductoFamilia.findOrCreate({ ..., transaction: null })`. These calls explicitly opt out of any transaction. The product `bulkCreate` at the end is wrapped in a separate `sequelize.transaction()`.

If the `bulkCreate` transaction fails and rolls back, all department and family rows created during the loop remain committed to the database — they are not rolled back. On re-import after a failure, those departments/families already exist, so `findOrCreate` returns them correctly. But if the import partially succeeds (e.g., some products fail the unique constraint mid-bulk), the caller receives an error, the product rows are rolled back, and orphaned `ProductoDepartamento`/`ProductoFamilia` records persist with no associated products.

Additionally, line 345 contains a spurious `section: "Clasificación (Opcional)"` key inside the `findOrCreate` options object — a copy-paste artifact from a UI form or specification document that was never removed. Sequelize ignores unknown keys, so this is not functional, but it signals unreviewed code.

**Steps to reproduce:**
Import a CSV where the first 50 rows have valid departments/families but row 51 has a malformed product. The bulkCreate transaction rolls back. Departments from rows 1–50 are now in the DB permanently; products are not.

**Expected:** Atomic import — all-or-nothing including classifications.
**Actual:** Partial state committed; DB left inconsistent on any import failure.

**Impact:** High — repeated failed imports accumulate orphaned classification records. The classification lists visible in the UI grow with phantom entries that have no associated products.

---

## [HIGH] `guardar-producto` UPDATE returns `{ success: true }` when 0 rows are affected

**File:** `productos-handlers.js:142–148`

**Description:**
When `productoId` is present in the payload, the handler executes `Producto.update(payload, { where: { id: productoId } })`. Sequelize's `update` returns an array `[affectedRows]`. The handler does not inspect this value. If `productoId` is a valid UUID format but does not correspond to any row in the database, `update` returns `[0]`, `t.commit()` is called, and `{ success: true }` is returned to the renderer.

The `productoId` is taken directly from `payload.id` which originates from the renderer. A renderer can supply any UUID as `id` and receive a success response without any product being modified.

**Steps to reproduce:**
Call `guardar-producto` with `{ id: "<valid-uuid-not-in-db>", nombre: "Fake", precioVenta: 999 }`. Handler returns `{ success: true }`. No product is created or modified.

**Expected:** `{ success: false, message: "Producto no encontrado." }` when 0 rows updated.
**Actual:** `{ success: true }` regardless of whether the target product exists.

**Impact:** High — data corruption via silent no-op; operator believes a product was saved when it was not. In an inventory management context, this masks configuration errors silently.

---

## [HIGH] CSV `bulkCreate` with `updateOnDuplicate` includes `stock` — price import silently zeros inventory

**File:** `productos-handlers.js:393–400`

**Description:**
The `updateOnDuplicate` list includes `'stock'`:
```js
updateOnDuplicate: ['nombre', 'precioCompra', 'precioVenta', 'stock', 'unidad', 'pesable', 'plu', 'codigo_barras', 'DepartamentoId', 'FamiliaId', 'activo']
```
The `parseFloatOrZero` helper returns `0` for any missing, empty, or null value. If an operator exports a CSV to update prices only and omits the `stock` column (or leaves it blank), on re-import every existing product's `stock` is overwritten with `0`. This requires no error — Sequelize treats it as a normal upsert.

There is no dry-run mode, no confirmation prompt, no backup taken before import, and no warning that stock values will be overwritten.

**Steps to reproduce:**
1. Export CSV. Delete the `stock` column. Update `precioVenta` values only. Re-import.
2. All product stocks in the database become `0`. No error is shown.

**Expected:** `stock` excluded from `updateOnDuplicate` by default, or a per-field confirmation prompt.
**Actual:** All stock values silently zeroed on a partial CSV import.

**Impact:** High — inventory is destroyed silently. Requires manual recovery from a backup, which may not exist (no backup mechanism was found in the audited code).

---

## [MEDIUM] `get-productos` returns all records with nested associations — no pagination or limit

**File:** `productos-handlers.js:12–44`

**Description:**
`Producto.findAll` with nested `ProductoFamilia → ProductoDepartamento` associations returns all product rows on every call. No `limit`, no `offset`, no filter. The same pattern was reported for `get-ventas`. On a catalogue of thousands of products with full association trees, this serializes the entire dataset across IPC on every page load.

**Impact:** Medium — UI freeze on renderer deserialization; memory spike in main process proportional to catalogue size.

---

## [MEDIUM] `fs.readFileSync` and `fs.writeFileSync` block the main process event loop

**File:** `productos-handlers.js:301`, `313`

**Description:**
`export-productos-csv` uses `fs.writeFileSync(filePath, csv, 'utf-8')` and `import-productos-csv` uses `fs.readFileSync(filePath, 'utf-8')` — both synchronous on the Electron main process. During a large CSV export or import, the main process event loop is blocked. No other IPC messages, window events, or Electron lifecycle events are processed until the synchronous I/O completes.

**Impact:** Medium — UI becomes unresponsive during file I/O. On large datasets (multi-MB CSV), the freeze is user-visible. The async alternatives (`fsPromises.readFile`, `fsPromises.writeFile`) are already imported as `fsPromises` in this file but unused for these operations.

---

## [MEDIUM] No row count limit on CSV import — memory exhaustion on large files

**File:** `productos-handlers.js:321–401`

**Description:**
`parseResult.data` is iterated without any length check. A CSV file with 100,000 rows will load the entire parsed array into memory, execute N `findOrCreate` calls in a serial loop (one per department/family name per row), then attempt a single `bulkCreate` with all rows. No limit, no batch processing, no progress feedback.

**Impact:** Medium — main process memory exhaustion on maliciously large or accidentally large files. The serial `findOrCreate` loop compounds this: for a 10,000-row CSV with 500 unique departments, 500 sequential DB round-trips occur before the `bulkCreate` begins.

---

## [MEDIUM] CSV column schema not validated — missing or misnamed columns produce silent zero values

**File:** `productos-handlers.js:371–389`

**Description:**
`parseFloatOrZero` returns `0` for `undefined` (i.e., when a column is missing from the CSV). If the imported CSV has column names that differ from the expected schema (`precioCompra`, `precioVenta`, `stock`, etc.) — due to localization, manual editing, or a different system's export — all numeric fields default to `0`. Only `codigo` and `nombre` are validated for presence; no other column is checked.

`parseResult.errors` from PapaParse is never checked. PapaParse reports row-level parse errors there; they are silently ignored.

**Impact:** Medium — a CSV from a different source or with renamed columns imports "successfully" with all prices and stock values at zero. Operator receives `{ success: true, message: "Se procesaron N productos." }` with no indication of the data loss.

---

## [MEDIUM] `guardar-producto` payload is not field-whitelisted — any model field can be overwritten via IPC

**File:** `productos-handlers.js:98–156`

**Description:**
`payload = { ...productoData }` spreads all renderer-supplied keys. After sanitizing a handful of specific fields, the entire `payload` object is passed to either `Producto.update(payload, ...)` or `Producto.create(payload, ...)`. Any valid Sequelize model field (`activo`, `pesable`, `deletedAt`, `createdAt`, `updatedAt`) included in the renderer payload will be written to the database without restriction.

Of particular concern: `deletedAt` — if a renderer sends `{ id: "...", deletedAt: null }`, it can un-soft-delete a product without going through a dedicated restore handler. Conversely, sending `{ id: "...", deletedAt: "2020-01-01" }` can soft-delete a product silently through the update path.

**Impact:** Medium — any model field is a writable attack surface. The absence of an explicit field allowlist means future model additions are automatically exposed.

---

## [MEDIUM] `show-open-dialog` forwards renderer-controlled options directly to native dialog

**File:** `productos-handlers.js:253–255`

**Description:**
`dialog.showOpenDialog(options)` is called with `options` passed entirely from the renderer. A renderer can control `properties`, `filters`, `title`, `defaultPath`, and `buttonLabel`. While the result is a file path chosen by the user (native OS picker), a compromised renderer could set `properties: ['openDirectory']` to get a directory path instead of a file, or manipulate dialog behavior in unintended ways.

More critically: the returned `filePaths` array is passed back to the renderer, which then sends a path to `import-productos-csv`. This IPC round-trip through the renderer is the mechanism that creates the arbitrary-file-read vulnerability documented above — the dialog provides no binding between what was shown and what is eventually imported.

**Impact:** Medium — the dialog options issue itself is lower risk in a local desktop app; the real impact is in how the dialog result flows through the renderer before reaching the import handler.

---

## [MEDIUM] `guardar-familia` accepts `DepartamentoId` from renderer without existence validation

**File:** `productos-handlers.js:230–247`

**Description:**
`DepartamentoId` is taken from `data?.DepartamentoId` (renderer-supplied) and used directly in `ProductoFamilia.findOrCreate({ where: { nombre, DepartamentoId } })`. There is no prior check that a `ProductoDepartamento` row with that ID exists. Since `PRAGMA foreign_keys` is disabled (main.js bug), the FK constraint is not enforced at the DB level. A `ProductoFamilia` row with a `DepartamentoId` referencing no department can be created.

**Impact:** Medium — orphaned family records with dangling foreign keys accumulate silently. The classification tree displayed in the UI will have families pointing to non-existent departments.

---

## [MEDIUM] `imagen_base64` accepted without size limit or strict MIME validation

**File:** `productos-handlers.js:121–133`

**Description:**
The handler accepts `payload.imagen_base64` as a string, strips the data URI prefix with a regex, and writes the result as a file. There is no check on the string length (no max file size). A renderer can send a base64-encoded payload of any size. The regex `/^data:image\/\w+;base64,/` strips the prefix if it matches, but if the prefix is absent or malformed, the full string is decoded as base64 and written. The file is always saved with a `.png` extension regardless of the actual MIME type embedded in the data URI.

**Impact:** Medium — an oversized image payload consumes disk space in `userData/images/productos/` without limit. A non-image payload written as `.png` will not cause immediate errors but produces a corrupt file that fails to render.

---

## [LOW] `eliminar-producto` FK error handler is unreachable dead code under current PRAGMA conditions

**File:** `productos-handlers.js:181–183`

**Description:**
```js
if (error.name === "SequelizeForeignKeyConstraintError") {
  return { success: false, message: "No se puede eliminar: tiene ventas/compras asociadas." };
}
```
Two reasons this is unreachable:
1. `PRAGMA foreign_keys` is not enforced (main.js bug), so SQLite never raises FK violations.
2. `Producto` uses `paranoid: true`, meaning `destroy()` issues `UPDATE SET deletedAt = NOW()`, not `DELETE FROM`. Even if FK enforcement were active, UPDATE operations do not trigger FK constraint checks.

This code gives operators false confidence that products with associated sales are protected from deletion. In reality, a soft-delete always succeeds silently.

**Impact:** Low — the product is not hard-deleted (paranoid protects that), but the error path is never reached, and the intended guard behavior is completely absent.

---

## [LOW] `toggle-producto-activo` performs SELECT then UPDATE — two round-trips for a boolean flip

**File:** `productos-handlers.js:192–196`

**Description:**
`Producto.findByPk(productoId)` fetches the full row, then `producto.activo = !producto.activo; await producto.save()` issues an UPDATE. This is two DB queries. The equivalent `Producto.update({ activo: sequelize.literal('NOT activo') }, { where: { id: productoId } })` or a query-time toggle would achieve the same result in a single round-trip.

Additionally, there is a TOCTOU (time-of-check to time-of-use) gap: the `activo` value is read, negated, and written back without a transaction or lock. If two concurrent calls toggle the same product, both may read the same `activo` value and both write the same result.

**Impact:** Low — in a single-operator POS this is unlikely to cause practical issues, but the pattern is inherently non-atomic.

---

## [LOW] `get-producto-by-id` logs full serialized Sequelize instance to console in production

**File:** `productos-handlers.js:71`

**Description:**
`console.log("[HANDLER: get-producto-by-id] Resultado de findByPk:", JSON.stringify(producto, null, 2))` serializes the entire Sequelize model instance, including all associations, internal Sequelize metadata, and all field values, on every call. In a production environment this floods the console/log file and may expose sensitive product cost data in log output.

**Impact:** Low — no functional issue, but produces noise and potential data exposure in log files.

---

## [LOW] `nombre` not validated for non-empty in `guardar-producto`

**File:** `productos-handlers.js:99`

**Description:**
`payload.nombre = String(payload.nombre || "").trim()` — if `nombre` is not supplied or is whitespace-only, it becomes an empty string. No `throw` or return for empty `nombre`, unlike `codigo` which has an explicit guard (lines 102–104). A product with `nombre = ""` can be created and saved.

`Producto.nombre` is `allowNull: false` at the model level but has no `validate: { notEmpty: true }`. Sequelize's NOT NULL only catches `null`, not empty strings. An empty string is a valid non-null value.

**Impact:** Low — products with blank names appear in the product list and search results in ways that break UI rendering and search logic.

---

## [LOW] CSV export uses `fs.writeFileSync` despite `fsPromises` already being imported

**File:** `productos-handlers.js:4`, `301`

**Description:**
`const fsPromises = require("fs/promises")` is imported at the top of the file and used for image writes in `guardar-producto`. The CSV export handler uses `fs.writeFileSync` (synchronous) instead of `fsPromises.writeFile` (async). The async alternative is already available in scope; the synchronous call is inconsistent with the rest of the file.

**Impact:** Low — inconsistent coding pattern; practical impact is the main process event loop blockage documented in the MEDIUM finding above.

---

*Previously reported findings (pre-audit):*

- **[BUG] Product loads empty** — Selected product sometimes loads with empty data when selected from the product list. High impact on sales flow.
- **[PERF] Slow product list rendering** — Product list renders slowly under normal load conditions.
