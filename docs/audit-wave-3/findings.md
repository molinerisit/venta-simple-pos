# Wave 3 Audit Findings

> Scope: handler files NOT covered in Wave 1 or Wave 2.
> Wave 1/2 covered: session-handlers, admin-handlers, config-handlers, compras-handlers, mercadoPago-handlers.

---

## HIGH Severity

### W3-H1 — get-clientes returns ALL records with no limit (clientes-handlers.js:12)
**File:** `src/ipc-handlers/clientes-handlers.js`, line 12
**Problem:** `Cliente.findAll()` with no `limit`. On large datasets loads all customer PII into memory in one shot.
**Risk:** Memory exhaustion / full table dump to renderer.

### W3-H2 — get-proveedores returns ALL records with no limit (proveedores-handlers.js:10)
**File:** `src/ipc-handlers/proveedores-handlers.js`, line 10
**Problem:** `Proveedor.findAll()` with no `limit`.
**Risk:** Memory exhaustion on large supplier catalogues.

### W3-H3 — get-proveedores-con-deuda has no limit (ctascorrientes-handlers.js:34)
**File:** `src/ipc-handlers/ctascorrientes-handlers.js`, line 34
**Problem:** `Proveedor.findAll({ where: { deuda > 0 } })` with no `limit`.
**Risk:** Unbounded query / memory pressure.

### W3-H4 — guardar-insumo spreads raw renderer payload without allowlist (insumos-handlers.js:54)
**File:** `src/ipc-handlers/insumos-handlers.js`, line 54
**Problem:** `const payload = { ...data, nombre }` then `Insumo.update(payload)` / `Insumo.create(payload)`. Renderer can inject any field (id, createdAt, activo, ProveedorId).
**Risk:** Mass-assignment vulnerability.

### W3-H5 — guardar-insumo update silently ignores affectedRows=0 (insumos-handlers.js:55)
**File:** `src/ipc-handlers/insumos-handlers.js`, line 55
**Problem:** `Insumo.update(payload, { where: { id: payload.id } })` — if row doesn't exist, returns `{ success: true }` silently.
**Risk:** Silent no-op masquerades as success.

### W3-H6 — registrar-pago-cliente and registrar-abono-proveedor have no session check (ctascorrientes-handlers.js:65,110)
**File:** `src/ipc-handlers/ctascorrientes-handlers.js`, lines 65 and 110
**Problem:** Both handlers modify financial balances based on renderer-supplied IDs without verifying an active session exists.
**Risk:** Unauthenticated financial mutation.

### W3-H7 — abrir-caja accepts renderer-supplied usuarioId written to UsuarioId column (caja-handlers.js:99)
**File:** `src/ipc-handlers/caja-handlers.js`, line 99
**Problem:** `UsuarioId: usuarioId` taken directly from renderer payload. Any caller can open a cash drawer attributed to any user.
**Risk:** Audit log tampering.

### W3-H8 — get-ventas-con-factura returns all facturadas with no limit (facturacion-handlers.js:14)
**File:** `src/ipc-handlers/facturacion-handlers.js`, line 14
**Problem:** `Venta.findAll({ where: { facturada: true } })` with no limit/offset.
**Risk:** Memory pressure; increasingly slow as history grows.

---

## MEDIUM Severity

### W3-M1 — get-insumos has no result limit (insumos-handlers.js:11)
**File:** `src/ipc-handlers/insumos-handlers.js`, line 11
**Problem:** `Insumo.findAll()` returns all rows when filtro is absent.

### W3-M2 — get-ventas has no default page size (ventas-handlers.js:186)
**File:** `src/ipc-handlers/ventas-handlers.js`, line 186
**Problem:** When limit/offset both absent, `Venta.findAll()` with full includes scans every sale ever registered.
**Risk:** Very expensive unbounded query on large installations.

### W3-M3 — get-data-for-seleccion returns ALL products with no limit (etiquetas-handlers.js:21)
**File:** `src/ipc-handlers/etiquetas-handlers.js`, line 21
**Problem:** `Producto.findAll()` with no limit.

### W3-M4 — dashboard-handlers accepts dates without isNaN validation (dashboard-handlers.js:9-12)
**File:** `src/ipc-handlers/dashboard-handlers.js`, lines 9-12
**Problem:** `new Date(dateFrom)` produces `Invalid Date` on garbage input; all subsequent Op.gte/lte receive NaN.
**Risk:** Silent incorrect statistics.

### W3-M5 — registerReportesHandlers accepts dates without validation (registerReportesHandlers.js:10-13)
**File:** `src/ipc-handlers/registerReportesHandlers.js`, lines 10-13
**Problem:** Same as W3-M4.

### W3-M6 — guardar-cliente allows descuento > 100 with no upper bound (clientes-handlers.js:81)
**File:** `src/ipc-handlers/clientes-handlers.js`, line 81
**Problem:** `descuento` has no max validation. A renderer can set 200, producing negative sale totals.
**Risk:** Financial integrity.

### W3-M7 — guardar-proveedor passes raw proveedorData to proveedor.update() (proveedores-handlers.js:58)
**File:** `src/ipc-handlers/proveedores-handlers.js`, line 58
**Problem:** Entire renderer payload forwarded; renderer can inject deuda, createdAt, etc.
**Risk:** Mass-assignment on proveedor model.

### W3-M8 — generar-vista-impresion injects product data into HTML without escaping (etiquetas-handlers.js:132)
**File:** `src/ipc-handlers/etiquetas-handlers.js`, line 132
**Problem:** `${p.nombre}`, `${getCodigo(p)}` templated into HTML without escaping. Product names with `<script>` would be injected.
**Risk:** Stored XSS in print BrowserWindow.

---

## LOW Severity

### W3-L1 — get-clientes error returns [] not {success,message} (clientes-handlers.js:18)
**File:** `src/ipc-handlers/clientes-handlers.js`, line 18
**Problem:** Inconsistent error shape.

### W3-L2 — get-proveedores error returns [] not {success,message} (proveedores-handlers.js:10)
**File:** `src/ipc-handlers/proveedores-handlers.js`, line 10
**Problem:** Inconsistent error shape.

### W3-L3 — get-insumos error returns [] not {success,message} (insumos-handlers.js:28)
**File:** `src/ipc-handlers/insumos-handlers.js`, line 28
**Problem:** Inconsistent error shape.

### W3-L4 — guardar-insumo-familia does not validate InsumoDepartamentoId exists (insumos-handlers.js:106)
**File:** `src/ipc-handlers/insumos-handlers.js`, line 106
**Problem:** FK error produces generic misleading message.

### W3-L5 — dashboard totalGastosFijos ignores date filter (dashboard-handlers.js:211)
**File:** `src/ipc-handlers/dashboard-handlers.js`, line 211
**Problem:** `GastoFijo.sum("monto")` sums all time, not the selected period.
**Risk:** Incorrect P&L in dashboard.

### W3-L6 — abrir-caja does not validate montoInicial >= 0 (caja-handlers.js:99)
**File:** `src/ipc-handlers/caja-handlers.js`, line 99
**Problem:** `Number(-500)` is truthy, so `|| 0` coercion does not kick in. Negative opening balance stored.

### W3-L7 — registrar-pago-cliente concepto field has no length bound (ctascorrientes-handlers.js:86)
**File:** `src/ipc-handlers/ctascorrientes-handlers.js`, line 86
**Problem:** Arbitrarily large concepto string can be stored.

### W3-L8 — etiquetas generar-vista-impresion does not validate config.modo (etiquetas-handlers.js:115)
**File:** `src/ipc-handlers/etiquetas-handlers.js`, line 115
**Problem:** Unknown config.modo produces empty HTML but still opens a BrowserWindow.
