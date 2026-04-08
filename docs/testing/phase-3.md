# Phase 3 — Test Suite: Seguridad

## Objetivo

Validar que los tres vectores de ataque cerrados en Phase 3 están efectivamente bloqueados y que ninguna superficie de ataque residual permite ejecución de los exploits originales.

---

## Entorno de test

- **Runner:** manual + `tests/run-phase-2.js` (regresión de Phase 2 incluida)
- **Base de datos:** In-memory SQLite (fresh para cada run)
- **Handlers testeados:** código de producción real — sin mocks para lógica de seguridad
- **Mock de Electron:** `tests/helpers/electron-mock.js` — exporta `mockDialog` para override por test

---

## SUITE 1 — H-5a: Path traversal en protocolo `app://`

**Superficie de ataque:** `protocol.registerFileProtocol("app", ...)` en `main.js`

**Roots aprobados:**
- `<__dirname>/public/`
- `<app.getPath("userData")>/`

---

### Test 1.1 — Path traversal básico

**Escenario:** Renderer solicita un archivo fuera del root con secuencias `..`.

```json
{
  "url": "app://../../sensitive-file.txt"
}
```

**Esperado:**
- Handler retorna `error: -10` (NET_ERR_ACCESS_DENIED)
- Ningún archivo es leído ni servido

**Falla si:** El archivo es servido → CRÍTICO

**Resultado:** ✅ Passed — `path.resolve` + `startsWith(root + sep)` bloquea traversal

---

### Test 1.2 — Prefix spoofing sin separador

**Escenario:** Path que pasa un check naive de `startsWith` porque comparte prefijo con el root pero no está dentro de él.

```json
{
  "url": "app://../../public_evil/secret.txt"
}
```

**Esperado:**
- `path.resolve` produce un path fuera de `public/`
- El check `startsWith(root + path.sep)` lo rechaza (el separador evita el falso positivo)
- Retorna `error: -10`

**Resultado:** ✅ Passed — `path.sep` en el check previene el prefix spoofing

---

### Test 1.3 — URL malformada / error de decode

**Escenario:** URL con secuencia de escape inválida que lanza en `decodeURI`.

```json
{
  "url": "app://%"
}
```

**Esperado:**
- El `try/catch` externo captura el error de decode
- Retorna `error: -10` — fail-closed garantizado

**Resultado:** ✅ Passed — handler nunca falla abierto

---

### Test 1.4 — Path legítimo dentro de `public/`

**Escenario:** Acceso normal a un asset estático de la aplicación.

```json
{
  "url": "app://js/app.js"
}
```

**Esperado:**
- `path.resolve(__dirname/public, "js/app.js")` está dentro de `public/`
- Si el archivo existe → `callback({ path: resolved })`
- Comportamiento idéntico al original para paths válidos

**Resultado:** ✅ Passed — paths legítimos no afectados

---

### Test 1.5 — Path legítimo dentro de `userData/` (imágenes de productos)

**Escenario:** Acceso a imagen de producto guardada en userData.

```json
{
  "url": "app://images/productos/producto_1234567890.png"
}
```

**Esperado:**
- `path.resolve(userData, "images/productos/producto_1234567890.png")` está dentro de `userData/`
- Si el archivo existe → servido correctamente

**Resultado:** ✅ Passed — flujo de imágenes de productos no roto

---

## SUITE 2 — H-5b: Lectura arbitraria de archivos vía CSV import

**Superficie de ataque eliminada:** `import-productos-csv(filePath)` + `show-open-dialog(options)` en `productos-handlers.js`

---

### Test 2.1 — Renderer no puede inyectar file path

**Escenario:** Llamada directa a `import-productos-csv` con un path arbitrario como argumento (simulando renderer comprometido).

```json
{
  "channel": "import-productos-csv",
  "args": ["C:/Windows/System32/drivers/etc/hosts"]
}
```

**Esperado:**
- El handler ignora todos los argumentos del renderer
- Abre `dialog.showOpenDialog` con opciones hardcoded internamente
- El path enviado por el renderer NUNCA es leído

**Falla si:** El contenido del archivo de sistema es leído → CRÍTICO

**Resultado:** ✅ Passed — handler no acepta argumentos; el path no cruza la barrera IPC

---

### Test 2.2 — `show-open-dialog` ya no existe en el surface IPC

**Escenario:** Renderer intenta llamar al canal `show-open-dialog` que fue eliminado.

```json
{
  "channel": "show-open-dialog",
  "args": [{ "properties": ["openFile"], "filters": [] }]
}
```

**Esperado:**
- IPC error: canal no registrado
- No se abre ningún dialog

**Falla si:** El canal responde → handler no fue removido correctamente

**Resultado:** ✅ Passed — canal eliminado de `productos-handlers.js` y del preload whitelist

---

### Test 2.3 — Cancelación del dialog es silenciosa

**Escenario:** Usuario hace click en "Importar CSV" y cancela el dialog de selección de archivo.

```json
{
  "dialog_response": { "canceled": true, "filePaths": [] }
}
```

**Esperado:**
- Handler retorna `{ "success": false, "message": "Importación cancelada." }`
- Renderer no muestra notificación de error (silencioso)
- Botón vuelve a su estado original

**Resultado:** ✅ Passed — `canceled: true` retorna early, renderer filtra el mensaje

---

### Test 2.4 — Flujo normal de importación CSV

**Escenario:** Usuario selecciona un CSV válido a través del dialog. `mockDialog.showOpenDialog` configurado para retornar el archivo de test.

```json
{
  "dialog_response": {
    "canceled": false,
    "filePaths": ["/tmp/test-productos.csv"]
  },
  "csv_content": "codigo,nombre,precioCompra,precioVenta,stock,unidad,pesable\nPROD1,Producto Test,50,100,10,unidad,NO"
}
```

**Esperado:**
- Import procesa el CSV correctamente
- `{ "success": true, "message": "Se procesaron 1 productos." }`
- Producto creado/actualizado en DB

**Resultado:** ✅ Passed — flujo completo funciona con dialog interno (test 3.1 de phase-2 valida esto)

---

## SUITE 3 — M-7: Inyección de campos en `guardar-producto`

**Superficie de ataque:** `const payload = { ...productoData }` en `guardar-producto`

**Allowlist de campos permitidos:**
`id`, `nombre`, `codigo`, `codigo_barras`, `plu`, `stock`, `precioCompra`, `precioVenta`, `precio_oferta`, `unidad`, `pesable`, `activo`, `imagen_base64`, `imagen_url`, `fecha_fin_oferta`, `fecha_vencimiento`, `DepartamentoId`, `FamiliaId`

---

### Test 3.1 — Inyección de campos de sistema

**Escenario:** Renderer envía campos internos de Sequelize junto con los datos válidos del producto.

```json
{
  "id": "uuid-existente",
  "nombre": "Producto Legítimo",
  "codigo": "COD001",
  "precioVenta": 100,
  "precioCompra": 50,
  "createdAt": "1970-01-01T00:00:00.000Z",
  "updatedAt": "1970-01-01T00:00:00.000Z",
  "deletedAt": "1970-01-01T00:00:00.000Z"
}
```

**Esperado:**
- `createdAt`, `updatedAt`, `deletedAt` son descartados por el allowlist filter
- Solo los campos permitidos llegan a `Producto.update()`
- Timestamps del registro no se modifican

**Resultado:** ✅ Passed — `Object.fromEntries` filtra todo lo que no está en `ALLOWED_FIELDS`

---

### Test 3.2 — Inyección de campos de otros modelos

**Escenario:** Renderer intenta modificar campos que pertenecen a modelos relacionados o que no existen en el modelo Producto.

```json
{
  "nombre": "Producto Test",
  "codigo": "COD002",
  "precioVenta": 100,
  "precioCompra": 50,
  "rol": "administrador",
  "UserId": "uuid-usuario",
  "ArqueoCajaId": "uuid-arqueo",
  "password": "hack",
  "isAdmin": true
}
```

**Esperado:**
- `rol`, `UserId`, `ArqueoCajaId`, `password`, `isAdmin` son descartados
- Solo `nombre`, `codigo`, `precioVenta`, `precioCompra` pasan el filtro
- Update/create ejecuta sin campos inyectados

**Resultado:** ✅ Passed — campos fuera del allowlist son silenciosamente descartados

---

### Test 3.3 — Prototype pollution attempt

**Escenario:** Renderer intenta inyectar claves de prototype pollution.

```json
{
  "nombre": "Producto Test",
  "codigo": "COD003",
  "precioVenta": 100,
  "precioCompra": 50,
  "__proto__": { "isAdmin": true },
  "constructor": { "prototype": { "isAdmin": true } }
}
```

**Esperado:**
- `__proto__` y `constructor` no están en `ALLOWED_FIELDS` → descartados
- `Object.fromEntries(Object.entries(...))` no serializa prototype chains

**Resultado:** ✅ Passed — `Object.entries` enumera solo own enumerable properties; allowlist es barrera adicional

---

### Test 3.4 — `productoData` null o undefined

**Escenario:** Handler recibe `null` o `undefined` como payload (bug en renderer o llamada mal formada).

```json
null
```

**Esperado:**
- `productoData || {}` → `{}` — no lanza en `Object.entries`
- Falla con "El campo 'código' es obligatorio." — error controlado
- `{ "success": false, "message": "El campo 'código' es obligatorio." }`

**Resultado:** ✅ Passed — `|| {}` previene crash; validación downstream captura el dato vacío

---

### Test 3.5 — Producto válido: todos los campos permitidos funcionan

**Escenario:** Guardar un producto usando todos los campos del allowlist para verificar que el filtro no bloquea casos legítimos.

```json
{
  "nombre": "Producto Completo",
  "codigo": "COD-FULL",
  "codigo_barras": "7790001234567",
  "plu": "001",
  "stock": 25,
  "precioCompra": 80,
  "precioVenta": 150,
  "precio_oferta": 130,
  "unidad": "kg",
  "pesable": true,
  "activo": true,
  "fecha_fin_oferta": "2026-12-31",
  "fecha_vencimiento": "2027-06-30",
  "DepartamentoId": "uuid-depto",
  "FamiliaId": "uuid-familia"
}
```

**Esperado:**
- Todos los campos pasan el allowlist
- Producto creado con todos los valores correctos
- `{ "success": true }`

**Resultado:** ✅ Passed — flujo legítimo no afectado por el filtro

---

## Resultados Finales

**Fecha:** 2026-04-08
**Tests de regresión (Phase 2):** 15/15 ✅ — ejecutados con los cambios de Phase 3 aplicados

| Suite | Test | Nombre | Status |
|-------|------|--------|--------|
| 1 | 1.1 | Path traversal básico (`../../`) | ✅ |
| 1 | 1.2 | Prefix spoofing sin separador | ✅ |
| 1 | 1.3 | URL malformada — fail-closed | ✅ |
| 1 | 1.4 | Path legítimo en `public/` | ✅ |
| 1 | 1.5 | Path legítimo en `userData/` (imágenes) | ✅ |
| 2 | 2.1 | Renderer no puede inyectar file path | ✅ |
| 2 | 2.2 | `show-open-dialog` eliminado del IPC surface | ✅ |
| 2 | 2.3 | Cancelación del dialog es silenciosa | ✅ |
| 2 | 2.4 | Flujo normal de import CSV | ✅ |
| 3 | 3.1 | Inyección de campos de sistema (`createdAt`, etc.) | ✅ |
| 3 | 3.2 | Inyección de campos de otros modelos | ✅ |
| 3 | 3.3 | Prototype pollution attempt | ✅ |
| 3 | 3.4 | `productoData` null/undefined | ✅ |
| 3 | 3.5 | Producto válido — todos los campos del allowlist | ✅ |

| Métrica | Valor |
|---------|-------|
| Total   | 14    |
| Pass    | 14    |
| Fail    | 0     |

**Phase 3 validada. Las tres superficies de ataque están cerradas.** ✅
