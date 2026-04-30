// src/ipc-handlers/session-handlers.js
const { ipcMain, BrowserWindow } = require("electron");

let activeUserId   = null;
let activeToken    = null;

const { CLOUD_API_URL } = require('../config');

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

// Verifica credenciales contra el backend en la nube.
// Devuelve { nombre, rol, tenant_id } si OK, o null si falla.
async function tryCloudLogin(email, password) {
  try {
    const fetch = require("node-fetch");
    const res = await fetch(`${CLOUD_API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      timeout: 8000,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Crea o actualiza el usuario local a partir de los datos de la nube.
// Guarda un bcrypt del password para que el login siguiente funcione offline.
async function upsertCloudUser(Usuario, { email, nombre, rol, plainPassword }) {
  const bcrypt = require("bcryptjs");
  const hash = await bcrypt.hash(plainPassword, 10);
  const nombreLimpio = (nombre || email.split("@")[0]).trim();

  // 1. Coincidencia exacta por email (cuenta ya sincronizada antes)
  let user = await Usuario.findOne({ where: { email } });
  if (user) {
    await user.update({ nombre: nombreLimpio, password: hash });
    return user;
  }

  // 2. Existe un admin local con distinto email (cuenta anterior en esta PC).
  //    Reasignamos sus credenciales para preservar todos los datos locales
  //    (ventas, productos, etc.) y evitar conflictos de nombre_canon.
  const existingAdmin = await Usuario.findOne({ where: { rol: "administrador" } });
  if (existingAdmin) {
    await existingAdmin.update({ email, nombre: nombreLimpio, password: hash });
    return existingAdmin;
  }

  // 3. Base de datos vacía → crear desde cero
  return await Usuario.create({
    nombre:   nombreLimpio,
    email,
    password: hash,
    rol:      "administrador",
  });
}

function registerSessionHandlers(models, sequelize, createMainWindow, createLoginWindow) {
  const { Usuario } = models;

  // LOGIN
  ipcMain.handle("login-attempt", async (event, payload = {}) => {
    try {
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

      const isEmail = loginName.includes("@");
      const bcrypt  = require("bcryptjs");

      // ── 1. Buscar en base local ────────────────────────────────
      let localUser = await Usuario.findOne({
        where: isEmail
          ? { email: loginName }
          : { nombre_canon: loginName.toLowerCase() },
        attributes: ["id", "nombre_canon", "password"],
      });

      // ── 2. Verificar contraseña local ──────────────────────────
      if (localUser && localUser.password) {
        const ok = await bcrypt.compare(plainPass, localUser.password);
        if (ok) {
          loginAttempts.delete(loginName);
          activeUserId = localUser.id;
          return openMainWindow(event, createMainWindow);
        }
        // Password local incorrecta: si no es email, falla directo
        if (!isEmail) {
          return recordFailure(loginAttempts, loginName, rec, now);
        }
        // Si es email: puede que cambiaron la clave en la web → intentar nube
      }

      // ── 3. Fallback nube (solo para emails) ───────────────────
      if (!isEmail) {
        return recordFailure(loginAttempts, loginName, rec, now);
      }

      const cloud = await tryCloudLogin(loginName, plainPass);
      if (!cloud) {
        // Distinguir entre cuenta no encontrada y sin conexión
        const msg = localUser
          ? "Contraseña incorrecta."
          : "Cuenta no encontrada. Verificá el email o tu conexión a internet.";
        return recordFailure(loginAttempts, loginName, rec, now, msg);
      }

      // ── 4. Sincronizar cuenta cloud → local ───────────────────
      const synced = await upsertCloudUser(Usuario, {
        email:         loginName,
        nombre:        cloud.nombre,
        rol:           cloud.rol,
        plainPassword: plainPass,
      });

      loginAttempts.delete(loginName);
      activeUserId = synced.id;

      // Arrancar heartbeat inteligente + polling de comandos remotos
      if (cloud.token) {
        activeToken = cloud.token;
        const heartbeat = require('../heartbeat');
        const executor  = require('../command-executor');
        heartbeat.loadHoursAndStart(cloud.token).catch(() => {});
        executor.startPolling(cloud.token);
      }

      return openMainWindow(event, createMainWindow);

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

  // Token cloud activo (para IPC handlers que necesitan autenticar al backend)
  ipcMain.handle("get-session-token", () => activeToken || null);

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

// ── Helpers internos ──────────────────────────────────────────────

function recordFailure(map, key, rec, now, msg = "Usuario o contraseña incorrectos.") {
  const windowActive = now - rec.windowStart < WINDOW_MS;
  const failures     = (windowActive ? rec.failures : 0) + 1;
  const windowStart  = windowActive ? rec.windowStart : now;
  const lockedUntil  = failures >= MAX_FAILURES ? now + LOCKOUT_MS : 0;
  map.set(key, { failures, windowStart, lockedUntil });
  return { success: false, message: msg };
}

function openMainWindow(event, createMainWindow) {
  const loginWin = event?.sender ? BrowserWindow.fromWebContents(event.sender) : null;
  const mainWin  = createMainWindow ? createMainWindow() : null;
  if (mainWin) {
    mainWin.once("ready-to-show", () => {
      if (loginWin && !loginWin.isDestroyed()) loginWin.close();
    });
  }
  return { success: true };
}

function getActiveToken() { return activeToken; }

module.exports = { registerSessionHandlers, clearSession, getActiveUserId, getActiveToken, _resetLoginAttempts };
