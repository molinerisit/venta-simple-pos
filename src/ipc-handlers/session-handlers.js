// src/ipc-handlers/session-handlers.js
const { ipcMain, BrowserWindow } = require("electron");

let activeUserId = null;

function registerSessionHandlers(models, sequelize, createMainWindow, createLoginWindow) {
  const { Usuario } = models;

  // LOGIN
  ipcMain.handle("login-attempt", async (event, payload = {}) => {
    try {
      // Admitimos { nombre } o { username } desde el front
      const loginName = String(payload.nombre ?? payload.username ?? "").trim();
      const plainPass = String(payload.password ?? "").trim();
      if (!loginName || !plainPass) {
        return { success: false, message: "Usuario o contraseña incorrectos." };
      }

      // Traemos el hash con el scope que incluye 'password'
      const user = await Usuario.scope("withPassword").findOne({ where: { nombre: loginName } });
      if (!user || !user.password) {
        return { success: false, message: "Usuario o contraseña incorrectos." };
      }

      const ok = await user.validPassword(plainPass);
      if (!ok) {
        return { success: false, message: "Usuario o contraseña incorrectos." };
      }

      activeUserId = user.id;

      // Abrimos main y cerramos login cuando esté listo
      const loginWin = BrowserWindow.fromWebContents(event.sender);
      const mainWin = createMainWindow();
      if (mainWin) {
        mainWin.once("ready-to-show", () => {
          if (loginWin && !loginWin.isDestroyed()) loginWin.close();
        });
      }

      return { success: true };
    } catch (error) {
      console.error("[Session] Error grave en 'login-attempt':", error);
      return { success: false, message: "Ocurrió un error inesperado en el servidor." };
    }
  });

  // SESIÓN ACTIVA
  ipcMain.handle("get-user-session", async () => {
    if (!activeUserId) return null;
    try {
      const user = await Usuario.findByPk(activeUserId, {
        attributes: { exclude: ["password"] }, // nunca exponer el hash
        raw: true,
      });
      if (!user) {
        activeUserId = null;
        return null;
      }
      return user;
    } catch (error) {
      console.error("[Session] Error al obtener datos de sesión:", error);
      activeUserId = null;
      return null;
    }
  });

  // LOGOUT
  ipcMain.handle("logout", async () => {
    try {
      activeUserId = null;
      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) win.close();
      });
      createLoginWindow();
      return { success: true };
    } catch (error) {
      console.error("[Session] Logout error:", error);
      return { success: false, message: "No se pudo cerrar sesión." };
    }
  });
}

module.exports = { registerSessionHandlers };
