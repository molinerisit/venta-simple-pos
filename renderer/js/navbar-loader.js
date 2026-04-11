// Carga el sidebar, aplica permisos y dispara 'app-ready' una sola vez.

let __NAVBAR_INIT_DONE__ = false;

(() => {
  // Evitar drag & drop accidental que trabe la UI
  const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
  ["dragenter", "dragover", "dragleave", "drop"].forEach((ev) => {
    window.addEventListener(ev, preventDefaults, { passive: false });
    document.addEventListener(ev, preventDefaults, { passive: false });
  });

  const boot = async () => {
    if (__NAVBAR_INIT_DONE__) return;
    __NAVBAR_INIT_DONE__ = true;

    try {
      // 1) Inyectar sidebar
      await cargarSidebarHTML();

      // 2) Obtener sesión + config
      const [user, config] = await Promise.all([
        window.electronAPI.invoke("get-user-session"),
        window.electronAPI.invoke("get-admin-config"),
      ]);
      if (!user || !user.id) throw new Error("Sesión inválida.");

      window.APP_SESSION = { user, config: config || {} };

      // 3) Inicializar UI
      inicializarSidebarUI(window.APP_SESSION);
    } catch (err) {
      console.error("[NavbarLoader] Error inicializando:", err);
      const ph = document.getElementById("sidebar-placeholder");
      if (ph) ph.innerHTML = '<p style="color:red;padding:1rem;">Error al cargar el menú / sesión.</p>';
    } finally {
      document.dispatchEvent(new CustomEvent("app-ready"));
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true, passive: true });
  } else {
    setTimeout(boot, 0);
  }
})();

async function cargarSidebarHTML() {
  const placeholder = document.getElementById("sidebar-placeholder");
  if (!placeholder) {
    console.warn("[NavbarLoader] No existe #sidebar-placeholder en este HTML.");
    return;
  }
  try {
    const res = await fetch("_sidebar.html", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const tpl = document.createElement("template");
    tpl.innerHTML = html.trim();
    placeholder.innerHTML = "";
    placeholder.appendChild(tpl.content.cloneNode(true));
  } catch (e) {
    console.error("[NavbarLoader] Error cargando _sidebar.html:", e);
    placeholder.innerHTML = '<p style="color:red;">Error al cargar menú.</p>';
  }
}

function inicializarSidebarUI({ user, config }) {
  // Resaltar link activo por página actual
  try {
    const currentPage = window.location.pathname.split("/").pop();
    const activeLink = document.querySelector(`nav li a[href="${currentPage}"]`);
    if (activeLink) {
      activeLink.setAttribute("aria-current", "page");
    }
  } catch {}

  // Referencias
  const sidebarUsername   = document.getElementById("sidebar-username");
  const sidebarUserAvatar = document.getElementById("sidebar-user-avatar");
  const sidebarLogoBadge  = document.getElementById("sidebar-logo-badge");
  const sidebarLogoutBtn  = document.getElementById("sidebar-logout-btn");
  const sidebarAdminBtn   = document.getElementById("sidebar-admin-btn");

  // Datos de usuario
  const displayName = user.nombre || "Usuario";
  if (sidebarUsername) sidebarUsername.textContent = displayName;
  if (sidebarUserAvatar) sidebarUserAvatar.textContent = displayName.charAt(0).toUpperCase();
  if (sidebarAdminBtn && user.rol !== "administrador") sidebarAdminBtn.style.display = "none";

  // Badge: logo circular si está configurado, o iniciales del negocio como fallback
  if (sidebarLogoBadge && config) {
    if (config.logo_url) {
      const src = `app://${config.logo_url}`;
      const probe = new Image();
      probe.onload = () => {
        sidebarLogoBadge.textContent = "";
        sidebarLogoBadge.classList.add("sidebar-logo-badge--img");
        const img = document.createElement("img");
        img.src = src;
        img.alt = config.nombre_negocio || "Logo";
        img.className = "sidebar-logo-img";
        sidebarLogoBadge.appendChild(img);
      };
      probe.onerror = () => {
        // Fallback a iniciales si la imagen no carga
        if (config.nombre_negocio) {
          const words = config.nombre_negocio.trim().split(/\s+/);
          sidebarLogoBadge.textContent = words.length >= 2
            ? (words[0][0] + words[1][0]).toUpperCase()
            : config.nombre_negocio.substring(0, 2).toUpperCase();
        }
      };
      probe.src = src;
    } else if (config.nombre_negocio) {
      const words = config.nombre_negocio.trim().split(/\s+/);
      sidebarLogoBadge.textContent = words.length >= 2
        ? (words[0][0] + words[1][0]).toUpperCase()
        : config.nombre_negocio.substring(0, 2).toUpperCase();
    }
  }

  // Permisos
  let userPermissions = [];
  if (Array.isArray(user.permisos)) {
    userPermissions = user.permisos;
  } else if (typeof user.permisos === "string" && user.permisos.trim()) {
    try { userPermissions = JSON.parse(user.permisos); } catch {}
  }

  document.querySelectorAll("a[data-module]").forEach((link) => {
    const moduleName = link.dataset.module;
    const li = link.closest("li");
    let visible = true;

    if (user.rol === "cajero") {
      visible = userPermissions.includes(moduleName);
    }
    if (moduleName === "facturacion" && (!config || config.facturacion_activa === false)) {
      visible = false;
    }
    if (li) li.style.display = visible ? "" : "none";
    else if (!visible) link.style.display = "none";
  });

  // Logout
  sidebarLogoutBtn?.addEventListener("click", () => window.electronAPI.send("logout"));
}

// ─── Sonido de ingreso de pago por transferencia MP ──────────────────────────
// Se registra en cada página que carga navbar-loader.js.
// El canal mp-payment-approved se dispara desde main.js cuando el pago QR es aprobado.
(function () {
  if (!window.electronAPI?.on) return;

  window.electronAPI.on("mp-payment-approved", function () {
    try {
      const snd = new Audio("../sounds/ingresopagomp.mp3");
      snd.volume = 1.0;
      snd.play().catch(function () {
        // Algunos contextos requieren interacción previa del usuario;
        // si falla silenciosamente no queremos romper nada.
      });
    } catch (_) {}
  });
})();
