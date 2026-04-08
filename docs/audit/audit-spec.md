# Audit Specification — Venta Simple POS

**Version:** 1.0
**Date:** 2026-04-07
**Status:** Active

---

## 1. Objective

Evaluate the production-readiness of Venta Simple POS across four dimensions:

- **Stability** — crash paths, initialization failures, unhandled exceptions
- **Financial integrity** — correctness of sale totals, closing records, inventory state
- **Security** — trust boundary violations, arbitrary file access, input validation
- **Maintainability** — schema evolution, code structure, data consistency patterns

---

## 2. System Under Audit

| Component | Technology |
|---|---|
| Application shell | Electron (main + renderer processes) |
| Backend runtime | Node.js (embedded in Electron main process) |
| Database | SQLite (local file, single-writer) |
| ORM | Sequelize |
| Communication | IPC (ipcMain.handle / ipcRenderer.invoke) |
| Packaging target | Windows desktop, ASAR bundle |

---

## 3. Scope

### In-Scope

| File | Role |
|---|---|
| `main.js` | App entry point, DB init, IPC registration, window management |
| `src/ipc-handlers/ventas-handlers.js` | Sale registration, product search, stock decrement |
| `src/ipc-handlers/productos-handlers.js` | Product CRUD, CSV import/export, category management |
| `src/ipc-handlers/caja-handlers.js` | Cash register open/close lifecycle, daily financial totals |
| `src/database/models/Venta.js` | Sale record schema |
| `src/database/models/DetalleVenta.js` | Sale line-item schema |
| `src/database/models/Producto.js` | Product catalog schema |
| `src/database/models/ArqueoCaja.js` | Cash session schema |

### Out-of-Scope (Not Yet Analyzed)

- `src/database/models/Usuario.js` — user roles and configuration fields
- `src/database/associations.js` — FK relationship declarations
- `src/ipc-handlers/mercadopago-handlers.js` — payment gateway integration
- All renderer-side code (UI components, state management)
- Authentication and session management
- Electron security configuration (`contextIsolation`, `nodeIntegration`, CSP)

---

## 4. Methodology

1. **Static code analysis** — Manual review of handler and model source files
2. **Cross-layer tracing** — Each finding traced across handler → model → DB to confirm presence or absence of mitigations at each layer
3. **Root-cause grouping** — Issues sharing a common cause merged into a single finding with cross-component impact listed
4. **Severity classification:**

| Severity | Criteria |
|---|---|
| **HIGH** | Financial data loss, crash on normal path, security vulnerability, data silently corrupted |
| **MEDIUM** | Incorrect data persisted, business logic violation, performance degradation at scale |
| **LOW** | Code quality issue, latent risk, inconsistent pattern, minor UX impact |

---

## 5. Key Axiom Established During Audit

> **The model and database layers enforce zero business rules.**
> No Sequelize `validate` blocks, `beforeCreate`/`beforeUpdate` hooks, or DB-level CHECK constraints exist on any audited model beyond `NOT NULL` and a single `UNIQUE` on `Producto.codigo`. All domain logic is exclusively in IPC handlers. The renderer process is the primary — and often only — source of input validation.
