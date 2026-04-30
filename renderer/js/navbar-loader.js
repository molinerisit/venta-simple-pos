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

      // 2) Obtener sesión + config + plan
      const [user, config, subscription] = await Promise.all([
        window.electronAPI.invoke("get-user-session"),
        window.electronAPI.invoke("get-admin-config"),
        window.electronAPI.invoke("get-subscription-status"),
      ]);
      if (!user || !user.id) throw new Error("Sesión inválida.");

      window.APP_SESSION = { user, config: config || {}, subscription: subscription || { plan: "FREE" } };

      // 3) Inicializar UI
      inicializarSidebarUI(window.APP_SESSION);

      // 4) UI de prueba si el plan es FREE
      if (!subscription || subscription.plan === "FREE") {
        _inyectarBannerPrueba();
        _mostrarPopupPrueba();
      }
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

// ─── Banner modo prueba (estilo activación Windows) ──────────────────────────

function _inyectarBannerPrueba() {
  if (document.getElementById("vs-trial-banner")) return;
  const banner = document.createElement("div");
  banner.id = "vs-trial-banner";
  banner.innerHTML =
    'Venta Simple &mdash; Modo de prueba &nbsp;·&nbsp; ' +
    '<a href="#" id="vs-trial-banner-link">Activar licencia</a>';
  document.body.appendChild(banner);

  document.getElementById("vs-trial-banner-link")?.addEventListener("click", (e) => {
    e.preventDefault();
    _mostrarPopupPrueba(true);
  });
}

function _mostrarPopupPrueba(forzar = false) {
  // Solo una vez por sesión (a menos que el usuario haga clic en el banner)
  if (!forzar && sessionStorage.getItem("vs-trial-popup-shown")) return;
  sessionStorage.setItem("vs-trial-popup-shown", "1");

  if (document.getElementById("vs-trial-popup")) return;

  const overlay = document.createElement("div");
  overlay.id = "vs-trial-popup";
  overlay.innerHTML = `
    <div class="vs-trial-popup-box">
      <button class="vs-trial-popup-close" id="vs-trial-close" title="Cerrar">&times;</button>
      <div class="vs-trial-popup-icon">VS</div>
      <h2 class="vs-trial-popup-title">Modo de prueba</h2>
      <p class="vs-trial-popup-body">
        Estás usando <strong>Venta Simple</strong> sin una licencia activa.<br>
        Podés usar el sistema normalmente, pero la sincronización en la nube
        está limitada a <strong>productos y ventas</strong>.<br><br>
        Activá tu licencia para sincronizar clientes, proveedores y más.
      </p>
      <div class="vs-trial-popup-actions">
        <a class="vs-trial-btn-primary" href="#" id="vs-trial-buy">Activar licencia</a>
        <button class="vs-trial-btn-secondary" id="vs-trial-close2">Continuar en modo prueba</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cerrar = () => overlay.remove();
  document.getElementById("vs-trial-close")?.addEventListener("click", cerrar);
  document.getElementById("vs-trial-close2")?.addEventListener("click", cerrar);
  document.getElementById("vs-trial-buy")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const url = await window.electronAPI.invoke("get-web-login-url", "/cuenta").catch(() => "https://ventasimple.cloud/cuenta");
    window.electronAPI.invoke("open-external-url", url).catch(() => {});
    cerrar();
  });
}

// ─── Eventos de licencia desde main process ──────────────────────────────────

(function () {
  if (!window.electronAPI?.on) return;

  // Licencia activada exitosamente (deep link o save-license)
  window.electronAPI.on('license-activated', function (data) {
    // Remover banner y popup
    document.getElementById('vs-trial-banner')?.remove();
    document.getElementById('vs-trial-popup')?.remove();
    sessionStorage.removeItem('vs-trial-popup-shown');

    // Mostrar toast de éxito
    const toast = document.createElement('div');
    toast.style.cssText = [
      'position:fixed', 'top:20px', 'right:20px', 'z-index:10000',
      'background:rgba(34,197,94,.15)', 'border:1px solid rgba(34,197,94,.3)',
      'color:#86efac', 'padding:12px 18px', 'border-radius:10px',
      'font-size:14px', 'font-weight:500', 'display:flex', 'align-items:center', 'gap:8px',
    ].join(';');
    toast.textContent = '✓ Licencia activada — Plan ' + (data?.plan || '') + ' activo';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  });

  // Error al activar (token expirado, etc.)
  window.electronAPI.on('license-activation-error', function () {
    const toast = document.createElement('div');
    toast.style.cssText = [
      'position:fixed', 'top:20px', 'right:20px', 'z-index:10000',
      'background:rgba(239,68,68,.15)', 'border:1px solid rgba(239,68,68,.3)',
      'color:#fca5a5', 'padding:12px 18px', 'border-radius:10px',
      'font-size:14px', 'font-weight:500',
    ].join(';');
    toast.textContent = '⚠ El link de activación expiró. Generá uno nuevo desde el panel web.';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
  });
})();

// ─── Sonido de ingreso de pago por transferencia MP ──────────────────────────
// Se registra en cada página que carga navbar-loader.js.
// Show-toast push desde main.js (sync automático, licencias, etc.)
(function () {
  if (!window.electronAPI?.on) return;

  window.electronAPI.on('show-toast', function (data) {
    const msg  = (typeof data === 'string') ? data : (data?.msg || '');
    const type = (typeof data === 'string') ? 'info' : (data?.type || 'info');
    if (!msg) return;
    if (window.AppToast?.show) {
      window.AppToast.show(msg, type);
    }
  });
})();

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
