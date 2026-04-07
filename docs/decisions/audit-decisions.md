# Audit Decisions — Venta Simple POS

**Version:** 2.0 (consolidated)
**Date:** 2026-04-07

> Decisions are ordered chronologically and reflect reasoning that shaped audit methodology and severity classification.

---

## AD-001 · Financial integrity takes priority over all other categories

**Date:** 2026-04-07

**Context:** Early handler analysis revealed that sale prices and quantities are accepted from the renderer without server-side validation, and that stock decrements have no floor guard.

**Decision:** Financial integrity findings (tampered prices, negative stock, incorrect closing totals) are classified as HIGH and must be addressed before UX, performance, or code quality work.

**Justification:** In a POS system, corrupted sale records and inventory state are harder to detect and retroactively correct than slow renders or UX friction. The financial impact compounds with every transaction.

**Impact:** Performance and UX findings (M-1 through M-5, L-series) are documented but deprioritized relative to H-series findings.

---

## AD-002 · Model and database validation layers are effectively absent — do not assume mitigation below handler level

**Date:** 2026-04-07

**Context:** Model audit of `Venta.js`, `DetalleVenta.js`, `Producto.js`, and `ArqueoCaja.js` found zero Sequelize `validate` blocks and zero `beforeCreate`/`beforeUpdate` hooks across all models. DB-level constraints are limited to NOT NULL and a single UNIQUE on `Producto.codigo`. The only ENUM found (`ArqueoCaja.estado`) may not be enforced on existing installations due to the `sync()` without alter issue.

**Decision:** All handler-level findings are classified as if the handler is the last and only line of defense — because it is. No finding is softened on the assumption that a model or DB constraint might catch bad data.

**Justification:** The consistent absence of domain validation across all audited models confirms this is a systemic pattern, not a per-model omission. Future audits of unreviewed models should apply the same assumption until evidence contradicts it.

---

## AD-003 · `metodoPago` upgraded to HIGH — confirmed as a financial data loss mechanism

**Date:** 2026-04-07

**Context:** `metodoPago` was initially classified as LOW (no allowlist in handler). Model audit confirmed no enum or `isIn` constraint at any layer. Caja handler audit confirmed that `normalizarMetodoPago`'s `return s` fallback causes any unrecognized value to be silently excluded from all daily totals, and that `totalVentasTransferencia` is not stored in the model.

**Decision:** The `metodoPago` root cause is classified as HIGH (finding H-3). The three compounding issues (no allowlist, normalization fallback, missing model field) share the same root cause and are documented as a single finding.

**Justification:** The impact is not "data quality degrades over time." It is "any sale with an unrecognized payment method is permanently excluded from financial records, with no error, flag, or recovery path within the application."

---

## AD-004 · Missing-transaction pattern is systemic — all multi-step financial writes must be reviewed

**Date:** 2026-04-07

**Context:** Three confirmed instances of non-transactional multi-step writes: (1) `import-productos-csv` creates departments/families with `transaction: null` before the product `bulkCreate` transaction; (2) `toggle-producto-activo` uses SELECT + UPDATE without a transaction; (3) `cerrar-caja` reads sales and writes the arqueo across two independent `now()` calls without a wrapping transaction.

**Decision:** The absence of a wrapping transaction on any multi-step write that involves financial records or inventory state is classified as HIGH. The pattern is documented as systemic, not as isolated per-file incidents.

**Justification:** All three instances produce correct results on the happy path and silent inconsistency on the failure or concurrency path. In a POS where DB recovery is manual and backups may not exist, partial commits are high-consequence and difficult to detect.

---

## AD-005 · Two independent path traversal vectors confirmed — fix independently

**Date:** 2026-04-07

**Context:** Two distinct arbitrary file read vulnerabilities were identified with different entry points and different required fixes: (1) `app://` protocol handler in `main.js`; (2) `import-productos-csv` accepting `filePath` from the renderer.

**Decision:** Both are classified as HIGH security findings (H-5). They require independent fixes and must both be resolved, as fixing one does not mitigate the other.

**Fix guidance:**
- `app://`: Add a path containment guard (`path.resolve(resolved).startsWith(allowedRoot)`).
- `import-productos-csv`: Move `fs.readFileSync` inside the handler that calls `dialog.showOpenDialog`, so the file path never crosses the IPC boundary. The renderer should never hold a path that the main process will act on without re-validation.
