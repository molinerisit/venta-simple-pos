Objetivo

Validar que las garantías de integridad financiera introducidas en Phase 2 se cumplen bajo condiciones reales y adversas.

Entorno de test
Base de datos: copia local limpia
Datos iniciales:
3 productos con stock conocido:
Producto A → stock: 10 → precio: 100
Producto B → stock: 1 → precio: 50
Producto C → stock: 0 → precio: 200
Caja abierta
🧪 SUITE 1 — Ventas (Integridad crítica)
Test 1.1 — Manipulación de precio (ataque frontend)

Escenario:
Interceptar request de venta (DevTools / preload / IPC) y enviar:

{
  "ProductoId": 1,
  "cantidad": 1,
  "precioUnitario": 0.01
}

Esperado:

Venta se crea con precio REAL (100)
Subtotal correcto
No usa el valor enviado

Falla si:

Se registra 0.01 → 🔥 CRÍTICO
Test 1.2 — Stock insuficiente

Escenario:
Producto B (stock 1) → intentar vender cantidad 2

Esperado:

Error: "Stock insuficiente"
No se crea venta
Stock sigue en 1
Test 1.3 — Stock negativo exploit

Escenario:
Enviar:

cantidad: -5

Esperado:

Error
Stock NO cambia
Test 1.4 — metodoPago inválido

Escenario:

metodoPago: "BitcoinMagico"

Esperado:

Error inmediato
No se crea venta
Test 1.5 — Producto inexistente

Escenario:
ProductoId que no existe

Esperado:

Error
No hay side effects
🧪 SUITE 2 — Caja (consistencia temporal)
Test 2.1 — Cierre concurrente

Escenario:

Iniciar cerrar caja
Mientras tanto → crear venta

Esperado:

Venta queda:
o completamente dentro
o completamente fuera
Nunca “medio incluida”
Test 2.2 — Consistencia de totales

Escenario:
Crear ventas con:

Efectivo
Débito
Crédito
Transferencia
CtaCte

Esperado:

Todos aparecen en arqueo
Totales coinciden con sumatoria real
Test 2.3 — metodoPago legacy

Escenario:
Insertar manualmente en DB:

"Debito"
"Credito"
"cta cte"

Esperado:

Se normalizan correctamente
Se incluyen en totales
🧪 SUITE 3 — Productos (integridad de datos)
Test 3.1 — CSV no pisa stock

Escenario:

Producto A stock = 10
Importar CSV con mismo producto pero sin stock o stock=0

Esperado:

Stock sigue en 10
Test 3.2 — Update inexistente

Escenario:
Editar producto con ID inválido

Esperado:

{ success: false }
Test 3.3 — Update sin cambios

Escenario:
Guardar mismo producto sin modificar nada

Esperado:

No error
No comportamiento raro
🧪 SUITE 4 — Regresión rápida

Checklist que corrés SIEMPRE después de cambios:

 Puedo vender normalmente
 Stock baja correctamente
 Caja abre y cierra
 No hay crashes
🧪 BONUS — Test destructivo (opcional pero nivel dios)

Escenario:
Script que dispare 20 ventas simultáneas del mismo producto con stock limitado

Esperado:

Nunca stock < 0
Algunas ventas fallan correctamente