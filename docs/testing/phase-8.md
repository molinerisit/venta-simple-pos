# Phase 8 — Test Suite: Wave 3 Security & Quality

## Objetivo

Validar todos los hallazgos cerrados en Wave 3: session guards en mutaciones financieras, allowlists de campos en handlers de insumos y proveedores, limites en queries no acotadas, validacion de fechas en dashboard/reportes, cota de descuento en clientes, y mejoras menores de calidad.

---

## Entorno de test

- **Runner:** `tests/run-phase-8.js` (plain Node.js, sin framework externo)
- **Script:** `npm run test:phase8`
- **Base de datos:** In-memory SQLite (fresh para cada run, reset entre tests)
- **Handlers testeados:** clientes, proveedores, ctascorrientes, insumos, caja, ventas, facturacion, dashboard, reportes

---

## SUITE 1 — 8.1: Session guard en mutaciones financieras (W3-H6, W3-H7)

**Finding:** W3-H6, W3-H7
**Handlers:** `ctascorrientes-handlers.js`, `caja-handlers.js`

**Antes:** `registrar-pago-cliente`, `registrar-abono-proveedor` y `abrir-caja` aceptaban IDs del renderer y modificaban datos financieros sin verificar sesion activa. `abrir-caja` almacenaba el `usuarioId` del renderer directamente como propietario del arqueo.

**Despues:** `getActiveUserId()` null-check en los tres handlers. `abrir-caja` ignora `usuarioId` del renderer y usa la sesion del servidor.

---

### Test 1.1 — registrar-pago-cliente falla sin sesion activa

**Escenario:** `clearSession()` → intento de pago de cliente.

**Esperado:** `{ success: false }`, mensaje menciona sesion.

**Resultado:** PASS

---

### Test 1.2 — registrar-pago-cliente funciona con sesion activa

**Escenario:** Login → crear cliente con deuda=500 → pago de 100.

**Esperado:** `{ success: true }`, `cliente.deuda === 400`.

**Resultado:** PASS

---

### Test 1.3 — registrar-abono-proveedor falla sin sesion activa

**Escenario:** `clearSession()` → intento de abono.

**Esperado:** `{ success: false }`.

**Resultado:** PASS

---

### Test 1.4 — abrir-caja usa el userId de sesion, ignora el del renderer

**Escenario:** Login como admin → `abrir-caja({ usuarioId: otherUser.id })`.

**Esperado:** `arqueo.UsuarioId === admin.id` (no el del renderer).

**Resultado:** PASS

---

## SUITE 2 — 8.2: guardar-insumo allowlist + affectedRows (W3-H4, W3-H5)

**Finding:** W3-H4, W3-H5
**Handler:** `insumos-handlers.js`

**Antes:** `const payload = { ...data, nombre }` — mass-assignment sin restricciones. Update con id inexistente retornaba `{ success: true }` silenciosamente.

**Despues:** `INSUMO_ALLOWED_FIELDS` allowlist; `affectedRows === 0` en update retorna `{ success: false }`.

---

### Test 2.1 — Update en ID inexistente retorna success:false

**Esperado:** `{ success: false }`, mensaje incluido.

**Resultado:** PASS

---

### Test 2.2 — Create con datos validos funciona

**Resultado:** PASS

---

### Test 2.3 — Update con campos permitidos funciona

**Resultado:** PASS

---

### Test 2.4 — Create rechaza nombre vacio

**Resultado:** PASS

---

## SUITE 3 — 8.3: Limites en queries no acotadas

**Finding:** W3-H1, W3-H2, W3-H3, W3-H8, W3-M1, W3-M2, W3-M3
**Handlers:** clientes, proveedores, ctascorrientes, facturacion, insumos, ventas, etiquetas

**Antes:** Multiples `findAll()` sin `limit` — riesgo de memory exhaustion en datasets grandes.

**Despues:** Limite por defecto (500 o 200) + soporte de `limit`/`offset` opcionales.

---

### Test 3.1 — get-clientes retorna resultado acotado por defecto

**Resultado:** PASS

---

### Test 3.2 — get-clientes respeta limit=1

**Resultado:** PASS

---

### Test 3.3 — get-insumos retorna resultado acotado por defecto

**Resultado:** PASS

---

### Test 3.4 — get-insumos respeta limit=1

**Resultado:** PASS

---

### Test 3.5 — get-ventas aplica limite por defecto (no mas de 200)

**Resultado:** PASS

---

## SUITE 4 — 8.4: Cota de descuento en guardar-cliente (W3-M6)

**Finding:** W3-M6
**Handler:** `clientes-handlers.js`

**Antes:** `descuento` sin limite superior — un valor de 200 producia totales de venta negativos.

**Despues:** Validacion `descuento en [0, 100]`.

---

### Test 4.1 — Rechaza descuento: 150

**Esperado:** `{ success: false }`, mensaje menciona descuento o 100.

**Resultado:** PASS

---

### Test 4.2 — Rechaza descuento: -5

**Resultado:** PASS

---

### Test 4.3 — Acepta descuento: 100 (limite inclusivo)

**Resultado:** PASS

---

### Test 4.4 — Acepta descuento: 0

**Resultado:** PASS

---

## SUITE 5 — 8.5: Allowlist de campos en guardar-proveedor (W3-M7)

**Finding:** W3-M7
**Handler:** `proveedores-handlers.js`

**Antes:** `proveedor.update(proveedorData)` — payload completo del renderer al ORM.

**Despues:** `PROVEEDOR_ALLOWED_FIELDS` filtra campos protegidos (deuda, createdAt, etc.).

---

### Test 5.1 — Create con nombreEmpresa valido funciona

**Resultado:** PASS

---

### Test 5.2 — No se puede sobrescribir deuda via inyeccion de payload

**Escenario:** Proveedor con `deuda=5000` → update con `{ deuda: 0 }` en el payload.

**Esperado:** `{ success: true }`, pero `proveedor.deuda === 5000` (no sobrescrita).

**Resultado:** PASS

---

### Test 5.3 — Rechaza nombreEmpresa faltante

**Resultado:** PASS

---

## SUITE 6 — 8.6: Validacion de fechas en dashboard y reportes (W3-M4, W3-M5)

**Finding:** W3-M4, W3-M5
**Handlers:** `dashboard-handlers.js`, `registerReportesHandlers.js`

**Antes:** `new Date("not-a-date")` producia `Invalid Date`; todas las queries subsecuentes recibían NaN en Op.gte/Op.lte.

**Despues:** `isNaN(startDate.getTime())` → `{ success: false, message: "Fechas invalidas." }`.

---

### Test 6.1 — get-dashboard-stats con dateFrom invalido retorna success:false

**Resultado:** PASS

---

### Test 6.2 — get-dashboard-stats con dateTo invalido retorna success:false

**Resultado:** PASS

---

### Test 6.3 — get-dashboard-stats con fechas validas retorna success:true

**Resultado:** PASS

---

### Test 6.4 — get-rentabilidad-report con fechas invalidas retorna success:false

**Resultado:** PASS

---

### Test 6.5 — get-rentabilidad-report con fechas validas retorna success:true

**Resultado:** PASS

---

## SUITE 7 — 8.7: Guard de montoInicial negativo en abrir-caja (W3-L6)

**Finding:** W3-L6
**Handler:** `caja-handlers.js`

**Antes:** `Number(-500)` es truthy, la coercion `|| 0` no actuaba — saldo inicial negativo se almacenaba.

**Despues:** `monto < 0` → `{ success: false, message: "El monto inicial no puede ser negativo." }`.

---

### Test 7.1 — abrir-caja rechaza montoInicial negativo

**Resultado:** PASS

---

### Test 7.2 — abrir-caja acepta montoInicial: 0

**Resultado:** PASS

---

## SUITE 8 — 8.8: Verificacion de InsumoDepartamentoId en guardar-insumo-familia (W3-L4)

**Finding:** W3-L4
**Handler:** `insumos-handlers.js`

**Antes:** FK error al crear familia con dept inexistente → mensaje generico "ya existe o es invalido".

**Despues:** `InsumoDepartamento.findByPk(depId)` guard → mensaje claro "El departamento de insumo no existe."

---

### Test 8.1 — InsumoDepartamentoId invalido retorna mensaje claro

**Esperado:** `{ success: false }`, mensaje menciona "departamento".

**Resultado:** PASS

---

### Test 8.2 — InsumoDepartamentoId valido permite crear familia

**Resultado:** PASS

---

## SUITE 9 — Regresion

### Test 9.1 — guardar-cliente create sigue funcionando

**Resultado:** PASS

### Test 9.2 — eliminar-cliente sigue funcionando

**Resultado:** PASS

### Test 9.3 — get-clientes retorna clientes sembrados

**Resultado:** PASS

### Test 9.4 — guardar-proveedor create sigue funcionando

**Resultado:** PASS

### Test 9.5 — registrar-venta sigue funcionando end-to-end

**Resultado:** PASS

### Test 9.6 — get-insumos sigue devolviendo insumos

**Resultado:** PASS

### Test 9.7 — get-ctacte-resumen devuelve totales

**Resultado:** PASS

---

## Resumen

| Suite | Descripcion | Tests | Estado |
|-------|-------------|-------|--------|
| 1 | Session guard en mutaciones financieras (W3-H6, W3-H7) | 4 | PASS |
| 2 | guardar-insumo allowlist + affectedRows (W3-H4, W3-H5) | 4 | PASS |
| 3 | Limites en queries no acotadas (W3-H1/2/3/8, W3-M1/2/3) | 5 | PASS |
| 4 | Cota de descuento en clientes (W3-M6) | 4 | PASS |
| 5 | Allowlist en guardar-proveedor (W3-M7) | 3 | PASS |
| 6 | Validacion de fechas en dashboard/reportes (W3-M4/5) | 5 | PASS |
| 7 | Guard montoInicial negativo en abrir-caja (W3-L6) | 2 | PASS |
| 8 | InsumoDepartamentoId check en insumo-familia (W3-L4) | 2 | PASS |
| 9 | Regresion | 7 | PASS |
| **Total** | | **36** | **36 PASS / 0 FAIL** |
