// src/ipc-handlers/config-handlers.js
const { ipcMain, app, BrowserWindow } = require("electron");
const { SerialPort } = require("serialport");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");

// B-7: max logo payload size (5 MB decoded ≈ 6.8 M base64 chars)
const MAX_LOGO_B64_CHARS = Math.ceil(5 * 1024 * 1024 / 0.75);
const bcrypt = require("bcryptjs"); // B-1: pure-JS, no native rebuild needed

// Importamos el manager de la balanza
const { getScaleManager } = require("../scale/scale-manager");

// Servicio de email
const { testConnection, sendRecoveryToken } = require("../services/email-service");

// Registra TODOS los handlers de configuración
function registerConfigHandlers(models, sequelize) {
  const { Usuario } = models;

  // ===================================================================
  // 🟢 INICIO: FUNCIÓN RESTAURADA
  // Este es el handler que faltaba para crear el primer admin.
  // ===================================================================
  ipcMain.handle("submit-setup", async (_event, { nombre, password, email }) => {
    try {
      const cleanName = String(nombre || "").trim();
      const cleanPassword = String(password || "").trim();
      if (!cleanName || !cleanPassword) {
        return { success: false, message: "Nombre y contraseña son obligatorios." };
      }
      // B-8a: minimum password length
      if (cleanPassword.length < 6) {
        return { success: false, message: "La contraseña debe tener al menos 6 caracteres." };
      }

      // Validate email format if provided
      const cleanEmail = String(email || "").trim() || null;
      if (cleanEmail) {
        const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRe.test(cleanEmail)) {
          return { success: false, message: "El formato del correo electrónico no es válido." };
        }
      }

      const salt = await bcrypt.genSalt(8);
      const hashedPassword = await bcrypt.hash(cleanPassword, salt);

      const newAdmin = await Usuario.create({
        nombre: cleanName,
        password: hashedPassword,
        email: cleanEmail,
        rol: "administrador",
        permisos: ["all"], // Asumimos 'all' para el primer admin
      });

      const { password: _omit, ...userData } = newAdmin.toJSON();
      return { success: true, userData };
    } catch (error) {
      console.error("[SETUP] Error al crear el administrador:", error);
      const msg =
        error?.name === "SequelizeUniqueConstraintError"
          ? "Ya existe un administrador con ese nombre."
          : error.message || "Error al crear el admin";
      return { success: false, message: msg };
    }
  });
  // ===================================================================
  // 🟢 FIN: FUNCIÓN RESTAURADA
  // ===================================================================

  // --- LÓGICA DE CARGA ---

  ipcMain.handle("get-admin-config", async () => {
    try {
      // S-3: explicit allowlist — excludes mp_access_token, mp_user_id, mp_pos_id, password
      const adminUser = await Usuario.findOne({
        where: { rol: "administrador" },
        attributes: [
          "id", "nombre", "rol", "permisos",
          "config_puerto_scanner", "config_puerto_impresora",
          "config_balanza", "config_balanza_conexion", "config_arqueo_caja",
          "config_redondeo_automatico", "config_recargo_credito", "config_descuento_efectivo",
          "nombre_negocio", "slogan_negocio", "footer_ticket", "logo_url", "direccion_negocio", "mp_access_token",
        ],
        raw: true,
      });

      if (!adminUser) {
        console.error("No se encontró usuario admin para cargar config.");
        return null;
      }

      // Parsear campos JSON que pueden estar guardados como texto
      const parseJSONField = (field) => {
        if (typeof field === "string") {
          try {
            return JSON.parse(field);
          } catch (e) {
            return null; // Devuelve null si el JSON es inválido
          }
        }
        return field || null; // Devuelve el objeto si ya es un objeto, o null
      };

      adminUser.config_balanza = parseJSONField(adminUser.config_balanza);
      adminUser.config_balanza_conexion = parseJSONField(
        adminUser.config_balanza_conexion
      );
      adminUser.config_arqueo_caja = parseJSONField(
        adminUser.config_arqueo_caja
      );
      // ⬇️ AÑADE ESTA LÍNEA AQUÍ ⬇️
      adminUser.config_redondeo_automatico = parseJSONField(
        adminUser.config_redondeo_automatico
      );
      adminUser.permisos = parseJSONField(adminUser.permisos);
      adminUser.mp_configurado = !!adminUser.mp_access_token;
      delete adminUser.mp_access_token;

      return adminUser;
    } catch (error) {
      console.error("Error al cargar config de admin:", error);
      return null;
    }
  });

  // --- LÓGICA DE GUARDADO ---

  ipcMain.handle("save-balanza-config", async (_event, data) => {
    try {
      await Usuario.update(
        { config_balanza: data ? data : null }, // 👈 Quita el JSON.stringify
        { where: { rol: "administrador" } }
      );
      return { success: true };
    } catch (error) {
      console.error("[CONFIG][BALANZA] Error:", error);
      return {
        success: false,
        message: "Error al guardar formato de balanza.",
      };
    }
  });

  ipcMain.handle("save-arqueo-config", async (_event, data) => {
    try {
      await Usuario.update(
        { config_arqueo_caja: data ? data : null }, // 👈 Quita el JSON.stringify
        { where: { rol: "administrador" } }
      );
      return { success: true };
    } catch (error) {
      console.error("[CONFIG][ARQUEO] Error:", error);
      return {
        success: false,
        message: "Error al guardar configuración de caja.",
      };
    }
  });

  ipcMain.handle("save-hardware-config", async (_event, data) => {
    try {
      await Usuario.update(
        {
          config_puerto_scanner: data?.scannerPort || "",
          config_puerto_impresora: data?.printerName || "",
        },
        { where: { rol: "administrador" } }
      );
      return { success: true };
    } catch (error) {
      console.error("[CONFIG][HARDWARE] Error:", error);
      return { success: false, message: "Error al guardar hardware." };
    }
  });

  ipcMain.handle("save-general-config", async (_event, data) => {
    try {
      // I-2: validate rate multipliers are in [0, 100] before writing to DB
      const recargoCredito = data?.recargoCredito ?? 0;
      const descuentoEfectivo = data?.descuentoEfectivo ?? 0;

      if (typeof recargoCredito !== "number" || recargoCredito < 0 || recargoCredito > 100) {
        return { success: false, message: "El recargo por crédito debe estar entre 0 y 100." };
      }
      if (typeof descuentoEfectivo !== "number" || descuentoEfectivo < 0 || descuentoEfectivo > 100) {
        return { success: false, message: "El descuento por efectivo debe estar entre 0 y 100." };
      }

      await Usuario.update(
        {
          config_recargo_credito: recargoCredito,
          config_descuento_efectivo: descuentoEfectivo,
          config_redondeo_automatico: { habilitado: !!data.redondeo }, // B-8g: coerce to boolean
        },
        { where: { rol: "administrador" } }
      );
      return { success: true };
    } catch (error) {
      console.error("[CONFIG][GENERAL] Error:", error);
      return { success: false, message: "Error al guardar parámetros." };
    }
  });

  ipcMain.handle("save-business-info", async (_event, data) => {
    try {
      let logoPath = null;
      if (data?.logoBase64) {
        // B-7: size guard before decoding
        if (data.logoBase64.length > MAX_LOGO_B64_CHARS) {
          return { success: false, message: "El logo supera el tamaño máximo permitido (5 MB)." };
        }
        const logoData = data.logoBase64.split(";base64,").pop();
        const logoBuffer = Buffer.from(logoData, "base64");
        const logoDir = path.join(app.getPath("userData"), "logos");

        // B-7: async I/O — does not block the main process event loop
        await fsPromises.mkdir(logoDir, { recursive: true });
        logoPath = path.join(logoDir, `logo-${Date.now()}.png`);
        await fsPromises.writeFile(logoPath, logoBuffer);
      }

      const updateData = {
        nombre_negocio:    data?.nombre    || "",
        slogan_negocio:    data?.slogan    || "",
        footer_ticket:     data?.footer    || "",
        direccion_negocio: data?.direccion || "",
      };

      if (logoPath) {
        updateData.logo_url = path.relative(app.getPath("userData"), logoPath);
      }

      await Usuario.update(updateData, { where: { rol: "administrador" } });
      return { success: true };
    } catch (error) {
      console.error("[CONFIG][BUSINESS] Error:", error);
      return { success: false, message: "Error al guardar info del negocio." };
    }
  });

  ipcMain.handle("save-scale-config", async (_event, cfg) => {
    try {
      const clean = {
        transport: (cfg?.transport || "tcp").toLowerCase(),
        ip: cfg?.ip || null,
        port: Number.isFinite(+cfg?.port) ? +cfg.port : 8000,
        btAddress: cfg?.btAddress || null,
        protocol: cfg?.protocol || "kretz-report",
        timeoutMs: Number.isFinite(+cfg?.timeoutMs) ? +cfg.timeoutMs : 4000,
      };

      await Usuario.update(
        { config_balanza_conexion: JSON.stringify(clean) },
        { where: { rol: "administrador" } }
      );

      const mgr = await getScaleManager(models);
      await mgr.reloadConfig();

      return { success: true };
    } catch (e) {
      console.error("[CONFIG][SCALE] Error:", e);
      return { success: false, message: e.message };
    }
  });

  // --- LÓGICA DE HARDWARE (Listar) ---

  ipcMain.handle("get-available-ports", async () => {
    try {
      const serialPorts = await SerialPort.list();
      const focusedWindow = BrowserWindow.getFocusedWindow();
      const printers = focusedWindow
        ? await focusedWindow.webContents.getPrintersAsync()
        : [];
      return {
        serialPorts: serialPorts.map((p) => p.path),
        printers: printers.map((p) => p.name),
      };
    } catch (error) {
      console.error(
        "[HARDWARE-CONFIG] Error al listar puertos/impresoras:",
        error
      );
      return { serialPorts: [], printers: [] };
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // GMAIL CONFIG
  // ═══════════════════════════════════════════════════════════════

  /** Get current Gmail config (returns address only, never the password). */
  ipcMain.handle("get-gmail-config", async () => {
    try {
      const admin = await Usuario.findOne({
        where: { rol: "administrador" },
        attributes: ["config_gmail_user"],
        raw: true,
      });
      return { gmailUser: admin?.config_gmail_user || null };
    } catch (e) {
      console.error("[gmail] get-gmail-config:", e);
      return { gmailUser: null };
    }
  });

  /** Save Gmail address + app password. */
  ipcMain.handle("save-gmail-config", async (_e, { gmailUser, gmailPass }) => {
    try {
      const user  = String(gmailUser || "").trim();
      const pass  = String(gmailPass  || "").trim();
      if (!user || !pass) {
        return { success: false, message: "Ingresá el correo y la contraseña de aplicación." };
      }
      if (!/^[^\s@]+@gmail\.com$/i.test(user)) {
        return { success: false, message: "Ingresá una dirección Gmail válida (debe terminar en @gmail.com)." };
      }
      await Usuario.update(
        { config_gmail_user: user, config_gmail_pass: pass },
        { where: { rol: "administrador" } }
      );
      return { success: true };
    } catch (e) {
      console.error("[gmail] save-gmail-config:", e);
      return { success: false, message: e.message };
    }
  });

  /** Test Gmail connection. */
  ipcMain.handle("test-gmail-config", async (_e, { gmailUser, gmailPass }) => {
    try {
      return await testConnection(
        String(gmailUser || "").trim(),
        String(gmailPass  || "").trim()
      );
    } catch (e) {
      return { success: false, message: e.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // RECUPERACIÓN DE CONTRASEÑA
  // ═══════════════════════════════════════════════════════════════

  /** Generate a 6-digit token and send it to the admin's registered email. */
  ipcMain.handle("send-recovery-token", async () => {
    try {
      const admin = await Usuario.findOne({
        where: { rol: "administrador" },
        attributes: ["id", "email", "config_gmail_user", "config_gmail_pass", "nombre_negocio"],
      });
      if (!admin) return { success: false, message: "Administrador no encontrado." };

      const toEmail = admin.email;
      if (!toEmail) {
        return {
          success: false,
          message: "El administrador no tiene correo registrado. Configuralo en Administración → Usuarios.",
        };
      }
      if (!admin.config_gmail_user || !admin.config_gmail_pass) {
        return {
          success: false,
          message: "Configurá el correo Gmail en Configuración → Avanzado antes de usar la recuperación.",
        };
      }

      // Generate 6-digit token
      const token = String(Math.floor(100000 + Math.random() * 900000));
      const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

      await admin.update({ recovery_token: token, recovery_token_expires: expires });

      await sendRecoveryToken(
        admin.config_gmail_user,
        admin.config_gmail_pass,
        toEmail,
        token,
        admin.nombre_negocio || "Venta Simple"
      );

      // Return masked email so UI can show "Enviado a m***@gmail.com"
      const masked = toEmail.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 5)) + c);
      return { success: true, maskedEmail: masked };
    } catch (e) {
      console.error("[recovery] send-recovery-token:", e);
      return { success: false, message: e.message || "Error al enviar el correo." };
    }
  });

  /** Verify a recovery token. Returns success + userId if valid. */
  ipcMain.handle("verify-recovery-token", async (_e, { token }) => {
    try {
      const admin = await Usuario.findOne({
        where: { rol: "administrador" },
        attributes: ["id", "recovery_token", "recovery_token_expires"],
      });
      if (!admin || !admin.recovery_token) {
        return { success: false, message: "Código inválido." };
      }
      if (admin.recovery_token !== String(token).trim()) {
        return { success: false, message: "Código incorrecto." };
      }
      if (!admin.recovery_token_expires || new Date() > new Date(admin.recovery_token_expires)) {
        await admin.update({ recovery_token: null, recovery_token_expires: null });
        return { success: false, message: "El código expiró. Solicitá uno nuevo." };
      }
      return { success: true };
    } catch (e) {
      console.error("[recovery] verify-recovery-token:", e);
      return { success: false, message: e.message };
    }
  });

  /** Set a new password after verifying the recovery token. */
  ipcMain.handle("reset-password-with-token", async (_e, { token, newPassword }) => {
    try {
      const cleanPass = String(newPassword || "").trim();
      if (cleanPass.length < 6) {
        return { success: false, message: "La nueva contraseña debe tener al menos 6 caracteres." };
      }

      const admin = await Usuario.findOne({
        where: { rol: "administrador" },
        attributes: ["id", "recovery_token", "recovery_token_expires"],
      });
      if (!admin || admin.recovery_token !== String(token).trim()) {
        return { success: false, message: "Código inválido." };
      }
      if (!admin.recovery_token_expires || new Date() > new Date(admin.recovery_token_expires)) {
        await admin.update({ recovery_token: null, recovery_token_expires: null });
        return { success: false, message: "El código expiró." };
      }

      const hashed = await bcrypt.hash(cleanPass, await bcrypt.genSalt(8));
      await admin.update({
        password: hashed,
        recovery_token: null,
        recovery_token_expires: null,
      });

      return { success: true };
    } catch (e) {
      console.error("[recovery] reset-password-with-token:", e);
      return { success: false, message: e.message };
    }
  });

}

module.exports = { registerConfigHandlers };
