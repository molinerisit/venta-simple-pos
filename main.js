// main.js (VERSIÓN FINAL: Local + MP, Sin Migraciones)

const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  session,
  powerMonitor,
  dialog,
} = require("electron");
const { autoUpdater } = require("electron-updater");

const path = require("path");

const fs = require("fs");

const { Sequelize } = require("sequelize");

const { registerScaleHandlers } = require("./src/ipc-handlers/scale-handlers");

// === ELIMINADO: Lógica de Heartbeat/Sync ===

// --- DECLARACIONES ---

let sequelize;

let models;

// --- GESTIÓN DE VENTANAS ---

let mainWindow, loginWindow, setupWindow, hardwareWindow, qrWindow, soporteWindow;

// ====== INSTANCIA ÚNICA ======

// Registrar protocolo custom ventasimple:// (debe ir antes de ready)
app.setAsDefaultProtocolClient("ventasimple");

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    // Windows: el deep link llega como argumento del proceso
    const { handleDeepLink } = require("./src/ipc-handlers/license-handlers");
    const deepLink = argv.find((a) => a.startsWith("ventasimple://"));
    if (deepLink) {
      handleDeepLink(deepLink);
    }

    // Traer la ventana principal al frente
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    } else {
      createLoginWindow();
    }
  });
}

// macOS: deep link en instancia ya corriendo
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (url.startsWith("ventasimple://")) {
    const { handleDeepLink } = require("./src/ipc-handlers/license-handlers");
    handleDeepLink(url);
  }
});

// ====== HELPERS ======

function createMainWindow() {
  if (mainWindow) {
    mainWindow.focus();

    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1280,

    height: 720,

    minWidth: 940,

    minHeight: 560,

    resizable: true,

    maximizable: true,

    webPreferences: { preload: path.join(__dirname, "renderer/preload.js") },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer/windows/caja.html"));

  mainWindow.maximize();

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

function createLoginWindow() {
  if (loginWindow) {
    loginWindow.focus();

    return loginWindow;
  }

  loginWindow = new BrowserWindow({
    width: 550,

    height: 650,

    webPreferences: { preload: path.join(__dirname, "renderer/preload.js") },

    resizable: false,

    autoHideMenuBar: true,
  });

  loginWindow.loadFile(path.join(__dirname, "renderer/windows/login.html"));

  loginWindow.on("closed", () => {
    loginWindow = null;
  });

  return loginWindow;
}

function createAdminSetupWindow() {
  if (setupWindow) {
    setupWindow.focus();

    return setupWindow;
  }

  setupWindow = new BrowserWindow({
    width: 550,

    height: 650,

    autoHideMenuBar: true,

    webPreferences: { preload: path.join(__dirname, "renderer/preload.js") },

    resizable: false,
  });

  setupWindow.loadFile(path.join(__dirname, "renderer/windows/setup.html"));

  setupWindow.on("closed", () => {
    setupWindow = null;
  });

  return setupWindow;
}

/** Ventana de hardware opcional (solo si la usás en algún flujo) */

function createHardwareWindow() {
  if (hardwareWindow) {
    hardwareWindow.focus();

    return hardwareWindow;
  }

  hardwareWindow = new BrowserWindow({
    width: 700,

    height: 600,

    autoHideMenuBar: true,

    webPreferences: { preload: path.join(__dirname, "renderer/preload.js") },

    resizable: false,
  });

  hardwareWindow.loadFile(
    path.join(__dirname, "renderer/windows/hardware-setup.html")
  );

  hardwareWindow.on("closed", () => {
    hardwareWindow = null;
  });

  return hardwareWindow;
}

// === ELIMINADO: blockApp(message) ===

// === ELIMINADO: withTimeout(promise, ms, fallback) ===

// === ELIMINADO: getAdminSyncConfig() ===

// === ELIMINADO: persistSubscriptionStatus(rowId, status) ===

// === ELIMINADO: checkSubscriptionAndSync() ===

// ====== CICLO DE VIDA ======

app.on("ready", async () => {
  try {
    // Limpieza de sesión SIN tocar localStorage

    await session.defaultSession.clearStorageData({
      storages: ["cookies", "shader_cache", "serviceworkers", "cachestorage"],

      quotas: ["temporary", "persistent"],
    });

    console.log("✅ Sesión limpia.");

    // Production: userData is the OS-designated writable directory for app data.
    // Development: keep next to the project root for easy inspection.
    const dbPath = app.isPackaged
      ? path.join(app.getPath("userData"), "database.sqlite")
      : path.join(__dirname, "database.sqlite");

    sequelize = new Sequelize({
      dialect: "sqlite",

      storage: dbPath,

      logging: false,
    });

    await sequelize.authenticate();

    console.log("✅ DB local ok.");

    // Each PRAGMA must be a separate query call.
    // The sqlite3 driver (sqlite3_prepare + sqlite3_step) only executes the
    // first statement in a multi-statement string — all subsequent PRAGMAs
    // were previously silently ignored, including foreign_keys = ON.
    await sequelize.query("PRAGMA journal_mode = WAL;");
    await sequelize.query("PRAGMA synchronous = NORMAL;");
    await sequelize.query("PRAGMA temp_store = MEMORY;");
    await sequelize.query("PRAGMA cache_size = -20000;");
    await sequelize.query("PRAGMA foreign_keys = ON;");

    // Modelos

    models = {
      Usuario: require("./src/database/models/Usuario")(sequelize),

      Producto: require("./src/database/models/Producto")(sequelize),

      Proveedor: require("./src/database/models/Proveedor")(sequelize),

      Venta: require("./src/database/models/Venta")(sequelize),

      DetalleVenta: require("./src/database/models/DetalleVenta")(sequelize),

      Cliente: require("./src/database/models/Cliente")(sequelize),

      ProductoDepartamento:
        require("./src/database/models/ProductoDepartamento")(sequelize),

      ProductoFamilia: require("./src/database/models/ProductoFamilia")(
        sequelize
      ),

      Empleado: require("./src/database/models/Empleado")(sequelize),

      GastoFijo: require("./src/database/models/GastoFijo")(sequelize),

      Factura: require("./src/database/models/Factura")(sequelize),

      Insumo: require("./src/database/models/Insumo")(sequelize),

      Compra: require("./src/database/models/Compra")(sequelize),

      DetalleCompra: require("./src/database/models/DetalleCompra")(sequelize),

      InsumoDepartamento: require("./src/database/models/InsumoDepartamento")(
        sequelize
      ),

      InsumoFamilia: require("./src/database/models/InsumoFamilia")(sequelize),

      MovimientoCuentaCorriente:
        require("./src/database/models/MovimientoCuentaCorriente")(sequelize),

      ArqueoCaja: require("./src/database/models/ArqueoCaja")(sequelize),

      Lote: require("./src/database/models/Lote")(sequelize),

      MovimientoCaja: require("./src/database/models/MovimientoCaja")(sequelize),

      Oferta: require("./src/database/models/Oferta")(sequelize),

      CatalogCache: require("./src/database/models/CatalogCache")(sequelize),
    };

    const { applyAssociations } = require("./src/database/associations");

    applyAssociations(models);

    const { runMigrations } = require("./src/database/migrator");
    await runMigrations(sequelize);

    console.log("✅ Esquema actualizado.");

    // ── Seed superadmin (primera ejecución) ──────────────────────────
    {
      const bcryptSeed = require("bcryptjs");
      const existingSuperAdmin = await models.Usuario.findOne({ where: { rol: "superadmin" } });
      if (!existingSuperAdmin) {
        const defaultPass = "ventasimple";
        const hashed = await bcryptSeed.hash(defaultPass, 8);
        await models.Usuario.create({
          nombre:       "superadmin",
          password:     hashed,
          email:        "superadmin@ventasimple.com",
          rol:          "superadmin",
          permisos:     ["all"],
        });
        console.log("✅ Superadmin creado. Usuario: superadmin | Contraseña: ventasimple");
      }
    }

    // Handlers IPC

    console.log("[MAIN] Registrando handlers IPC…");

    const { registerLicenseHandlers } = require("./src/ipc-handlers/license-handlers");
    registerLicenseHandlers();

    const { registerSoporteHandlers } = require("./src/ipc-handlers/soporte-handlers");
    registerSoporteHandlers();

    const { registerMonitoringHandlers } = require("./src/ipc-handlers/monitoring-handlers");
    registerMonitoringHandlers();
    ipcMain.handle('open-soporte', () => {
      if (soporteWindow && !soporteWindow.isDestroyed()) {
        soporteWindow.focus();
        return;
      }
      soporteWindow = new BrowserWindow({
        width: 420,
        height: 640,
        minWidth: 360,
        minHeight: 500,
        title: 'Soporte VentaSimple',
        autoHideMenuBar: true,
        resizable: true,
        webPreferences: { preload: path.join(__dirname, 'renderer/preload.js') },
      });
      soporteWindow.loadFile(path.join(__dirname, 'renderer/windows/soporte.html'));
      soporteWindow.on('closed', () => { soporteWindow = null; });
    });

    // ── Auto-updater ──────────────────────────────────────────────────────────
    // Solo corre cuando la app está empaquetada (no en desarrollo)
    if (app.isPackaged) {
      autoUpdater.autoDownload = true;
      autoUpdater.autoInstallOnAppQuit = true;

      autoUpdater.on("update-available", (info) => {
        // Notificar a todas las ventanas que hay update disponible
        BrowserWindow.getAllWindows().forEach(win =>
          win.webContents.send("update-available", { version: info.version })
        );
      });

      autoUpdater.on("update-downloaded", (info) => {
        // Mostrar diálogo nativo para instalar ahora o después
        dialog.showMessageBox({
          type: "info",
          title: "Actualización lista",
          message: `Venta Simple ${info.version} está listo para instalarse.`,
          detail: "La app se va a reiniciar para aplicar la actualización.",
          buttons: ["Instalar y reiniciar", "Más tarde"],
          defaultId: 0,
        }).then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall();
        });
      });

      autoUpdater.on("error", (err) => {
        console.error("[AutoUpdater] Error:", err.message);
      });

      // Chequear al iniciar, luego cada 4 horas
      autoUpdater.checkForUpdatesAndNotify();
      setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);
    }

    const sessionHandlers = require("./src/ipc-handlers/session-handlers");

    sessionHandlers.registerSessionHandlers(
      models,
      sequelize,
      createMainWindow,
      createLoginWindow
    );

    const handlerModules = [
      { name: "admin-handlers", needsSequelize: false },

      { name: "caja-handlers", needsSequelize: true },

      { name: "clientes-handlers", needsSequelize: false },

      { name: "common-handlers", needsSequelize: false },

      { name: "compras-handlers", needsSequelize: true },

      { name: "config-handlers", needsSequelize: true },

      { name: "ctascorrientes-handlers", needsSequelize: true },

      { name: "dashboard-handlers", needsSequelize: true },

      { name: "etiquetas-handlers", needsSequelize: true },

      // { name: "facturacion-handlers", needsSequelize: false }, // <-- COMENTADO (requiere internet/AFIP)

      { name: "insumos-handlers", needsSequelize: true },

      { name: "mercadoPago-handlers", needsSequelize: true }, // <-- RESTAURADO (requiere internet/MP)

      { name: "productos-handlers", needsSequelize: true },

      { name: "proveedores-handlers", needsSequelize: true },

      { name: "ventas-handlers", needsSequelize: true },

      { name: "lotes-handlers", needsSequelize: false },

      { name: "catalog-handlers",  needsSequelize: true },
      { name: "ofertas-handlers",  needsSequelize: true },
      { name: "remote-handlers",   needsSequelize: false },
    ];

    const toRegisterFn = (name) =>
      `register${
        name.charAt(0).toUpperCase() +
        name.slice(1).replace(/-(\w)/g, (_, c) => c.toUpperCase())
      }`;

    handlerModules.forEach((mod) => {
      try {
        const handlerModulePath = path.resolve(
          __dirname,
          `./src/ipc-handlers/${mod.name}.js`
        );

        console.log(`[MAIN] Cargando handler: ${handlerModulePath}`);

        if (!fs.existsSync(handlerModulePath)) {
          console.warn(`[MAIN] Handler no encontrado, se omite: ${mod.name}`);

          return;
        }

        const handlerModule = require(handlerModulePath);

        const functionName = toRegisterFn(mod.name);

        if (typeof handlerModule[functionName] === "function") {
          if (mod.needsSequelize) {
            handlerModule[functionName](models, sequelize);
          } else {
            handlerModule[functionName](models);
          }

          console.log(`[MAIN] ✔ Handler '${mod.name}' ok.`);
        } else {
          console.error(
            `[MAIN] ❌ Falta función '${functionName}' en '${mod.name}.js'.`
          );
        }
      } catch (error) {
        console.error(`[MAIN] ❌ No se pudo cargar '${mod.name}.js'`, error);
      }
    });

    // 🔹 Reportes (get-rentabilidad-report, etc.)
    try {
      const { registerReportesHandlers } = require("./src/ipc-handlers/registerReportesHandlers");
      registerReportesHandlers(models, sequelize);
      console.log("[MAIN] ✔ reportes-handlers registrados.");
    } catch (e) {
      console.warn("[MAIN] reportes-handlers no disponibles:", e?.message || e);
    }

    // 🔹 Kretz / Balanza (PLU & co)

    try {
      registerScaleHandlers(models, sequelize);

      console.log("[MAIN] ✔ scale-handlers registrados.");
    } catch (e) {
      console.warn("[MAIN] scale-handlers no disponibles:", e?.message || e);
    }

    // Protocolo "app://"
    // H-5a: Path traversal fix — resolve and contain within approved roots.
    // Fail-closed: any path outside the two approved roots returns ACCESS_DENIED.

    protocol.registerFileProtocol("app", (request, callback) => {
      try {
        const rawUrl = decodeURI(
          request.url.substring("app://".length).split("?")[0]
        );

        const publicRoot   = path.resolve(path.join(__dirname, "public"));
        const userDataRoot = path.resolve(app.getPath("userData"));

        for (const root of [publicRoot, userDataRoot]) {
          const resolved = path.resolve(path.join(root, rawUrl));
          // A path is contained in root only if it starts with "<root><sep>" or IS root.
          // The separator check prevents "/public_evil" from passing a "/public" prefix test.
          const isContained =
            resolved === root ||
            resolved.startsWith(root + path.sep);

          if (isContained && fs.existsSync(resolved)) {
            callback({ path: resolved });
            return;
          }
        }

        // Deny by default — NET_ERR_ACCESS_DENIED
        callback({ error: -10 });
      } catch {
        callback({ error: -10 });
      }
    });

    // === ELIMINADO: Heartbeat recurrente (setInterval) ===

    // === ELIMINADO: Primer chequeo en background (setImmediate) ===

    // Ventanas iniciales

    // ── Auto-arrancar servidor remoto si estaba habilitado ───────────
    try {
      const sa = await models.Usuario.findOne({ where: { rol: 'superadmin' } });
      if (sa?.remote_access_enabled && sa?.remote_access_token) {
        const remoteServer = require('./src/remote/server');
        const result = await remoteServer.start(models, sa.remote_access_token, sa.remote_access_port || 4827);
        if (result.success) console.log(`✅ Servidor remoto en puerto ${sa.remote_access_port || 4827}`);
        else console.warn(`[REMOTE] No se pudo iniciar: ${result.error}`);
      }
    } catch (e) {
      console.warn('[REMOTE] Error al auto-iniciar:', e.message);
    }

    console.log("--- Boot windows ---");

    // Superadmin siempre existe desde el primer boot → siempre mostramos login.
    // El link "Crear administrador" en el login se muestra si no hay admin regular.
    createLoginWindow();

    // Windows: cold start con deep link en process.argv
    const coldDeepLink = process.argv.find((a) => a.startsWith("ventasimple://"));
    if (coldDeepLink) {
      const { handleDeepLink } = require("./src/ipc-handlers/license-handlers");
      // Esperar un tick para que la ventana esté lista antes de notificarla
      setTimeout(() => handleDeepLink(coldDeepLink), 1500);
    }

    // ====== POWER EVENTS (SIN SYNC) ======

    try {
      powerMonitor.on("suspend", () => console.log("[POWER] suspend"));

      powerMonitor.on("resume", () => console.log("[POWER] resume"));
    } catch {}
  } catch (error) {
    console.error("==============================================");

    console.error("❌ ERROR FATAL AL INICIALIZAR LA APLICACIÓN:", error);

    console.error("==============================================");

    app.quit();
  }
});

// ====== LISTENERS IPC GLOBALES ======

const handleLogout = () => {
  // I-1: clear server-side session state before opening login window
  const { clearSession } = require("./src/ipc-handlers/session-handlers");
  clearSession();

  if (mainWindow) mainWindow.close();

  // (Se mantiene la referencia a qrWindow)

  [qrWindow].forEach((win) => {
    if (win) win.close();
  });

  if (!loginWindow || loginWindow.isDestroyed()) {
    createLoginWindow();
  } else {
    loginWindow.focus();
  }
};

ipcMain.on("logout", handleLogout);

ipcMain.on("switch-user", handleLogout);

ipcMain.handle("open-setup-window", () => {
  createAdminSetupWindow();
});

ipcMain.on("setup-complete", (event) => {
  const setupWin = BrowserWindow.fromWebContents(event.sender);

  if (setupWin && !setupWin.isDestroyed()) setupWin.close();

  createLoginWindow();
});

ipcMain.on("relaunch-app", () => {
  app.relaunch();

  app.quit();
});

ipcMain.on("hardware-setup-complete", () => {
  app.relaunch();

  app.quit();
});

// === IPC: QR modal (RESTAURADO) ===

ipcMain.on("open-qr-modal", (event, data) => {
  if (qrWindow) {
    qrWindow.focus();

    return;
  }

  const parentWindow = BrowserWindow.fromWebContents(event.sender);

  qrWindow = new BrowserWindow({
    parent: parentWindow,

    modal: true,

    width: 400,

    height: 550,

    frame: false,

    resizable: false,

    webPreferences: { preload: path.join(__dirname, "renderer/preload.js") },
  });

  qrWindow.loadFile(
    path.join(__dirname, "renderer/windows/pago_qr_modal.html")
  );

  qrWindow.webContents.on("did-finish-load", () =>
    qrWindow.webContents.send("venta-data", data)
  );

  qrWindow.on("closed", () => {
    qrWindow = null;
  });
});

ipcMain.on("payment-successful", (event, externalReference) => {
  if (mainWindow)
    mainWindow.webContents.send("mp-payment-approved", externalReference);

  if (qrWindow) qrWindow.close();
});

ipcMain.on("payment-cancelled", () => {
  if (mainWindow) mainWindow.webContents.send("mp-payment-cancelled");

  if (qrWindow) qrWindow.close();
});

// === ELIMINADO: IPC: RUN MANUAL SYNC ===

// Cierre app

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // L-10: Guard against activation before DB initialization completes.
    // On macOS, clicking the Dock icon can fire 'activate' before 'ready' finishes.
    if (!models) return;
    (async () => {
      try {
        createLoginWindow();
      } catch (error) {
        console.error("Error en 'activate':", error);
      }
    })();
  }
});
