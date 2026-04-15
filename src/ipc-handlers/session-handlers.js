// src/ipc-handlers/session-handlers.js
const { ipcMain, BrowserWindow } = require("electron");

let activeUserId = null;

// B-4: In-memory brute-force cooldown
// Map: loginName → { failures: number, windowStart: number, lockedUntil: number }
const loginAttempts = new Map();
const MAX_FAILURES   = 5;
const WINDOW_MS      = 60 * 1000;  // 60 s
const LOCKOUT_MS     = 30 * 1000;  // 30 s

/** Clears the active session. Called by main.js handleLogout. */
function clearSession() {
  activeUserId = null;
}

/** Returns the currently active user ID (or null if no session). */
function getActiveUserId() {
  return activeUserId;
}

/** (test helper) resets brute-force counters for a given username */
function _resetLoginAttempts(name) {
  loginAttempts.delete(name);
}

function registerSessionHandlers(models, sequelize, createMainWindow, createLoginWindow) {
  const { Usuario } = models;

  // LOGIN
  ipcMain.handle("login-attempt", async (event, payload = {}) => {
    try {
      // B-8k: standardize on payload.nombre only
      const loginName = String(payload.nombre ?? "").trim();
      const plainPass = String(payload.password ?? "").trim();
      if (!loginName || !plainPass) {
        return { success: false, message: "Usuario o contraseña incorrectos." };
      }

      // B-4: check lockout before hitting DB
      const now = Date.now();
      const rec = loginAttempts.get(loginName) || { failures: 0, windowStart: now, lockedUntil: 0 };
      if (rec.lockedUntil > now) {
        const wait = Math.ceil((rec.lockedUntil - now) / 1000);
        return { success: false, message: `Cuenta bloqueada temporalmente. Intente en ${wait} segundos.` };
      }

      // B-8j: explicit attribute list instead of scope('withPassword')
      const user = await Usuario.findOne({
        where: { nombre: loginName },
        attributes: ["id", "nombre_canon", "password"],
      });
      if (!user || !user.password) {
        return { success: false, message: "Usuario o contraseña incorrectos." };
      }

      const bcrypt = require("bcryptjs");
      const ok = await bcrypt.compare(plainPass, user.password);
      if (!ok) {
        // B-4: record failure
        const windowActive = now - rec.windowStart < WINDOW_MS;
        const failures = (windowActive ? rec.failures : 0) + 1;
        const windowStart = windowActive ? rec.windowStart : now;
        const lockedUntil = failures >= MAX_FAILURES ? now + LOCKOUT_MS : 0;
        loginAttempts.set(loginName, { failures, windowStart, lockedUntil });
        return { success: false, message: "Usuario o contraseña incorrectos." };
      }

      // B-4: successful login clears the counter
      loginAttempts.delete(loginName);
      activeUserId = user.id;

      // Abrimos main y cerramos login cuando esté listo
      // Guard event?.sender for environments where event is null (e.g. tests)
      const loginWin = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
      const mainWin = createMainWindow ? createMainWindow() : null;
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

  // CHECK ADMIN EXISTS — para que el login muestre el link de setup si no hay admin
  ipcMain.handle("check-admin-exists", async () => {
    try {
      const admin = await Usuario.findOne({ where: { rol: "administrador" } });
      return { exists: !!admin };
    } catch {
      return { exists: true }; // fail-safe: si hay error no mostramos el link
    }
  });

  // SESIÓN ACTIVA — S-3: explicit allowlist, no credential fields exposed
  ipcMain.handle("get-user-session", async () => {
    if (!activeUserId) return null;
    try {
      const user = await Usuario.findByPk(activeUserId, {
        attributes: ["id", "nombre", "rol", "permisos"],
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
}

module.exports = { registerSessionHandlers, clearSession, getActiveUserId, _resetLoginAttempts };
