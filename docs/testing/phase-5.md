# Phase 5 — Test Suite: Restricciones de Modelos (ORM Validators)

## Objetivo

Validar que los validators ORM añadidos en Phase 5 a los modelos `Producto`, `DetalleVenta`, `Venta` y `ArqueoCaja` rechazan correctamente datos inválidos en la capa de Sequelize (segunda línea de defensa, tras los handlers).

---

## Entorno de test

- **Runner:** `tests/run-phase-5.js` (plain Node.js, sin framework externo)
- **Base de datos:** In-memory SQLite (fresh para cada run, reset entre tests)
- **Modelos testeados:** `Producto`, `DetalleVenta`, `Venta`, `ArqueoCaja`
- **Técnica principal:** `.build(data).validate()` para aislar validators sin dependencias FK

---

## SUITE 1 — 5.1: Producto ORM validators

**Modelos afectados:** `src/database/models/Producto.js`

**Cambios:**
- `nombre`: agregado `validate: { notEmpty: true }`
- `stock`, `precioCompra`, `precioVenta`: agregado `validate: { min: 0 }`
- `precio_oferta`: agregado `validate: { min: 0 }` (ya tenía `allowNull: true`)

---

### Test 1.1 — Producto rechaza stock negativo

**Escenario:**

```json
{ "codigo": "NEGSTOCK", "nombre": "Stock Negativo", "stock": -1, "precioVenta": 100 }
```

**Esperado:** `SequelizeValidationError` en el campo `stock`

**Resultado:** ✅ Passed

---

### Test 1.2 — Producto rechaza precioVenta negativo

**Escenario:**

```json
{ "codigo": "NEGPV", "nombre": "Precio Negativo", "stock": 5, "precioVenta": -0.01 }
```

**Esperado:** `SequelizeValidationError` en el campo `precioVenta`

**Resultado:** ✅ Passed

---

### Test 1.3 — Producto rechaza precioCompra negativo

**Escenario:**

```json
{ "codigo": "NEGPC", "nombre": "Compra Negativa", "stock": 5, "precioCompra": -5, "precioVenta": 100 }
```

**Esperado:** `SequelizeValidationError` en el campo `precioCompra`

**Resultado:** ✅ Passed

---

### Test 1.4 — Producto rechaza nombre vacío

**Escenario:**

```json
{ "codigo": "EMPTYNOM", "nombre": "", "stock": 5, "precioVenta": 100 }
```

**Esperado:** `SequelizeValidationError` en el campo `nombre` (`notEmpty`)

**Resultado:** ✅ Passed

---

### Test 1.5 — Producto acepta stock=0 y precios=0

**Escenario:**

```json
{ "codigo": "VALID5A", "nombre": "Producto Valido", "stock": 0, "precioCompra": 0, "precioVenta": 0 }
```

**Esperado:** Crea correctamente, `prod.id` definido

**Resultado:** ✅ Passed

---

## SUITE 2 — 5.2: DetalleVenta ORM validators

**Modelos afectados:** `src/database/models/DetalleVenta.js`

**Cambios:**
- `cantidad`: agregado `validate: { min: 0.001 }` (cantidad cero no válida)
- `precioUnitario`, `subtotal`: agregado `validate: { min: 0 }`

---

### Test 2.1 — DetalleVenta rechaza cantidad = 0

**Escenario:**

```json
{ "nombreProducto": "Test", "cantidad": 0, "precioUnitario": 100, "subtotal": 0 }
```

**Esperado:** `SequelizeValidationError` en el campo `cantidad`

**Resultado:** ✅ Passed

---

### Test 2.2 — DetalleVenta rechaza cantidad negativa

**Escenario:**

```json
{ "nombreProducto": "Test", "cantidad": -1, "precioUnitario": 100, "subtotal": 100 }
```

**Esperado:** `SequelizeValidationError` en el campo `cantidad`

**Resultado:** ✅ Passed

---

### Test 2.3 — DetalleVenta rechaza precioUnitario negativo

**Escenario:**

```json
{ "nombreProducto": "Test", "cantidad": 1, "precioUnitario": -0.01, "subtotal": 100 }
```

**Esperado:** `SequelizeValidationError` en el campo `precioUnitario`

**Resultado:** ✅ Passed

---

### Test 2.4 — DetalleVenta rechaza subtotal negativo

**Escenario:**

```json
{ "nombreProducto": "Test", "cantidad": 1, "precioUnitario": 100, "subtotal": -1 }
```

**Esperado:** `SequelizeValidationError` en el campo `subtotal`

**Resultado:** ✅ Passed

---

### Test 2.5 — DetalleVenta acepta valores mínimos válidos

**Escenario:**

```json
{ "nombreProducto": "Valido", "cantidad": 0.001, "precioUnitario": 0, "subtotal": 0 }
```

**Esperado:** `.validate()` no lanza error

**Resultado:** ✅ Passed

---

## SUITE 3 — 5.3: Venta ORM validators

**Modelos afectados:** `src/database/models/Venta.js`

**Cambios:**
- `total`: agregado `validate: { min: 0 }`
- `montoPagado`: agregado `allowNull: false`
- `metodoPago`: ya tenía `validate: { isIn: [...] }` desde Phase 2.1 (sin cambios)

---

### Test 3.1 — Venta rechaza total negativo

**Escenario:**

```json
{ "metodoPago": "Efectivo", "total": -1, "montoPagado": 0 }
```

**Esperado:** `SequelizeValidationError` en el campo `total`

**Resultado:** ✅ Passed

---

### Test 3.2 — Venta rechaza montoPagado null

**Escenario:**

```json
{ "metodoPago": "Efectivo", "total": 100, "montoPagado": null }
```

**Esperado:** `SequelizeValidationError` en el campo `montoPagado`

**Resultado:** ✅ Passed

---

### Test 3.3 — Venta acepta total=0 y montoPagado=0

**Escenario:**

```json
{ "metodoPago": "Efectivo", "total": 0, "montoPagado": 0 }
```

**Esperado:** `.validate()` no lanza error

**Resultado:** ✅ Passed

---

### Test 3.4 — Venta rechaza metodoPago inválido (regresión Phase 2.1)

**Escenario:**

```json
{ "metodoPago": "Bitcoin", "total": 100, "montoPagado": 100 }
```

**Esperado:** `SequelizeValidationError` en el campo `metodoPago` (`isIn` validator)

**Resultado:** ✅ Passed

---

## SUITE 4 — 5.4: ArqueoCaja ORM validators

**Modelos afectados:** `src/database/models/ArqueoCaja.js`

**Cambios:**
- `montoInicial`: agregado `validate: { min: 0 }`
- `montoFinalReal`: agregado `validate: { min: 0 }` (mantiene `allowNull: true`)

---

### Test 4.1 — ArqueoCaja rechaza montoInicial negativo

**Escenario:**

```json
{ "montoInicial": -100, "estado": "ABIERTA", "UsuarioId": "00000000-..." }
```

**Esperado:** `SequelizeValidationError` en el campo `montoInicial`

**Resultado:** ✅ Passed

---

### Test 4.2 — ArqueoCaja rechaza montoFinalReal negativo

**Escenario:**

```json
{ "montoInicial": 0, "montoFinalReal": -50, "estado": "ABIERTA", "UsuarioId": "00000000-..." }
```

**Esperado:** `SequelizeValidationError` en el campo `montoFinalReal`

**Resultado:** ✅ Passed

---

### Test 4.3 — ArqueoCaja acepta montoFinalReal = null

**Escenario:**

```json
{ "montoInicial": 500, "montoFinalReal": null, "estado": "ABIERTA", "UsuarioId": "00000000-..." }
```

**Esperado:** `.validate()` no lanza error (`allowNull: true` se mantiene)

**Resultado:** ✅ Passed

---

### Test 4.4 — ArqueoCaja acepta montoInicial = 0

**Escenario:**

```json
{ "montoInicial": 0, "estado": "ABIERTA", "UsuarioId": "00000000-..." }
```

**Esperado:** `.validate()` no lanza error (`min: 0` es inclusivo)

**Resultado:** ✅ Passed

---

## SUITE 5 — Regresión

### Test 5.1 — seedBase crea Producto y ArqueoCaja sin errores de validación

**Escenario:** Ejecutar `seedBase(MODELS)` en DB limpia con los nuevos validators activos.

**Esperado:**
- `prodA.id` definido, `prodA.stock = 10`
- `arqueo.id` definido, `arqueo.montoInicial = 1000`

**Resultado:** ✅ Passed

---

### Test 5.2 — registrar-venta end-to-end sigue funcionando

**Escenario:**

```json
{
  "detalles": [{ "ProductoId": "<prodA.id>", "cantidad": 2, "precioUnitario": 100, "nombreProducto": "Producto A" }],
  "metodoPago": "Efectivo",
  "montoPagado": 200,
  "UsuarioId": "<admin.id>"
}
```

**Esperado:** `{ "success": true, "datosRecibo": { "total": 200 } }`

**Resultado:** ✅ Passed

---

### Test 5.3 — guardar-producto sigue funcionando con datos válidos

**Escenario:**

```json
{ "nombre": "Producto Phase5 Reg", "codigo": "P5REG", "precioVenta": 150, "precioCompra": 70, "stock": 20, "activo": true }
```

**Esperado:** `{ "success": true }`, producto en DB con `precioVenta = 150`

**Resultado:** ✅ Passed

---

### Test 5.4 — abrir-caja sigue funcionando via IPC

**Escenario:** DB limpia (solo usuario admin, sin ArqueoCaja preexistente).

```json
{ "montoInicial": 500, "usuarioId": "<admin.id>" }
```

**Esperado:** `{ "success": true }`, ArqueoCaja en DB con `montoInicial = 500`

**Nota:** `seedBase` crea un ArqueoCaja abierto automáticamente, por lo que este test crea solo el usuario admin manualmente para evitar el bloqueo de "ya existe una caja abierta".

**Resultado:** ✅ Passed

---

## Resumen

| Suite | Descripción | Tests | Estado |
|-------|-------------|-------|--------|
| 1     | Producto ORM validators (5.1) | 5 | ✅ |
| 2     | DetalleVenta ORM validators (5.2) | 5 | ✅ |
| 3     | Venta ORM validators (5.3) | 4 | ✅ |
| 4     | ArqueoCaja ORM validators (5.4) | 4 | ✅ |
| 5     | Regresión | 4 | ✅ |
| **Total** | | **22** | **22 PASS / 0 FAIL** |
