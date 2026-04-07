# Audit Decisions — Venta Simple POS

---

## [AD-001] Prioritize financial integrity findings over UX findings

**Date:** 2026-04-07
**Context:**
The audit of `ventas-handlers.js` revealed that `precioUnitario` is accepted from the renderer process without server-side validation, and that stock decrements have no floor guard. Both issues directly affect the correctness of financial records and inventory state.

**Decision:**
Financial integrity issues (`precioUnitario` trust, negative stock) are classified as HIGH and must be resolved before any UX or performance work.

**Justification:**
In a POS system, corrupted sale totals or negative inventory values are harder to detect and correct retroactively than a slow render or a UX friction point. The impact compounds over time.

**Impact on audit:**
Performance and UX findings (pagination, LIKE index, search debounce) are documented but deprioritized until the two HIGH financial integrity issues are resolved.

---

## [AD-002] Audit model layer before further handler analysis

**Date:** 2026-04-07
**Context:**
`ventas-handlers.js` destructures `Venta`, `DetalleVenta`, `Producto`, `Cliente`, `Usuario`, `Factura` from `models`. The audit has not yet examined model definitions for validation rules, constraints, or hooks that may partially compensate for the missing input validation in the handler.

**Decision:**
The next audit target should be the model layer (`src/database/models/`) before auditing remaining IPC handlers (`caja-handlers.js`, `productos-handlers.js`).

**Justification:**
Model-level constraints (e.g., a `min: 0` validator on `Producto.stock`, or `allowedValues` on `Venta.metodoPago`) would affect the actual severity of several MEDIUM/LOW findings. Knowing the model layer prevents over- or under-reporting issue severity in subsequent handler audits.

**Impact on audit:**
If models have no validation, HIGH findings in `ventas-handlers.js` remain unchanged. If models partially validate inputs, some findings may be downgraded to MEDIUM. Either way, the model audit is load-bearing for the final severity assessment.
