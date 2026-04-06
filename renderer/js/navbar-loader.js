// Carga el sidebar, aplica permisos, inyecta/mueve el botón toggle como hermano del sidebar,
// y dispara 'app-ready' una sola vez. Incluye persistencia en localStorage.

let __NAVBAR_INIT_DONE__ = false;
const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";

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

      // 3) Inicializar UI y toggle
      inicializarSidebarUI(window.APP_SESSION);
      inicializarSidebarToggle();
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
  // Resaltar link activo
  try {
    const currentPage = window.location.pathname.split("/").pop();
    const activeLink = document.querySelector(`nav li a[href="${currentPage}"]`);
    if (activeLink) {
      activeLink.setAttribute("aria-current", "page");
      activeLink.closest("li")?.classList.add("active");
    }
  } catch {}

  // Referencias
  const sidebarUsername = document.getElementById("sidebar-username");
  const sidebarUserRole = document.getElementById("sidebar-user-role");
  const sidebarLogo = document.getElementById("sidebar-logo");
  const sidebarBusinessName = document.getElementById("sidebar-business-name");
  const sidebarLogoutBtn = document.getElementById("sidebar-logout-btn");
  const sidebarAdminBtn = document.getElementById("sidebar-admin-btn");

  // Datos de usuario
  if (sidebarUsername) sidebarUsername.textContent = user.nombre || "Usuario";
  if (sidebarUserRole) sidebarUserRole.textContent = user.rol || "";
  if (sidebarAdminBtn && user.rol !== "administrador") sidebarAdminBtn.style.display = "none";

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
  });

  // Datos del negocio
  if (sidebarBusinessName) {
    sidebarBusinessName.textContent = (config && config.nombre_negocio) || "Mi Negocio";
  }
  if (sidebarLogo && config && config.logo_url) {
    const logoPath = String(config.logo_url).replace(/\\/g, "/");
    sidebarLogo.src = `app://${logoPath}?v=${Date.now()}`;
    sidebarLogo.style.display = "block";
  }

  // Logout
  sidebarLogoutBtn?.addEventListener("click", () => window.electronAPI.send("logout"));
}

// Reemplazá SOLO esta función en tu navbar-loader.js
function inicializarSidebarToggle() {
  const container = document.querySelector(".container, .container-fluid") || document.querySelector(".container");
  const sidebar = document.querySelector(".sidebar");
  if (!container || !sidebar) return;

  // Evitar duplicados
  let toggleBtn = document.getElementById("toggle-sidebar-btn");
  let toggleIcon;

  if (!toggleBtn) {
    toggleBtn = document.createElement("button");
    toggleBtn.id = "toggle-sidebar-btn";
    toggleBtn.className = "sidebar-toggle";
    toggleBtn.type = "button";

    toggleIcon = document.createElement("span");
    toggleIcon.id = "toggle-icon";
    toggleIcon.textContent = container.classList.contains("sidebar-collapsed") ? "▶" : "◀";
    toggleBtn.appendChild(toggleIcon);

    // Asegurar que el botón quede como HERMANO del sidebar
    sidebar.parentElement.insertBefore(toggleBtn, sidebar.nextSibling);
  } else {
    toggleIcon =
      document.getElementById("toggle-icon") ||
      toggleBtn.querySelector("span") ||
      document.createElement("span");
    if (!toggleIcon.id) toggleIcon.id = "toggle-icon";
  }

  // Fija la posición del toggle según ancho real del sidebar
  const getOverlap = () => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--toggle-overlap') || '2px';
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 2;
  };

  const updateTogglePos = () => {
    const overlap = getOverlap();
    const w = Math.round(sidebar.getBoundingClientRect().width);
    // Colocar el botón exactamente en el borde (monta "overlap" px)
    toggleBtn.style.left = (w - overlap) + 'px';
  };

  // Estado inicial (desde localStorage si lo usás en otro lado)
  const SIDEBAR_COLLAPSED_KEY = "sidebarCollapsed";
  const collapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  container.classList.toggle("sidebar-collapsed", collapsed);
  toggleIcon.textContent = collapsed ? "▶" : "◀";
  // Posicionamiento inicial
  requestAnimationFrame(updateTogglePos);

  // Click: alternar clase, icono y posición
  toggleBtn.addEventListener("click", () => {
    container.classList.toggle("sidebar-collapsed");
    const isCollapsed = container.classList.contains("sidebar-collapsed");
    toggleIcon.textContent = isCollapsed ? "▶" : "◀";
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, isCollapsed ? "1" : "0");

    // Actualizar posición durante y al final de la animación
    updateTogglePos();
    setTimeout(updateTogglePos, 60);
    setTimeout(updateTogglePos, 180);
    setTimeout(updateTogglePos, 320);
  }, { passive: true });

  // Reposicionar en resize y cuando termina la transición de ancho
  window.addEventListener("resize", updateTogglePos, { passive: true });
  sidebar.addEventListener("transitionend", (e) => {
    if (e.propertyName === "width" || e.propertyName === "min-width" || e.propertyName === "flex-basis") {
      updateTogglePos();
    }
  });
}


