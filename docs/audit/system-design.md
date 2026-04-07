# System Design — Venta Simple POS (Actual Behavior)

> This document describes how the system **actually behaves** based on audit findings,
> not how it was intended to work. Deviations from expected behavior are noted inline.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Electron Renderer Process                               │
│  (HTML/JS — UI, state, price display, form validation)   │
│                                                          │
│  ⚠ Renderer is trusted source of truth for:             │
│    - precioUnitario  - cantidad  - metodoPago            │
│    - ProductoId      - UsuarioId - ClienteId             │
└───────────────────────┬──────────────────────────────────┘
                        │ ipcRenderer.invoke (IPC)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                         │
│                                                          │
│  ipc-handlers/ ← ALL business logic lives here          │
│    ventas-handlers.js                                    │
│    productos-handlers.js                                 │
│    caja-handlers.js                                      │
│                                                          │
│  ⚠ No service layer — handlers call ORM directly        │
│  ⚠ No input validation at model or DB layer             │
└───────────────────────┬──────────────────────────────────┘
                        │ Sequelize ORM
                        ▼
┌──────────────────────────────────────────────────────────┐
│  SQLite (local file)                                     │
│                                                          │
│  ⚠ PRAGMA foreign_keys = OFF (silently ignored)         │
│  ⚠ No CHECK constraints on any monetary field           │
│  ⚠ No migration system — sync() only creates new tables │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Database Initialization (main.js)

**Intended behavior:** Apply WAL mode, enable foreign keys, run migrations.
**Actual behavior:**

1. Multiple PRAGMA statements concatenated in a single `sequelize.query()` call.
2. SQLite's `sqlite3_prepare` processes only the **first statement**. All subsequent PRAGMAs — including `PRAGMA foreign_keys = ON` and `PRAGMA journal_mode = WAL` — are silently skipped.
3. `sequelize.sync()` runs without `{ alter: true }`. Tables are created on fresh installs; existing schema is never modified.
4. SQLite file path resolves to `__dirname`, which is read-only inside a packaged ASAR bundle.

**Net state of a running installation:**
- Foreign key enforcement: **OFF**
- WAL mode: **OFF** (default rollback journal)
- All model constraints defined in Sequelize are model-layer only, not reflected in DDL on existing installations
- Schema evolution after initial install: **impossible without manual intervention**

---

## 3. Sale Registration Flow

```
Renderer → IPC: registrar-venta(ventaData)
│
├─ Input: { detalles[{ProductoId, precioUnitario, cantidad, nombreProducto}],
│            metodoPago, ClienteId, dniCliente, UsuarioId, montoPagado }
│
│  ⚠ precioUnitario and cantidad come from the renderer, not the DB
│  ⚠ No validation against Producto.precioVenta or stock
│
├─ DB: Usuario.findOne(rol="administrador") → fetch config_recargo + config_descuento
│      (called on every sale, no caching)
│
├─ DB: Cliente.findByPk / Cliente.findOrCreate (if client info provided)
│
├─ COMPUTE (JavaScript float arithmetic — no decimal library):
│    subtotal = Σ(precioUnitario × cantidad)   ← values from renderer
│    descCliente = subtotal × (cliente.descuento / 100)
│    descEfectivo = (subtotal - descCliente) × (descEfPorcentaje / 100)
│    totalFinal = subtotal - descuentoTotal + recargo
│
│  ⚠ Float arithmetic: 0.1 × 3 === 0.30000000000000004
│  ⚠ cantidad can be negative → totalFinal can be negative
│
├─ DB (transaction):
│    Venta.create({ metodoPago, total: totalFinal, ... })
│    for each item:
│      Producto.increment({ stock: -cantidad })   ← NO stock check
│      ⚠ if stock = 2 and cantidad = 10 → stock becomes -8
│    DetalleVenta.bulkCreate(detallesRows)
│
└─ Return: { success, ventaId, datosRecibo }
```

---

## 4. Product Search Flow (busqueda-inteligente)

```
Renderer → IPC: busqueda-inteligente(texto)
│
├─ DB: Usuario.findOne(rol="administrador")   ← round-trip on EVERY scan
├─ Parse config_balanza (stored as JSON string)
│
├─ IF scale barcode pattern detected:
│    extract PLU code from barcode
│    DB: Producto.findOne({ plu, pesable: true })   ← full table scan (no index)
│
└─ ELSE fallback:
     DB: Producto.findOne({ [Op.or]: [
       { codigo_barras: texto },   ← full table scan (index removed)
       { codigo: texto },
       { nombre: { LIKE: '%texto%' } }   ← full table scan (leading wildcard)
     ]})
     
     ⚠ No activo: true filter → inactive/discontinued products can be returned
     ⚠ Non-unique codigo_barras and plu → result is non-deterministic
```

**Worst case per scan:** 3 sequential full table scans on `productos`.

---

## 5. Cash Register Close Flow

```
Operator previews close → get-resumen-cierre(arqueoId)
│
├─ obtenerVentanaArqueo → fin = now()  [T1]
├─ Venta.findAll(createdAt BETWEEN inicio AND T1)
├─ agregarTotalesPorMetodo(ventas)
│    normalizarMetodoPago(v.metodoPago):
│      "Crédito" → "Credito" ✓
│      "Transferencia" → "Transferencia" ✓
│      "CtaCte" → "CtaCte" (no match) ← FALLBACK: contributes 0 to ALL totals
│      ⚠ Any unrecognized value → silently excluded from all buckets
│
└─ Returns preview to renderer (NOT LOCKED — new sales can occur)

          ↓ Operator reviews (seconds to minutes pass)

Operator confirms → cerrar-caja({ arqueoId, montoFinalReal, observaciones })
│
├─ obtenerVentanaArqueo → fin = now()  [T2 > T1]
│   ⚠ Sales between T1 and T2 are in stored totals but were NOT in preview
│
├─ Venta.findAll(createdAt BETWEEN inicio AND T2)
├─ agregarTotalesPorMetodo(ventas)   [same fallback applies]
│
├─ COMPUTE (no transaction):
│    montoEstimado = montoInicial + totalEfectivo
│    diferencia = montoFinalReal - montoEstimado
│
│    ⚠ montoFinalReal accepted from renderer — not validated
│    ⚠ negative values accepted for montoInicial and montoFinalReal
│
├─ DB (NO TRANSACTION):
│    arqueo.totalVentasEfectivo = totalEfectivo
│    arqueo.totalVentasDebito   = totalDebito
│    arqueo.totalVentasCredito  = totalCredito
│    arqueo.totalVentasQR       = totalQR
│    ⚠ totalTransfer computed but NOT ASSIGNED — permanently discarded
│    arqueo.fechaCierre = now()  [T3 > T2]
│    ⚠ Sales between T2 and T3 excluded from stored totals
│
└─ arqueo.save()
```

---

## 6. CSV Product Import Flow

```
Renderer → IPC: show-open-dialog(options)   ← options from renderer, unchecked
│
└─ Returns filePath to renderer

Renderer → IPC: import-productos-csv(filePath)   ← path from renderer, unvalidated
│
├─ fs.readFileSync(filePath)   ← SYNCHRONOUS, blocks main process event loop
│   ⚠ Any file on the filesystem is readable — no path containment check
│
├─ Papa.parse(content)   (no error checking on parseResult.errors)
│
├─ Loop rows (no count limit):
│    ProductoDepartamento.findOrCreate({ transaction: null })  ← OUTSIDE any transaction
│    ProductoFamilia.findOrCreate({ transaction: null })       ← OUTSIDE any transaction
│    ⚠ On bulkCreate failure, these rows persist as orphaned records
│
└─ sequelize.transaction():
     Producto.bulkCreate(rows, {
       updateOnDuplicate: ['nombre', 'precioCompra', 'precioVenta', 'stock', ...]
       ⚠ 'stock' included — missing column in CSV sets all stocks to 0
     })
```

---

## 7. Data Model — Constraint Summary

| Entity | Field | DB Type | Constraint | Validated at |
|---|---|---|---|---|
| `Venta` | `total` | FLOAT | NOT NULL | nowhere (min not enforced) |
| `Venta` | `metodoPago` | STRING | NOT NULL | nowhere (free-form) |
| `Venta` | `montoPagado` | FLOAT | nullable | handler (partial) |
| `DetalleVenta` | `precioUnitario` | FLOAT | NOT NULL | nowhere |
| `DetalleVenta` | `cantidad` | FLOAT | NOT NULL | nowhere |
| `Producto` | `stock` | FLOAT | default 0 | guardar-producto handler only |
| `Producto` | `codigo` | STRING | NOT NULL + UNIQUE | handler + model + DB ✓ |
| `Producto` | `precioVenta` | FLOAT | default 0 | guardar-producto handler only |
| `Producto` | `codigo_barras` | STRING | nullable, not unique | nowhere |
| `ArqueoCaja` | `estado` | ENUM | ABIERTA/CERRADA | model only (CHECK absent on existing installs) |
| `ArqueoCaja` | `montoInicial` | FLOAT | NOT NULL | nowhere (negatives accepted) |
| `ArqueoCaja` | `totalVentasTransferencia` | — | **does not exist** | — |

---

## 8. Structural Weaknesses

| Weakness | Description |
|---|---|
| **No validation layer below IPC handler** | Model and DB enforce nothing beyond NOT NULL and one UNIQUE. Handler is last line of defense. |
| **Renderer is trusted as data source** | Prices, quantities, payment methods, and IDs from the renderer are used directly without server-side re-validation. |
| **Sales not linked to sessions by FK** | `Venta` has no `ArqueoCajaId`. Sessions are reconstructed by timestamp range, creating audit gaps. |
| **No migration system** | `sync()` without `alter` means schema changes cannot be deployed to existing installations. |
| **Systemic missing-transaction pattern** | Multi-step writes in `cerrar-caja` and CSV import are not wrapped in transactions. Partial failures leave inconsistent state. |
| **Float arithmetic end-to-end** | All monetary values computed, stored, and accumulated as IEEE 754 doubles. Rounding drift reaches the daily cash reconciliation `diferencia` field. |
| **No backup or recovery mechanism** | No code for DB backup found. Destructive operations (CSV import, soft-delete) cannot be undone through the application. |
