# System Map — Venta Simple POS

## Entry Point
- main.js
  - Inicializa Electron
  - Configura Sequelize + SQLite
  - Registra IPC handlers
  - Maneja ventanas (login, caja, setup)

## Arquitectura general
- Electron (main + renderer)
- Node.js backend embebido
- SQLite como base de datos local
- Sequelize como ORM

## Módulos clave
- src/ipc-handlers/
  - ventas-handlers → lógica de ventas
  - caja-handlers → operaciones de caja
  - productos-handlers → gestión de productos
- src/database/
  - models/
  - associations.js

## IPC Handlers — ventas-handlers.js

### Handlers registrados
| Channel | Acción |
|---|---|
| `get-ventas` | Devuelve todas las ventas con asociaciones completas (sin paginación) |
| `busqueda-inteligente` | Búsqueda de producto por texto: balanza → barcode → nombre LIKE |
| `registrar-venta` | Crea venta en transacción vía `createSaleTx` |

### Flujo de `registrar-venta`
```
Renderer → IPC: registrar-venta (ventaData)
  └─ createSaleTx(ventaData, t)
       ├─ Calcular subtotal desde detalles (precio del renderer, no DB)
       ├─ Usuario.findOne(rol=administrador) → config recargo/descuento
       ├─ Cliente.findByPk / Cliente.findOrCreate
       ├─ Aplicar descuentos + recargo → totalFinal
       ├─ Venta.create
       ├─ Loop detalles:
       │    ├─ DetalleVenta rows push
       │    └─ Producto.increment(stock: -cantidad) [sin guard]
       └─ DetalleVenta.bulkCreate
```

### Relaciones de modelo utilizadas
- `Venta` → `DetalleVenta` (as: "detalles")
- `DetalleVenta` → `Producto` (as: "producto", paranoid: false)
- `Venta` → `Cliente` (as: "cliente")
- `Venta` → `Usuario` (as: "usuario")
- `Venta` → `Factura` (as: "factura")

### Config de balanza
- Almacenada como JSON string en `Usuario.config_balanza`
- Parseada en cada llamada a `busqueda-inteligente`
- Campos usados: `prefijo`, `codigo_inicio`, `codigo_longitud`, `valor_inicio`, `valor_longitud`, `valor_divisor`, `tipo_valor`

## Modelo de Datos — Estructura y Restricciones

### Venta
| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | UUID | PK, defaultValue UUIDV4 | — |
| `metodoPago` | STRING | NOT NULL | Sin enum/isIn — libre |
| `total` | FLOAT | NOT NULL | Sin min(0) |
| `montoPagado` | FLOAT | nullable | Puede ser NULL |
| `vuelto` | FLOAT | nullable | Puede ser NULL |
| `recargo` | FLOAT | NOT NULL, default 0 | Sin min/max |
| `montoDescuento` | FLOAT | NOT NULL, default 0 | Sin min |
| `ClienteId` | UUID | nullable | FK no enforced (PRAGMA off) |
| `UsuarioId` | — | no declarado en model body | Añadido por association |
| `dniCliente` | STRING | nullable | — |
| `facturada` | BOOLEAN | default false | — |
| `deletedAt` | DATEONLY | paranoid | Soft delete |

**Índices:** `createdAt`, `metodoPago`, `ClienteId`, `facturada`, `total`, `dniCliente`, `UsuarioId`, `updatedAt`, `deletedAt`

---

### DetalleVenta
| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | UUID | PK, defaultValue UUIDV4 | — |
| `nombreProducto` | STRING | NOT NULL | Denormalizado — copia histórica |
| `cantidad` | FLOAT | NOT NULL | Sin min — permite 0 y negativos |
| `precioUnitario` | FLOAT | NOT NULL | Sin min — acepta cualquier float |
| `subtotal` | FLOAT | NOT NULL | Calculado en handler, sin hook de validación |
| `VentaId` | — | no declarado en model body | FK por association |
| `ProductoId` | — | no declarado en model body | FK por association |

**Índices:** `VentaId`, `ProductoId`, `nombreProducto`, `updatedAt`, `deletedAt`

**Nota:** `subtotal` es un valor calculado almacenado (`cantidad * precioUnitario`) sin integridad referencial interna.

---

### Producto
| Campo | Tipo | Restricciones | Notas |
|---|---|---|---|
| `id` | UUID | PK, defaultValue UUIDV4 | — |
| `codigo` | STRING | NOT NULL, unique | Clave de import/export |
| `nombre` | STRING | NOT NULL | No unique — duplicados posibles |
| `stock` | FLOAT | default 0 | Sin min — permite negativos |
| `precioVenta` | FLOAT | default 0 | Sin min — precio 0 válido |
| `precioCompra` | FLOAT | default 0 | Sin min |
| `precio_oferta` | FLOAT | nullable | Sin validación vs. precioVenta |
| `codigo_barras` | STRING | nullable, **no unique** | Índice eliminado |
| `plu` | STRING | nullable, **no unique** | Índice eliminado |
| `activo` | BOOLEAN | default true | NO filtrado en búsqueda |
| `pesable` | BOOLEAN | default false | Usado en búsqueda balanza |
| `fecha_fin_oferta` | DATEONLY | — | Sin hook de expiración |
| `fecha_vencimiento` | DATEONLY | nullable | Sin hook de alerta |
| `DepartamentoId` | UUID | nullable | FK no enforced |
| `FamiliaId` | UUID | nullable | FK no enforced |

**Índices:** `nombre`, `activo`, `DepartamentoId`, `FamiliaId`, `updatedAt`, `deletedAt`
**Índices eliminados:** `codigo_barras`, `plu` (causaban conflicto con unique=false)

---

### Dónde vive la lógica de negocio

| Regla | Handler | Model | DB |
|---|---|---|---|
| Stock no puede ser negativo | ❌ sin guard | ❌ sin validación | ❌ sin CHECK |
| precioUnitario >= 0 | ❌ sin validación | ❌ sin min | ❌ |
| cantidad > 0 | ❌ sin validación | ❌ sin min | ❌ |
| metodoPago en lista conocida | ❌ libre | ❌ sin isIn | ❌ |
| montoPagado >= total (efectivo) | ✅ parcial (handler) | ❌ | ❌ |
| producto activo en búsqueda | ❌ no filtrado | ❌ | ❌ |
| subtotal = cantidad × precioUnitario | ✅ handler calcula | ❌ sin hook | ❌ |
| FK integridad referencial | — | — | ❌ PRAGMA off |

**Conclusión:** La lógica de negocio reside **exclusivamente** en los handlers IPC. El modelo y la base de datos no imponen ninguna restricción de dominio. El renderer es la única fuente de validación para precios, cantidades, y método de pago.

---

## IPC Handlers — productos-handlers.js

### Handlers registrados
| Channel | Acción |
|---|---|
| `get-productos` | Devuelve todos los productos con familia → departamento anidados (sin paginación) |
| `get-producto-by-id` | Busca por PK con asociaciones; retorna null en error |
| `get-clasificaciones` | Devuelve todos los departamentos y familias |
| `guardar-producto` | CREATE o UPDATE según presencia de `id` en payload del renderer |
| `eliminar-producto` | Soft-delete vía `Producto.destroy` (paranoid); FK handler es dead code |
| `toggle-producto-activo` | SELECT + UPDATE para invertir campo `activo` |
| `guardar-departamento` | `findOrCreate` por nombre |
| `guardar-familia` | `findOrCreate` por nombre + DepartamentoId (sin validar existencia del depto) |
| `show-open-dialog` | Proxy del dialog nativo con opciones del renderer sin validar |
| `export-productos-csv` | Exporta todos los productos a CSV vía `dialog.showSaveDialog` |
| `import-productos-csv` | Lee CSV desde path del renderer (sin validación de path) + upsert vía bulkCreate |

### Flujo de `guardar-producto`
```
Renderer → IPC: guardar-producto (productoData)
  └─ sanitizar: nombre, codigo, barras, plu (trim)
  └─ sanitizar numéricos: stock, precioCompra, precioVenta, precio_oferta
       └─ parseFloat || 0; si < 0 → 0 (solo en este handler, no protege contra increment())
  └─ si imagen_base64: decode → writeFile a userData/images/productos/
  └─ si payload.id existe → Producto.update (retorna success:true aunque 0 rows affected)
  └─ si payload.id ausente → Producto.create
```

### Flujo de `import-productos-csv`
```
Renderer → IPC: import-productos-csv (filePath)  ← filePath NO validado
  └─ fs.readFileSync(filePath)  ← lectura síncrona, cualquier archivo del sistema
  └─ Papa.parse(content)
  └─ loop filas (sin límite de count):
       ├─ ProductoDepartamento.findOrCreate({ transaction: null })  ← FUERA de txn
       └─ ProductoFamilia.findOrCreate({ transaction: null })       ← FUERA de txn
  └─ sequelize.transaction():
       └─ Producto.bulkCreate(rows, { updateOnDuplicate: [..., 'stock', ...] })
            └─ si falla → rollback solo afecta productos, NO depts/familias
```

### Modelos adicionales identificados
- `ProductoDepartamento` — clasificación de primer nivel; `nombre` único por findOrCreate
- `ProductoFamilia` — clasificación de segundo nivel; `DepartamentoId` FK no enforced

### Dónde vive la lógica de negocio (productos)

| Regla | Handler | Model | DB |
|---|---|---|---|
| `codigo` obligatorio | ✅ explícito (throw) | ✅ NOT NULL + unique | ✅ UNIQUE index |
| `nombre` no vacío | ❌ no validado | ✅ NOT NULL (no notEmpty) | ❌ |
| stock >= 0 al guardar | ✅ parcial (coerce a 0) | ❌ | ❌ |
| stock >= 0 al vender | ❌ ventas-handlers no verifica | ❌ | ❌ |
| precioVenta >= 0 | ✅ parcial (coerce a 0) | ❌ | ❌ |
| DepartamentoId existe | ❌ no validado | ❌ | ❌ FK off |
| Path CSV seguro | ❌ sin validación | — | — |
| Import atómico | ❌ depts/familias fuera de txn | — | — |
| UPDATE afecta >= 1 fila | ❌ no verificado | — | — |

## Riesgos detectados
- Integridad de datos no garantizada (PRAGMA issue)
- Sin sistema de migraciones
- Posible vulnerabilidad en protocolo app://
- Precios de venta no validados contra base de datos (trust renderer) — **confirmado sin mitigación en ninguna capa**
- Stock puede quedar negativo (sin guard en decremento) — **confirmado sin mitigación en ninguna capa**
- `cantidad` negativa en DetalleVenta puede inflar stock
- `metodoPago` libre en todos los niveles — datos de conciliación no confiables
- `codigo_barras` y `plu` no únicos + sin índice — lookups no determinísticos y lentos
- Productos inactivos no filtrados en búsqueda
- Sin paginación en consulta de ventas
- Todos los valores monetarios almacenados como FLOAT
- `import-productos-csv` lee path arbitrario del renderer — lectura de archivo sin restricción
- Import CSV no es atómico — depts/familias se crean fuera de la transacción
- `bulkCreate updateOnDuplicate` incluye `stock` — importación de precios destruye inventario
- UPDATE de producto retorna success aunque no actualice ninguna fila
- `guardar-producto` payload sin whitelist — cualquier campo del modelo es sobreescribible
- `eliminar-producto` FK handler es dead code bajo condiciones actuales (PRAGMA off + paranoid)