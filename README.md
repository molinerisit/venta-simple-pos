# Venta Simple POS

> Sistema de Punto de Venta de escritorio con arquitectura **offline-first** y sincronización híbrida en la nube.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Railway-4169E1?logo=postgresql)
![License](https://img.shields.io/badge/License-ISC-blue)

---

## Características principales

| Módulo | Descripción |
|--------|-------------|
| **Caja / Ventas** | POS táctil con búsqueda de productos, descuentos, múltiples métodos de pago |
| **Compras** | Registro de compras a proveedores, actualización automática de stock |
| **Inventario** | Productos e insumos con familias, departamentos y precio de costo |
| **Clientes** | Ficha de cliente con historial y cuentas corrientes |
| **Proveedores** | ABM completo con historial de compras |
| **Facturación AFIP** | Emisión de facturas electrónicas A/B/C directamente desde la caja |
| **Pagos QR** | Cobros con Mercado Pago QR integrado al flujo de venta |
| **Impresión térmica** | Compatible con impresoras de 58mm y 80mm |
| **Balanza PLU** | Integración via puerto serial para productos por peso |
| **Reportes** | Ventas, rentabilidad, cierres de caja y exportes |
| **Dashboard** | KPIs en tiempo real con gráficos de performance |
| **Offline-first** | Opera sin internet; sincroniza al reconectarse |

---

## Stack tecnológico

```
┌─────────────────────────────────────────────┐
│              CLIENTE (Desktop)               │
│                                              │
│  Electron 28 + HTML/CSS/JS                   │
│  SQLite local  ←→  Sequelize ORM             │
│  18 IPC Handlers  ←→  21 Modelos             │
│  Impresión térmica │ Balanza serial           │
└──────────────────┬──────────────────────────┘
                   │ HTTP + JWT (sync)
                   │ (offline: cola local)
┌──────────────────▼──────────────────────────┐
│           SERVIDOR (Railway)                 │
│                                              │
│  Express.js API                              │
│  PostgreSQL — fuente única de verdad          │
└─────────────────────────────────────────────┘
```

### Dependencias clave

| Paquete | Uso |
|---------|-----|
| `electron` 28 | Framework desktop |
| `sequelize` + `sqlite3` | ORM + DB local |
| `bcrypt` + `jsonwebtoken` | Autenticación |
| `keytar` | Almacenamiento seguro de credenciales (OS keychain) |
| `electron-pos-printer` | Impresión térmica |
| `node-thermal-printer` | Soporte 58mm/80mm |
| `afip-apis` | Facturación electrónica AFIP |
| `serialport` | Comunicación con balanzas PLU |
| `axios` | Sync con API en la nube |
| `papaparse` | Importación/exportación CSV |

---

## Arquitectura offline-first

El sistema implementa una sincronización bidireccional en dos fases que se ejecuta al iniciar la app:

```
PUSH  →  Cliente envía cambios locales pendientes al servidor
PULL  ←  Cliente descarga cambios realizados por otros puestos
```

### Claves de diseño
- **UUIDs** como PKs para evitar colisiones entre múltiples instancias
- **Timestamps** (`createdAt`, `updatedAt`) como base para resolución de conflictos
- **Soft deletes** (`paranoid: true`) para sincronizar eliminaciones lógicamente
- **WAL mode + caché 20MB** en SQLite para máximo rendimiento local

---

## Modelos de datos (21 modelos)

```
src/database/models/
├── Usuario.js              # Empleados/operadores con roles
├── Producto.js             # Catálogo de productos para venta
├── ProductoDepartamento.js # Departamentos de productos
├── ProductoFamilia.js      # Familias de productos
├── ProductoProveedor.js    # Relación producto ↔ proveedor
├── Insumo.js               # Materias primas / insumos
├── InsumoDepartamento.js   # Departamentos de insumos
├── InsumoFamilia.js        # Familias de insumos
├── InsumoProveedor.js      # Relación insumo ↔ proveedor
├── Proveedor.js            # Proveedores
├── Cliente.js              # Clientes con ficha completa
├── Venta.js                # Cabecera de venta
├── DetalleVenta.js         # Líneas de venta
├── Compra.js               # Cabecera de compra a proveedor
├── DetalleCompra.js        # Líneas de compra
├── Factura.js              # Facturas electrónicas AFIP
├── ArqueoCaja.js           # Cierres y arqueos de caja
├── GastoFijo.js            # Gastos fijos del negocio
├── Empleado.js             # Gestión de personal
├── MovimientoCuentaCorriente.js  # Cuentas corrientes clientes
└── (asociaciones en src/database/associations.js)
```

---

## Módulos IPC (18 handlers)

Cada módulo conecta el renderer (UI) con el proceso principal (Node.js/SQLite):

| Handler | Responsabilidad |
|---------|-----------------|
| `ventas-handlers` | Registrar ventas, aplicar descuentos, calcular cambio |
| `caja-handlers` | Apertura, cierre y arqueo de caja |
| `productos-handlers` | CRUD productos, ajuste de stock, búsqueda |
| `insumos-handlers` | CRUD insumos con control de stock |
| `compras-handlers` | Registro de compras, actualización de costos |
| `clientes-handlers` | ABM clientes, historial de compras |
| `proveedores-handlers` | ABM proveedores |
| `ctascorrientes-handlers` | Movimientos y saldos de cuentas corrientes |
| `facturacion-handlers` | Emisión de facturas electrónicas AFIP |
| `mercadoPago-handlers` | Generación de QR y verificación de pagos |
| `dashboard-handlers` | Métricas y KPIs del período |
| `registerReportesHandlers` | Generación de reportes y exportes |
| `etiquetas-handlers` | Impresión de etiquetas de productos |
| `admin-handlers` | Configuración del sistema y usuarios |
| `session-handlers` | Login, logout, gestión de sesión activa |
| `config-handlers` | Ajustes de hardware y preferencias |
| `scale-handlers` | Comunicación con balanzas PLU |
| `common-handlers` | Helpers compartidos entre módulos |

---

## Vistas (24 pantallas)

```
renderer/windows/
├── login.html                    # Autenticación
├── setup.html                    # Configuración inicial (primer uso)
├── _sidebar.html                 # Navegación lateral (shared)
├── dashboard.html                # KPIs y resumen del negocio
├── caja.html                     # Pantalla principal de venta (POS)
├── cierres-caja.html             # Historial de cierres
├── productos.html                # Listado y gestión de productos
├── producto-form.html            # Alta/edición de producto
├── insumos.html                  # Listado de insumos
├── insumo-form.html              # Alta/edición de insumo
├── compras.html                  # Listado de compras
├── registrar-compra-productos.html  # Nueva compra de productos
├── registrar-compra-insumos.html    # Nueva compra de insumos
├── clientes.html                 # Listado de clientes
├── proveedores.html              # Listado de proveedores
├── proveedor-form.html           # Alta/edición de proveedor
├── cuentas-corrientes.html       # Cuentas corrientes por cliente
├── facturacion.html              # Emisión de facturas AFIP
├── mp_transactions.html          # Historial Mercado Pago
├── pago_qr_modal.html            # Modal de pago QR
├── etiquetas.html                # Configuración de etiquetas
├── etiquetas-seleccion.html      # Selección de productos a etiquetar
├── reportes.html                 # Reportes de ventas
├── rentabilidad.html             # Análisis de rentabilidad
└── admin.html                    # Panel de administración
```

---

## Instalación

### Requisitos

- **Node.js** 18 LTS o 20 LTS
- **npm** 9+
- **Windows** 10/11 (build primario; Linux/macOS experimental)
- **Python** (requerido por `node-gyp` para compilar módulos nativos)
- **Visual C++ Build Tools** (Windows)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/molinerisit/venta-simple-pos.git
cd venta-simple-pos

# 2. Instalar dependencias
npm install

# 3. Recompilar módulos nativos para Electron
npx electron-rebuild -f -w sqlite3

# 4. Ejecutar en modo desarrollo
npm start
# o usar el launcher:
# Caja.bat
```

### Primera ejecución

Al abrir la app por primera vez, se muestra la pantalla de **Setup** para configurar:
- Usuario administrador (nombre, contraseña)
- Datos del negocio
- Hardware (impresora, balanza)

---

## Variables de entorno

Crear `.env` en la raíz del proyecto:

```env
# URL del servidor de sincronización (Railway)
SYNC_API_URL=https://tu-api.railway.app

# Seguridad
JWT_SECRET=tu-secreto-jwt-aqui

# Mercado Pago
MP_ACCESS_TOKEN=APP_USR-...
MP_PUBLIC_KEY=APP_USR-...

# AFIP (facturación electrónica)
AFIP_CUIT=20-12345678-9
AFIP_CERT=./config/afip.crt
AFIP_KEY=./config/afip.key
AFIP_ENVIRONMENT=production  # o: homologation
```

---

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `npm start` | Inicia la app en modo desarrollo |
| `npm run dist` | Genera el instalador de producción (.exe) |
| `npx electron-rebuild -f -w sqlite3` | Recompila módulos nativos |
| `Caja.bat` | Launcher para Windows (inicia con doble clic) |

---

## Estructura del proyecto

```
venta-simple-pos/
├── main.js                    # Proceso principal de Electron
├── package.json
├── Caja.bat                   # Launcher Windows
├── config/
│   └── config.json            # Configuración de entornos DB
├── src/
│   ├── database/
│   │   ├── models/            # 21 modelos Sequelize
│   │   └── associations.js    # Relaciones entre modelos
│   ├── ipc-handlers/          # 18 módulos de comunicación UI↔Main
│   └── scale/                 # Integración de balanzas PLU
├── renderer/
│   ├── windows/               # 24 vistas HTML
│   ├── js/                    # Lógica de cada vista
│   ├── css/                   # Estilos por módulo
│   └── preload.js             # Puente seguro contextBridge
├── models/
│   └── index.js               # Loader de modelos (legacy)
├── seeders/                   # Datos iniciales
└── Iconos/                    # Assets de íconos
```

---

## Licencia

ISC © [Julian Molineris](https://github.com/molinerisit)
