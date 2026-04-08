# Phase 6 — Test Suite: Performance y Code Quality

## Objetivo

Validar las mejoras de performance y calidad de código introducidas en Phase 6: paginación en queries de listado, forma de error consistente en catch blocks, I/O asíncrono en CSV, límite de filas en importación, validaciones de negocio adicionales, y optimizaciones menores.

---

## Entorno de test

- **Runner:** `tests/run-phase-6.js` (plain Node.js, sin framework externo)
- **Base de datos:** In-memory SQLite (fresh para cada run, reset entre tests)
- **Handlers testeados:** `registerProductosHandlers`, `registerVentasHandlers`, `registerCajaHandlers`

---

## SUITE 1 — 6.1: Paginación (limit/offset) en handlers de listado [M-1]

**Handlers afectados:** `get-productos`, `get-ventas`, `get-all-cierres-caja`

**Antes:** `findAll` sin `limit` ni `offset` — retornaba todos los registros siempre.

**Después:** Acepta parámetro opcional `{ limit, offset }`. Si no se pasan, se mantiene el comportamiento actual (retorna todo). El renderer puede agregar paginación sin romper compatibilidad.

---

### Test 1.1 — get-productos sin opts retorna todos los productos

**Escenario:** Sin parámetros de paginación.

**Esperado:** Array con todos los 3 productos del seedBase.

**Resultado:** ✅ Passed

---

### Test 1.2 — get-productos con limit=1 retorna solo 1 producto

**Escenario:**

```json
{ "limit": 1 }
```

**Esperado:** Array de longitud 1.

**Resultado:** ✅ Passed

---

### Test 1.3 — get-productos con limit=2 offset=1 salta el primer resultado

**Escenario:**

```json
{ "limit": 2, "offset": 1 }
```

**Esperado:** El primer elemento del resultado paginado debe ser el segundo elemento de la lista completa.

**Resultado:** ✅ Passed

---

### Test 1.4 — get-ventas con limit=1 retorna solo 1 venta

**Escenario:** Se registran 2 ventas, luego se invoca `get-ventas` con `{ limit: 1 }`.

**Esperado:** Array de longitud 1.

**Resultado:** ✅ Passed

---

### Test 1.5 — get-all-cierres-caja con limit=1 retorna solo 1 cierre

**Escenario:** Se crean 2 arqueos cerrados, luego se invoca `get-all-cierres-caja` con `{ limit: 1 }`.

**Esperado:** Array de longitud 1.

**Resultado:** ✅ Passed

---

## SUITE 2 — 6.2: Forma de error consistente en catch blocks [M-2]

**Handlers afectados:** Todos los handlers con semántica `{ success: true/false }`.

**Antes:** Catch blocks retornaban `{ success: false, message }` sin flag `error: true`. Algunos retornaban `{ error: error.message }` (inconsistente).

**Después:** Todos los catch blocks retornan `{ success: false, message, error: true }`. Los retornos de lógica de negocio (no catch) retornan `{ success: false, message }` sin el flag.

---

### Test 2.1 — Catch block en guardar-producto retorna error:true

**Escenario:** `guardar-producto` con un ID que no existe — activa el path de catch.

```json
{ "id": "00000000-0000-0000-0000-000000000099", "nombre": "Ghost", "codigo": "GHOST2", "precioVenta": 100 }
```

**Esperado:** `{ "success": false, "error": true, "message": "..." }`

**Resultado:** ✅ Passed

---

### Test 2.2 — Departamento duplicado retorna mensaje claro

**Escenario:** Crear mismo departamento dos veces.

**Esperado:** `success: false` con `message` en el segundo intento.

**Resultado:** ✅ Passed

---

### Test 2.3 — guardar-producto con id fantasma retorna error:true

**Escenario:** UPDATE con id inexistente.

**Esperado:** `{ "success": false, "error": true }`

**Resultado:** ✅ Passed

---

## SUITE 3 — 6.3/6.5: Export CSV asíncrono [M-10, L-series]

**Handler afectado:** `export-productos-csv`

**Antes:** `fs.writeFileSync(filePath, csv, 'utf-8')` — bloqueaba el event loop durante la escritura.

**Después:** `await fsPromises.writeFile(filePath, csv, 'utf-8')` — I/O asíncrono sin bloqueo.

---

### Test 3.1 — export-produtos-csv escribe el archivo correctamente (async)

**Escenario:** `mockDialog.showSaveDialog` apunta a un archivo temporal.

**Esperado:** El archivo existe, contiene el header `codigo`, y la fila `PRODA`.

**Resultado:** ✅ Passed

---

## SUITE 4 — 6.4: Límite de filas en import CSV [M-11]

**Handler afectado:** `import-productos-csv`

**Antes:** Sin límite — un CSV con millones de filas podía agotar la memoria del proceso.

**Después:** Si `productosCSV.length > 10000`, retorna `{ success: false, error: true }` inmediatamente antes de abrir la transacción.

---

### Test 4.1 — CSV con > 10,000 filas es rechazado

**Escenario:** CSV con 10,001 filas de datos.

**Esperado:**

```json
{ "success": false, "error": true, "message": "El CSV tiene 10001 filas. El límite es 10.000 por lote." }
```

**Resultado:** ✅ Passed

---

### Test 4.2 — CSV con 100 filas es aceptado

**Escenario:** CSV con 100 filas de datos válidos.

**Esperado:** `{ "success": true }`

**Resultado:** ✅ Passed

---

## SUITE 5 — 6.7: Validación precio_oferta < precioVenta [L-2]

**Handler afectado:** `guardar-producto`

**Antes:** Se podía guardar `precio_oferta >= precioVenta` sin error.

**Después:** Si ambos son positivos y `precio_oferta >= precioVenta`, se lanza un error antes del commit.

---

### Test 5.1 — Rechaza precio_oferta igual a precioVenta

**Escenario:**

```json
{ "nombre": "Oferta Invalida", "codigo": "OFBAD", "precioVenta": 100, "precio_oferta": 100 }
```

**Esperado:** `success: false`, mensaje que menciona "oferta".

**Resultado:** ✅ Passed

---

### Test 5.2 — Rechaza precio_oferta mayor que precioVenta

**Escenario:**

```json
{ "precioVenta": 50, "precio_oferta": 80 }
```

**Esperado:** `success: false`

**Resultado:** ✅ Passed

---

### Test 5.3 — Acepta precio_oferta válido (< precioVenta)

**Escenario:**

```json
{ "precioVenta": 100, "precio_oferta": 80 }
```

**Esperado:** `success: true`, `precio_oferta = 80` en DB.

**Resultado:** ✅ Passed

---

### Test 5.4 — Acepta precio_oferta null (sin oferta activa)

**Escenario:**

```json
{ "precioVenta": 100, "precio_oferta": null }
```

**Esperado:** `success: true` (no se ejecuta la validación cuando es null).

**Resultado:** ✅ Passed

---

## SUITE 6 — 6.8: Single-query toggle en toggle-producto-activo [L-4]

**Handler afectado:** `toggle-producto-activo`

**Antes:** SELECT + UPDATE — dos round-trips al DB por toggle.

**Después:** `Producto.update({ activo: sequelize.literal('CASE WHEN activo = 1 THEN 0 ELSE 1 END') }, ...)` — un solo UPDATE.

---

### Test 6.1 — toggle cambia activo de true a false

**Escenario:** `prodA.activo = true`, invocar `toggle-producto-activo`.

**Esperado:** `activo = false` en DB.

**Resultado:** ✅ Passed

---

### Test 6.2 — Doble toggle restaura activo a true

**Escenario:** Dos toggles consecutivos.

**Esperado:** `activo = true` en DB.

**Resultado:** ✅ Passed

---

### Test 6.3 — Toggle en producto inexistente retorna error

**Escenario:** `toggle-produto-activo` con UUID que no existe.

**Esperado:** `{ "success": false, "message": "..." }`

**Resultado:** ✅ Passed

---

## SUITE 7 — 6.10: Validación nombre no vacío en guardar-producto [L-8]

**Handler afectado:** `guardar-producto`

**Antes:** `nombre` vacío pasaba silenciosamente hasta el ORM validator (que podría dar un error menos claro).

**Después:** Falla explícitamente con "El nombre del producto es obligatorio." antes de llegar al ORM.

---

### Test 7.1 — Rechaza nombre vacío

**Escenario:**

```json
{ "nombre": "", "codigo": "EMPTYNOM6", "precioVenta": 100 }
```

**Esperado:** `success: false`, mensaje menciona "nombre" u "obligatorio".

**Resultado:** ✅ Passed

---

### Test 7.2 — Rechaza nombre solo con espacios (post-trim)

**Escenario:**

```json
{ "nombre": "   ", "codigo": "WSNOM6", "precioVenta": 100 }
```

**Esperado:** `success: false` (trim convierte en cadena vacía).

**Resultado:** ✅ Passed

---

### Test 7.3 — Acepta nombre válido

**Escenario:**

```json
{ "nombre": "Producto Valido Phase6", "codigo": "PV6OK", "precioVenta": 50 }
```

**Esperado:** `success: true`

**Resultado:** ✅ Passed

---

## SUITE 8 — Regresión

### Test 8.1 — get-produtos sin paginación retorna todos los productos del seedBase

**Resultado:** ✅ Passed (3 productos presentes)

---

### Test 8.2 — registrar-venta funciona end-to-end

**Resultado:** ✅ Passed

---

### Test 8.3 — busqueda-inteligente funciona sin los debug logs

**Resultado:** ✅ Passed (logs eliminados no afectan la lógica)

---

### Test 8.4 — import-produtos-csv con CSV válido sigue funcionando

**Resultado:** ✅ Passed

---

## Resumen

| Suite | Descripción | Tests | Estado |
|-------|-------------|-------|--------|
| 1     | Paginación limit/offset (6.1) | 5 | ✅ |
| 2     | Error shape consistente (6.2) | 3 | ✅ |
| 3     | Export CSV asíncrono (6.3/6.5) | 1 | ✅ |
| 4     | Límite de filas CSV (6.4) | 2 | ✅ |
| 5     | Validación precio_oferta (6.7) | 4 | ✅ |
| 6     | Single-query toggle (6.8) | 3 | ✅ |
| 7     | Validación nombre (6.10) | 3 | ✅ |
| 8     | Regresión | 4 | ✅ |
| **Total** | | **25** | **25 PASS / 0 FAIL** |
