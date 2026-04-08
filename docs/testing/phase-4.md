# Phase 4 — Test Suite: Integridad de Datos

## Objetivo

Validar que las cinco correcciones de integridad de datos introducidas en Phase 4 se cumplen: atomicidad del import CSV, exclusión de productos inactivos en búsquedas, indexes de rendimiento, cache del admin config y validación FK en guardar-familia.

---

## Entorno de test

- **Runner:** `tests/run-phase-4.js` (plain Node.js, sin framework externo)
- **Base de datos:** In-memory SQLite (fresh para cada run, reset entre tests)
- **Handlers testeados:** `registerProductosHandlers`, `registerVentasHandlers`, `registerCajaHandlers`
- **Migration nueva:** `20260408020000-add-search-indexes.js` (indexes en `codigo_barras` y `plu`)

---

## SUITE 1 — H-7: CSV import fully atomic

**Superficie:** `import-productos-csv` en `productos-handlers.js`

**Antes:** `findOrCreate` para departamentos y familias corría FUERA de la transacción, con `transaction: null`. Si `bulkCreate` fallaba, los departamentos/familias quedaban creados como registros huérfanos. También había una línea estray `section: "Clasificación (Opcional)"` en el payload de `findOrCreate`.

**Después:** Todo el loop (findOrCreate de depts, findOrCreate de families, build de productos, bulkCreate) corre dentro de UNA sola transacción. Un fallo en cualquier paso revierte todo.

---

### Test 1.1 — Departamentos y familias creados atomicamente en import exitoso

**Escenario:**

```json
{
  "csv": "codigo,nombre,precioCompra,precioVenta,stock,unidad,pesable,departamento,familia,plu,codigo_barras\nATOMA1,Producto Atomic A,10,50,5,unidad,NO,DeptAtomico,FamiliaAtomicA,,"
}
```

**Esperado:**
- Import retorna `{ "success": true }`
- Departamento "DeptAtomico" existe en DB
- Familia "FamiliaAtomicA" existe en DB
- Producto `ATOMA1` existe y tiene el `DepartamentoId` correcto

**Resultado:** ✅ Passed

---

### Test 1.2 — Mismo departamento en múltiples filas del CSV — sin duplicados

**Escenario:**

```json
{
  "csv_rows": [
    "DUPD1,Producto Dup1,10,50,5,unidad,NO,DeptDup,FamDup1,,",
    "DUPD2,Producto Dup2,10,60,3,unidad,NO,DeptDup,FamDup2,,"
  ]
}
```

**Esperado:**
- Import exitoso
- Exactamente 1 registro en `ProductoDepartamento` para "DeptDup"
- Ambos productos comparten el mismo `DepartamentoId`

**Resultado:** ✅ Passed — `findOrCreate` dentro de la misma transacción + caché en-memoria previenen duplicados

---

### Test 1.3 — CSV vacío retorna error sin crear registros huérfanos

**Escenario:**

```json
{
  "csv": "codigo,nombre,precioCompra,precioVenta\n"
}
```

**Esperado:**
- `{ "success": false, "message": "El archivo CSV está vacío o tiene un formato incorrecto." }`
- Ningún departamento creado en DB

**Resultado:** ✅ Passed

---

## SUITE 2 — M-6: `activo: true` filter en `busqueda-inteligente`

**Superficies corregidas:**
1. PLU lookup (búsqueda por balanza): agregado `activo: true` al `where`
2. Fallback `findOne` (barcode/codigo/nombre): agregado `activo: true` al `whereClause`

---

### Test 2.1 — Producto inactivo NO retornado por barcode

**Escenario:**

```json
{
  "producto": { "codigo": "INACT1", "codigo_barras": "7790000000001", "activo": false },
  "busqueda": "7790000000001"
}
```

**Esperado:** `null`

**Resultado:** ✅ Passed

---

### Test 2.2 — Producto activo SÍ retornado por barcode

**Escenario:**

```json
{
  "producto": { "codigo": "ACT1", "codigo_barras": "7790000000002", "activo": true },
  "busqueda": "7790000000002"
}
```

**Esperado:** Producto con `codigo: "ACT1"`

**Resultado:** ✅ Passed

---

### Test 2.3 — Producto inactivo NO retornado por nombre

**Escenario:**

```json
{
  "producto": { "nombre": "Producto Fantasma Inactivo", "activo": false },
  "busqueda": "Fantasma Inactivo"
}
```

**Esperado:** `null`

**Resultado:** ✅ Passed

---

### Test 2.4 — Producto inactivo NO retornado por codigo

**Escenario:**

```json
{
  "producto": { "codigo": "INACTCOD", "activo": false },
  "busqueda": "INACTCOD"
}
```

**Esperado:** `null`

**Resultado:** ✅ Passed

---

### Test 2.5 — Producto pesable inactivo NO retornado por barcode de balanza (PLU)

**Escenario:**

```json
{
  "admin_config_balanza": {
    "prefijo": "2",
    "codigo_inicio": "2",
    "codigo_longitud": "4",
    "valor_inicio": "7",
    "valor_longitud": "5",
    "valor_divisor": "1000",
    "tipo_valor": "peso"
  },
  "producto": { "plu": "0011", "pesable": true, "activo": false },
  "barcode_balanza": "200110050000"
}
```

**Esperado:** `null` — el filtro `activo: true` aplica también en el branch de PLU/balanza

**Resultado:** ✅ Passed

---

## SUITE 3 — M-5: Cache de admin config en `busqueda-inteligente`

**Cambio:** Variable `_cachedAdminConfig` a nivel de módulo. Primera llamada hace `findOne` y guarda el resultado. Llamadas subsiguientes usan el caché. Se invalida mediante el handler `config-updated`.

---

### Test 3.1 — Múltiples búsquedas usan el caché correctamente

**Escenario:** Dos llamadas consecutivas a `busqueda-inteligente` con el mismo texto.

```json
{ "busqueda": "Producto A" }
```

**Esperado:**
- Primera llamada: accede a DB (popula caché)
- Segunda llamada: usa caché (mismo resultado, sin nueva query)
- Ambas retornan el mismo producto

**Resultado:** ✅ Passed

---

### Test 3.2 — Canal `config-updated` está registrado

**Escenario:** Verificación estructural del IPC surface.

**Esperado:** `registeredHandlers['config-updated'] !== undefined`

**Resultado:** ✅ Passed

---

### Test 3.3 — Invalidación de caché no rompe búsqueda subsiguiente

**Escenario:**
1. Llamada a `busqueda-inteligente` (popula caché)
2. Llamada a `config-updated` (invalida caché → `_cachedAdminConfig = null`)
3. Llamada a `busqueda-inteligente` (re-popula caché desde DB)

**Esperado:** Resultado correcto en el paso 3

**Resultado:** ✅ Passed

---

## SUITE 4 — M-12: Validación de `DepartamentoId` en `guardar-familia`

**Cambio:** Antes de `findOrCreate`, se verifica que `DepartamentoId` existe con `ProductoDepartamento.findByPk`. Si no existe → retorna `{ success: false, message: "El departamento no existe." }`.

---

### Test 4.1 — Familia con `DepartamentoId` inexistente falla gracefully

**Escenario:**

```json
{
  "nombre": "Familia Fantasma",
  "DepartamentoId": "00000000-0000-0000-0000-000000000000"
}
```

**Esperado:**
- `{ "success": false, "message": "El departamento no existe." }`
- Ninguna familia creada en DB

**Resultado:** ✅ Passed

---

### Test 4.2 — Familia con `DepartamentoId` válido es creada correctamente

**Escenario:**

```json
{
  "nombre": "Familia Real",
  "DepartamentoId": "<uuid-depto-existente>"
}
```

**Esperado:**
- `{ "success": true, "data": { "nombre": "Familia Real", "DepartamentoId": "<uuid>" } }`

**Resultado:** ✅ Passed

---

### Test 4.3 — Campos obligatorios faltantes retornan error

**Escenario A:** `nombre` vacío → `{ "success": false }`

**Escenario B:** `DepartamentoId` null → `{ "success": false }`

```json
[
  { "nombre": "", "DepartamentoId": "uuid-cualquiera" },
  { "nombre": "Sin Depto", "DepartamentoId": null }
]
```

**Resultado:** ✅ Passed

---

## SUITE 5 — Regresión

| Test | Descripción | Resultado |
|------|-------------|-----------|
| 5.1  | CSV import sin pisar stock existente | ✅ |
| 5.2  | Venta normal con producto activo | ✅ |
| 5.3  | `busqueda-inteligente` retorna producto activo por barcode | ✅ |
| 5.4  | `guardar-producto` create + update sin romper Phase 3 allowlist | ✅ |

---

## Resultados Finales

**Fecha:** 2026-04-08
**Runner:** `tests/run-phase-4.js`

| Test | Nombre | Status |
|------|--------|--------|
| 1.1 | H-7: atomicidad CSV — dept/familia creados en import exitoso | ✅ |
| 1.2 | H-7: mismo departamento en CSV — sin duplicados | ✅ |
| 1.3 | H-7: CSV vacío sin registros huérfanos | ✅ |
| 2.1 | M-6: producto inactivo NO retornado por barcode | ✅ |
| 2.2 | M-6: producto activo SÍ retornado por barcode | ✅ |
| 2.3 | M-6: producto inactivo NO retornado por nombre | ✅ |
| 2.4 | M-6: producto inactivo NO retornado por codigo | ✅ |
| 2.5 | M-6: producto pesable inactivo NO retornado por balanza | ✅ |
| 3.1 | M-5: múltiples búsquedas usan caché correctamente | ✅ |
| 3.2 | M-5: canal `config-updated` registrado | ✅ |
| 3.3 | M-5: invalidación de caché no rompe búsqueda | ✅ |
| 4.1 | M-12: DepartamentoId inexistente falla gracefully | ✅ |
| 4.2 | M-12: DepartamentoId válido crea familia correctamente | ✅ |
| 4.3 | M-12: campos obligatorios faltantes retornan error | ✅ |
| 5.1 | [Regresión] CSV sin pisar stock | ✅ |
| 5.2 | [Regresión] Venta normal con producto activo | ✅ |
| 5.3 | [Regresión] `busqueda-inteligente` retorna activo | ✅ |
| 5.4 | [Regresión] `guardar-producto` Phase 3 allowlist intacto | ✅ |

| Métrica | Valor |
|---------|-------|
| Total   | 18    |
| Pass    | 18    |
| Fail    | 0     |

**Phase 4 validada. Las cinco correcciones de integridad de datos están activas.** ✅
