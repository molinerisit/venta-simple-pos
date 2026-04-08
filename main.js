// main.js (VERSIÓN FINAL: Local + MP, Sin Migraciones)

const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  session,
  powerMonitor,
} = require("electron");

const path = require("path");

const fs = require("fs");

const { Sequelize } = require("sequelize");

const { registerScaleHandlers } = require("./src/ipc-handlers/scale-handlers");

// === ELIMINADO: Lógica de Heartbeat/Sync ===

// --- DECLARACIONES ---

let sequelize;

let models;

// --- GESTIÓN DE VENTANAS ---

let mainWindow, loginWindow, setupWindow, hardwareWindow, qrWindow;

// ====== INSTANCIA ÚNICA ======

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // Enviar al frente alguna ventana existente

    const win = BrowserWindow.getAllWindows()[0];

    if (win) {
      if (win.isMinimized()) win.restore();

      win.focus();
    } else {
      // Si no hay ventanas, creamos la adecuada

      if (models?.Usuario) {
        models.Usuario.findOne({ where: { rol: "administrador" } })

          .then((admin) =>
            admin ? createLoginWindow() : createAdminSetupWindow()
          )

          .catch(() => createLoginWindow());
      } else {
        createLoginWindow();
      }
    }
  });
}

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

    // Así guardará en tu carpeta de proyecto

    const dbPath = path.join(__dirname, "database.sqlite");

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

      // Subscription: require(...)  <-- ELIMINADO
    };

    const { applyAssociations } = require("./src/database/associations");

    applyAssociations(models);

    // === BLOQUE DE MIGRACIONES ELIMINADO ===

    // try {

    //   const { runMigrations } = require("./src/migrations/migrator");

    //   await runMigrations(sequelize);

    // } catch (e) {

    //   ...

    // }

    await sequelize.query("PRAGMA foreign_keys = OFF");

    try {
      //await sequelize.sync({ alter: true });

      await sequelize.sync();
    } finally {
      await sequelize.query("PRAGMA foreign_keys = ON");
    }

    console.log("✅ Esquema actualizado.");

    // Handlers IPC

    console.log("[MAIN] Registrando handlers IPC…");

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

    // 🔹 Kretz / Balanza (PLU & co)

    try {
      registerScaleHandlers(models, sequelize);

      console.log("[MAIN] ✔ scale-handlers registrados.");
    } catch (e) {
      console.warn("[MAIN] scale-handlers no disponibles:", e?.message || e);
    }

    // Protocolo "app://"

    protocol.registerFileProtocol("app", (request, callback) => {
      const url = decodeURI(
        request.url.substring("app://".length).split("?")[0]
      );

      const publicPath = path.join(__dirname, "public", url);

      const userDataPath = path.join(app.getPath("userData"), url);

      if (fs.existsSync(publicPath)) callback({ path: publicPath });
      else if (fs.existsSync(userDataPath)) callback({ path: userDataPath });
      else callback({ error: -6 });
    });

    // === ELIMINADO: Heartbeat recurrente (setInterval) ===

    // === ELIMINADO: Primer chequeo en background (setImmediate) ===

    // Ventanas iniciales

    console.log("--- Boot windows ---");

    const adminExists = await models.Usuario.findOne({
      where: { rol: "administrador" },
    });

    if (adminExists) createLoginWindow();
    else createAdminSetupWindow();

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
    (async () => {
      try {
        const adminExists = await models.Usuario.findOne({
          where: { rol: "administrador" },
        });

        if (adminExists) createLoginWindow();
        else createAdminSetupWindow();
      } catch (error) {
        console.error("Error en 'activate':", error);
      }
    })();
  }
});
