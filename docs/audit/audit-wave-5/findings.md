# Audit Findings — Wave 5
## ERP Retail: Hybrid Inventory · Speed/Scale UX · Operational UI · Business Model & Cash

**Date:** 2026-04-10
**Auditor role:** Senior ERP Consultant — Retail & Consumo Masivo
**Scope:** 4 axes — hybrid inventory, cashier speed/scale, operational UI gaps, business model & cash flow

---

## Summary

| ID     | Severity | Axis                   | Title                                              | Auto-fixed |
|--------|----------|------------------------|----------------------------------------------------|------------|
| W5-F1  | HIGH     | Hybrid Inventory       | No UI for manual weight entry on pesable products  | Partial    |
| W5-F2  | MEDIUM   | Hybrid Inventory       | Float drift on weight×price — "pérdida hormiga"    | Yes        |
| W5-F3  | LOW      | Hybrid Inventory       | `unidad` free-text allows semantically-dup values  | No         |
| W5-F4  | HIGH     | Speed/Scale UX         | Payment hotkeys not visible on buttons             | Yes        |
| W5-F5  | MEDIUM   | Speed/Scale UX         | Cancel-sale hotkey has no confirmation             | Yes        |
| W5-F6  | MEDIUM   | Speed/Scale UX         | Double-Enter countdown has no visual feedback      | Yes        |
| W5-F7  | MEDIUM   | Speed/Scale UX         | No split payment (cobro mixto)                     | No         |
| W5-F8  | LOW      | Speed/Scale UX         | Qty input lacks ±1 buttons (gloved/kiosk env)      | No         |
| W5-F9  | LOW      | Speed/Scale UX         | Acceso rápido buttons show no stock indicator      | No         |
| W5-F10 | MEDIUM   | Operational UI         | Lote model exists but not integrated into POS flow | No         |
| W5-F11 | LOW      | Operational UI         | MovimientoCaja has no category for expense type    | No         |
| W5-F12 | HIGH     | Business Model & Cash  | No "Informe X" — owner can't check totals intra-day | Yes       |
| W5-F13 | MEDIUM   | Business Model & Cash  | Dashboard lacks shrinkage/merma analysis           | No         |
| W5-F14 | LOW      | Business Model & Cash  | Cuentas corrientes saldo not shown in Informe Z    | No         |

---

## HIGH Severity

---

### W5-F1 · No dedicated UI for manual weight entry on `pesable` products

**Axis:** Hybrid Inventory

**Root cause:** `busqueda-inteligente` in `ventas-handlers.js` parses scale barcodes via configurable prefix matching. When a `pesable` product is looked up by name or by a barcode that does *not* match the configured scale prefix format, the handler returns the product with `cantidad: 1` and no weight prompt is triggered in the renderer.

**Affected files:**
- `src/ipc-handlers/ventas-handlers.js` — `busqueda-inteligente` handler
- `renderer/js/caja.js` — `agregarProductoALaVenta()`

**Description:**
Products with `pesable = true` require a weight (in kg) to compute the correct subtotal. The scale integration path handles this automatically via the `prefijo_balanza` config: a barcode like `2100050023456` is decoded to product code + weight. However, if the cashier searches by product name or scans a standard barcode, `pesable` is true but `cantidad` defaults to `1` — meaning a 1-kg charge is issued regardless of actual weight. There is no prompt, no visual warning, no rejection.

**Business impact:** Silent under/overcharging on every manually-keyed weighted product. In a cheese or deli counter context this is a revenue leak or a customer-facing pricing error on every transaction.

**Recommended fix:**
- In `caja.js`, after receiving search results, check `result.pesable === true && !result._fromScale`. If true, show a weight-entry modal (numeric input, kg) before adding to cart.
- Pass the entered weight as `cantidad` when calling `agregarProductoALaVenta`.
- Mark the cart line with a scale icon to distinguish manual vs. scale-weighed entries.

**Auto-fixed:** Partial — see W5-F2 (rounding normalization applied). The modal itself requires UI work deferred to Phase B.

---

### W5-F4 · Payment hotkeys invisible — undiscoverable for new cashiers

**Axis:** Speed/Scale UX

**Root cause:** `caja.js` binds `keydown` listeners for numpad keys (`/`=Efectivo, `*`=Débito, `-`=Crédito, `+`=QR, `.`=Cancelar) but the corresponding payment-method buttons in `caja.html` show only the method name with no hint of the keyboard shortcut.

**Affected files:**
- `renderer/windows/caja.html` — payment method buttons
- `renderer/css/caja.css` — button styles

**Description:**
The hotkey system is powerful and optimized for experienced cashiers, but completely opaque to anyone who hasn't been trained. There is no tooltip, no badge, no label. The period (`.`) hotkey for "Cancelar Venta" is especially dangerous — it is adjacent to numpad digit keys and can wipe the entire cart without confirmation (see W5-F5).

**Business impact:** New cashier onboarding time is extended. Accidental cart wipes are frequent during the learning period.

**Auto-fixed:** Yes — hotkey badges added to payment buttons (see refactor-plan Phase A).

---

### W5-F12 · No "Informe X" — owner cannot check intra-day totals without closing the shift

**Axis:** Business Model & Cash

**Root cause:** The `cerrar-caja` IPC handler is the only way to compute the Z-report totals. There is no read-only path that queries the same aggregates without writing `cierre_at`, marking sales as `cerrada`, and creating the `ArqueoCaja` record.

**Affected files:**
- `src/ipc-handlers/caja-handlers.js` — `cerrar-caja`, `get-resumen-cierre`
- `renderer/windows/caja.html` — missing Informe X button

**Description:**
In retail, an "Informe X" (or "X-report") is a mid-day total snapshot: same numbers as the Z-report but without resetting the cash register. Owners/managers use it to verify the float, detect discrepancies, and reconcile partial shifts. Without it, the only option is to close the shift prematurely (losing the ability to continue selling) or to work blind.

**Business impact:** High — managers of multi-shift stores cannot monitor the current shift without ending it. Cash reconciliation must be done at shift close, concentrating error detection too late in the day.

**Auto-fixed:** Yes — `get-informe-x` IPC handler added to `caja-handlers.js` (read-only snapshot, no write side-effects).

---

## MEDIUM Severity

---

### W5-F2 · Float drift on weight×price (pérdida hormiga)

**Axis:** Hybrid Inventory

**Root cause:** `precioUnitario * cantidad` is a raw IEEE-754 float multiplication. On weighted products `cantidad` is a decimal like `0.375` kg. `Producto.precioVenta` might be `$899.99`. The product `899.99 * 0.375 = 337.49625` — stored and summed with full float precision, accumulating drift across the daily total.

**Affected files:**
- `src/ipc-handlers/ventas-handlers.js` — `createSaleTx` subtotal computation

**Description:**
Individual rounding errors are sub-cent but compound across tens of weighted line items per day. More critically, the displayed subtotal (computed in the renderer) and the stored subtotal (computed server-side in `createSaleTx`) can differ by 1–2 cents due to independent floating-point paths. This creates a reconciliation mismatch that looks like a cash handling error.

**Auto-fixed:** Yes — `Math.round(subtotal * 100) / 100` applied in `createSaleTx`.

---

### W5-F5 · "Cancelar Venta" has no confirmation — accidental cart wipes

**Axis:** Speed/Scale UX

**Root cause:** `caja.js` binds numpad `.` to call `cancelarVenta()` directly, which clears `carritoVenta` without any dialog.

**Affected files:**
- `renderer/js/caja.js` — `cancelarVenta()` invocation
- `renderer/windows/caja.html` — cancel button

**Description:**
In a high-pressure POS environment the numpad period is pressed accidentally (e.g., when entering a price with decimals). A 15-item cart built over 3 minutes can be wiped in a single accidental keypress. There is no undo.

**Auto-fixed:** Yes — confirmation guard added (see refactor-plan Phase A).

---

### W5-F6 · Double-Enter countdown: 2s, no visual feedback

**Axis:** Speed/Scale UX

**Root cause:** `caja.js` sets a 2000ms timer (`enterPressedOnce`) on first Enter. The second Enter within that window confirms the sale. The timer has no visual representation — no countdown ring, no button state change.

**Affected files:**
- `renderer/js/caja.js` — double-Enter confirm logic

**Description:**
Cashiers learn to press Enter twice quickly. If the first press lands just before the 2s expiry, the second press misses the window silently. No visual indicator shows that the window is open. This causes "why didn't it confirm?" confusion and repeated Enter presses that can trigger double-sales in edge cases.

**Auto-fixed:** Yes — button visual state added (CSS class toggle during the 2s window).

---

### W5-F7 · No split payment (cobro mixto)

**Axis:** Speed/Scale UX

**Root cause:** `caja-handlers.js` / `createSaleTx` assumes a single `metodoPago` per sale. The `Venta` model has one `metodoPago` field (STRING). There is no `pagos[]` array or partial-amount concept.

**Affected files:**
- `src/database/models/Venta.js`
- `src/ipc-handlers/caja-handlers.js`
- `renderer/js/caja.js`

**Description:**
A customer paying $500 in cash + $300 in debit is common. Today the cashier must choose one method and the difference is untracked. This silently corrupts payment-method analytics in the dashboard and ArqueoCaja breakdown.

**Business impact:** Payment method breakdown in Informe Z is unreliable for mixed-payment stores. Dashboard `totalVentasEfectivo` etc. are undercounted.

**Auto-fixed:** No — requires model migration + UI redesign. Planned Phase C.

---

### W5-F10 · Lote model unintegrated — no FEFO deduction at POS

**Axis:** Operational UI

**Root cause:** `Lote.js` model and `lotes-handlers.js` exist, but `createSaleTx` in `ventas-handlers.js` deducts stock directly from `Producto.stock` without querying active Lotes or applying FEFO (First Expired, First Out) logic.

**Affected files:**
- `src/ipc-handlers/ventas-handlers.js` — `createSaleTx`
- `src/ipc-handlers/lotes-handlers.js`
- `src/database/models/Lote.js`

**Description:**
Lotes track quantity per expiry date. If a Lote system is maintained but stock deduction ignores it, `Lote.cantidad` and `Producto.stock` diverge immediately after the first sale. The expiry-date tracking becomes purely decorative.

**Auto-fixed:** No — requires careful integration to avoid breaking existing installations without lotes data. Planned Phase B.

---

### W5-F13 · Dashboard lacks shrinkage/merma analysis for weighted products

**Axis:** Business Model & Cash

**Root cause:** Weighted products (pesable) sold via scale have `cantidad` in kg. Dashboard ranking sums `cantidad` but there is no comparison between `Lote.cantidad` ingressed and total `cantidad` sold — the gap is shrinkage/merma.

**Affected files:**
- `renderer/js/dashboard.js`
- `src/ipc-handlers/ventas-handlers.js` (no merma tracking)

**Description:**
For deli/bulk goods, merma (spoilage, trimming loss, scale calibration drift) is a direct cost. Without a merma metric, the owner cannot distinguish "we sold 10 kg of cheese" from "we received 11 kg and can only account for 10 kg". The 1 kg gap is invisible.

**Auto-fixed:** No — requires Lote integration first (W5-F10). Planned Phase C.

---

## LOW Severity

---

### W5-F3 · `unidad` field is free-text — semantic duplicates

**Axis:** Hybrid Inventory

`Producto.unidad` is `DataTypes.STRING` with no ENUM or FK constraint. Values like `'kg'`, `'Kg'`, `'kilogramo'`, `'KG'` are stored as distinct strings. Group-by queries on `unidad` (e.g., for reporting) produce exploded result sets.

**Auto-fixed:** No — requires a data-migration step to normalize existing values. Planned Phase C.

---

### W5-F8 · Quantity input lacks ±1 buttons

**Axis:** Speed/Scale UX

`renderer/css/caja.css` sets `.cantidad-input { width: 70px }`. In gloved environments (butcher, bakery) or on touchscreen kiosks, typing a number is error-prone. Standard retail POS provides `−` / `+` stepper buttons flanking the input.

**Auto-fixed:** No. Planned Phase B.

---

### W5-F9 · Acceso rápido buttons show no stock indicator

**Axis:** Speed/Scale UX

`acceso_rapido` products appear as quick-access grid buttons in the POS but the buttons don't show current stock. A cashier can tap an out-of-stock product, add it to the cart, and only find out at stock-deduction time. A small stock badge would prevent this.

**Auto-fixed:** No. Planned Phase B.

---

### W5-F11 · MovimientoCaja has no expense category

**Axis:** Operational UI

`MovimientoCaja` records `tipo` (INGRESO/EGRESO) and `concepto` (free text). There is no `categoria` field (e.g., "Servicios", "Limpieza", "Personal"). Free-text concepto prevents meaningful expense breakdown in the Informe Z and dashboard.

**Auto-fixed:** No. Planned Phase C (requires migration + UI update).

---

### W5-F14 · Cuentas corrientes saldo not included in Informe Z

**Axis:** Business Model & Cash

`ArqueoCaja` tracks `totalVentasCtaCte` (sales charged to a running account) but the Informe Z display does not reconcile this against actual cash received. An owner cannot tell from the Z-report how much credit was extended today vs. how much cash was physically collected.

**Auto-fixed:** No. Planned Phase B.
