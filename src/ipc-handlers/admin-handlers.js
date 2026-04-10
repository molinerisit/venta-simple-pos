// src/ipc-handlers/admin-handlers.js (Limpiado)
const { ipcMain, BrowserWindow } = require("electron");
const bcrypt = require("bcryptjs"); // B-1: pure-JS, no native rebuild needed
const { getActiveUserId } = require("./session-handlers"); // S-1: role checks

// (opcionales: mantenidos por compatibilidad; no los usa el test-print actual)
const printer = require("node-thermal-printer");
const { PosPrinter } = require("electron-pos-printer");

// S-1: valid role values (explicit allowlist)
const VALID_ROLES = ["administrador", "empleado", "vendedor"];

function registerAdminHandlers(models) {
  const { Usuario, Empleado, GastoFijo } = models;

  /** S-1: returns true only if the active session user has rol === "administrador" */
  async function requireAdmin() {
    const userId = getActiveUserId();
    if (!userId) return false;
    const user = await Usuario.findByPk(userId, { attributes: ["rol"] });
    return user?.rol === "administrador";
  }

  // -----------------------------
  // USUARIOS
  // -----------------------------
  ipcMain.handle("get-all-users", async () => {
    try {
      const users = await Usuario.findAll({
        attributes: { exclude: ["password"] },
        order: [["nombre", "ASC"]],
        raw: true,
      });
      return users;
    } catch (error) {
      console.error("Error en 'get-all-users':", error);
      return [];
    }
  });

  ipcMain.handle("get-app-modules", () => {
    return [
      { id: "caja", nombre: "Caja" },
      { id: "reportes", nombre: "Ventas" },
      { id: "productos", nombre: "Productos" },
      { id: "insumos", nombre: "Insumos" },
      { id: "proveedores", nombre: "Proveedores" },
      { id: "clientes", nombre: "Clientes" },
      { id: "cuentas_corrientes", nombre: "Ctas. Corrientes" },
      { id: "etiquetas", nombre: "Etiquetas" },
      { id: "mp_transactions", nombre: "Transacciones MP" }, // Se mantiene por MercadoPago
      { id: "dashboard", nombre: "Estadísticas" },
    ];
  });

  ipcMain.handle("save-user", async (_event, userData) => {
    try {
      // S-1: only admins may create/edit users
      if (!(await requireAdmin())) {
        return { success: false, message: "Acceso denegado." };
      }

      const { id, nombre, password, rol, permisos } = userData || {};
      const cleanNombre = String(nombre || "").trim();
      const cleanPassword = String(password || "").trim();

      if (!cleanNombre) {
        return { success: false, message: "El nombre de usuario no puede estar vacío." };
      }
      if (!rol) {
        return { success: false, message: "El rol es obligatorio." };
      }
      // S-1: validate rol against allowlist
      if (!VALID_ROLES.includes(rol)) {
        return { success: false, message: `Rol inválido: "${rol}". Valores permitidos: ${VALID_ROLES.join(", ")}.` };
      }
      // B-8a: minimum password length for new users
      if (!id && cleanPassword.length < 6) {
        return { success: false, message: "La contraseña debe tener al menos 6 caracteres." };
      }

      const permsArray = Array.isArray(permisos) ? permisos : [];

      if (id) {
        const userToUpdate = await Usuario.findByPk(id);
        if (!userToUpdate) return { success: false, message: "Usuario no encontrado." };

        userToUpdate.nombre = cleanNombre;
        userToUpdate.rol = rol;
        userToUpdate.permisos = permsArray;

        if (cleanPassword) {
          const salt = await bcrypt.genSalt(10);
          userToUpdate.password = await bcrypt.hash(cleanPassword, salt);
        }
        await userToUpdate.save();
      } else {
        if (!cleanPassword) {
          return { success: false, message: "La contraseña es obligatoria para usuarios nuevos." };
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(cleanPassword, salt);
        await Usuario.create({
          nombre: cleanNombre,
          password: hashedPassword,
          rol,
          permisos: permsArray,
        });
      }
      return { success: true };
    } catch (error) {
      if (error.name === "SequelizeUniqueConstraintError") {
        return { success: false, message: "El nombre de usuario ya existe." };
      }
      console.error("Error en 'save-user':", error);
      return { success: false, message: "Ocurrió un error inesperado al guardar el usuario." };
    }
  });

  ipcMain.handle("delete-user", async (_event, userId) => {
    try {
      // S-1: only admins may delete users
      if (!(await requireAdmin())) {
        return { success: false, message: "Acceso denegado." };
      }
      const userToDelete = await Usuario.findByPk(userId);
      if (!userToDelete) return { success: false, message: "El usuario no existe." };

      if (userToDelete.rol === "administrador") {
        const admins = await Usuario.count({ where: { rol: "administrador" } });
        if (admins <= 1) {
          return { success: false, message: "No se puede eliminar el último administrador." };
        }
      }
      await userToDelete.destroy();
      return { success: true };
    } catch (error) {
      console.error("Error en 'delete-user':", error);
      return { success: false, message: "Error al eliminar el usuario." };
    }
  });

  // 🟢 AÑADIDO: Esta función faltaba pero "admin.js" la necesita
  ipcMain.handle("get-user-by-id", async (_event, userId) => {
    try {
      const user = await Usuario.findByPk(userId, {
        attributes: { exclude: ["password"] },
        raw: true,
      });
      return user;
    } catch (error) {
      console.error("Error en 'get-user-by-id':", error);
      return null;
    }
  });

  // -----------------------------
  // SINCRONIZACIÓN (ELIMINADO)
  // -----------------------------
  // ipcMain.handle("save-sync-config", ...) ELIMINADO

  // -----------------------------
  // EMPLEADOS
  // -----------------------------
  ipcMain.handle("get-empleados", async () => {
    // ... (código sin cambios)
    try {
      return await Empleado.findAll({
        attributes: ["id", "nombre", "funcion", "sueldo", "createdAt", "updatedAt"],
        order: [["nombre", "ASC"]],
        raw: true,
      });
    } catch (error) {
      console.error("Error en 'get-empleados':", error);
      return [];
    }
  });

  ipcMain.handle("save-empleado", async (_event, data) => {
    // ... (código sin cambios)
    try {
      const { id, nombre, funcion, sueldo } = data || {};
      const cleanNombre = String(nombre || "").trim();
      if (!cleanNombre) {
        return { success: false, message: "El nombre del empleado es obligatorio." };
      }
      // B-8c: reject negative sueldo
      const cleanSueldo = Number.isFinite(+sueldo) ? +sueldo : 0;
      if (cleanSueldo < 0) {
        return { success: false, message: "El sueldo no puede ser negativo." };
      }
      const cleanData = {
        nombre: cleanNombre,
        funcion: funcion ? String(funcion).trim() : null,
        sueldo: cleanSueldo,
      };
      if (id) {
        await Empleado.update(cleanData, { where: { id } });
      } else {
        await Empleado.create(cleanData);
      }
      return { success: true };
    } catch (error) {
      console.error("Error al guardar empleado:", error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("delete-empleado", async (_event, id) => {
    // ... (código sin cambios)
    try {
      const result = await Empleado.destroy({ where: { id } });
      return result > 0 ? { success: true } : { success: false, message: "Empleado no encontrado" };
    } catch (error) {
      console.error("Error al eliminar empleado:", error);
      return { success: false, message: "Ocurrió un error inesperado." };
    }
  });

  // -----------------------------
  // GASTOS FIJOS
  // -----------------------------
  ipcMain.handle("get-gastos-fijos", async () => {
    // ... (código sin cambios)
    try {
      return await GastoFijo.findAll({
        attributes: ["id", "nombre", "monto", "createdAt", "updatedAt"],
        order: [["nombre", "ASC"]],
        raw: true,
      });
    } catch (error) {
      console.error("Error en 'get-gastos-fijos':", error);
      return [];
    }
  });

  ipcMain.handle("save-gasto-fijo", async (_event, data) => {
    // ... (código sin cambios)
    try {
      const { id, nombre, monto } = data || {};
      const cleanNombre = String(nombre || "").trim();
      if (!cleanNombre) {
        return { success: false, message: "El nombre del gasto es obligatorio." };
      }
      // B-8b: reject negative monto
      const cleanMonto = Number.isFinite(+monto) ? +monto : 0;
      if (cleanMonto < 0) {
        return { success: false, message: "El monto del gasto no puede ser negativo." };
      }
      const cleanData = {
        nombre: cleanNombre,
        monto: cleanMonto,
      };
      if (id) {
        await GastoFijo.update(cleanData, { where: { id } });
      } else {
        await GastoFijo.create(cleanData);
      }
      return { success: true };
    } catch (error) {
      console.error("Error al guardar gasto fijo:", error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle("delete-gasto-fijo", async (_event, id) => {
    // ... (código sin cambios)
    try {
      const result = await GastoFijo.destroy({ where: { id } });
      return result > 0 ? { success: true } : { success: false, message: "Gasto no encontrado" };
    } catch (error) {
      console.error("Error al eliminar gasto fijo:", error);
      return { success: false, message: "Ocurrió un error inesperado." };
    }
  });

  // -----------------------------
  // AFIP (ELIMINADO)
  // -----------------------------
  // ipcMain.handle("save-afip-config", ...) ELIMINADO

  // -----------------------------
  // FACTURACIÓN (ELIMINADO)
  // -----------------------------
  // ipcMain.handle("save-facturacion-status", ...) ELIMINADO

  // -----------------------------
  // 🔴 INICIO: BLOQUE MOVIDO
  // La lógica de "save-arqueo-config" y "save-balanza-config"
  // se movió a "config-handlers.js" para mantener el código ordenado.
  // -----------------------------
  /*
  ipcMain.handle("save-arqueo-config", async (_event, data) => {
    // ... (CÓDIGO ELIMINADO DE AQUÍ)
  });

  ipcMain.handle("save-balanza-config", async (_event, data) => {
    // ... (CÓDIGO ELIMINADO DE AQUÍ)
  });
  */
  // 🔴 FIN: BLOQUE MOVIDO
  // -----------------------------

 // -----------------------------
  // TEST DE IMPRESIÓN
  // -----------------------------
    // B-2: HTML-escape helper — prevents XSS injection in print templates
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, '&#39;');
  }

ipcMain.handle("test-print", async (_event, printerName) => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (!focusedWindow) {
        return { success: false, message: "No hay ventana enfocada para imprimir." };
      }

      const options = {
        silent: false,
        printBackground: true,
        deviceName: printerName || undefined,
      };

    // B-2: escape printerName before injecting into HTML
    const safePrinterName = escapeHtml(printerName || "(predeterminada)");
      const testWin = new BrowserWindow({ show: false });
      await testWin.loadURL(
        `data:text/html,
        <html>
          <body style="font-family: monospace; font-size:12px; padding:10px;">
            <h2>🧾 PRUEBA DE IMPRESIÓN</h2>
            <p>Impresora: ${safePrinterName}</p>
            <p>Fecha: ${new Date().toLocaleString()}</p>
            <hr/>
            <p>Si ves este ticket, la impresora está funcionando.</p>
          </body>
        </html>`
      );

      await testWin.webContents.executeJavaScript("document.body.innerHTML");

      await new Promise((resolve, reject) => {
        testWin.webContents.print(options, (success, failureReason) => {
          if (!success) reject(new Error(failureReason));
          else resolve();
        });
      });

      testWin.close();
      return { success: true };
    } catch (error) {
      console.error("Error en test-print:", error);
      return { success: false, message: error.message };
    }
  });

  // ==========================================================
  // 🟢 INICIO: CÓDIGO AÑADIDO (IMPRIMIR TICKET REAL)
  // ==========================================================
ipcMain.handle(
    "imprimir-ticket",
    async (_event, { recibo, nombreImpresora }) => {
      try {
        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (!focusedWindow) {
          return {
            success: false,
            message: "No hay ventana enfocada para imprimir.",
          };
        }

        const options = {
          silent: false, // Mantenemos el diálogo
          printBackground: true,
          deviceName: nombreImpresora || undefined,
          copies: 1,
          // Quitamos pageSize y margins
        };

        const ticketWin = new BrowserWindow({ show: false });

        // Convertir el texto plano del recibo a HTML para imprimir
        const htmlRecibo = `
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { 
              font-family: 'Courier New', Courier, monospace; 
              
              /* ⬇️ 1. ACHICAMOS LA FUENTE ⬇️ */
              font-size: 9px; 
              
              line-height: 1.4;
              width: 100%;
              margin: 0;
              padding: 5px;
              
              /* ⬇️ 2. MANTENEMOS OSCURO ⬇️ */
              font-weight: bold;
              color: #000;
            }
            pre { 
              font-family: 'Courier New', Courier, monospace; 
              
              /* ⬇️ 1. ACHICAMOS LA FUENTE ⬇️ */
              font-size: 9px; 
              
              margin: 0;
              white-space: pre-wrap;
              
              /* ⬇️ 2. MANTENEMOS OSCURO ⬇️ */
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <pre>${escapeHtml(recibo)}</pre>
        </body>
        </html>
      `;

        await ticketWin.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent(htmlRecibo)}`
        );

        await ticketWin.webContents.executeJavaScript(
          "document.body.innerHTML"
        );

        await new Promise((resolve, reject) => {
          ticketWin.webContents.print(options, (success, failureReason) => {
            if (!success) {
              console.error("Fallo al imprimir:", failureReason);
              reject(new Error(failureReason));
            } else {
              resolve();
            }
          });
        });

        ticketWin.close();
        return { success: true };
      } catch (error) {
        console.error("Error en imprimir-ticket:", error);
        return { success: false, message: error.message };
      }
    }
  );
  // ==========================================================
  // 🟢 FIN: CÓDIGO AÑADIDO
  // ==========================================================

} // 👈 Esta es la llave de cierre de registerAdminHandlers


module.exports = { registerAdminHandlers };