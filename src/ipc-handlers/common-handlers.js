// src/ipc-handlers/common-handlers.js
const { ipcMain } = require("electron");
const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");

// Sesión activa (inyectada desde session-handlers)
let activeUserSession = null;
function setActiveUserSession(session) {
  activeUserSession = session;
}

function registerCommonHandlers(/* models */) {
  ipcMain.handle("get-sidebar-html", async () => {
    if (!activeUserSession) {
      console.error("Se intentó obtener el sidebar sin una sesión activa.");
      return "";
    }

    try {
      const templatePath = path.join(__dirname, "..", "..", "renderer", "partials", "_sidebar.html");
      const htmlTemplate = await fs.readFile(templatePath, "utf-8");
      const $ = cheerio.load(htmlTemplate);

      const userRole = activeUserSession.rol;
      const userPermissions = Array.isArray(activeUserSession.permisos)
        ? activeUserSession.permisos
        : [];

      // Filtra ítems por permiso (solo si no es admin)
      $(".sidebar-nav ul li").each((_i, el) => {
        const moduleId = $(el).data("module");
        if (moduleId && userRole !== "administrador" && !userPermissions.includes(moduleId)) {
          $(el).remove();
        }
      });

      // Módulo activo por defecto
      let defaultModule = "caja";
      if (userRole !== "administrador" && !userPermissions.includes(defaultModule)) {
        defaultModule = userPermissions[0] || "";
      }

      if (defaultModule) {
        $(`.sidebar-nav ul li[data-module="${defaultModule}"]`).addClass("active");
      } else {
        // Si no hay permisos o no hay coincidencia, pone active al primer li disponible
        $(".sidebar-nav ul li").first().addClass("active");
      }

      // Oculta botón de Admin si no es administrador
      if (userRole !== "administrador") {
        $("#sidebar-admin-btn").remove();
      }

      return $.html();
    } catch (error) {
      console.error("Error al generar el HTML del sidebar:", error);
      return "<p>Error al cargar el menú.</p>";
    }
  });
}

module.exports = {
  registerCommonHandlers,
  setActiveUserSession,
};
