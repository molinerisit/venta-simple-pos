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

*Previously reported findings (pre-audit):*

- **[BUG] Product loads empty** — Selected product sometimes loads with empty data when selected from the product list. High impact on sales flow.
- **[PERF] Slow product list rendering** — Product list renders slowly under normal load conditions.
