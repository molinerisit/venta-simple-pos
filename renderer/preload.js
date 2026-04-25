// renderer/preload.js (VERSIÓN FINAL CON TODOS LOS CANALES)
const { contextBridge, ipcRenderer } = require("electron");

const validInvokeChannels = [
  // Sesión y Setup
  "login-attempt",
  "get-user-session",
  "submit-setup",
  // Administración y Configuración
  "get-admin-config",
  "get-all-users",
  "get-user-by-id",
  "save-user",
  "delete-user",
  "get-app-modules",
  "save-facturacion-status",
  "save-mp-config",
  "save-balanza-config",
  "get-mp-pos-list", // ✅ CANAL PARA LISTAR CAJAS
  "save-general-config",
  "save-business-info",
  "save-hardware-config",
  "test-print",
  "get-available-ports",
  "save-afip-config",
  "save-arqueo-config",
  // Empleados y Gastos
  "get-empleados",
  "save-empleado",
  "delete-empleado",
  "get-gastos-fijos",
  "save-gasto-fijo",
  "imprimir-comprobante-mp",
  "delete-gasto-fijo",
  // Caja y Arqueo
  "busqueda-inteligente",
  "create-mp-order",
  "registrar-venta",
  "registrar-venta-y-facturar",
  "imprimir-ticket",
  "get-estado-caja",
  "show-toast", // para toasts iniciados desde main
  "save-sync-config",
  "force-sync-now",
  "abrir-caja",
  "cerrar-caja",
  "get-resumen-cierre",
  "get-informe-x",
  "get-all-cierres-caja",
  "registrar-movimiento-caja",
  "get-movimientos-caja",
  // Productos y sus Clasificaciones
  "get-productos",
  "get-producto-by-id",
  "guardar-producto",
  "eliminar-producto",
  "toggle-producto-activo",
  "get-clasificaciones",
  "guardar-departamento",
  "guardar-familia",
  "guardar-familia",
  "export-productos-csv",
  "import-productos-csv",
  // "show-open-dialog" removed — H-5b: generic renderer-controlled dialog was an attack surface
  // Proveedores
  "get-proveedores",
  "get-proveedor-by-id",
  "guardar-proveedor",
  "eliminar-proveedor",
  // Insumos y sus Clasificaciones
  "get-insumos",
  "get-insumo-by-id",
  "guardar-insumo",
  "eliminar-insumo",
  "get-insumo-clasificaciones",
  "guardar-insumo-departamento",
  "guardar-insumo-familia",
  // Clientes
  "get-clientes",
  "get-cliente-by-id",
  "guardar-cliente",
  "eliminar-cliente",
  "get-cliente-by-dni",
  // Compras
  "get-productos-insumos",
  "registrar-compra-insumos",
  "registrar-compra-producto",
  // Reportes y Estadísticas
  "get-dashboard-stats",
  "get-ventas",
  "get-ventas-con-factura",
  "check-mp-payment-status",
  "cobrarmppos",
  "facturar-venta",
  "get-rentabilidad-report",
  "export-report-as-pdf",
  "get-departamentos",
  "get-familias",
  // Etiquetas
  "get-data-for-seleccion",
  "generar-vista-impresion",
  "get-subscription-status",
  // Soporte
  "open-soporte",
  "soporte-chat-init",
  "soporte-chat-send",
  "soporte-chat-poll",
  "soporte-diagnostics",
  "soporte-launch-rustdesk",
  "soporte-open-whatsapp",
  "soporte-copy-report",
  // Monitoreo / heartbeat
  "monitoring-start",
  "monitoring-stop",
  "monitoring-get-hours",
  "monitoring-set-hours",
  "get-session-token",
  "save-license",
  "open-external-url",
  "run-manual-sync",

  // Cuentas Corrientes
  "get-clientes-con-deuda",
  "get-proveedores-con-deuda",
  "registrar-pago-cliente",
  "registrar-abono-proveedor",
  "get-mp-transactions",

  // 🔹 Balanza / Kretz
  "scale-upsert-plu",

  // Lotes (gestión de vencimientos)
  "get-lotes",
  "get-lotes-by-producto",
  "crear-lote",
  "actualizar-lote",
  "eliminar-lote",

  // Ofertas
  "get-ofertas",
  "get-oferta-activa",
  "guardar-oferta",
  "toggle-oferta-activa",
  "eliminar-oferta",

  // Gmail y recuperación de contraseña
  "get-gmail-config",
  "save-gmail-config",
  "test-gmail-config",
  "send-recovery-token",
  "verify-recovery-token",
  "reset-password-with-token",
  "save-scale-config",

  // Catálogo maestro compartido
  "buscar-en-catalogo",
  "enviar-observacion-catalogo",

  // Sesión / Setup
  "check-admin-exists",
  "open-setup-window",

  // Mercado Pago OAuth
  "mp:connect-oauth",
  "mp:disconnect-oauth",
  "mp:get-context",
  "mp:search-payments",
  "mp:get-payment",

  // Acceso remoto
  "remote-get-config",
  "remote-save-config",
  "remote-regenerate-token",
  "remote-get-metrics",
  "remote-start",
  "remote-stop",
  "remote-exec-cmd",
  "remote-list-commands",
];

const validSendChannels = [
  "logout",
  "relaunch-app",
  "open-qr-modal",
  "payment-successful",
  "payment-cancelled",
  "setup-complete",
];
const validOnChannels = [
  "mp-payment-approved",
  "mp-payment-cancelled",
  "mp-oauth-connected",
  "mp-oauth-error",
  "venta-data",
  "show-toast",
  "block-message",
  "license-activated",
  "license-activation-error",
  "update-available",
];

contextBridge.exposeInMainWorld("electronAPI", {
  invoke: (channel, data) => {
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
    console.error(
      `[Preload Error] Llamada a 'invoke' bloqueada. Canal no válido: '${channel}'`
    );
    return Promise.reject(new Error(`Canal IPC no válido: ${channel}`));
  },
  send: (channel, data) => {
    if (validSendChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    } else {
      console.error(
        `[Preload Error] Llamada a 'send' bloqueada. Canal no válido: '${channel}'`
      );
    }
  },
  on: (channel, func) => {
    if (validOnChannels.includes(channel)) {
      const subscription = (event, ...args) => func(...args);
      ipcRenderer.on(channel, subscription);
      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    } else {
      console.error(
        `[Preload Error] Llamada a 'on' bloqueada. Canal no válido: '${channel}'`
      );
    }
  },
  onBlockMessage: (callback) =>
    ipcRenderer.on("block-message", (_event, value) => callback(value)),
});
