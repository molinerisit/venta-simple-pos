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

## [AD-003] Upgrade severity of `metodoPago` finding from LOW to MEDIUM

**Date:** 2026-04-07
**Context:**
`ventas-handlers.js` audit classified `metodoPago` without allowlist as LOW because it was possible a model-level constraint existed. Model audit confirmed `Venta.metodoPago` is `DataTypes.STRING, allowNull: false` with no `validate.isIn`, no Sequelize ENUM, and no DB-level CHECK constraint.

**Decision:**
Upgrade the `metodoPago` finding to MEDIUM. The original LOW classification assumed a possible model-level fallback that does not exist.

**Justification:**
Without any constraint at any layer, arbitrary payment method strings accumulate in the database over the lifetime of the installation. Every financial report that aggregates by payment method (end-of-day, monthly) will silently under-count totals if a non-standard string was ever used. The risk is not theoretical — it compounds with every sale.

**Impact on audit:**
Review all other findings previously rated LOW that assumed possible model-level mitigation. Treat the absence of any model hooks or validators as a confirmed pattern, not a per-finding question.

---

## [AD-004] Treat the entire validation layer as absent — do not assume mitigation below handler level

**Date:** 2026-04-07
**Context:**
Model audit of `Venta.js`, `DetalleVenta.js`, and `Producto.js` found zero Sequelize validators (`validate` blocks), zero hooks (`beforeCreate`, `beforeUpdate`, etc.), and zero database-level constraints beyond NOT NULL and UNIQUE on `Producto.codigo`. The pattern is uniform across all three models.

**Decision:**
For all remaining handler audits (`caja-handlers.js`, `productos-handlers.js`, and any others), assume by default that **no model-level or DB-level validation exists** for any business rule unless explicitly verified. Do not soften handler-level findings on the assumption that models might catch bad data.

**Justification:**
The audit of three core models found a consistent absence of domain validation. Applying the same assumption to unaudited models avoids artificially low severity ratings and prevents re-auditing the same question per handler.

**Impact on audit:**
All future handler findings related to input validation, business rules, and data integrity should be classified as if the handler is the last and only line of defense — because it is.

---

## [AD-005] CSV import path traversal is a second HIGH security finding independent of app:// protocol

**Date:** 2026-04-07
**Context:**
`import-productos-csv` reads a file path from the renderer process without any path containment check. This mirrors the `app://` protocol path traversal finding in `main.js` but operates via a different mechanism (IPC parameter vs. protocol handler URL).

**Decision:**
Classify `import-productos-csv` arbitrary file read as HIGH severity. Track it as a distinct finding from the `app://` traversal — same class of vulnerability, different entry point. Both must be fixed independently.

**Justification:**
The two vulnerabilities require different fixes. The `app://` fix is a containment guard on the protocol handler. The CSV import fix requires either moving the `fs.readFileSync` call inside the handler that opens the dialog (so the path never crosses the IPC boundary) or adding strict containment validation before the read.

**Impact on audit:**
The security surface of the application now has at least two confirmed path traversal / arbitrary file read vectors. Any remaining handlers that accept file paths from the renderer should be flagged immediately during audit.

---

## [AD-006] CSV import atomicity failure is a data integrity pattern — check all bulk operations

**Date:** 2026-04-07
**Context:**
`import-productos-csv` creates `ProductoDepartamento` and `ProductoFamilia` rows outside the product `bulkCreate` transaction, with `transaction: null` explicit. On rollback, these rows persist as orphaned records.

**Decision:**
During audit of any remaining handler that performs multi-model writes, explicitly verify whether all writes participate in the same transaction. Treat `transaction: null` as a HIGH-risk code pattern warranting immediate documentation.

**Justification:**
Partial commitment in multi-step writes is a class of data integrity bug that is invisible in the happy path and only manifests under failure conditions. In a POS system where DB recovery is manual and backups may not exist, orphaned classification data compounds over time and is difficult to clean up retroactively.

**Impact on audit:**
`caja-handlers.js` and any remaining handler that opens/closes a caja session across multiple models should be scrutinized for the same transaction isolation pattern.

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
