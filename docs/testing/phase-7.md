# Phase 7 — Test Suite: Wave-2 Security & Authorization

## Objetivo

Validar todos los hallazgos cerrados en Wave 2: sesión, autorización por rol, validación de rangos financieros, integridad en compras, protección de credenciales MP, cooldown de login y mejoras de código de calidad.

---

## Entorno de test

- **Runner:** `tests/run-phase-7.js` (plain Node.js, sin framework externo)
- **Script:** `npm run test:phase7`
- **Base de datos:** In-memory SQLite (fresh para cada run, reset entre tests)
- **Handlers testeados:** `session`, `config`, `compras`, `admin`, `mercadoPago`

---

## SUITE 1 — I-1: Invalidación de sesión en logout

**Finding:** SES-H1  
**Handler:** `session-handlers.js`, `main.js`

**Antes:** `handleLogout` en `main.js` cerraba ventanas pero nunca ponía `activeUserId = null`. El `ipcMain.handle("logout")` correcto era código muerto (canal no en `validInvokeChannels`).

**Después:** `clearSession()` exportado desde `session-handlers.js`. `handleLogout` lo llama antes de abrir la ventana de login.

---

### Test 1.1 — clearSession() pone activeUserId en null

**Escenario:** Login exitoso → llamar `clearSession()`.

**Esperado:** `getActiveUserId() === null`

**Resultado:** ✅ Passed

---

### Test 1.2 — get-user-session retorna null después de clearSession

**Escenario:** Login → clearSession → `get-user-session`.

**Esperado:** `null`

**Resultado:** ✅ Passed

---

### Test 1.3 — get-user-session retorna el usuario después de login

**Escenario:** Login exitoso → `get-user-session`.

**Esperado:** Objeto con `id` del usuario autenticado.

**Resultado:** ✅ Passed

---

### Test 1.4 — Re-login después de logout retorna nuevo usuario

**Escenario:** Login como admin → clearSession → login como user2.

**Esperado:** `getActiveUserId() === user2.id`

**Resultado:** ✅ Passed

---

## SUITE 2 — S-3: Allowlist de campos en get-user-session y get-admin-config

**Finding:** SES-M2, ADMIN-M4, CONFIG-M2  
**Handlers:** `session-handlers.js`, `config-handlers.js`

**Antes:** Ambos handlers usaban `attributes: { exclude: ['password'] }` — cualquier campo nuevo en el modelo quedaba expuesto automáticamente, incluyendo `mp_access_token`.

**Después:** Allowlist explícita. `get-user-session` retorna solo `[id, nombre, rol, permisos]`. `get-admin-config` excluye `mp_access_token`, `mp_user_id`, `mp_pos_id`.

---

### Test 2.1 — get-user-session NO expone mp_access_token

**Escenario:** Admin con `mp_access_token: "secret"` configurado → `get-user-session`.

**Esperado:** `session.mp_access_token === undefined`

**Resultado:** ✅ Passed

---

### Test 2.2 — get-user-session NO expone password

**Esperado:** `session.password === undefined`

**Resultado:** ✅ Passed

---

### Test 2.3 — get-user-session retorna campos requeridos (id, nombre, rol, permisos)

**Esperado:** Los cuatro campos presentes.

**Resultado:** ✅ Passed

---

### Test 2.4 — get-admin-config NO expone mp_access_token

**Escenario:** Admin con `mp_access_token: "admin-secret"` → `get-admin-config`.

**Esperado:** `config.mp_access_token === undefined`

**Resultado:** ✅ Passed

---

### Test 2.5 — get-admin-config retorna campos requeridos por la UI

**Esperado:** `config.config_recargo_credito` presente.

**Resultado:** ✅ Passed

---

## SUITE 3 — I-2: Validación de rangos para recargo/descuento

**Finding:** CONFIG-H1  
**Handler:** `config-handlers.js`, `models/Usuario.js`

**Antes:** `save-general-config` almacenaba `recargoCredito` y `descuentoEfectivo` sin validación. Un valor de 150 producía totales de venta negativos.

**Después:** Handler valida `[0, 100]` antes de escribir. ORM agrega `validate: { min: 0, max: 100 }` como segunda capa.

---

### Test 3.1 — Rechaza recargoCredito: -1

```json
{ "recargoCredito": -1, "descuentoEfectivo": 0 }
```

**Esperado:** `{ "success": false }`

**Resultado:** ✅ Passed

---

### Test 3.2 — Rechaza recargoCredito: 101

**Esperado:** `{ "success": false }`

**Resultado:** ✅ Passed

---

### Test 3.3 — Rechaza descuentoEfectivo: 150

**Esperado:** `{ "success": false }`

**Resultado:** ✅ Passed

---

### Test 3.4 — Acepta valor límite: recargoCredito: 100, descuentoEfectivo: 0

**Esperado:** `{ "success": true }` (100 es inclusive)

**Resultado:** ✅ Passed

---

### Test 3.5 — Acepta valor límite: recargoCredito: 0, descuentoEfectivo: 100

**Esperado:** `{ "success": true }`

**Resultado:** ✅ Passed

---

### Test 3.6 — El valor se persiste correctamente en DB

**Escenario:** `save-general-config` con `{ recargoCredito: 15, descuentoEfectivo: 5 }`.

**Esperado:** `Usuario.config_recargo_credito === 15`, `config_descuento_efectivo === 5`

**Resultado:** ✅ Passed

---

## SUITE 4 — I-3: Guard de actualizarPrecioVenta

**Finding:** COMP-H2  
**Handler:** `compras-handlers.js`

**Antes:** `Producto.update({ precioVenta: nuevoPrecioVenta })` sin validación de cota ni verificación de affectedRows.

**Después:** Validación: `nuevoPrecioVenta > 0`, `>= costoUnitario`, `<= 100 × costo`. `affectedRows === 0` genera rollback.

---

### Test 4.1 — Rechaza nuevoPrecioVenta < costoUnitario

```json
{ "costoUnitario": 50, "nuevoPrecioVenta": 30 }
```

**Esperado:** `{ "success": false }`, mensaje menciona "costo"

**Resultado:** ✅ Passed

---

### Test 4.2 — Rechaza nuevoPrecioVenta = 0

**Esperado:** `{ "success": false }`

**Resultado:** ✅ Passed

---

### Test 4.3 — Rechaza nuevoPrecioVenta > 100x costoUnitario

```json
{ "costoUnitario": 10, "nuevoPrecioVenta": 9999 }
```

**Esperado:** `{ "success": false }`

**Resultado:** ✅ Passed

---

### Test 4.4 — Valor válido actualiza precioVenta en DB

```json
{ "costoUnitario": 50, "nuevoPrecioVenta": 80 }
```

**Esperado:** `{ "success": true }`, `Producto.precioVenta === 80`

**Resultado:** ✅ Passed

---

### Test 4.5 — actualizarPrecioVenta: false no modifica precioVenta

**Esperado:** `precioVenta` sin cambios en DB.

**Resultado:** ✅ Passed

---

## SUITE 5 — I-4: Guard de amount en mp:refund-payment

**Finding:** MP-H3  
**Handler:** `mercadoPago-handlers.js`

**Antes:** `amount ? { amount: Number(amount) } : {}` — `amount: 0` producía `body = {}`, que dispara reembolso total en la API de MP.

**Después:** `Number(amount) > 0` validado explícitamente antes de cualquier llamada. Falsy → `{ ok: false, error: "amount must be a positive number" }`.

---

### Test 5.1 — amount: 0 retorna ok:false

**Esperado:** `{ "ok": false }`, error menciona "positive"

**Resultado:** ✅ Passed

---

### Test 5.2 — amount: null retorna ok:false

**Resultado:** ✅ Passed

---

### Test 5.3 — amount: -50 retorna ok:false

**Resultado:** ✅ Passed

---

### Test 5.4 — amount: undefined retorna ok:false

**Resultado:** ✅ Passed

---

### Test 5.5 — amount: 100 pasa la validación (puede fallar por token, no por guard)

**Esperado:** Error posterior al guard (no `"amount must be a positive number"`)

**Resultado:** ✅ Passed

---

## SUITE 6 — S-1: Autorización por rol en admin handlers

**Finding:** ADMIN-H1  
**Handler:** `admin-handlers.js`, `session-handlers.js`

**Antes:** `save-user`, `delete-user` sin verificación de rol. Cualquier sesión autenticada podía crearlos.

**Después:** `requireAdmin()` consulta `Usuario.rol` desde la DB antes de ejecutar. `rol` validado contra allowlist `[administrador, empleado, vendedor]`.

---

### Test 6.1 — save-user denegado sin sesión activa

**Esperado:** `{ "success": false, "message": "Acceso denegado." }`

**Resultado:** ✅ Passed

---

### Test 6.2 — save-user denegado para sesión de empleado

**Resultado:** ✅ Passed

---

### Test 6.3 — save-user permitido para sesión de administrador

**Resultado:** ✅ Passed

---

### Test 6.4 — save-user rechaza rol inválido (superadmin)

**Esperado:** `{ "success": false }`, mensaje menciona rol inválido

**Resultado:** ✅ Passed

---

### Test 6.5 — delete-user denegado sin sesión activa

**Resultado:** ✅ Passed

---

### Test 6.6 — delete-user denegado para sesión de empleado

**Resultado:** ✅ Passed

---

## SUITE 7 — S-2: UsuarioId desde sesión, no desde renderer

**Finding:** COMP-H1  
**Handler:** `compras-handlers.js`

**Antes:** `{ UsuarioId }` extraído del payload del renderer y almacenado directamente.

**Después:** `const sessionUserId = getActiveUserId()`. El campo `UsuarioId` del renderer es ignorado.

---

### Test 7.1 — UsuarioId del renderer es ignorado; se usa el de sesión

```json
{ "UsuarioId": "00000000-0000-0000-0000-000000000099", ... }
```

**Esperado:** `Compra.UsuarioId === admin.id` (de sesión, no el fake)

**Resultado:** ✅ Passed

---

### Test 7.2 — Compra falla sin sesión activa

**Esperado:** `{ "success": false, "message": "Sesión no activa." }`

**Resultado:** ✅ Passed

---

## SUITE 8 — B-3: Validación de descuento/recargo en compras

**Finding:** COMP-M1

**Antes:** `totalCompra = subtotal - descuento + recargo` sin validaciones — podía resultar negativo.

**Después:** `recargo >= 0`, `descuento <= subtotal`, `totalCompra >= 0`.

---

### Test 8.1 — Rechaza descuento > subtotal

```json
{ "pago": { "descuento": 10000 } }  // subtotal = 100
```

**Esperado:** `{ "success": false }`, mensaje menciona "descuento"

**Resultado:** ✅ Passed

---

### Test 8.2 — Rechaza recargo negativo

```json
{ "pago": { "recargo": -50 } }
```

**Resultado:** ✅ Passed

---

### Test 8.3 — Acepta descuento == subtotal (total = 0)

**Resultado:** ✅ Passed

---

## SUITE 9B — B-4: Cooldown de intentos de login

**Finding:** SES-M1  
**Handler:** `session-handlers.js`

**Antes:** Sin rate limiting — ataques de fuerza bruta irrestrictos.

**Después:** Mapa en memoria: tras 5 fallos en 60 s, bloqueo de 30 s. Login exitoso limpia el contador.

---

### Test 9b.1 — 5 fallos consecutivos bloquean el 6to intento

**Escenario:** 5 intentos con contraseña incorrecta → 6to intento con credenciales correctas.

**Esperado:** `{ "success": false }`, mensaje menciona "bloqueada"

**Resultado:** ✅ Passed

---

### Test 9b.2 — Login exitoso después de 4 fallos limpia el contador

**Escenario:** 4 fallos → login exitoso → 1 fallo → login exitoso de nuevo.

**Esperado:** Todos los logins exitosos tienen `success: true`

**Resultado:** ✅ Passed

---

## SUITE 9C — B-7: Límite de tamaño en save-business-info

**Finding:** CONFIG-M3  
**Handler:** `config-handlers.js`

**Antes:** `fs.mkdirSync` y `fs.writeFileSync` bloqueaban el event loop. Sin límite de tamaño en el payload.

**Después:** Async I/O con `fsPromises`. Guard: `logoBase64.length > 6.8 M chars` → `{ success: false }`.

---

### Test 9c.1 — Rechaza logoBase64 mayor a 5 MB (decodificado)

**Esperado:** `{ "success": false }`, mensaje menciona "tamaño" o "máximo"

**Resultado:** ✅ Passed

---

### Test 9c.2 — Funciona correctamente sin logo

**Resultado:** ✅ Passed

---

## SUITE 9D — B-8: Validaciones menores (batched)

**Finding IDs:** ADMIN-L2, CONFIG-L2, ADMIN-L3, ADMIN-L4, SES-L3

---

### Test 9d.1 — B-8a: save-user rechaza contraseña < 6 caracteres

```json
{ "password": "abc" }
```

**Esperado:** `{ "success": false }`, mensaje menciona "6" o "contraseña"

**Resultado:** ✅ Passed

---

### Test 9d.2 — B-8b: save-gasto-fijo rechaza monto negativo

```json
{ "monto": -100 }
```

**Esperado:** `{ "success": false }`, mensaje menciona "negativo"

**Resultado:** ✅ Passed

---

### Test 9d.3 — B-8b: save-gasto-fijo acepta monto: 0

**Resultado:** ✅ Passed

---

### Test 9d.4 — B-8c: save-empleado rechaza sueldo negativo

```json
{ "sueldo": -5000 }
```

**Resultado:** ✅ Passed

---

### Test 9d.5 — B-8c: save-empleado acepta sueldo: 0

**Resultado:** ✅ Passed

---

### Test 9d.6 — B-8k: login-attempt ignora payload.username (solo acepta payload.nombre)

**Escenario:** `{ username: "Admin Test", password: "test123" }` — sin campo `nombre`.

**Esperado:** `{ "success": false }` (no autentica)

**Resultado:** ✅ Passed

---

## SUITE 9 — Regresión

### Test 9.1 — login-attempt sigue autenticando correctamente

**Resultado:** ✅ Passed

---

### Test 9.2 — save-general-config con valores válidos (10, 5) sigue funcionando

**Resultado:** ✅ Passed

---

### Test 9.3 — save-user con rol administrador sigue funcionando

**Resultado:** ✅ Passed

---

### Test 9.4 — registrar-compra-producto end-to-end sigue funcionando

**Resultado:** ✅ Passed

---


---

### Test 9d.7 — B-8d: save-user rechaza IDs de permiso inválidos

```json
{ "permisos": ["caja", "hack_the_planet"] }
```

**Esperado:** `{ "success": false }`, mensaje menciona el permiso inválido

**Resultado:** ✅ Passed

---

### Test 9d.8 — B-8d: save-user acepta IDs de permiso conocidos

```json
{ "permisos": ["caja", "productos", "reportes"] }
```

**Resultado:** ✅ Passed

---

### Test 9d.9 — B-8f: registrar-compra-producto rechaza nroFactura duplicado para mismo proveedor

**Escenario:** Dos compras con `nroFactura: "FAC-001"` para el mismo `ProveedorId`.

**Esperado:** Segunda compra → `{ "success": false }`, mensaje menciona `"FAC-001"`

**Resultado:** ✅ Passed

---
## Resumen

| Suite | Descripción | Tests | Estado |
|-------|-------------|-------|--------|
| 1  | Invalidación de sesión en logout (I-1) | 4 | ✅ |
| 2  | Allowlist de campos en session/config (S-3) | 5 | ✅ |
| 3  | Validación de rangos recargo/descuento (I-2) | 6 | ✅ |
| 4  | Guard actualizarPrecioVenta (I-3) | 5 | ✅ |
| 5  | Guard amount en mp:refund-payment (I-4) | 5 | ✅ |
| 6  | Autorización por rol en admin handlers (S-1) | 6 | ✅ |
| 7  | UsuarioId desde sesión, no renderer (S-2) | 2 | ✅ |
| 8  | Validación descuento/recargo en compras (B-3) | 3 | ✅ |
| 9B | Cooldown de intentos de login (B-4) | 2 | ✅ |
| 9C | Límite de tamaño en save-business-info (B-7) | 2 | ✅ |
| 9D | Validaciones menores batched (B-8a/b/c/d/f/k) | 9 | ✅ |
| 9  | Regresión | 4 | ✅ |
| **Total** | | **53** | **53 PASS / 0 FAIL** |
