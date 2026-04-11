# Test Plan — Wave 5

**Date:** 2026-04-10
**Scope:** Covers auto-fixed items (Phase A) and regression surface for Phase B/C items.

---

## A-1 · Float rounding — weight×price (W5-F2)

### Unit test: subtotal normalization
```
input:  precioUnitario = 899.99, cantidad = 0.375
expect: subtotal === 337.50   // Math.round(899.99 * 0.375 * 100) / 100
```

### Unit test: non-pesable product unchanged
```
input:  precioUnitario = 150.00, cantidad = 3
expect: subtotal === 450.00
```

### Unit test: accumulation across 10 weighted items
```
items: 10x { precioUnitario: 99.99, cantidad: 0.333 }
each subtotal = Math.round(99.99 * 0.333 * 100) / 100 = 33.30
total = sum(subtotals) = 333.00
expect: total === 333.00  // no drift
```

### Integration test: createSaleTx stores rounded subtotals
```
Mock Producto with precioVenta = 500, pesable = true
Send registrar-venta with cantidad = 0.777
Query DetalleVenta after commit
expect: DetalleVenta.subtotal === 388.50  // 500 * 0.777 rounded
```

---

## A-2 · Hotkey badges on payment buttons (W5-F4)

### DOM test: badge presence
```
Load caja.html in test environment
expect: document.querySelector('[data-metodo="efectivo"] kbd') to exist
expect: badge text to include 'Num /'
```

### DOM test: all four methods have badges
```
Methods: efectivo, debito, credito, qr
expect: each method button contains a <kbd> element
```

### Visual regression: buttons don't overflow
```
Load caja.html at 1024×768
expect: payment grid renders without horizontal scroll
```

---

## A-3 · Cancel-sale confirmation guard (W5-F5)

### Unit test: empty cart skips confirm
```
Set carritoVenta = []
Call cancelarVenta()
expect: window.confirm NOT called
expect: carritoVenta still === []
```

### Unit test: non-empty cart triggers confirm
```
Set carritoVenta = [{ producto: 'Test', cantidad: 1 }]
Spy on window.confirm, return true
Call cancelarVenta()
expect: window.confirm called once
expect: carritoVenta === [] after confirm
```

### Unit test: confirm cancelled preserves cart
```
Set carritoVenta = [item1, item2]
Spy on window.confirm, return false
Call cancelarVenta()
expect: carritoVenta.length === 2  // not cleared
```

### Unit test: numpad '.' hotkey respects guard
```
Set carritoVenta = [item1]
Fire keydown event { key: '.', location: DOM_KEY_LOCATION_NUMPAD }
Spy window.confirm, return false
expect: carritoVenta.length === 1
```

---

## A-4 · Double-Enter visual state (W5-F6)

### Unit test: .confirm-pending added on first Enter
```
Focus search input or sale context
Simulate keydown Enter
expect: confirmButton.classList.contains('confirm-pending') === true
```

### Unit test: .confirm-pending removed after timeout
```
Simulate first Enter
Wait 2100ms
expect: confirmButton.classList.contains('confirm-pending') === false
```

### Unit test: .confirm-pending removed on second Enter
```
Simulate first Enter
Simulate second Enter (within 2s)
expect: confirmButton.classList.contains('confirm-pending') === false
```

### CSS test: .confirm-pending visible state
```
Apply .confirm-pending to button
expect: computed border-color !== initial border-color
expect: animation defined (keyframes 'pulse' or equivalent)
```

---

## A-5 · Informe X handler (W5-F12)

### Unit test: get-informe-x returns same shape as get-resumen-cierre
```
Create an open ArqueoCaja (sin cierre_at)
Register 3 sales with different metodos
Call get-informe-x
expect response to have keys:
  totalVentasEfectivo, totalVentasDebito, totalVentasCredito,
  totalVentasQR, totalVentasCtaCte, totalVentasTransferencia,
  totalIngresosExtra, totalEgresosExtra,
  totalVentas, cantidadVentas, ticketPromedio
```

### Unit test: get-informe-x does NOT write ArqueoCaja
```
Count ArqueoCaja rows before
Call get-informe-x
Count ArqueoCaja rows after
expect: count before === count after
```

### Unit test: get-informe-x does NOT mark sales as closed
```
Register 2 sales
Call get-informe-x
Query Venta records
expect: all Venta.estado !== 'cerrada'
```

### Integration test: get-informe-x followed by cerrar-caja
```
Register 3 sales
Call get-informe-x → note totalVentas = X
Call cerrar-caja
Query resulting ArqueoCaja.totalVentas
expect: ArqueoCaja.totalVentas === X (same totals)
```

---

## Regression Tests — Existing Functionality

### Caja flow: complete sale still works after A-3
```
Add item to cart
Simulate Enter x2 (within 2s)
expect: venta registered
expect: cart cleared
expect: no confirmation dialog shown (only on cancel)
```

### Weighted product: scale-parsed barcode unaffected by A-1
```
Simulate scale barcode scan for pesable product
expect: cantidad = weight from barcode (not 1)
expect: subtotal = Math.round(precioVenta * weight * 100) / 100
```

### Dashboard Informe X button renders (W5-F12 UI)
```
Open caja.html
expect: #btn-informe-x button visible in header actions
```
