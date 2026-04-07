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

## Riesgos detectados
- Integridad de datos no garantizada (PRAGMA issue)
- Sin sistema de migraciones
- Posible vulnerabilidad en protocolo app://
- Precios de venta no validados contra base de datos (trust renderer)
- Stock puede quedar negativo (sin guard en decremento)
- Sin paginación en consulta de ventas