# Refactor Plan — Wave 2

**Based on:** `docs/audit/wave-2-audit.md` — formal audit passes 2–6  
**Date:** 2026-04-08  
**Findings source:** 9 HIGH · 20+ MEDIUM across `session-handlers.js`, `admin-handlers.js`, `mercadoPago-handlers.js`, `compras-handlers.js`, `config-handlers.js`

> Fixes are ordered by dependency and business risk, not by file.  
> A step earlier in the list may be required for a later step to be meaningful.  
> No code is written here — this is a specification for implementation.

---

## Objective

Close the confirmed HIGH and critical MEDIUM findings from Wave 2 across five handler files. The core problems are:

1. **Session state is not cleared on logout** — the actual logout code path skips `activeUserId = null`.
2. **No server-side authorization** — any authenticated renderer can invoke user management, purchase registration, and global config mutation.
3. **Global financial rate multipliers accept arbitrary values** — `config_recargo_credito` and `config_descuento_efectivo` can be set to any float, corrupting every subsequent sale total.
4. **Product prices are permanently writable from a purchase payload** — `actualizarPrecioVenta: true` from any renderer overwrites `Producto.precioVenta` without bounds or ownership check.
5. **MP refund sends a full-refund request when `amount` is falsy** — `amount: 0` or `amount: null` triggers `{}` body → full refund on any payment ID.
6. **MP credentials flow into the renderer on every page load** — `get-user-session` and `get-admin-config` return `mp_access_token` to all authenticated sessions.

---

## Scope

**In scope:**

| File | Finding IDs addressed |
|---|---|
| `src/ipc-handlers/session-handlers.js` | SES-H1, SES-M1, SES-M2, SES-L1, SES-L2, SES-L3 |
| `src/ipc-handlers/admin-handlers.js` | ADMIN-H1, ADMIN-M1, ADMIN-M2, ADMIN-M3, ADMIN-M4, ADMIN-L1, ADMIN-L2, ADMIN-L3, ADMIN-L4 |
| `src/ipc-handlers/mercadoPago-handlers.js` | MP-H1, MP-H2, MP-H3, MP-H4, MP-M1, MP-M2, MP-M3, MP-M4, MP-M5 |
| `src/ipc-handlers/compras-handlers.js` | COMP-H1, COMP-H2, COMP-M1, COMP-M2, COMP-L1, COMP-L2 |
| `src/ipc-handlers/config-handlers.js` | CONFIG-H1, CONFIG-M1, CONFIG-M2, CONFIG-M3, CONFIG-L1, CONFIG-L2 |
| `main.js` | SES-H1 (dead logout listener) |
| `src/database/models/Usuario.js` | SES-M2, CONFIG-H1 (field validation) |

**Out of scope for this plan:**

- Wave 1 findings (tracked in `refactor-plan.md`)
- `dashboard-handlers.js`, `registerReportesHandlers.js` — period-filter bugs (MEDIUM, tracked for Wave 2 continuation)
- `ctascorrientes-handlers.js`, `clientes-handlers.js`, `proveedores-handlers.js` — recon-level findings (not yet formally audited)
- Renderer-side code (HTML/JS files)

---

## Immediate Phase

**Goal:** Close findings that corrupt data or bypass authentication in the current production path. Each step here is independent enough to be deployed individually.

---

### I-1 — Fix session invalidation on logout

**Finding IDs:** SES-H1, SES-L2  
**Target files:** `main.js`, `src/ipc-handlers/session-handlers.js`

**Problem:**  
`ipcMain.on("logout", handleLogout)` in `main.js` (the actual logout path, triggered by the renderer's `send("logout")`) closes windows but never sets `activeUserId = null`. The correct implementation in `ipcMain.handle("logout")` in `session-handlers.js` is unreachable dead code — `"logout"` is absent from `validInvokeChannels`, so `invoke("logout")` is blocked by the preload bridge.

**Guarantee the fix must provide:**  
After every logout — regardless of which IPC mechanism triggers it — `activeUserId` must be `null` before the login window is displayed. `get-user-session` called immediately after logout must return `null`.

**Implementation constraint:**  
`activeUserId` is a module-level variable inside `session-handlers.js`. `handleLogout` in `main.js` has no access to it. The fix must either:  
- Export a `clearSession()` function from `session-handlers.js` and call it from `handleLogout`, or  
- Move all logout logic into `session-handlers.js` and register a single `ipcMain.on("logout")` there, removing the duplicate `ipcMain.handle("logout")`.

Do not add `"logout"` to `validInvokeChannels` without also removing the `ipcMain.on("logout")` registration — that would create a third code path.

**No migration required.**

**Tests to add (`tests/run-phase-7.js`):**
- After simulating a logout signal, `get-user-session` returns `null`
- After logout then re-login with different credentials, `get-user-session` returns the new user's ID
- Verifying `activeUserId` is null between sessions

---

### I-2 — Add range validation to `config_recargo_credito` and `config_descuento_efectivo`

**Finding IDs:** CONFIG-H1  
**Target files:** `src/ipc-handlers/config-handlers.js`, `src/database/models/Usuario.js`

**Problem:**  
`save-general-config` stores `data?.recargoCredito ?? 0` and `data?.descuentoEfectivo ?? 0` without bounds. These floats are read by `ventas-handlers.js` on every sale and applied as percentage multipliers to `totalFinal`. A value of `150` for `descuentoEfectivo` produces negative `Venta.total`. Values are unconstrained at handler level, ORM level, and DB level.

**Guarantee the fix must provide:**  
- `config_recargo_credito` must be rejected if not in the range `[0, 100]` (inclusive). A 100% credit surcharge is the maximum defensible business value.
- `config_descuento_efectivo` must be rejected if not in the range `[0, 100]` (inclusive).
- Values outside range must cause `save-general-config` to return `{ success: false, message: "..." }` without writing to DB.
- The ORM must also validate these bounds via `validate: { min: 0, max: 100 }` on both fields in `Usuario.js` as defense-in-depth.

**Note:** If a business legitimately requires surcharges or discounts above 100%, the plan must be reviewed before setting the cap. The 100% ceiling is the default safe bound and must be explicitly documented.

**Migration required?** Yes — adding `validate` to the ORM model does not alter the DB schema. However, if DB-level CHECK constraints are desired for defense-in-depth, a migration adding `CHECK (config_recargo_credito BETWEEN 0 AND 100)` and `CHECK (config_descuento_efectivo BETWEEN 0 AND 100)` to the `Usuario` table must be written. DB-level CHECK is not strictly required for the fix to be effective.

**Tests to add:**
- `save-general-config` with `recargoCredito: -1` → `{ success: false }`
- `save-general-config` with `recargoCredito: 101` → `{ success: false }`
- `save-general-config` with `descuentoEfectivo: 150` → `{ success: false }`
- `save-general-config` with `recargoCredito: 100, descuentoEfectivo: 0` → `{ success: true }` (boundary)
- `save-general-config` with `recargoCredito: 0, descuentoEfectivo: 100` → `{ success: true }` (boundary)

---

### I-3 — Guard `actualizarPrecioVenta` with server-side price verification

**Finding IDs:** COMP-H2  
**Target files:** `src/ipc-handlers/compras-handlers.js`

**Problem:**  
When `it.actualizarPrecioVenta === true` in a purchase item, `Producto.update({ precioVenta: toNum(it.nuevoPrecioVenta) }, ...)` runs inside the transaction with no upper bound, no comparison against the current price, and no comparison against `costoUnitario`. A renderer can set any product's `precioVenta` to any positive value via a purchase payload.

**Guarantee the fix must provide:**  
- `nuevoPrecioVenta` must be validated server-side before writing. At minimum: `nuevoPrecioVenta > 0` (already present) AND `nuevoPrecioVenta >= costoUnitario` (sale price must not be below purchase cost) AND `nuevoPrecioVenta <= some_ceiling` (to be determined by business rules, e.g., `100 * costoUnitario` or a configurable max).
- The product must be fetched from the DB within the transaction to verify it exists before allowing a price update. The current code uses `Producto.increment` (which verifies existence via `affectedRows`) for stock, but the price `Producto.update` does not check `affectedRows`.
- If `affectedRows === 0` for the price update, the transaction must roll back with an error.

**Alternative design (must be evaluated during implementation):** Remove `actualizarPrecioVenta` from the purchase flow entirely and require price updates through the dedicated `guardar-producto` handler, which has more validation. If the business requires inline price updates at purchase time, the field allowlist and bounds must be explicit.

**No migration required.**

**Tests to add:**
- Purchase with `actualizarPrecioVenta: true, nuevoPrecioVenta: 0.001` on a $100 product → rejected or bounded
- Purchase with `actualizarPrecioVenta: true, nuevoPrecioVenta: 999999` → rejected or bounded
- Purchase with `actualizarPrecioVenta: true, nuevoPrecioVenta: costoUnitario + 10` → accepted, `precioVenta` updated correctly
- Purchase with `actualizarPrecioVenta: false` → `precioVenta` unchanged in DB

---

### I-4 — Reject falsy `amount` in `mp:refund-payment` before calling MP API

**Finding IDs:** MP-H3  
**Target files:** `src/ipc-handlers/mercadoPago-handlers.js`

**Problem:**  
```js
const body = amount ? { amount: Number(amount) } : {};
```
When `amount` is `0`, `null`, or `undefined`, `body = {}`. Posting `{}` to `POST /v1/payments/{id}/refunds` triggers a full refund on the MP API. There is no ownership check between `paymentId` and any local `Venta` record.

**Guarantee the fix must provide:**  
- If `amount` is falsy (including `0`), the handler must return `{ ok: false, error: "amount must be a positive number" }` without making any API call.
- `Number(amount) > 0` must be explicitly validated before constructing the body.
- A partial-refund path (when `amount` is a valid positive number) remains functional.

**Note on ownership check:** Verifying `paymentId` against a local `Venta` record requires a DB lookup and may have performance implications. This ownership check is desirable (prevents refunds on payments from other sessions) but is not required for the Immediate phase — the `amount > 0` guard closes the full-refund-on-zero-amount risk independently. Ownership verification can be added in the Short-term phase.

**No migration required.**

**Tests to add:**
- `mp:refund-payment` with `{ paymentId: "123", amount: 0 }` → `{ ok: false }`, no API call made (mock `doFetch`)
- `mp:refund-payment` with `{ paymentId: "123", amount: null }` → `{ ok: false }`, no API call
- `mp:refund-payment` with `{ paymentId: "123", amount: -50 }` → `{ ok: false }`, no API call
- `mp:refund-payment` with `{ paymentId: "123", amount: 100 }` → proceeds to API call with `{ amount: 100 }`

---

## Short-Term Phase

**Goal:** Close the authorization gap and credential exposure chain. These require coordination across multiple files and carry slightly more implementation risk than the Immediate phase.

---

### S-1 — Establish server-side role authorization on all admin handlers

**Finding IDs:** ADMIN-H1, COMP-M2  
**Target files:** `src/ipc-handlers/admin-handlers.js`, `src/ipc-handlers/compras-handlers.js`, `src/ipc-handlers/session-handlers.js`

**Problem:**  
`save-user`, `delete-user`, `save-empleado`, `delete-empleado`, `save-gasto-fijo`, `delete-gasto-fijo`, `test-print`, `imprimir-ticket` — none check the caller's session role. `activeUserId` in `session-handlers.js` is never imported by `admin-handlers.js`. Any authenticated renderer can invoke any of these handlers.

**Guarantee the fix must provide:**  
- `session-handlers.js` must export a function (e.g., `getActiveUserId()` or `getActiveUserRole(models)`) that `admin-handlers.js` and other handlers can call to read the current session state.
- Admin-only handlers (`save-user`, `delete-user`, and all employee/expense management) must verify that the active session user has `rol === "administrador"` before executing any DB operation. A non-admin caller receives `{ success: false, message: "Acceso denegado." }`.
- `rol` in `save-user` must be validated against an explicit allowlist of valid role strings before writing to DB. Invalid strings must be rejected.

**Dependency:** Requires I-1 (session invalidation) to be correct first — the role check is only trustworthy once `activeUserId` is reliably cleared on logout.

**Design note:** The exported function should resolve the active user's role from DB (via `Usuario.findByPk(activeUserId, { attributes: ['rol'] })`) rather than caching the role in a second module-level variable — avoids stale state if a role is changed while a session is active.

**No migration required.**

**Tests to add:**
- Simulate a non-admin session; call `save-user` → `{ success: false }`, no user created
- Simulate a non-admin session; call `delete-user` → `{ success: false }`, no user deleted
- Simulate an admin session; call `save-user` with valid data → `{ success: true }`
- `save-user` with `rol: "superadmin"` (not in allowlist) → `{ success: false }`
- `save-user` with `rol: "administrador"` by admin → `{ success: true }` (allowed)
- `save-user` with `rol: "administrador"` by non-admin session → `{ success: false }` (denied before role check)

---

### S-2 — Replace renderer-supplied `UsuarioId` in purchases with session-derived ID

**Finding IDs:** COMP-H1  
**Target files:** `src/ipc-handlers/compras-handlers.js`

**Problem:**  
Both `registrar-compra-producto` and `registrar-compra-insumos` destructure `UsuarioId` from the renderer payload and store it verbatim. Attribution of purchases is fully renderer-controlled.

**Guarantee the fix must provide:**  
- `UsuarioId` must be read from the active session state (`getActiveUserId()` from S-1's exported function), not from the renderer payload.
- Even if the renderer payload includes a `UsuarioId` field, it must be ignored.
- If `getActiveUserId()` returns `null` (no active session), the handler must return `{ success: false, message: "Sesión no activa." }` without beginning the transaction.

**Dependency:** Requires S-1's `getActiveUserId()` export from `session-handlers.js`.

**No migration required.**

**Tests to add:**
- Purchase payload includes `UsuarioId: "fake-uuid"` → stored `Compra.UsuarioId` equals the session user's actual ID, not `"fake-uuid"`
- Purchase with no active session (`activeUserId = null`) → `{ success: false }`, no Compra created
- Purchase by a valid session → `Compra.UsuarioId` matches `activeUserId`

---

### S-3 — Strip `mp_access_token` and sensitive fields from `get-user-session` and `get-admin-config` responses

**Finding IDs:** SES-M2, ADMIN-M4, CONFIG-M2  
**Target files:** `src/ipc-handlers/session-handlers.js`, `src/ipc-handlers/config-handlers.js`, `src/database/models/Usuario.js`

**Problem:**  
`get-user-session` uses `attributes: { exclude: ['password'] }` — every other field including `mp_access_token`, `mp_user_id`, `mp_pos_id`, and all config JSON blobs is returned to the renderer. `get-admin-config` has the same gap. `navbar-loader.js` stores the full result in `window.APP_SESSION`, exposing the live MP token to all authenticated renderer contexts via a global variable.

**Guarantee the fix must provide:**  
- `get-user-session` must exclude at minimum: `password`, `mp_access_token`, `mp_user_id`, `mp_pos_id`. Only fields legitimately needed by the renderer (e.g., `id`, `nombre`, `rol`, `permisos`) should be in the response.
- `get-admin-config` must exclude the same credential fields. It may return config fields (`config_recargo_credito`, `config_descuento_efectivo`, `nombre_negocio`, `logo_url`, etc.) since those are needed for UI rendering, but not the MP integration fields.
- Define an explicit allowlist of returned fields for both handlers rather than using `exclude` (which silently returns new fields added to the model).

**Design note:** Both handlers currently use `attributes: { exclude: [...] }`. The fix should switch to `attributes: { include: [...explicit list...] }` (or Sequelize's `attributes: ['id', 'nombre', 'rol', ...]` array form) to prevent future model additions from being automatically exposed.

**No migration required.**

**Tests to add:**
- `get-user-session` response does not contain `mp_access_token`
- `get-user-session` response does not contain `password`
- `get-admin-config` response does not contain `mp_access_token`
- `get-admin-config` response contains `config_recargo_credito`, `nombre_negocio` (UI-required fields remain)
- After S-3, `window.APP_SESSION.user.mp_access_token` is `undefined` (renderer-side test)

---

### S-4 — Fix `get-mp-pos-list` to use stored credentials, not renderer-supplied token

**Finding IDs:** MP-H1  
**Target files:** `src/ipc-handlers/mercadoPago-handlers.js`

**Problem:**  
`get-mp-pos-list` is the only handler in the file that does not call `resolveActiveMpContext`. It accepts `accessToken` directly from the renderer IPC payload and uses it to authenticate against the MP POS API. Any token can be used through this handler.

**Guarantee the fix must provide:**  
- `get-mp-pos-list` must call `resolveActiveMpContext(models)` and use the returned `accessToken`.
- The renderer-supplied `accessToken` parameter must be ignored.
- If `resolveActiveMpContext` returns `{ ok: false }`, the handler returns the error without making any API call.

**No migration required.**

**Tests to add:**
- `get-mp-pos-list` with renderer-supplied `accessToken: "fake-token"` → uses stored DB token, not the fake (verifiable by mocking `resolveActiveMpContext`)
- `get-mp-pos-list` with no stored token → `{ success: false, message: "Access Token no configurado." }`

---

### S-5 — Add field allowlist to `mp:create-preference`

**Finding IDs:** MP-H2  
**Target files:** `src/ipc-handlers/mercadoPago-handlers.js`

**Problem:**  
`JSON.stringify(preference || {})` sends the full renderer-supplied `preference` object to the MP Checkout Preferences API. Fields including `notification_url`, `marketplace_fee`, `differential_pricing`, and `back_urls` can be set by the renderer to arbitrary values.

**Guarantee the fix must provide:**  
- The `preference` object must be reconstructed server-side using only an explicit allowlist of permitted fields.
- At minimum: `{ title, description, items, external_reference, total_amount }`.
- Fields that should never be renderer-controlled — `notification_url`, `marketplace_fee`, `differential_pricing`, `sponsor_id`, `marketplace` — must be excluded from the forwarded body regardless of renderer input.
- If `notification_url` is a legitimate business requirement, it must be read from the stored admin configuration, not from the renderer payload.

**No migration required.**

**Tests to add:**
- `mp:create-preference` with `preference` containing `marketplace_fee: 999` → forwarded body does not contain `marketplace_fee`
- `mp:create-preference` with `preference` containing `notification_url: "http://evil.com"` → forwarded body does not contain that URL
- `mp:create-preference` with valid `items` and `total_amount` → forwarded correctly

---

### S-6 — Add field allowlist to `mp:search-payments`

**Finding IDs:** MP-H4  
**Target files:** `src/ipc-handlers/mercadoPago-handlers.js`

**Problem:**  
`_internal_searchPayments(models, query)` passes the full renderer `query` object to `new URLSearchParams(query)`. Any MP Payments Search API parameter can be injected by the renderer, including `collector.id` and `payer.id`.

**Guarantee the fix must provide:**  
- The `query` object from the renderer must be filtered to an explicit allowlist before being passed to `_internal_searchPayments`.
- Permitted parameters: `status`, `begin_date`, `end_date`, `external_reference`, `sort`, `criteria`, `limit`, `offset`.
- Denied parameters: `collector.id`, `payer.id`, `sponsor_id`, `merchant_order_id`, `processing_mode`, and any other parameter not in the allowlist.
- The allowlist must also apply to `get-mp-transactions` which calls `_internal_searchPayments` internally with its own hardcoded params — verify those are safe.

**No migration required.**

**Tests to add:**
- `mp:search-payments` with `query: { "collector.id": "12345" }` → forwarded URL params do not contain `collector.id`
- `mp:search-payments` with `query: { status: "approved" }` → forwarded correctly
- `mp:search-payments` with `query: { status: "approved", "payer.id": "999" }` → `payer.id` stripped

---

## Backlog

**Goal:** Harden code quality, remove latent risks, and close MEDIUM/LOW findings that do not require immediate deployment.

---

### B-1 — Replace `bcrypt` (native) with `bcryptjs` (pure JS) in all handlers

**Finding IDs:** ADMIN-M3, CONFIG-M1  
**Target files:** `src/ipc-handlers/admin-handlers.js`, `src/ipc-handlers/config-handlers.js`

**Problem:**  
Both files import `bcrypt` (native C++ addon) for password hashing. `src/database/models/Usuario.js` imports `bcryptjs` for verification. Both produce cross-compatible `$2b$` hashes — no functional login bug. But the native `bcrypt` binary must be compiled for the Electron ABI via `electron-rebuild`. If not run, both handler modules fail to load, silently unregistering all admin and config handlers.

**Guarantee the fix must provide:**  
- Replace `require("bcrypt")` with `require("bcryptjs")` in both files.
- Verify `bcryptjs` is in `package.json` dependencies (it already is, as `bcryptjs: ^3.0.3`).
- Remove `bcrypt` (native) from dependencies if it is no longer referenced anywhere.

**No migration required.** Existing password hashes remain valid — `bcryptjs.compare` can verify hashes created by either library.

**Tests to update:**
- Ensure existing `save-user` / `login-attempt` test cycle still passes after the swap (password created by `bcryptjs` verified by `bcryptjs`).

---

### B-2 — HTML-escape `printerName` and `recibo` in print handlers

**Finding IDs:** ADMIN-M1, ADMIN-M2  
**Target files:** `src/ipc-handlers/admin-handlers.js`

**Problem:**  
`test-print` injects `${printerName}` directly into a `data:text/html,` URL. `imprimir-ticket` injects `${recibo}` raw into a `<pre>` element inside the HTML string before `encodeURIComponent` is applied. HTML metacharacters in either value are interpreted as markup.

**Guarantee the fix must provide:**  
- `printerName` must be HTML-escaped before template-string insertion (escape `&`, `<`, `>`, `"`, `'`).
- `recibo` must be HTML-escaped before insertion into the `<pre>` element.
- The escaping must happen server-side in `admin-handlers.js`, not rely on renderer-side sanitization.
- A plain-text receipt containing `&`, `<`, or `>` (e.g., product named `"AT&T"`) must render correctly on the printed ticket after the fix.

**No migration required.**

**Tests to add:**
- `imprimir-ticket` with `recibo: "<script>alert(1)</script>"` → printed HTML does not contain `<script>` tag (mock `ticketWin.loadURL` and inspect the argument)
- `imprimir-ticket` with `recibo: "AT&T - $100"` → printed HTML renders `AT&amp;T - $100` inside `<pre>` (functional correctness)
- `test-print` with `printerName: "<img onerror=x>"` → printed HTML does not contain `<img` tag

---

### B-3 — Add `descuento <= subtotal` validation in purchase handlers

**Finding IDs:** COMP-M1  
**Target files:** `src/ipc-handlers/compras-handlers.js`

**Problem:**  
`descuento` from `pago?.descuento` can exceed `subtotal`, producing a negative `totalCompra` committed to `Compra.total`.

**Guarantee the fix must provide:**  
- After computing `subtotal` and `descuento`, validate `descuento <= subtotal`. If not, throw an error that triggers rollback.
- `totalCompra` must be `>= 0` before committing. Add a `totalCompra >= 0` guard as final defense.
- `recargo` must also be validated as `>= 0` (negative recargo silently reduces the total).

**No migration required.**

**Tests to add:**
- Purchase with `pago.descuento: 10000` on a $100 subtotal → `{ success: false }`, no Compra created
- Purchase with `pago.recargo: -500` → `{ success: false }`
- Purchase with valid `pago.descuento: 10` on a $100 subtotal → `{ success: true }`, `total = 90`

---

### B-4 — Add attempt cooldown to `login-attempt`

**Finding IDs:** SES-M1  
**Target files:** `src/ipc-handlers/session-handlers.js`

**Problem:**  
No rate limiting exists on `login-attempt`. Sequential or parallel brute-force attempts are unrestricted. The natural bcrypt delay (~100ms) is insufficient when calls are parallelized.

**Guarantee the fix must provide:**  
- After N consecutive failed attempts for the same `loginName` within a time window, subsequent attempts must be delayed or rejected for T seconds.
- Suggested values: after 5 failures within 60 seconds, impose a 30-second lockout.
- The counter must be in-memory (per main-process run) — no DB persistence required. On app restart the counter resets.
- Successful login clears the counter for that username.

**No migration required.**

**Tests to add:**
- 6 consecutive failed attempts → 6th attempt returns `{ success: false, message: "..." }` with delay indication or locked message
- Successful login after 4 failures clears counter → subsequent failure does not immediately lock

---

### B-5 — Remove production debug logs from `mercadoPago-handlers.js`

**Finding IDs:** MP-M2  
**Target files:** `src/ipc-handlers/mercadoPago-handlers.js`

**Problem:**  
`create-mp-order` logs the full QR order body (`items`, `total_amount`, `external_reference`, `notification_url`) on every invocation. Line 225 logs `userId`, `posId`, and the token's last 4 characters on every QR creation.

**Guarantee the fix must provide:**  
- Remove all `console.log` statements from the `create-mp-order` hot path.
- Replace `console.log` boundary markers (`"============"`) with a single `console.log` on success/error at DEBUG level (or remove entirely).
- The token suffix log at line 225 must be removed.
- `console.error` for genuine error paths may remain.

**No migration required.**

**Tests to add:** None required — verify by inspection that no `console.log` fires on successful `create-mp-order` invocations.

---

### B-6 — Add timeout to `doFetch` in `mercadoPago-handlers.js`

**Finding IDs:** MP-M5  
**Target files:** `src/ipc-handlers/mercadoPago-handlers.js`

**Problem:**  
`doFetch` calls `node-fetch` with no timeout option or `AbortSignal`. A hung MP API connection blocks the IPC handler indefinitely.

**Guarantee the fix must provide:**  
- All `doFetch` calls must have a timeout of at most 15 seconds (configurable constant at the top of the file).
- After timeout, `doFetch` must return `{ ok: false, error: "Timeout: MP API no respondió." }`.
- Use `AbortController` + `setTimeout` to cancel the fetch after the timeout expires.

**No migration required.**

**Tests to add:**
- Mock `node-fetch` to simulate a hung connection → `doFetch` returns `{ ok: false }` after the timeout window

---

### B-7 — Replace blocking I/O in `save-business-info` with async; add size limit

**Finding IDs:** CONFIG-M3  
**Target files:** `src/ipc-handlers/config-handlers.js`

**Problem:**  
`fs.mkdirSync` and `fs.writeFileSync` in `save-business-info` block the main process event loop. No size limit on the logo base64 payload.

**Guarantee the fix must provide:**  
- Replace `fs.mkdirSync` with `fs.promises.mkdir({ recursive: true })`.
- Replace `fs.writeFileSync` with `fs.promises.writeFile`.
- Before decoding the base64 payload, check that `data.logoBase64.length` does not exceed a reasonable limit (e.g., `5 * 1024 * 1024 / 0.75 ≈ 6.8M` characters for a 5MB decoded size). If exceeded, return `{ success: false, message: "El logo supera el tamaño máximo permitido." }`.

**No migration required.**

**Tests to add:**
- `save-business-info` with oversized `logoBase64` → `{ success: false }`, no file written
- `save-business-info` with valid logo data → file written asynchronously, `{ success: true }`

---

### B-8 — Minor validation and consistency fixes (batched)

**Finding IDs:** ADMIN-L1, ADMIN-L2, ADMIN-L3, ADMIN-L4, COMP-L1, COMP-L2, CONFIG-L1, CONFIG-L2, MP-M3, MP-M4, SES-L1, SES-L3  
**Target files:** `admin-handlers.js`, `compras-handlers.js`, `config-handlers.js`, `mercadoPago-handlers.js`, `session-handlers.js`

These are low-risk, low-complexity fixes that can be batched in a single implementation pass:

| Sub-item | Finding | Change |
|---|---|---|
| B-8a | ADMIN-L2, CONFIG-L2 | Add minimum password length (e.g., 6 chars) to `save-user` and `submit-setup` |
| B-8b | ADMIN-L3 | Reject negative `monto` in `save-gasto-fijo` (`monto >= 0`) |
| B-8c | ADMIN-L4 | Reject negative `sueldo` in `save-empleado` (`sueldo >= 0`) |
| B-8d | ADMIN-L1 | Validate each element of `permisos` array against `get-app-modules()` known IDs |
| B-8e | COMP-L1 | Treat `costoUnitario: 0` as a warning or require explicit confirmation |
| B-8f | COMP-L2 | Add duplicate `nroFactura` detection before `Compra.create` (within the same `ProveedorId`) |
| B-8g | CONFIG-L1 | Guard `config_redondeo_automatico` write: use `{ habilitado: !!data.redondeo }` instead of `{ habilitado: data.redondeo }` |
| B-8h | MP-M3 | Add a guard to `save-mp-config` that targets a specific admin UUID rather than all admins by role |
| B-8i | MP-M4 | Fix `limit: "400"` → `limit: 300` (as integer, within MP API documented maximum); add response `total` to the return value |
| B-8j | SES-L1 | Replace `scope('withPassword')` with explicit `attributes: ['id', 'nombre_canon', 'password']` in `login-attempt` |
| B-8k | SES-L3 | Remove the `payload.username` fallback in `login-attempt` — standardize on `payload.nombre` |

**No migrations required** for any of B-8.

**Tests to add for B-8:**
- `save-gasto-fijo` with `monto: -1` → `{ success: false }`
- `save-empleado` with `sueldo: -10000` → `{ success: false }`
- `save-user` with `password: "a"` (too short) → `{ success: false }`
- `login-attempt` with `{ username: "admin" }` (not `nombre`) → should still return correct error (login fails, not crash), or reject the alias after B-8k

---

## Testing Strategy

All Wave 2 fixes must be verified via a dedicated test runner following the established pattern.

**Test file:** `tests/run-phase-7.js`  
**Runner:** Plain Node.js, no external framework  
**Database:** In-memory SQLite, reset between test groups  
**Handlers tested:** All five in-scope handlers, plus session state interactions

**Test suites:**

| Suite | Covers | Target count |
|---|---|---|
| 7.1 — Session invalidation | I-1: logout clears session, stale state prevention | 4 tests |
| 7.2 — Financial rate bounds | I-2: `config_recargo_credito` / `config_descuento_efectivo` validation | 5 tests |
| 7.3 — Purchase price guard | I-3: `actualizarPrecioVenta` with extreme values | 4 tests |
| 7.4 — Refund guard | I-4: falsy `amount` rejected before API call | 4 tests |
| 7.5 — Admin authorization | S-1: role check on admin handlers | 6 tests |
| 7.6 — Purchase attribution | S-2: `UsuarioId` from session, not renderer | 3 tests |
| 7.7 — Credential scrubbing | S-3: `mp_access_token` absent from `get-user-session` / `get-admin-config` | 4 tests |
| 7.8 — MP proxy fix | S-4/S-5/S-6: stored token used, allowlists enforced | 4 tests |
| 7.9 — bcrypt unification | B-1: password created with `bcryptjs`, verified with `bcryptjs` | 2 tests |
| 7.10 — HTML escaping | B-2: injected HTML neutralized in print handlers | 3 tests |
| 7.11 — Purchase totals | B-3: negative total rejected | 3 tests |
| 7.12 — Regression | All prior phase tests still pass | full suite |

**MP API calls:** Mock `doFetch` (or `node-fetch`) to return controlled responses — tests must not call the real MP API.

**Minimum pass criteria:** All suites 100% green before any Immediate phase change is merged.

**Package.json addition:**
```json
"test:phase7": "node tests/run-phase-7.js"
```

---

## Execution Order

```
I-1 → I-2 → I-3 → I-4
          ↓
         S-1 → S-2 → S-3 → S-4 → S-5 → S-6
                              ↓
                    B-1 → B-2 → B-3 → B-4 → B-5 → B-6 → B-7 → B-8
```

**Strict ordering within Immediate:**  
I-1 must be first — fixing the logout path makes the session state trustworthy for all subsequent checks. I-2, I-3, I-4 are independent of each other and can be implemented in parallel once I-1 is complete.

**Strict ordering within Short-term:**  
S-1 (authorization + `getActiveUserId` export) must precede S-2 (attribution) — S-2 depends on the function exported by S-1. S-3 through S-6 are independent of each other and can be implemented in parallel.

**Backlog items are independent** of each other (except B-1 must precede any further bcrypt testing).

---

## Dependencies / Notes

### Session export function (required by S-1 and S-2)

`session-handlers.js` currently exports only `{ registerSessionHandlers }`. S-1 requires adding an exported function to read the active session role. This function will be called from `admin-handlers.js` (S-1) and `compras-handlers.js` (S-2). Consider:

```js
// session-handlers.js — proposed export shape (not yet implemented)
module.exports = {
  registerSessionHandlers,
  getActiveUserId: () => activeUserId,
};
```

`admin-handlers.js` and `compras-handlers.js` would then require and call `getActiveUserId()` directly. The role lookup (`Usuario.findByPk(id, { attributes: ['rol'] })`) happens inside each handler's execution — not in a shared cache — to avoid stale role data.

### `bcrypt` package removal

After B-1, verify `bcrypt` (the native package) is no longer required anywhere in the codebase:
```bash
grep -r "require('bcrypt')" src/ main.js --include="*.js"
```
Only if the grep returns zero results should `bcrypt` be removed from `package.json` and `node_modules`. `bcryptjs` must remain.

### No DB migrations required for Immediate or Short-term phases

All Immediate and Short-term fixes are code-only. The optional DB-level CHECK constraint for CONFIG-H1 (I-2) may be added as a migration later but is not required for the fix to be effective — ORM-level `validate: { min: 0, max: 100 }` is enforced before SQL execution.

### Wave 1 refactor plan interaction

Wave 2 fixes are additive — they do not conflict with Wave 1 fixes already deployed (Phase 1–6). Specifically:
- I-3 (`actualizarPrecioVenta`) interacts with the existing `guardar-producto` price validation (Phase 6, L-2). Ensure the same `precio_oferta < precioVenta` invariant is checked after any price update via the purchase path.
- S-1 (authorization) must not break the `delete-user` last-admin guard already implemented in `admin-handlers.js:100–104`.

### Preload channel cleanup (deferred)

`renderer/preload.js` has a duplicate `"guardar-familia"` entry and lists `"registrar-venta-y-facturar"` which has no handler. These are LOW-risk gaps that should be cleaned up but do not block any finding in this plan. Schedule cleanup alongside or after Short-term phase.
