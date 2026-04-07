# Audit Findings — Venta Simple POS

**Version:** 2.0 (consolidated)
**Date:** 2026-04-07
**Files analyzed:** `main.js`, `ventas-handlers.js`, `productos-handlers.js`, `caja-handlers.js`, `Venta.js`, `DetalleVenta.js`, `Producto.js`, `ArqueoCaja.js`

> Findings are organized by **root cause**, not by file. Each finding documents all affected components.
> Severity reflects the worst confirmed impact, verified across all layers.

---

## HIGH Severity

---

### H-1 · Database infrastructure failures (3 compounding issues)

**Root cause:** `main.js` database initialization is structurally broken.

**Affected files:** `main.js:216`, `main.js:230–242`, `main.js:313–318`

**Issues:**

**a) Multiple PRAGMAs silently fail** (`main.js:230–242`)
Multiple SQLite PRAGMA directives are concatenated in a single `sequelize.query()` call. The `sqlite3` Node.js driver's `sqlite3_prepare` + `sqlite3_step` pipeline processes only the first statement. All subsequent PRAGMAs — including `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` — are silently ignored. No error is thrown. The application behaves as if the settings were applied.

Consequence: **foreign key enforcement is OFF on every installation**, WAL mode is not active, and every other performance PRAGMA is not applied.

**b) Database path resolves to `__dirname`** (`main.js:216`)
`path.join(__dirname, "database.sqlite")` resolves inside the read-only ASAR bundle in a packaged Electron app. The database cannot be created or written. `sequelize.authenticate()` throws on first launch. The correct path is `app.getPath("userData")`.

**c) `sequelize.sync()` without migrations** (`main.js:313–318`)
The migration system was commented out and replaced with `await sequelize.sync()` (no options). `sync()` without `{ alter: true }` only creates tables that do not exist. It never modifies columns, adds indexes, or updates constraints on a live database. Any schema change deployed to an existing installation is silently ignored at runtime.

**Business impact:** (b) is a deploy-blocking crash on any packaged build. (a) means FK integrity is never enforced — orphaned rows and dangling foreign keys accumulate silently across all tables. (c) means the schema on installed instances can diverge permanently from the model definitions, causing silent runtime errors on any schema evolution.

**Technical impact:** The combination of (a) and (c) means the `totalVentasTransferencia` missing field (H-4) and any future field addition will never be reflected in existing databases. (b) means the production artifact cannot run at all.

---

### H-2 · Renderer data trusted for sale prices and quantities — no server-side validation

**Root cause:** `createSaleTx` uses IPC payload values as financial truth. No DB re-read of authoritative prices. No layer below the renderer validates these values.

**Affected files:** `ventas-handlers.js:27, 91`, `DetalleVenta.js:9–10`, `Producto.js:13`

**Description:**
Every sale's total is computed from `item.precioUnitario` and `item.cantidad` supplied by the renderer. The main process never queries `Producto.precioVenta` to verify the price. `DetalleVenta.precioUnitario` and `DetalleVenta.cantidad` have no model-level constraints beyond NOT NULL.

`cantidad` can be zero or negative. `Producto.increment({ stock: -cantidad })` with a negative `cantidad` **increases** stock. With `precioUnitario` from the renderer and a negative `cantidad`, a negative-total sale can be constructed and committed.

Cross-layer verdict:
- Handler: no validation
- Model (`DetalleVenta`): only NOT NULL
- Database: no CHECK constraints

**Steps to reproduce:**
1. Send `registrar-venta` with `precioUnitario = 0.01` for a $1000 product → sale committed at $0.01.
2. Send `registrar-venta` with `cantidad = -5` → stock increases by 5; sale total is negative.

**Business impact:** Financial integrity of every recorded sale depends entirely on renderer-side state. Pricing manipulation and inventory inflation are achievable through a single malformed IPC call with no server-side detection.

---

### H-3 · `metodoPago` free-form string causes silent financial data loss in daily closing records

**Root cause:** `Venta.metodoPago` accepts any string. The caja closing aggregation silently excludes sales with unrecognized payment methods. One payment method (`Transferencia`) is computed but never stored due to a missing model field.

**Affected files:** `ventas-handlers.js:74`, `Venta.js:8`, `caja-handlers.js:27–55`, `caja-handlers.js:187–191`, `ArqueoCaja.js:17–20`

**Three compounding failures with a single root cause:**

**a) No allowlist at storage time**
`Venta.metodoPago: { type: DataTypes.STRING, allowNull: false }` — only NOT NULL enforced. Any string is accepted and permanently stored. A typo, a locale variant, or a future payment type not yet handled by the aggregation logic enters the database without error.

**b) `normalizarMetodoPago` fallback silently drops unrecognized sales**
`caja-handlers.js` normalizes stored strings to canonical values before aggregating. The function's final line is `return s` — the original unmodified string — on no match. In `agregarTotalesPorMetodo`, unmatched values fall through all `if/else` branches and contribute `0` to every total bucket. A sale with `metodoPago = "CtaCte"` (a documented business value per `Venta.js` comment) is excluded from all caja totals with no error or flag.

**c) `totalVentasTransferencia` not stored in `ArqueoCaja`**
`agregarTotalesPorMetodo` computes five values including `totalTransfer`. `ArqueoCaja` defines four storage fields: `totalVentasEfectivo`, `totalVentasDebito`, `totalVentasCredito`, `totalVentasQR`. There is no `totalVentasTransferencia`. In `cerrar-caja`, `totalTransfer` is computed and returned in the pre-close preview but **is never assigned to `arqueo`**. Every session that includes a Transferencia payment produces a closing record missing that total. The value shown in the preview permanently disappears after commit.

This is also evidence that a payment method was added after the initial schema without a corresponding migration, consistent with H-1c.

**Business impact:** End-of-day financial records silently understate actual sales whenever any non-canonical payment method is used. The discrepancy cannot be detected from within the application — it requires querying raw `Venta` records and recomputing externally.

---

### H-4 · `cerrar-caja` is not transactional — closing totals are structurally susceptible to understatement

**Root cause:** `cerrar-caja` reads sales at time T1, computes totals, then writes the arqueo at time T2 without a database transaction. Sales registered in the T1→T2 window are excluded from stored totals.

**Affected file:** `caja-handlers.js:161–203`

**Description:**
The close sequence:
1. `obtenerVentanaArqueo` → `fin = now()` [T1]
2. `Venta.findAll(createdAt < T1)` — snapshot
3. Arithmetic on fetched sales
4. `arqueo.fechaCierre = now()` [T2 > T1]
5. `arqueo.save()`

Between steps 2 and 5, the main process event loop continues processing IPC messages. Any `registrar-venta` that completes in this window creates a `Venta.createdAt` between T1 and T2. That sale:
- Is temporally within the session (before the recorded close time)
- Is NOT reflected in the stored totals (outside the query window)
- WILL appear in future retrospective calculations (since historical window end uses `siguiente.fechaApertura`)

The stored totals are permanently understated for any session where a sale was registered during the close operation. In a busy POS, this is a normal operating condition.

**Business impact:** Every end-of-day financial record is potentially incomplete. The understatement is silent — no error is raised, no flag is set, and the discrepancy between raw `Venta` totals and `ArqueoCaja.totalVentas*` cannot be explained from within the application.

---

### H-5 · Path traversal / arbitrary file read (two independent vectors)

**Root cause:** File paths from the renderer are used directly for filesystem operations without containment validation.

**Affected files:** `main.js:422–434`, `productos-handlers.js:311–313`

**Vector 1 — `app://` custom protocol handler** (`main.js:422–434`)
The handler decodes the request URL with `decodeURI()` and passes it directly to `path.join()` before serving the file. No check verifies the resolved path is within `public/` or `userData/`. `path.join()` normalizes but does not prevent `../` sequences. A request to `app://../../../sensitive-file` resolves outside the intended root.

**Vector 2 — `import-productos-csv` IPC handler** (`productos-handlers.js:311–313`)
`filePath` is received as an IPC parameter from the renderer and passed directly to `fs.readFileSync(filePath, 'utf-8')`. The renderer-to-main IPC round-trip (via `show-open-dialog`) means the main process cannot verify the path came from the OS file dialog. Any path readable by the OS user account is accessible.

**Business impact:** Any file accessible to the OS user (database file, system credentials, configuration files) can be read by a compromised renderer or by any process capable of emitting IPC messages.

---

### H-6 · CSV import silently destroys inventory — `updateOnDuplicate` overwrites stock

**Root cause:** The CSV upsert includes `stock` in `updateOnDuplicate`. Missing CSV columns default to `0` via `parseFloatOrZero`. A price-only import zeroes all product stock values.

**Affected file:** `productos-handlers.js:393–400`

**Description:**
```js
updateOnDuplicate: ['nombre', 'precioCompra', 'precioVenta', 'stock', 'unidad', ...]
```
`parseFloatOrZero` returns `0` for `undefined` (column absent), `null`, or empty string. If the `stock` column is absent from the imported CSV — intentionally (price-update workflow) or accidentally (column renamed) — every existing product's stock is overwritten with `0`. Sequelize treats this as a normal upsert with no error.

No dry-run mode, no confirmation prompt, no backup, and no warning are present.

**Steps to reproduce:** Export CSV → delete `stock` column → update `precioVenta` values → re-import. All stocks become 0. No error is shown. `{ success: true, message: "Se procesaron N productos." }` is returned.

**Business impact:** Complete inventory destruction on a common operator workflow (price update via CSV). Recovery requires manual data entry or a backup that may not exist.

---

### H-7 · CSV import non-atomic — departments and families orphaned on partial failure

**Root cause:** `ProductoDepartamento` and `ProductoFamilia` rows are created with `transaction: null`, outside the `bulkCreate` transaction. On `bulkCreate` rollback, classification rows persist.

**Affected file:** `productos-handlers.js:343–368`, `392–401`

**Description:**
During the row-processing loop, each department and family is created via `findOrCreate({ ..., transaction: null })`. The `Producto.bulkCreate` at the end is wrapped in a separate transaction. If `bulkCreate` fails and rolls back, all classification rows created during the loop remain committed. Repeated failed imports accumulate orphaned `ProductoDepartamento` and `ProductoFamilia` records that have no associated products.

**Business impact:** Classification lists visible in the UI grow with phantom entries after any failed import. The longer the application is in use, the more cluttered the classification tree becomes with unrecoverable phantom data.

---

### H-8 · `guardar-producto` UPDATE silently succeeds when target product does not exist

**Root cause:** `Producto.update` return value is not inspected. Zero-affected-rows is treated as success.

**Affected file:** `productos-handlers.js:142–148`

**Description:**
`Producto.update(payload, { where: { id: productoId } })` returns `[affectedRows]`. The handler calls `t.commit()` and returns `{ success: true }` regardless of whether `affectedRows === 0`. The `productoId` comes from `payload.id`, which originates from the renderer. A renderer can supply a valid UUID format that corresponds to no row and receive a success response.

**Business impact:** An operator believes a product was saved; no product was modified. The failure is invisible in the UI and in the response. In a configuration or pricing workflow, this masks data loss silently.

---

## MEDIUM Severity

---

### M-1 · No pagination on any list-returning handler — full dataset loaded on every call

**Root cause:** Consistent absence of `limit`/`offset` across all `findAll` calls.

**Affected files:** `ventas-handlers.js:142–156`, `productos-handlers.js:12–44`, `caja-handlers.js:96–114`

**Description:**
`get-ventas`, `get-productos`, and `get-all-cierres-caja` all return their full dataset with complete eager-loaded associations on every call. No `limit`, no `offset`, no date range defaults.

**Impact:** Memory spike in the main process and IPC payload bloat proportional to dataset size. On a multi-year installation, `get-ventas` can return thousands of records with full association trees on every sales view load. `get-all-cierres-caja` returns every session in history. All handlers also return `[]` or `{}` on error, making failures indistinguishable from empty results.

---

### M-2 · All error handlers return empty structures — errors are invisible to the renderer

**Root cause:** Consistent catch-and-swallow pattern across all handlers.

**Affected files:** All IPC handlers

**Description:**
Every handler wraps its logic in `try/catch`. On exception, handlers log to `console.error` and return `[]`, `null`, or `{}` — structurally identical to an empty successful result. The renderer has no way to distinguish "no data" from "query failed." `get-ventas` returning `[]` on a DB error shows an empty sales list rather than an error state.

**Impact:** Transient failures (DB lock, model error, schema mismatch) are invisible to operators. Diagnosis requires inspecting console logs, which are not surfaced in the UI.

---

### M-3 · Float arithmetic used for all monetary calculations — rounding drift is full-stack

**Root cause:** All monetary values use JavaScript `Number` (IEEE 754 double) from computation through storage to aggregation.

**Affected files:** `ventas-handlers.js:27–67`, `Venta.js:9–14`, `DetalleVenta.js:10–11`, `Producto.js:15–17`, `ArqueoCaja.js:11–20`, `caja-handlers.js:38–55`

**Description:**
Sale totals are computed as `subtotal += precioUnitario * cantidad` (float), stored as `DataTypes.FLOAT`, and later aggregated by summing `Venta.total` values (also float) in `agregarTotalesPorMetodo`. The final `diferencia` in `ArqueoCaja` is a float subtraction of two float-accumulated sums.

`0.1 × 3 === 0.30000000000000004`. Over hundreds of daily transactions, rounding drift accumulates into the cash reconciliation figure, making it impossible to distinguish a real cash discrepancy from a float artifact without external recalculation.

**Impact:** Cash reconciliation reports (`diferencia`) carry accumulated rounding error. A `diferencia` of `0.0000000001` cannot be distinguished from `0.00` without external recomputation.

---

### M-4 · Barcode and PLU lookups are non-deterministic and unindexed

**Root cause:** `codigo_barras` and `plu` were made non-unique and their indexes were removed without replacement.

**Affected files:** `Producto.js:20–21, 36–46`, `ventas-handlers.js:210–244`

**Description:**
Both fields are `allowNull: true, unique: false`. Their index definitions are commented out (`// Eliminamos índices únicos conflictivos`). No non-unique replacement index was added. `busqueda-inteligente` calls `Producto.findOne({ where: { codigo_barras: texto } })`, which now performs a full table scan. When multiple products share a barcode or PLU, SQLite returns the first match in insertion order with no deterministic ordering.

**Impact:** Every barcode scan triggers a full products table scan. Incorrect products can be returned non-deterministically when barcodes are shared. In a POS environment, a wrong product at scan time means a wrong product on the receipt, with no error indicator.

---

### M-5 · `busqueda-inteligente` executes up to 3 full table scans per product search

**Root cause:** No caching of admin config + removed indexes + leading-wildcard LIKE.

**Affected file:** `ventas-handlers.js:165–257`

**Description:**
Each call executes:
1. `Usuario.findOne(rol="administrador")` — full scan of `usuarios`
2. Barcode/PLU lookup — full scan of `productos` (no index, see M-4)
3. `nombre LIKE '%texto%'` — full scan of `productos` (leading wildcard prevents index use)

The admin config lookup is unnecessary on every call; it could be loaded once at handler registration and invalidated on config change.

**Impact:** Measurable latency per scan on any catalogue larger than a few thousand products. In a scan-heavy workflow (scale-integrated products), this fires on every item.

---

### M-6 · Inactive products are not excluded from product search

**Root cause:** `busqueda-inteligente` fallback query has no `activo: true` filter.

**Affected files:** `ventas-handlers.js:236–244`, `Producto.js:26`

**Description:**
`Producto.activo` exists and defaults to `true`. Products can be deactivated via `toggle-producto-activo`. Soft-deleted products are correctly excluded by Sequelize's `paranoid` handling. However, `activo = false` products are not soft-deleted — they remain fully queryable. The `busqueda-inteligente` fallback query returns the first matching product regardless of `activo` state.

**Impact:** A deactivated product (discontinued, seasonal, price under review) can be scanned and sold. This is a business logic violation that produces no error.

---

### M-7 · `guardar-producto` payload is not field-whitelisted — internal fields writable via IPC

**Root cause:** `payload = { ...productoData }` spreads all renderer fields before passing to `Producto.update` or `Producto.create`.

**Affected file:** `productos-handlers.js:98–156`

**Description:**
After sanitizing a small set of named fields, the entire renderer payload is passed to the ORM call. Any valid Sequelize model field sent by the renderer will be written. Notably, `deletedAt` can be overwritten: sending `{ id: "...", deletedAt: null }` un-soft-deletes a product without a dedicated restore handler; sending `{ id: "...", deletedAt: "2020-01-01" }` soft-deletes it silently.

**Impact:** All model fields — including audit fields (`createdAt`, `updatedAt`, `deletedAt`) — are writable through the save endpoint. No explicit allowlist protects against field injection.

---

### M-8 · Cash session amounts accept negative values

**Root cause:** `|| 0` pattern in `abrir-caja` and `cerrar-caja` handles falsy values but not negative numbers.

**Affected file:** `caja-handlers.js:85, 192–193`

**Description:**
`Number(montoInicial) || 0` and `Number(montoFinalReal) || 0` — negative numbers are truthy. `Number(-500) || 0` evaluates to `-500`. Neither `ArqueoCaja.montoInicial` nor `ArqueoCaja.montoFinalReal` has a `validate: { min: 0 }` constraint.

**Impact:** A negative `montoInicial` shifts `montoEstimado = montoInicial + totalEfectivo`, producing a falsely inflated `diferencia`. A negative `montoFinalReal` produces a `diferencia` that represents no real cash position.

---

### M-9 · Pre-close summary and actual close use independent timestamps

**Root cause:** `get-resumen-cierre` and `cerrar-caja` both call `obtenerVentanaArqueo` independently; for an open session, `fin = now()` is re-evaluated at each call.

**Affected file:** `caja-handlers.js:117–203`

**Description:**
The operator reviews a summary computed at T1. By the time they confirm close (at T2), new sales may have occurred. The stored totals reflect T2's window; the operator approved T1's numbers. There is no lock, freeze, or delta notification.

**Impact:** In a financial audit, the approved preview and the stored record will diverge whenever sales activity is ongoing at closing time. The discrepancy cannot be explained without knowing the inter-call interval.

---

### M-10 · CSV import — synchronous file I/O blocks the main process event loop

**Root cause:** `fs.readFileSync` and `fs.writeFileSync` used on the main process; async alternatives already imported but unused.

**Affected file:** `productos-handlers.js:301, 313`

**Description:**
`fs.readFileSync(filePath)` and `fs.writeFileSync(filePath, csv)` block the Electron main process event loop for the duration of the I/O. No other IPC message, window event, or Electron lifecycle event is processed until the call returns. `fsPromises` is already imported at the top of the file but is only used for image writes.

**Impact:** UI becomes unresponsive during any CSV operation. On large files (multi-MB exports/imports), the freeze is operator-visible.

---

### M-11 · CSV import has no row limit and no column schema validation

**Root cause:** No validation on `parseResult.data` length or column presence.

**Affected file:** `productos-handlers.js:321–401`

**Description:**
- No row count check: 100,000-row CSV will trigger 100,000 iterations including N serial `findOrCreate` DB calls before `bulkCreate`.
- `parseResult.errors` from PapaParse is never checked.
- Only `codigo` and `nombre` are validated for presence. All other columns default to `0` when absent (via `parseFloatOrZero(undefined) === 0`). A CSV with misnamed or missing columns imports "successfully" with all prices set to zero.

**Impact:** Main process memory exhaustion on oversized files. Silent price zeroing on column-mismatch imports, with `{ success: true }` returned to the operator.

---

### M-12 · `guardar-familia` accepts a `DepartamentoId` that may not exist

**Root cause:** FK validation absent at handler level; FK enforcement absent at DB level (H-1a).

**Affected file:** `productos-handlers.js:230–247`

**Description:**
`DepartamentoId` from the renderer is used directly in `ProductoFamilia.findOrCreate({ where: { nombre, DepartamentoId } })`. No prior `ProductoDepartamento.findByPk(DepartamentoId)` check. Since `PRAGMA foreign_keys` is OFF, SQLite does not reject the row.

**Impact:** `ProductoFamilia` rows with dangling `DepartamentoId` values accumulate. The classification tree displayed in the UI has families attached to non-existent departments.

---

### M-13 · `imagen_base64` accepted without size limit or MIME validation

**Root cause:** No validation before writing renderer-supplied binary data to disk.

**Affected file:** `productos-handlers.js:121–133`

**Description:**
The handler accepts any `imagen_base64` string, strips the data URI prefix, and writes the decoded bytes to `userData/images/productos/*.png`. No maximum string length. If the prefix regex does not match, the full string is decoded and written. The extension is always `.png` regardless of actual content type.

**Impact:** Unbounded disk usage in `userData`. Non-image payloads produce corrupt `.png` files.

---

## LOW Severity

---

### L-1 · `Venta.total` and `Venta.montoPagado` have no minimum value constraints

**Files:** `Venta.js:9–10`
`total: { type: DataTypes.FLOAT, allowNull: false }` — no min. `montoPagado` — nullable. A sale with total = 0, total < 0, or montoPagado = NULL can be committed. Combined with H-2 (negative `cantidad`), a zero or negative total is achievable.

---

### L-2 · `precio_oferta` not validated against `precioVenta`

**File:** `Producto.js:17`
No constraint or hook ensures `precio_oferta < precioVenta`. An offer price higher than the regular price is accepted. The renderer would display the offer price as a discount, silently overcharging.

---

### L-3 · `eliminar-producto` FK error handler is dead code

**File:** `productos-handlers.js:181–183`
The `SequelizeForeignKeyConstraintError` catch is unreachable: (1) `PRAGMA foreign_keys` is OFF — FK violations are never raised; (2) `paranoid: true` means `destroy()` issues an UPDATE, not DELETE — FK checks do not apply to UPDATE. The intended protection (blocking deletion of products with sales) is entirely absent.

---

### L-4 · `toggle-producto-activo` is non-atomic (SELECT + UPDATE)

**File:** `productos-handlers.js:192–196`
Two round-trips for a boolean flip. The TOCTOU gap allows concurrent calls to read the same `activo` value and both write the same result. Equivalent single-query approach: `Producto.update({ activo: literal('NOT activo') }, { where: { id } })`.

---

### L-5 · `estado` ENUM CHECK constraint absent on existing installations

**File:** `ArqueoCaja.js:23`
Sequelize generates a CHECK constraint for ENUM. Due to `sync()` without `alter` (H-1c), the CHECK is absent from the DDL of any table created before the ENUM was added. The constraint exists in the ORM model but not in the actual schema of existing installations.

---

### L-6 · `obtenerVentanaArqueo` window end is structurally inconsistent with `fechaCierre`

**File:** `caja-handlers.js:13–25`
At close time, `fin = now()`. `fechaCierre = now()` is set separately after the sales query. For retrospective calculations, `fin = siguiente.fechaApertura`. If the next session opens the following day, the retrospective window is wider than the original closing window. Stored totals and any future recalculation are inconsistent by design.

---

### L-7 · Debug log statements left in production paths

**Files:** `productos-handlers.js:71`, `ventas-handlers.js:168–170`
`JSON.stringify(producto, null, 2)` serializes the full Sequelize instance on every `get-producto-by-id` call. Multiple `console.log` calls in `busqueda-inteligente` fire on every barcode scan. Sensitive product cost data appears in log output.

---

### L-8 · `nombre` not validated for non-empty in `guardar-producto`

**File:** `productos-handlers.js:99`
`String(payload.nombre || "").trim()` produces an empty string on blank input. No validation error is thrown. `Producto.nombre` is `allowNull: false` but has no `validate: { notEmpty: true }`. Empty string is a valid non-null value in SQLite — products with blank names are created without error.

---

### L-9 · Scale barcode divisor guard is misleading

**File:** `ventas-handlers.js:207`
`Number(cfg.valor_divisor) || 1` handles `null`/`undefined`/`"0"` (falsy) correctly via the `||` fallback, but only coincidentally — a numeric `0` is also falsy. No explicit validation or configuration error is surfaced when `valor_divisor` is 0 or invalid.

---

### L-10 · `macOS activate` event accesses `models` without initialization guard

**File:** `main.js:572–586`
If `app.on("ready")` fails and `models` remains `undefined`, clicking the macOS dock icon triggers `activate`, which calls `models.Usuario.findOne(...)` unconditionally. This produces an unhandled `TypeError` that compounds an already-failed startup.

---

### L-11 · `Venta.UsuarioId` not declared in the model body

**File:** `Venta.js:30–42`
`UsuarioId` appears in the `indexes` array and is passed in `Venta.create()` by the handler, but no explicit field definition exists in the model. The column is added by Sequelize's `belongsTo` association. If the association changes or is removed, the index silently references a non-existent column.

---

### L-12 · `DetalleVenta.subtotal` is a stored computed value with no integrity hook

**File:** `DetalleVenta.js:11`
`subtotal` is pre-computed by the handler as `cantidad * pUnit` and inserted directly. No `beforeCreate` hook asserts `subtotal === cantidad * precioUnitario`. A bug in the computation logic would produce stored subtotals that silently diverge from the product of their own fields.

---

*Pre-audit findings (not yet verified by code review):*

- **[BUG] Product loads empty** — Selected product sometimes loads with empty data when selected from the product list.
- **[PERF] Slow product list rendering** — Product list renders slowly under normal load conditions.
