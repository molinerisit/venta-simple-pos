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

// Registra TODOS los handlers de configuración
function registerConfigHandlers(models, sequelize) {
  const { Usuario } = models;

  // ===================================================================
  // 🟢 INICIO: FUNCIÓN RESTAURADA
  // Este es el handler que faltaba para crear el primer admin.
  // ===================================================================
  ipcMain.handle("submit-setup", async (_event, { nombre, password }) => {
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

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(cleanPassword, salt);

      const newAdmin = await Usuario.create({
        nombre: cleanName,
        password: hashedPassword,
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
          "nombre_negocio", "slogan_negocio", "footer_ticket", "logo_url",
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
        nombre_negocio: data?.nombre || "",
        slogan_negocio: data?.slogan || "",
        footer_ticket: data?.footer || "",
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
}

module.exports = { registerConfigHandlers };
