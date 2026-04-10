# Refactor Plan — Wave 3

> Findings source: `docs/audit-wave-3/findings.md`
> Implementation log: `docs/refactor-log.md`
> Tests: `tests/run-phase-8.js`

---

## IMMEDIATE (do first — HIGH severity + critical MEDIUM)

### Step 8.1 — Add session guard to financial-mutation handlers
**Finding IDs:** W3-H6, W3-H7
**Target files:** `src/ipc-handlers/ctascorrientes-handlers.js`, `src/ipc-handlers/caja-handlers.js`
**Problem:** `registrar-pago-cliente`, `registrar-abono-proveedor`, and `abrir-caja` all accept renderer-supplied IDs and write to the DB without verifying an active server-side session. `abrir-caja` also accepts `usuarioId` from the renderer and stores it verbatim as the audit owner.
**Guarantee the fix must provide:**
- `registrar-pago-cliente` and `registrar-abono-proveedor` must return `{ success: false, message: "Sesión no activa." }` when `getActiveUserId()` is null.
- `abrir-caja` must ignore the renderer-supplied `usuarioId` and read `UsuarioId` from `getActiveUserId()` instead.
**Tests to add:**
- registrar-pago-cliente fails without active session
- registrar-abono-proveedor fails without active session
- abrir-caja uses session userId, not renderer-supplied one

---

### Step 8.2 — Fix guardar-insumo: add allowlist and affectedRows check
**Finding IDs:** W3-H4, W3-H5
**Target files:** `src/ipc-handlers/insumos-handlers.js`
**Problem:** `guardar-insumo` spreads the full renderer payload into the ORM call (mass-assignment). On update, if the row doesn't exist, `affectedRows === 0` is ignored and `{ success: true }` is returned.
**Guarantee the fix must provide:**
- Only allowed fields (`nombre`, `stock`, `precioCompra`, `precioVenta`, `unidad`, `InsumoDepartamentoId`, `InsumoFamiliaId`, `activo`) are forwarded to the ORM.
- On update, if `affectedRows === 0`, return `{ success: false, message: "Insumo no encontrado." }`.
**Tests to add:**
- guardar-insumo update on non-existent ID returns success:false
- guardar-insumo cannot inject arbitrary fields (deuda not writable)

---

### Step 8.3 — Add default limit to unbounded list handlers
**Finding IDs:** W3-H1, W3-H2, W3-H3, W3-H8, W3-M1, W3-M2, W3-M3
**Target files:** `src/ipc-handlers/clientes-handlers.js`, `src/ipc-handlers/proveedores-handlers.js`, `src/ipc-handlers/ctascorrientes-handlers.js`, `src/ipc-handlers/facturacion-handlers.js`, `src/ipc-handlers/insumos-handlers.js`, `src/ipc-handlers/ventas-handlers.js`, `src/ipc-handlers/etiquetas-handlers.js`
**Problem:** Multiple `findAll()` calls have no `limit`, risking memory exhaustion on large datasets.
**Guarantee the fix must provide:**
- `get-clientes` accepts optional `limit`/`offset` (default limit = 500).
- `get-proveedores` accepts optional `limit`/`offset` (default limit = 500).
- `get-proveedores-con-deuda` has a default limit of 500.
- `get-ventas-con-factura` has a default limit of 200.
- `get-insumos` has a default limit of 500.
- `get-ventas` enforces a default limit of 200 when neither limit nor offset is supplied.
- `get-data-for-seleccion` accepts optional `limit` with default 500.
**Tests to add:**
- get-clientes without opts returns bounded list
- get-insumos without opts returns bounded list

---

### Step 8.4 — Add descuento upper-bound validation in guardar-cliente
**Finding IDs:** W3-M6
**Target files:** `src/ipc-handlers/clientes-handlers.js`
**Problem:** `descuento` is not capped at 100, allowing negative sale totals.
**Guarantee the fix must provide:**
- `descuento` outside `[0, 100]` returns `{ success: false, message }`.
**Tests to add:**
- guardar-cliente rejects descuento: 150
- guardar-cliente rejects descuento: -5
- guardar-cliente accepts descuento: 100

---

### Step 8.5 — Add field allowlist to guardar-proveedor
**Finding IDs:** W3-M7
**Target files:** `src/ipc-handlers/proveedores-handlers.js`
**Problem:** `proveedor.update(proveedorData)` passes the full renderer object to the ORM.
**Guarantee the fix must provide:**
- Only allowed fields (`nombreEmpresa`, `telefono`, `email`, `direccion`, `cuit`, `contacto`, `notas`) are forwarded.
- `deuda`, `createdAt`, and other protected fields are stripped.
**Tests to add:**
- guardar-proveedor cannot overwrite deuda via payload injection

---

## SHORT-TERM (important but not immediate)

### Step 8.6 — Add date validation to dashboard and reportes handlers
**Finding IDs:** W3-M4, W3-M5
**Target files:** `src/ipc-handlers/dashboard-handlers.js`, `src/ipc-handlers/registerReportesHandlers.js`
**Problem:** Invalid date strings produce `Invalid Date` (NaN), causing silent wrong results.
**Guarantee the fix must provide:**
- `isNaN(startDate.getTime())` or `isNaN(endDate.getTime())` returns `{ success: false, message: "Fechas inválidas." }`.
**Tests to add:**
- get-dashboard-stats with garbage dates returns success:false
- get-rentabilidad-report with garbage dates returns success:false

---

### Step 8.7 — Validate montoInicial >= 0 in abrir-caja
**Finding IDs:** W3-L6
**Target files:** `src/ipc-handlers/caja-handlers.js`
**Problem:** `Number(-500)` is truthy, bypassing the `|| 0` coercion, allowing negative opening balances.
**Guarantee the fix must provide:**
- `montoInicial < 0` returns `{ success: false, message: "El monto inicial no puede ser negativo." }`.
**Tests to add:**
- abrir-caja rejects negative montoInicial
- abrir-caja accepts montoInicial: 0

---

### Step 8.8 — Add InsumoDepartamentoId existence check in guardar-insumo-familia
**Finding IDs:** W3-L4
**Target files:** `src/ipc-handlers/insumos-handlers.js`
**Problem:** FK error produces generic misleading message when dept doesn't exist.
**Guarantee the fix must provide:**
- `InsumoDepartamento.findByPk(depId)` returns null → `{ success: false, message: "El departamento de insumo no existe." }`.
**Tests to add:**
- guardar-insumo-familia with invalid depId returns clear error

---

## BACKLOG (low severity / cosmetic)

### Step 8.9 — Fix totalGastosFijos date filter in dashboard
**Finding IDs:** W3-L5
**Target files:** `src/ipc-handlers/dashboard-handlers.js`
**Problem:** `GastoFijo.sum("monto")` ignores the selected period.
**Guarantee the fix must provide:**
- `GastoFijo.sum("monto", { where: { createdAt: { [Op.gte]: startDate, [Op.lte]: endDate } } })` — same date window as other queries.
**Tests to add:**
- (covered implicitly — no regression test needed for cosmetic fix)

### Step 8.10 — HTML-escape product data in generar-vista-impresion
**Finding IDs:** W3-M8
**Target files:** `src/ipc-handlers/etiquetas-handlers.js`
**Problem:** Product names/codes injected raw into HTML.
**Guarantee the fix must provide:**
- A simple `escapeHtml()` helper strips `<`, `>`, `"`, `&`, `'` before interpolation.
**Tests to add:**
- (handler opens a BrowserWindow — not easily testable in Node-only runner; fix verified by code review)
