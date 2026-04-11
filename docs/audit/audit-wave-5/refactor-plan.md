# Refactor Plan — Wave 5
## ERP Retail Audit: Implementation Phases

**Date:** 2026-04-10
**Based on:** `findings.md` (W5-F1 through W5-F14)

---

## Phase A — Immediate Fixes (auto-applied this session)

These are low-risk, high-value changes applied directly in this audit pass. No model migrations required.

### A-1 · Float rounding on weight×price (W5-F2)
**File:** `src/ipc-handlers/ventas-handlers.js`
**Change:** Wrap subtotal computation in `Math.round(x * 100) / 100` within `createSaleTx`.
**Risk:** Minimal — rounds to 2 decimal places, consistent with display logic already in the renderer.

### A-2 · Hotkey badges on payment buttons (W5-F4)
**Files:** `renderer/windows/caja.html`, `renderer/css/caja.css`
**Change:** Add a `<kbd>` badge inside each payment method button showing the numpad key (`Num /`, `Num *`, `Num -`, `Num +`). Style with a muted chip aesthetic.
**Risk:** Zero — purely additive HTML/CSS.

### A-3 · Cancel-sale confirmation guard (W5-F5)
**File:** `renderer/js/caja.js`
**Change:** Wrap `cancelarVenta()` body: if `carritoVenta.length > 0`, show `window.confirm('¿Cancelar la venta actual? Se perderán los items.')`. Also guard the numpad `.` hotkey path.
**Risk:** Low — adds one dialog; experienced cashiers who press `.` intentionally will click OK in under 1s.

### A-4 · Double-Enter visual state (W5-F6)
**Files:** `renderer/js/caja.js`, `renderer/css/caja.css`
**Change:** When first Enter is pressed (`enterPressedOnce = true`), add CSS class `.confirm-pending` to the confirm button. Remove on timeout or second press. Style with a pulsing blue border. Display "(Confirmá)" helper text.
**Risk:** Zero — purely cosmetic state toggle.

### A-5 · Informe X IPC handler (W5-F12)
**File:** `src/ipc-handlers/caja-handlers.js`
**Change:** Add `ipcMain.handle('get-informe-x', ...)` that runs the same aggregation queries as `get-resumen-cierre` but:
- Does **not** filter by `cierre_at IS NULL` exclusively on ArqueoCaja
- Reads from the current open arqueo (the one without `cierre_at`)
- Returns the same shape as `get-resumen-cierre` so the frontend can reuse the display logic
**Risk:** Low — read-only query, no writes.

---

## Phase B — UX Critical (next sprint)

Requires UI work but no new database migrations.

### B-1 · Weight-entry modal for manual `pesable` lookup (W5-F1)
**Files:** `renderer/js/caja.js`, `renderer/windows/caja.html`
**Change:** After `busqueda-inteligente` returns a result with `pesable: true` and no `_fromScale` flag, show a small modal with:
- Product name + `precioVenta`/kg
- Numeric input for weight (kg), defaulting to 1.000, step 0.001
- Estimated total preview (updates live)
- Confirm / Cancel
Set `cantidad = enteredWeight` before calling `agregarProductoALaVenta`.

### B-2 · ±1 quantity stepper buttons (W5-F8)
**Files:** `renderer/windows/caja.html`, `renderer/css/caja.css`
**Change:** Wrap each `.cantidad-input` in a flex container with `−` and `+` buttons. Clicking `+` calls `actualizarCantidad(idx, +1)`, clicking `−` clamps to 1.

### B-3 · Stock badge on acceso rápido buttons (W5-F9)
**Files:** `renderer/js/caja.js`
**Change:** When rendering quick-access grid, add a `<span class="stock-badge">` inside each button showing `producto.stock`. Style red if `stock <= stock_minimo`, amber if `stock <= stock_minimo * 2`.

### B-4 · Cuentas corrientes reconciliation in Informe Z (W5-F14)
**Files:** `renderer/windows/caja.html`, `renderer/js/caja.js`
**Change:** In the cierre modal, add a row "Crédito en Cta. Cte." showing `totalVentasCtaCte` as a separate line distinguished from cash collected. Add a "Efectivo real a depositar" computed as `totalVentasEfectivo + totalVentasTransferencia + ...`.

---

## Phase C — Feature Completions (backlog)

Require new model fields, migrations, or significant UX redesign.

### C-1 · Split payment / cobro mixto (W5-F7)
**Requires:**
- New `PagoVenta` join table: `VentaId`, `metodoPago`, `monto`
- Migration to add table
- `caja.js` UI: multi-payment accumulator (shows running total paid, remaining)
- `createSaleTx` refactor to accept `pagos[]` array
- ArqueoCaja aggregation to sum by method across `PagoVenta`

### C-2 · FEFO lote deduction in POS (W5-F10)
**Requires:**
- `createSaleTx` to query `Lote.findAll({ where: { ProductoId, cantidad: { [Op.gt]: 0 } }, order: [['fecha_vencimiento', 'ASC']] })`
- Deduct `lote.cantidad` in FEFO order, cascade to next lote if current is insufficient
- If lotes don't cover quantity, fall back to `Producto.stock` deduction (backwards compat)
- Alert if nearest expiry lote is within 3 days

### C-3 · `unidad` ENUM normalization (W5-F3)
**Requires:**
- Migration to add ENUM check or a `UnidadMedida` lookup table
- Data migration normalizing `'kg'`, `'Kg'`, `'KG'`, `'kilogramo'` → `'kg'`
- Dropdown in `producto-form.html` replacing free-text input

### C-4 · MovimientoCaja expense categories (W5-F11)
**Requires:**
- Migration: add `categoria` field to `MovimientoCaja` (ENUM or FK to a categories table)
- UI update in the movimientos modal
- Informe Z grouped expense breakdown

### C-5 · Shrinkage/merma analytics (W5-F13)
**Requires:**
- C-2 (FEFO lote deduction) completed
- Dashboard widget: `Lote.cantidad ingresado - DetalleVenta.cantidad vendido = merma`
- Filterable by date range and product

---

## Risk Register

| Phase | Item | Risk | Mitigation |
|-------|------|------|------------|
| A     | A-3 (cancel confirm) | Friction for power users | Keep `.` hotkey; dialog is skipped if cart is empty |
| A     | A-5 (Informe X) | Read-only — no risk | — |
| B     | B-1 (weight modal) | Blocks scale-only workflows if triggered incorrectly | Only show when `pesable && !_fromScale` |
| C     | C-1 (split payment) | Large refactor, touches financial core | Feature flag; release behind config flag first |
| C     | C-2 (FEFO) | Diverges lote vs. product stock | Migration that seeds initial lote from current Producto.stock |
