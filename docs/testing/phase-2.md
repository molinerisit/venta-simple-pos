# Phase 2 — Test Suite: Integridad Financiera

## Objetivo

Validar que las garantías de integridad financiera introducidas en Phase 2 se cumplen bajo condiciones reales y adversas.

---

## Entorno de test

- **Runner:** `tests/run-phase-2.js` (plain Node.js, sin framework externo)
- **Base de datos:** In-memory SQLite (fresh para cada run, reset entre tests)
- **Handlers testeados:** código de producción real — sin mocks para lógica de negocio

**Datos iniciales:**

| Producto   | Stock | Precio |
|------------|-------|--------|
| Producto A | 10    | 100    |
| Producto B | 1     | 50     |
| Producto C | 0     | 200    |

- Caja abierta al inicio de cada run

---

## SUITE 1 — Ventas (Integridad crítica)

### Test 1.1 — Manipulación de precio (ataque frontend)

**Escenario:** Interceptar request de venta y enviar `precioUnitario: 0.01` para un producto con precio real de 100.

```json
{
  "ProductoId": 1,
  "cantidad": 1,
  "precioUnitario": 0.01
}
```

**Esperado:**
- Venta se crea con precio REAL (100)
- Subtotal correcto
- No usa el valor enviado por el frontend

**Falla si:** Se registra 0.01 → CRÍTICO

**Resultado:** ✅ Passed — precio tomado de DB, precio del renderer ignorado

---

### Test 1.2 — Stock insuficiente

**Escenario:** Producto B (stock 1) → intentar vender cantidad 2.

```json
{
  "ProductoId": 2,
  "cantidad": 2,
  "precioUnitario": 50
}
```

**Esperado:**
- Error: "Stock insuficiente"
- No se crea venta
- Stock sigue en 1

**Resultado:** ✅ Passed

---

### Test 1.3 — Stock negativo exploit

**Escenario:** Enviar cantidad negativa.

```json
{
  "ProductoId": 1,
  "cantidad": -5,
  "precioUnitario": 100
}
```

**Esperado:**
- Error inmediato
- Stock NO cambia

**Resultado:** ✅ Passed — cantidad negativa rechazada antes de cualquier operación DB

---

### Test 1.4 — metodoPago inválido

**Escenario:**

```json
{
  "ProductoId": 1,
  "cantidad": 1,
  "precioUnitario": 100,
  "metodoPago": "BitcoinMagico"
}
```

**Esperado:**
- Error inmediato
- No se crea venta

**Resultado:** ✅ Passed — rechazado en handler y ORM (dos capas independientes)

---

### Test 1.5 — Producto inexistente

**Escenario:**

```json
{
  "ProductoId": 99999,
  "cantidad": 1,
  "precioUnitario": 100,
  "metodoPago": "Efectivo"
}
```

**Esperado:**
- Error
- No hay side effects

**Resultado:** ✅ Passed — lanzado dentro de la transacción, rollback automático

---

## SUITE 2 — Caja (consistencia temporal)

### Test 2.1 — Cierre de caja: totales exactos

**Escenario:** Cerrar caja y verificar que los totales del arqueo coinciden exactamente con las ventas registradas en el período.

**Esperado:**
- Totales del arqueo == sumatoria real de ventas
- `fechaCierre` consistente como límite superior de la query

**Resultado:** ✅ Passed — operación atómica con `sequelize.transaction` + `lock: true`

---

### Test 2.2 — Consistencia de totales por método de pago

**Escenario:** Crear ventas con todos los métodos: Efectivo, Débito, Crédito, Transferencia, CtaCte.

**Esperado:**
- Todos aparecen en el arqueo
- Totales coinciden con sumatoria real por método

**Resultado:** ✅ Passed — incluyendo Transferencia y CtaCte (columnas nuevas en ArqueoCaja)

---

### Test 2.3 — metodoPago legacy normalizado

**Escenario:** Insertar manualmente en DB registros con valores legacy: `"Debito"`, `"Credito"`, `"cta cte"`.

**Esperado:**
- Se normalizan correctamente vía NFD
- Se incluyen en los totales del arqueo

**Resultado:** ✅ Passed — `normalizarMetodoPago` cubre variantes sin acento y con espacios/puntos

> Primera iteración de tests: este caso fallaba porque `normalizarMetodoPago` devolvía `"Debito"` (sin acento) pero `agregarTotalesPorMetodo` buscaba `"Débito"`. Corregido alineando los valores de retorno a los nombres canónicos.

---

## SUITE 3 — Productos (integridad de datos)

### Test 3.1 — CSV import no pisa stock

**Escenario:** Producto A (stock = 10) → importar CSV con mismo producto sin stock o stock = 0.

**Esperado:**
- Stock sigue en 10

**Resultado:** ✅ Passed — `'stock'` removido de `updateOnDuplicate` en `bulkCreate`

---

### Test 3.2 — Update con ID inexistente

**Escenario:** Editar producto con ID inválido/inexistente.

**Esperado:**
- `{ success: false, message: "Producto con id X no encontrado." }`

**Resultado:** ✅ Passed — `affectedRows === 0` dispara throw → rollback → error al caller

---

### Test 3.3 — Update sin cambios

**Escenario:** Guardar mismo producto sin modificar ningún campo.

**Esperado:**
- Sin error
- Sin comportamiento inesperado

**Resultado:** ✅ Passed — SQLite devuelve `affectedRows = 1` si la fila matchea el WHERE, independientemente de si hubo cambio de valor

---

## SUITE 4 — Regresión rápida

Checklist ejecutado en cada run:

| Test | Descripción | Resultado |
|------|-------------|-----------|
| 4.1  | Venta normal con Efectivo | ✅ |
| 4.2  | Caja abre y cierra sin error | ✅ |
| 4.3  | Stock baja correctamente en venta de múltiples ítems | ✅ |

---

## BONUS — Test concurrente

### Test B.1 — 15 ventas concurrentes con stock limitado

**Escenario:** 15 requests simultáneos de venta del mismo producto con `stock = 10`.

**Esperado:**
- `stock` nunca queda < 0
- Algunas ventas fallan correctamente

**Resultado:** ✅ Passed — SQLite serializa writes, ninguna venta dejó stock negativo

> **Nota:** El patrón read-check-decrement sigue siendo teóricamente vulnerable bajo concurrencia extrema. SQLite mitiga esto en la práctica por su modelo de write lock, pero un fix atómico (`UPDATE ... WHERE stock >= cantidad`) sería más robusto. A considerar en una fase futura.

---

## Resultados Finales

**Fecha última ejecución:** 2026-04-08
**Runner:** `tests/run-phase-2.js`

| Test | Nombre | Status |
|------|--------|--------|
| 1.1 | Manipulación de precio rechazada | ✅ |
| 1.2 | Stock insuficiente rechazado | ✅ |
| 1.3 | Cantidad negativa rechazada (stock negativo exploit) | ✅ |
| 1.4 | metodoPago inválido rechazado | ✅ |
| 1.5 | Producto inexistente rechazado (sin side effects) | ✅ |
| 2.1 | Cierre de caja: totales coinciden exactamente con ventas registradas | ✅ |
| 2.2 | Todos los métodos de pago quedan reflejados en el arqueo | ✅ |
| 2.3 | Valores de metodoPago legacy normalizados y contabilizados | ✅ |
| 3.1 | CSV import no sobreescribe stock existente | ✅ |
| 3.2 | Update con ID inexistente retorna success:false | ✅ |
| 3.3 | Update con mismos datos no produce error | ✅ |
| 4.1 | [Regresión] Venta normal con Efectivo | ✅ |
| 4.2 | [Regresión] Caja abre y cierra sin error | ✅ |
| 4.3 | [Regresión] Stock baja correctamente en venta de múltiples ítems | ✅ |
| B.1 | [BONUS] 15 ventas concurrentes con stock=10 — stock no va negativo | ✅ |

| Métrica | Valor |
|---------|-------|
| Total   | 15    |
| Pass    | 15    |
| Fail    | 0     |

**Todos los tests pasaron. Phase 2 validada.** ✅
