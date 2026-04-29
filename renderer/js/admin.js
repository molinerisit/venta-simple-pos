// renderer/js/admin.js

(() => {
  "use strict";

  // Helper: IPC invoke con fallback si no hay preload
  const ipcInvoke = (channel, payload) => {
    if (window?.electronAPI?.invoke) {
      return window.electronAPI.invoke(channel, payload);
    }
    console.warn(`[admin] electronAPI.invoke no disponible para "${channel}"`);
    return Promise.reject(new Error("IPC no disponible"));
  };

  // Helper: addEventListener seguro
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

  // Toast simple (no bloqueante)
  const toast = (() => {
    let timeout;
    const el = document.getElementById("toast-notification");
    return {
      show(msg, type = "success", ms = 3000) {
        if (!el) return alert(msg);
        clearTimeout(timeout);
        el.textContent = msg;
        el.className = "toast";
        el.classList.add(type, "visible");
        timeout = setTimeout(() => el.classList.remove("visible"), ms);
      },
    };
  })();

  // === Confirm modal no bloqueante ===
  const confirmOverlay = document.createElement("div");
  confirmOverlay.className = "confirm-overlay";
  confirmOverlay.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h4 id="confirm-title">Confirmar</h4>
      <p id="confirm-msg">¿Estás seguro?</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secundario" data-action="cancelar">Cancelar</button>
        <button type="button" class="btn btn-danger" data-action="aceptar">Aceptar</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmOverlay);

  const confirmar = (mensaje, titulo = "Confirmar") =>
    new Promise((resolve) => {
      confirmOverlay.querySelector("#confirm-title").textContent = titulo;
      confirmOverlay.querySelector("#confirm-msg").textContent =
        mensaje || "¿Estás seguro?";
      confirmOverlay.classList.add("visible");
      const onClick = (ev) => {
        const action = ev.target?.dataset?.action;
        if (!action) return;
        ev.preventDefault();
        confirmOverlay.classList.remove("visible");
        confirmOverlay.removeEventListener("click", onClick);
        resolve(action === "aceptar");
      };
      confirmOverlay.addEventListener("click", onClick);
    });

  // Botón loading
  const setBtnLoading = (btn, loading, textWhile = "Procesando...") => {
    if (!btn) return;
    if (!btn.dataset.originalText)
      btn.dataset.originalText = btn.textContent || "";
    btn.disabled = !!loading;
    btn.textContent = loading ? textWhile : btn.dataset.originalText;
  };

  document.addEventListener("app-ready", () => {
    // --- 1. REFERENCIAS DOM ---
    // Usuarios
    const usersTableBody = document.querySelector("#users-table tbody");
    const userModal = document.getElementById("user-modal");
    const userForm = document.getElementById("user-form");
    const modalTitle = document.getElementById("modal-title");
    const userIdInput = document.getElementById("user-id");
    const nombreInput = document.getElementById("nombre");
    const passwordInput = document.getElementById("password");
    const rolSelect = document.getElementById("rol");
    const permisosContainer = document.getElementById("permisos-container");
    const permisosFieldset = document.getElementById("permisos-fieldset");
    const btnNuevoUsuario = document.getElementById("btn-nuevo-Usuario");
    const btnCancelarModal = document.getElementById("btn-cancelar");

    // Facturación / impresión
    const facturacionToggle = document.getElementById("facturacion-toggle");
    const btnTestPrint = document.getElementById("btn-test-print");

    // Mercado Pago OAuth
    const btnMpConnect    = document.getElementById("btn-mp-connect");
    const btnMpDisconnect = document.getElementById("btn-mp-disconnect");
    const btnMpReconnect  = document.getElementById("btn-mp-reconnect");
    const mpConnectedView    = document.getElementById("mp-connected-view");
    const mpDisconnectedView = document.getElementById("mp-disconnected-view");
    const mpOauthLoading     = document.getElementById("mp-oauth-loading");
    const mpOauthBadge       = document.getElementById("mp-oauth-badge");
    const mpConnectedDetail  = document.getElementById("mp-connected-detail");

    // Configuración de cobros por medio de pago
    const mpQrMode     = document.getElementById("mp-qr-mode");
    const mpDebitMode  = document.getElementById("mp-debit-mode");
    const mpCreditMode = document.getElementById("mp-credit-mode");
    const mpPointDevice           = document.getElementById("mp-point-device");
    const mpDeviceWrap            = document.getElementById("mp-device-wrap");
    const btnRefreshDevices       = document.getElementById("btn-refresh-devices");
    const btnSaveMpPaymentConfig  = document.getElementById("btn-save-mp-payment-config");
    const mpNoPdvWrap             = document.getElementById("mp-no-pdv-wrap");
    const mpAllTerminals          = document.getElementById("mp-all-terminals");
    const btnActivatePdv          = document.getElementById("btn-activate-pdv");
    const btnRefreshTerminals     = document.getElementById("btn-refresh-terminals");
    const mpActivateResult        = document.getElementById("mp-activate-result");

    function _mpNeedsDevice() {
      return [mpQrMode?.value, mpDebitMode?.value, mpCreditMode?.value].includes("posnet");
    }

    function updateMpDeviceWrap() {
      if (mpDeviceWrap) mpDeviceWrap.style.display = _mpNeedsDevice() ? "" : "none";
    }

    async function loadAllTerminalsForActivation() {
      if (!mpAllTerminals) return;
      mpAllTerminals.innerHTML = '<option value="">Buscando terminales…</option>';
      const res = await ipcInvoke("mp:point-list-all-terminals").catch(() => null);
      if (!res?.ok || !res.terminals?.length) {
        mpAllTerminals.innerHTML = '<option value="">No se encontraron terminales vinculados</option>';
        return;
      }
      mpAllTerminals.innerHTML = '<option value="">-- Seleccioná el terminal --</option>';
      res.terminals.forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = `${t.device_name || t.id} (${t.operating_mode || "standalone"})`;
        mpAllTerminals.appendChild(opt);
      });
    }

    async function refreshPointDevices(selectedId = null) {
      if (!mpPointDevice) return;
      mpPointDevice.innerHTML = '<option value="">Buscando dispositivos…</option>';
      const res = await ipcInvoke("mp:point-list-devices").catch(() => null);
      const hasPdvDevices = res?.ok && res.devices?.length;

      if (mpNoPdvWrap) {
        mpNoPdvWrap.style.display = hasPdvDevices ? "none" : "";
        if (!hasPdvDevices) loadAllTerminalsForActivation();
      }

      if (!hasPdvDevices) {
        mpPointDevice.innerHTML = '<option value="">Sin dispositivos en Modo PDV</option>';
        return;
      }
      mpPointDevice.innerHTML = '<option value="">-- Seleccioná el posnet --</option>';
      res.devices.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = `${d.device_name || d.id}`;
        if (selectedId && d.id === selectedId) opt.selected = true;
        mpPointDevice.appendChild(opt);
      });
    }

    on(btnActivatePdv, "click", async () => {
      const terminalId = mpAllTerminals?.value;
      if (!terminalId) { toast.show("Seleccioná un terminal primero.", "error"); return; }
      setBtnLoading(btnActivatePdv, true, "Activando…");
      if (mpActivateResult) mpActivateResult.style.display = "none";
      const res = await ipcInvoke("mp:point-activate-pdv", { terminalId }).catch(() => null);
      setBtnLoading(btnActivatePdv, false, "Activar Modo PDV");
      if (res?.ok) {
        if (mpActivateResult) {
          mpActivateResult.style.display = "";
          mpActivateResult.style.color = "#16a34a";
          mpActivateResult.textContent = "¡Modo PDV activado! Reiniciá el terminal y después hacé clic en ↻ para verlo listo.";
        }
      } else {
        if (mpActivateResult) {
          mpActivateResult.style.display = "";
          mpActivateResult.style.color = "#dc2626";
          mpActivateResult.textContent = `Error: ${res?.error || "No se pudo activar el Modo PDV."}`;
        }
      }
    });

    const mpQrModeHint = document.getElementById("mp-qr-mode-hint");
    const QR_HINTS = {
      dinamico: "El cliente escanea el QR con su celular desde la pantalla de la PC. Recomendado.",
      posnet:   "El QR aparece en la pantalla del posnet. Requiere que el dispositivo tenga QR habilitado en MP.",
      none:     "El botón QR solo registra el método de pago sin interactuar con MP.",
    };

    function updateQrHint() {
      if (mpQrModeHint && mpQrMode) {
        mpQrModeHint.textContent = QR_HINTS[mpQrMode.value] || "";
      }
    }

    async function loadMpPaymentConfig() {
      const cfg = await ipcInvoke("get-mp-payment-config").catch(() => null);
      if (!cfg) return;
      if (mpQrMode)     mpQrMode.value     = cfg.qr_mode     || "dinamico";
      if (mpDebitMode)  mpDebitMode.value  = cfg.debit_mode  || "posnet";
      if (mpCreditMode) mpCreditMode.value = cfg.credit_mode || "posnet";
      updateMpDeviceWrap();
      updateQrHint();
      if (_mpNeedsDevice()) await refreshPointDevices(cfg.point_device_id);
    }

    [mpQrMode, mpDebitMode, mpCreditMode].forEach(sel => {
      if (!sel) return;
      sel.addEventListener("change", async () => {
        updateMpDeviceWrap();
        updateQrHint();
        if (_mpNeedsDevice() && mpPointDevice && mpPointDevice.options.length <= 1) {
          await refreshPointDevices();
        }
      });
    });

    on(btnRefreshDevices, "click", () => refreshPointDevices(mpPointDevice?.value));
    on(btnRefreshTerminals, "click", () => loadAllTerminalsForActivation());

    on(btnSaveMpPaymentConfig, "click", async () => {
      setBtnLoading(btnSaveMpPaymentConfig, true, "Guardando…");
      const result = await ipcInvoke("save-mp-payment-config", {
        qr_mode:        mpQrMode?.value      || "dinamico",
        debit_mode:     mpDebitMode?.value   || "posnet",
        credit_mode:    mpCreditMode?.value  || "posnet",
        point_device_id: mpPointDevice?.value || null,
      });
      setBtnLoading(btnSaveMpPaymentConfig, false, "Guardar configuración de cobros");
      result?.success
        ? toast.show("Configuración de cobros guardada.")
        : toast.show(result?.message || "Error al guardar.", "error");
    });

    function renderMpStatus(ctx) {
      const connected = ctx?.ok && ctx?.ctx?.hasToken;
      mpConnectedView.classList.toggle("hidden", !connected);
      mpDisconnectedView.classList.toggle("hidden", connected);
      mpOauthBadge.classList.toggle("hidden", !connected);
      if (connected && mpConnectedDetail) {
        const uid = ctx.ctx.userId || "";
        const pos = ctx.ctx.posId  || "POS no configurado";
        mpConnectedDetail.textContent = `ID: ${uid} · ${pos}`;
        loadMpPaymentConfig();
      }
    }

    // Cargar estado inicial
    ipcInvoke("mp:get-context").then(renderMpStatus).catch(() => {});

    on(btnMpConnect, "click", async () => {
      mpOauthLoading.classList.remove("hidden");
      btnMpConnect.disabled = true;
      const result = await ipcInvoke("mp:connect-oauth");
      if (!result.ok) {
        mpOauthLoading.classList.add("hidden");
        btnMpConnect.disabled = false;
        toast.show(result.error || "No se pudo iniciar la conexión.", "error");
      }
      // Si ok: el browser abrió MP. El resultado llega por mp-oauth-connected.
    });

    on(btnMpDisconnect, "click", async () => {
      const result = await ipcInvoke("mp:disconnect-oauth");
      if (result.ok) {
        renderMpStatus({ ok: false });
        toast.show("Mercado Pago desconectado.");
      } else {
        toast.show(result.error || "Error al desconectar.", "error");
      }
    });

    on(btnMpReconnect, "click", async () => {
      mpOauthLoading.classList.remove("hidden");
      const result = await ipcInvoke("mp:connect-oauth");
      if (!result.ok) {
        mpOauthLoading.classList.add("hidden");
        toast.show(result.error || "No se pudo reconectar.", "error");
      }
    });

    // Deep link callback → guardar tokens y actualizar vista
    window.electronAPI.on("mp-oauth-connected", async ({ accessToken, userId, posId }) => {
      mpOauthLoading.classList.add("hidden");
      btnMpConnect.disabled = false;
      await ipcInvoke("save-mp-config", {
        accessToken,
        userId: String(userId),
        posId: posId || null,
      });
      const ctx = await ipcInvoke("mp:get-context").catch(() => null);
      renderMpStatus(ctx); // renderMpStatus llama a loadMpPaymentConfig internamente
      toast.show("Mercado Pago conectado exitosamente.");
    });

    window.electronAPI.on("mp-oauth-error", ({ error }) => {
      mpOauthLoading.classList.add("hidden");
      btnMpConnect.disabled = false;
      toast.show(`Error MP: ${error || "desconocido"}`, "error");
    });

    // Cuando el deep link activa la licencia, refrescar la card de suscripción
    window.electronAPI.on("license-activated", async () => {
      if (!suscripcionCard) return;
      const lic = await ipcInvoke("get-subscription-status").catch(() => null);
      renderSuscripcionCard(lic);
    });

    // Mercado Pago (legacy — kept for backward compat, IDs no longer exist in HTML)
    const mpForm = null;
    const accessTokenInput = null;
    const mpUserIdInput = null;
    const posIdInput = null;
    const btnVerifyMP = null;

    // Balanza (formato de código de barras existente)
    const balanzaForm = document.getElementById("balanza-config-form");
    const balanzaPrefijo = document.getElementById("balanza-prefijo");
    const balanzaTipoValor = document.getElementById("balanza-tipo-valor");
    const balanzaValorDivisor = document.getElementById(
      "balanza-valor-divisor"
    );
    const balanzaCodigoInicio = document.getElementById(
      "balanza-codigo-inicio"
    );
    const balanzaCodigoLongitud = document.getElementById(
      "balanza-codigo-longitud"
    );
    const balanzaValorInicio = document.getElementById("balanza-valor-inicio");
    const balanzaValorLongitud = document.getElementById(
      "balanza-valor-longitud"
    );
    const visPrefijo = document.getElementById("vis-prefijo");
    const visCodigo = document.getElementById("vis-codigo");
    const visValor = document.getElementById("vis-valor");
    const visResultado = document.getElementById("visualizador-resultado");

    // Balanza perfil B (segunda balanza)
    const balanzaBPrefijo        = document.getElementById("balanza-b-prefijo");
    const balanzaBTipoValor      = document.getElementById("balanza-b-tipo-valor");
    const balanzaBValorDivisor   = document.getElementById("balanza-b-valor-divisor");
    const balanzaBCodigoInicio   = document.getElementById("balanza-b-codigo-inicio");
    const balanzaBCodigoLongitud = document.getElementById("balanza-b-codigo-longitud");
    const balanzaBValorInicio    = document.getElementById("balanza-b-valor-inicio");
    const balanzaBValorLongitud  = document.getElementById("balanza-b-valor-longitud");

    // Conexión y gestión Kretz (sección extra)
    const scaleConfigForm = document.getElementById("scale-config-form");
    const scaleTransport = document.getElementById("scale-transport");
    const scaleIp = document.getElementById("scale-ip");
    const scalePort = document.getElementById("scale-port");
    const scaleBtAddress = document.getElementById("scale-bt-address");
    const scaleProtocol = document.getElementById("scale-protocol");
    const scaleTimeout = document.getElementById("scale-timeout");
    const btnScaleTest = document.getElementById("btn-scale-test");

    const pluForm = document.getElementById("scale-plu-form");
    const pluCodeInput = document.getElementById("plu-code");
    const pluNameInput = document.getElementById("plu-name");
    const pluPriceInput = document.getElementById("plu-price");
    const pluTareInput = document.getElementById("plu-tare");
    const btnScaleUpsert = document.getElementById("btn-scale-upsert");
    const btnScaleDelete = document.getElementById("btn-scale-delete");
    const btnScaleSyncAll = document.getElementById("btn-scale-sync-all");

    // Código de barras editable / auto
    const pluBarcodeInput = document.getElementById("plu-barcode");
    const barcodeAutoChk = document.getElementById("barcode-auto");
    const barcodePreview = document.getElementById("barcode-preview");

    // Suscripción
    const suscripcionCard = document.getElementById("suscripcion-card");

    // Generales
    const generalConfigForm = document.getElementById("general-config-form");
    const recargoCreditoInput = document.getElementById("recargo-credito");
    const descuentoEfectivoInput =
      document.getElementById("descuento-efectivo");
    const redondeoToggle = document.getElementById("redondeo-toggle");
    // Hardware
    const hardwareForm = document.getElementById("hardware-config-form");
    const scannerPortSelect = document.getElementById("scanner-port");
    const printerNameSelect = document.getElementById("printer-name");
    const btnRefreshPorts = document.getElementById("btn-refresh-ports");

    // Negocio
    const businessInfoForm = document.getElementById("business-info-form");
    const businessNameInput    = document.getElementById("business-name");
      const businessAddressInput = document.getElementById("business-address");
    const businessSloganInput = document.getElementById("business-slogan");
    const ticketFooterInput = document.getElementById("ticket-footer");
    const logoUploadInput = document.getElementById("logo-upload");
    const previewLogo = document.getElementById("preview-logo");
    const previewName = document.getElementById("preview-name");
    const previewSlogan  = document.getElementById("preview-slogan");
    const previewAddress = document.getElementById("preview-address");
    const previewFooter = document.getElementById("preview-footer");

    // Empleados
    const empleadosContainer = document.getElementById("empleados-container");
    const btnNuevoEmpleado = document.getElementById("btn-nuevo-empleado");
    const empleadoModal = document.getElementById("empleado-modal");
    const empleadoModalTitle = document.getElementById("empleado-modal-title");
    const empleadoForm = document.getElementById("empleado-form");
    const empleadoIdInput = document.getElementById("empleado-id");
    const empleadoNombreInput = document.getElementById("empleado-nombre");
    const empleadoFuncionInput = document.getElementById("empleado-funcion");
    const empleadoSueldoInput = document.getElementById("empleado-sueldo");
    const btnCancelarEmpleado = document.getElementById(
      "btn-cancelar-empleado"
    );

    // Gastos
    const gastosContainer = document.getElementById("gastos-fijos-container");
    const gastoForm = document.getElementById("gasto-fijo-form");
    const gastoNombreInput = document.getElementById("gasto-nombre");
    const gastoMontoInput = document.getElementById("gasto-monto");

    // AFIP
    const afipForm = document.getElementById("afip-config-form");
    const afipCuitInput = document.getElementById("afip-cuit");
    const afipPtoVtaInput = document.getElementById("afip-pto-vta");
    const afipCertFileInput = document.getElementById("afip-cert-file");
    const afipKeyFileInput = document.getElementById("afip-key-file");
    const certFilePathDisplay = document.getElementById("cert-file-path");
    const keyFilePathDisplay = document.getElementById("key-file-path");

    // Gmail
    const gmailForm      = document.getElementById("gmail-config-form");
    const gmailUserInput = document.getElementById("gmail-user");
    const gmailPassInput = document.getElementById("gmail-pass");
    const gmailStatus    = document.getElementById("gmail-status");
    const btnTestGmail   = document.getElementById("btn-test-gmail");

    // Arqueo
    const arqueoToggle = document.getElementById("arqueo-toggle");
    const horariosArqueoContainer = document.getElementById(
      "horarios-arqueo-container"
    );
    const arqueoConfigForm = document.getElementById("arqueo-config-form");
    const horarioAperturaT1Input = document.getElementById(
      "horario-apertura-t1"
    );
    const horarioCierreT1Input = document.getElementById("horario-cierre-t1");
    const horarioAperturaT2Input = document.getElementById(
      "horario-apertura-t2"
    );
    const horarioCierreT2Input = document.getElementById("horario-cierre-t2");

    // Misceláneo
    const btnCopyCurl = document.getElementById("btn-copy-curl");

    // --- 2. ESTADO GLOBAL ---
    let allModules = [];
    let newLogoBase64 = null;

    // cache del formato de balanza para generar códigos
    let _balanzaFormato = null;

    // --- 3. UTIL UI ---
    const closeModal = () => userModal && userModal.classList.remove("visible");
    const closeEmpleadoModal = () =>
      empleadoModal && empleadoModal.classList.remove("visible");

    const togglePermisosFieldset = () => {
      if (permisosFieldset && rolSelect) {
        permisosFieldset.disabled = rolSelect.value === "administrador";
      }
    };

    const openModal = (user = null) => {
      if (!userForm) return;
      userForm.reset();
      if (user) {
        if (modalTitle) modalTitle.textContent = "Editar Usuario";
        if (userIdInput) userIdInput.value = user.id;
        if (nombreInput) nombreInput.value = user.nombre || "";
        if (rolSelect) rolSelect.value = user.rol || "cajero";
        if (passwordInput)
          passwordInput.placeholder = "Dejar en blanco para no cambiar";
        const userPermissions =
          typeof user.permisos === "string"
            ? JSON.parse(user.permisos)
            : user.permisos || [];
        if (permisosContainer) {
          permisosContainer
            .querySelectorAll('input[type="checkbox"]')
            .forEach((c) => (c.checked = userPermissions.includes(c.value)));
        }
      } else {
        if (modalTitle) modalTitle.textContent = "Nuevo Usuario";
        if (userIdInput) userIdInput.value = "";
        if (passwordInput) passwordInput.placeholder = "Contraseña obligatoria";
      }
      togglePermisosFieldset();
      userModal && userModal.classList.add("visible");
    };

    const openEmpleadoModal = (empleado = null) => {
      if (!empleadoForm) return;
      empleadoForm.reset();
      if (empleado) {
        if (empleadoModalTitle)
          empleadoModalTitle.textContent = "Editar Empleado";
        if (empleadoIdInput) empleadoIdInput.value = empleado.id;
        if (empleadoNombreInput)
          empleadoNombreInput.value = empleado.nombre || "";
        if (empleadoFuncionInput)
          empleadoFuncionInput.value = empleado.funcion || "";
        if (empleadoSueldoInput)
          empleadoSueldoInput.value = empleado.sueldo || "";
      } else {
        if (empleadoModalTitle)
          empleadoModalTitle.textContent = "Nuevo Empleado";
        if (empleadoIdInput) empleadoIdInput.value = "";
      }
      empleadoModal && empleadoModal.classList.add("visible");
    };

    const toggleArqueoFields = () => {
      if (!arqueoToggle || !horariosArqueoContainer) return;
      horariosArqueoContainer.style.display = arqueoToggle.checked
        ? "block"
        : "none";
    };

    const PLANES_URL = "https://ventasimple.cloud/planes";

    const renderSuscripcionCard = (lic) => {
      if (!suscripcionCard) return;
      const plan    = lic?.plan || "FREE";
      const email   = lic?.email || null;
      const nombre  = lic?.nombre || null;
      const activo  = lic?.activated || (plan !== "FREE");

      if (activo) {
        suscripcionCard.innerHTML = `
          <div class="susc-card susc-card--active">
            <div class="susc-card__header">
              <span class="susc-badge susc-badge--pro">${plan}</span>
              <span class="susc-card__status">
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/></svg>
                Activo
              </span>
            </div>
            ${nombre ? `<p class="susc-card__nombre">${nombre}</p>` : ""}
            ${email  ? `<p class="susc-card__email">${email}</p>` : ""}
            <div class="susc-features">
              <span><svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/></svg>Respaldo automático en la nube</span>
              <span><svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/></svg>Sincronización entre equipos</span>
              <span><svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path fill-rule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd"/></svg>Acceso a todas las funciones</span>
            </div>
            <button class="btn btn-outline susc-btn-manage" id="btn-gestionar-plan">
              Gestionar suscripción
            </button>
          </div>
        `;
      } else {
        suscripcionCard.innerHTML = `
          <div class="susc-card susc-card--free">
            <div class="susc-card__header">
              <span class="susc-badge susc-badge--free">FREE</span>
            </div>
            <p class="susc-card__desc">Activá un plan para acceder a sincronización en la nube, respaldo automático y más funciones.</p>
            <div class="susc-features susc-features--muted">
              <span>Respaldo automático en la nube</span>
              <span>Sincronización entre equipos</span>
              <span>Acceso a todas las funciones</span>
            </div>
            <div class="susc-card__cta">
              <button class="btn btn-primario susc-btn-activar" id="btn-activar-plan">
                Ver planes y activar
              </button>
              <p class="susc-card__hint">Al comprar el plan desde la web con tu misma cuenta, la activación se aplica automáticamente en esta app.</p>
            </div>
          </div>
        `;
      }

      document.getElementById("btn-gestionar-plan")?.addEventListener("click", async () => {
        const url = await ipcInvoke("get-web-login-url", "/cuenta");
        ipcInvoke("open-external-url", url);
      });
      document.getElementById("btn-activar-plan")?.addEventListener("click", async () => {
        const url = await ipcInvoke("get-web-login-url", "/cuenta");
        ipcInvoke("open-external-url", url);
      });
    };

    const updateTicketPreview = () => {
      if (previewName)
        previewName.textContent =
          businessNameInput?.value || "Nombre del Negocio";
      if (previewAddress)
        previewAddress.textContent = businessAddressInput?.value || "";
      if (previewSlogan)
        previewSlogan.textContent =
          businessSloganInput?.value || "Slogan del Negocio";
      if (previewFooter)
        previewFooter.textContent =
          ticketFooterInput?.value || "¡Gracias por su compra!";
      if (previewLogo && previewLogo.src) previewLogo.style.display = "block";
    };

    const leerConfigBalanza = () => {
      const base = {
        prefijo:          balanzaPrefijo?.value || "20",
        tipo_valor:       balanzaTipoValor?.value || "peso",
        valor_divisor:    parseInt(balanzaValorDivisor?.value) || 1000,
        codigo_inicio:    parseInt(balanzaCodigoInicio?.value) || 3,
        codigo_longitud:  parseInt(balanzaCodigoLongitud?.value) || 5,
        valor_inicio:     parseInt(balanzaValorInicio?.value) || 8,
        valor_longitud:   parseInt(balanzaValorLongitud?.value) || 5,
      };
      // Incluir perfil_b solo si tiene prefijo configurado
      const prefijoB = balanzaBPrefijo?.value?.trim();
      if (prefijoB) {
        base.perfil_b = {
          prefijo:         prefijoB,
          tipo_valor:      balanzaBTipoValor?.value || "peso",
          valor_divisor:   parseInt(balanzaBValorDivisor?.value) || 1000,
          codigo_inicio:   parseInt(balanzaBCodigoInicio?.value) || 3,
          codigo_longitud: parseInt(balanzaBCodigoLongitud?.value) || 5,
          valor_inicio:    parseInt(balanzaBValorInicio?.value) || 8,
          valor_longitud:  parseInt(balanzaBValorLongitud?.value) || 5,
        };
      }
      return base;
    };

    const actualizarVisualizador = () => {
      if (!balanzaForm) return;
      const config = leerConfigBalanza();
      const codigoEjemplo = "12345";
      const valorEjemplo = config.tipo_valor === "peso" ? "01500" : "12550"; // 1.5kg o $125.50
      const digitoEjemplo = "7";
      const codigoCompleto = `${config.prefijo}${codigoEjemplo}${valorEjemplo}${digitoEjemplo}`;

      if (visPrefijo) visPrefijo.textContent = config.prefijo;
      if (visCodigo) visCodigo.textContent = "C".repeat(config.codigo_longitud);
      if (visValor) visValor.textContent = "V".repeat(config.valor_longitud);

      const valorParseado =
        parseFloat(
          codigoCompleto.substring(
            config.valor_inicio - 1,
            config.valor_inicio - 1 + config.valor_longitud
          )
        ) / config.valor_divisor;

      const plu = codigoCompleto.substring(
        config.codigo_inicio - 1,
        config.codigo_inicio - 1 + config.codigo_longitud
      );

      if (visResultado) {
        visResultado.textContent =
          `De un código como "${codigoCompleto}", se extraería:\n` +
          `PLU: ${plu}\n` +
          `Valor: ${
            config.tipo_valor === "peso"
              ? `${valorParseado} kg`
              : `$${valorParseado.toFixed(2)}`
          }`;
      }
    };

    // === helpers de código de barras (generación con formato actual) ===
    const luhnMod10 = (numStr) => {
      let sum = 0,
        dbl = false;
      for (let i = numStr.length - 1; i >= 0; i--) {
        let d = parseInt(numStr[i], 10);
        if (dbl) {
          d = d * 2;
          if (d > 9) d -= 9;
        }
        sum += d;
        dbl = !dbl;
      }
      const mod = sum % 10;
      return (mod === 0 ? 0 : 10 - mod).toString();
    };

    const buildBarcodeFromConfig = (
      cfg,
      { plu, priceCent = 0, weightGr = 0 }
    ) => {
      const prefijo = String(cfg.prefijo || "20");
      const pluStr = String(plu).padStart(cfg.codigo_longitud || 5, "0");
      let valorStr;
      if (cfg.tipo_valor === "peso") {
        const scaled = Math.round(weightGr || 0); // en gramos
        valorStr = String(scaled).padStart(cfg.valor_longitud || 5, "0");
      } else {
        const scaled = Math.round(priceCent || 0); // en centavos
        valorStr = String(scaled).padStart(cfg.valor_longitud || 5, "0");
      }
      const base = `${prefijo}${pluStr}${valorStr}`;
      const check = luhnMod10(base);
      return `${base}${check}`;
    };

    const refreshBarcodePreview = () => {
      if (!barcodePreview) return;
      const plu = parseInt(pluCodeInput?.value || "0");
      const pcent = parseInt(pluPriceInput?.value || "0");
      if (!plu || !_balanzaFormato) {
        barcodePreview.textContent = "";
        return;
      }
      if (barcodeAutoChk?.checked) {
        const auto = buildBarcodeFromConfig(_balanzaFormato, {
          plu,
          priceCent: _balanzaFormato.tipo_valor === "precio" ? pcent : 0,
          weightGr: _balanzaFormato.tipo_valor === "peso" ? 1000 : 0, // preview 1kg
        });
        barcodePreview.textContent = `Código generado: ${auto}`;
        if (pluBarcodeInput) pluBarcodeInput.value = auto;
      } else {
        barcodePreview.textContent = `Código manual: ${
          pluBarcodeInput?.value || ""
        }`;
      }
    };

    // --- 4. CARGA DE DATOS ---
    const loadUsers = async () => {
      if (!usersTableBody) return;
      try {
        const users = await ipcInvoke("get-all-users");
        usersTableBody.innerHTML = "";
        (users || []).forEach((user) => {
          const row = document.createElement("tr");
          row.innerHTML = `
            <td>${user.nombre}</td>
            <td>${user.rol}</td>
            <td class="acciones-btn">
              <button class="btn btn-info btn-edit" data-id="${user.id}">✏️</button>
              <button class="btn btn-danger btn-eliminar" data-id="${user.id}">🗑️</button>
            </td>`;
          usersTableBody.appendChild(row);
        });
      } catch (e) {
        console.error("Error al cargar Usuarios:", e);
      }
    };

    const loadModules = async () => {
      if (!permisosContainer) return;
      try {
        allModules = await ipcInvoke("get-app-modules");
        permisosContainer.innerHTML = "";
        (allModules || []).forEach((module) => {
          const div = document.createElement("div");
          div.className = "permiso-item";
          div.innerHTML = `
            <input type="checkbox" id="permiso-${module.id}" value="${module.id}">
            <label for="permiso-${module.id}">${module.nombre}</label>`;
          permisosContainer.appendChild(div);
        });
      } catch (e) {
        console.error("Error al cargar módulos:", e);
      }
    };

    const loadAvailablePorts = async () => {
      if (!scannerPortSelect || !printerNameSelect) return;
      try {
        const { serialPorts = [], printers = [] } = await ipcInvoke(
          "get-available-ports"
        );
        const currentScanner = scannerPortSelect.value;
        const currentPrinter = printerNameSelect.value;

        scannerPortSelect.innerHTML =
          '<option value="">-- No seleccionado --</option>';
        printerNameSelect.innerHTML =
          '<option value="">-- No seleccionada --</option>';

        serialPorts.forEach((port) =>
          scannerPortSelect.add(new Option(port, port))
        );
        printers.forEach((printer) =>
          printerNameSelect.add(new Option(printer, printer))
        );

        scannerPortSelect.value = currentScanner;
        printerNameSelect.value = currentPrinter;
      } catch (e) {
        console.error("Error al cargar puertos y impresoras:", e);
      }
    };

    const loadEmpleados = async () => {
      if (!empleadosContainer) return;
      try {
        const empleados = await ipcInvoke("get-empleados");
        empleadosContainer.innerHTML = "";
        (empleados || []).forEach((emp) => {
          const card = document.createElement("div");
          card.className = "empleado-card";
          card.innerHTML = `
            <h4>${emp.nombre}</h4>
            <p class="funcion">${emp.funcion || "Sin función"}</p>
            <p class="sueldo">$${(emp.sueldo || 0).toFixed(2)}</p>
            <div class="card-actions">
              <button class="btn btn-info btn-sm btn-edit-empleado" data-id="${
                emp.id
              }">Editar</button>
              <button class="btn btn-danger btn-sm btn-delete-empleado" data-id="${
                emp.id
              }">Eliminar</button>
            </div>`;
          empleadosContainer.appendChild(card);
        });
      } catch (e) {
        console.error("Error al cargar empleados:", e);
      }
    };

    const loadGastosFijos = async () => {
      if (!gastosContainer) return;
      try {
        const gastos = await ipcInvoke("get-gastos-fijos");
        gastosContainer.innerHTML = "";
        (gastos || []).forEach((gasto) => {
          const item = document.createElement("div");
          item.className = "gasto-item";
          item.innerHTML = `
            <span class="nombre">${gasto.nombre}</span>
            <div class="d-flex align-items-center" style="gap: 5px;">
              <span class="monto">$${(gasto.monto || 0).toFixed(2)}</span>
              <button class="btn btn-danger btn-sm btn-delete-gasto" data-id="${
                gasto.id
              }">🗑️</button>
            </div>`;
          gastosContainer.appendChild(item);
        });
      } catch (e) {
        console.error("Error al cargar gastos:", e);
      }
    };

    const loadAdminConfig = async () => {
      try {
        const config = await ipcInvoke("get-admin-config");
        if (!config) return;

        if (facturacionToggle)
          facturacionToggle.checked = !!config.facturacion_activa;

        if (afipForm) {
          if (afipCuitInput)          afipCuitInput.value     = config.afip_cuit    || "";
          if (afipPtoVtaInput)        afipPtoVtaInput.value   = config.afip_pto_vta || "";
          if (certFilePathDisplay)    certFilePathDisplay.textContent = config.afip_cert_path || "No seleccionado";
          if (keyFilePathDisplay)     keyFilePathDisplay.textContent  = config.afip_key_path  || "No seleccionado";
        }

        // Gmail: load only the user address (never the password)
        if (gmailForm) {
          try {
            const gmailCfg = await ipcInvoke("get-gmail-config");
            if (gmailCfg?.gmailUser) gmailUserInput.value = gmailCfg.gmailUser;
          } catch (_) {}
        }

        if (businessInfoForm) {
          businessNameInput.value    = config.nombre_negocio    || "";
          businessAddressInput.value = config.direccion_negocio || "";
          businessSloganInput.value = config.slogan_negocio || "";
          ticketFooterInput.value = config.footer_ticket || "";
          if (config.logo_url) {
            const logoSrc = `app:///${String(config.logo_url).replace(
              /\\/g,
              "/"
            )}?${Date.now()}`;
            previewLogo.src = logoSrc;
            previewLogo.style.display = "block";
          } else {
            previewLogo.style.display = "none";
          }
        }

        if (hardwareForm) {
          scannerPortSelect.value = config.config_puerto_scanner || "";
          printerNameSelect.value = config.config_puerto_impresora || "";
        }

        if (mpForm) {
          accessTokenInput.value = config.mp_access_token || "";
          mpUserIdInput.value = config.mp_user_id || "";
          if (config.mp_pos_id) {
            posIdInput.innerHTML = `<option value="${config.mp_pos_id}">Guardado: ${config.mp_pos_id}</option>`;
            posIdInput.value = config.mp_pos_id;
          }
        }

        // Formato de balanza (lector/generador)
        if (balanzaForm) {
          const bc = config.config_balanza || {};
          balanzaPrefijo.value = bc.prefijo ?? "20";
          balanzaTipoValor.value = bc.tipo_valor ?? "peso";
          balanzaValorDivisor.value = bc.valor_divisor ?? 1000;
          balanzaCodigoInicio.value = bc.codigo_inicio ?? 3;
          balanzaCodigoLongitud.value = bc.codigo_longitud ?? 5;
          balanzaValorInicio.value = bc.valor_inicio ?? 8;
          balanzaValorLongitud.value = bc.valor_longitud ?? 5;

          _balanzaFormato = {
            prefijo: bc.prefijo ?? "20",
            tipo_valor: bc.tipo_valor ?? "peso",
            valor_divisor: parseInt(bc.valor_divisor ?? 1000),
            codigo_inicio: parseInt(bc.codigo_inicio ?? 3),
            codigo_longitud: parseInt(bc.codigo_longitud ?? 5),
            valor_inicio: parseInt(bc.valor_inicio ?? 8),
            valor_longitud: parseInt(bc.valor_longitud ?? 5),
          };

          // Cargar perfil B si existe
          const bb = bc.perfil_b;
          if (bb && balanzaBPrefijo) {
            balanzaBPrefijo.value       = bb.prefijo || "";
            if (balanzaBTipoValor)      balanzaBTipoValor.value      = bb.tipo_valor || "peso";
            if (balanzaBValorDivisor)   balanzaBValorDivisor.value   = bb.valor_divisor || 1000;
            if (balanzaBCodigoInicio)   balanzaBCodigoInicio.value   = bb.codigo_inicio || 3;
            if (balanzaBCodigoLongitud) balanzaBCodigoLongitud.value = bb.codigo_longitud || 5;
            if (balanzaBValorInicio)    balanzaBValorInicio.value    = bb.valor_inicio || 8;
            if (balanzaBValorLongitud)  balanzaBValorLongitud.value  = bb.valor_longitud || 5;
          }
        }

        // Config de conexión de balanza (tcp/bt)
        if (scaleConfigForm) {
          const sc = config.config_balanza_conexion || {};
          if (scaleTransport) scaleTransport.value = sc.transport || "tcp";
          if (scaleIp) scaleIp.value = sc.ip || "";
          if (scalePort) scalePort.value = sc.port ?? 8000;
          if (scaleBtAddress) scaleBtAddress.value = sc.btAddress || "";
          if (scaleProtocol)
            scaleProtocol.value = sc.protocol || "kretz-report";
          if (scaleTimeout) scaleTimeout.value = sc.timeoutMs ?? 4000;

          const toggleTransp = () => {
            document
              .querySelectorAll(".only-tcp")
              .forEach(
                (el) =>
                  (el.style.display =
                    scaleTransport?.value === "tcp" ? "" : "none")
              );
            document
              .querySelectorAll(".only-bt")
              .forEach(
                (el) =>
                  (el.style.display =
                    scaleTransport?.value === "bt" ? "" : "none")
              );
          };
          toggleTransp();
          on(scaleTransport, "change", toggleTransp);
        }

        if (generalConfigForm) {
          recargoCreditoInput.value = config.config_recargo_credito ?? 0;
          descuentoEfectivoInput.value = config.config_descuento_efectivo ?? 0;
          
if (redondeoToggle) redondeoToggle.checked = !!(config.config_redondeo_automatico?.habilitado);
        }

        if (arqueoToggle) {
          const arqueoConfig = config.config_arqueo_caja || {};
          arqueoToggle.checked = !!arqueoConfig.habilitado;
          const horarios = arqueoConfig.horarios || {};
          const turno1 = horarios.turno1 || {};
          const turno2 = horarios.turno2 || {};
          horarioAperturaT1Input.value = turno1.apertura || "";
          horarioCierreT1Input.value = turno1.cierre || "";
          horarioAperturaT2Input.value = turno2.apertura || "";
          horarioCierreT2Input.value = turno2.cierre || "";
          toggleArqueoFields();
        }

        if (suscripcionCard) {
          try {
            const lic = await ipcInvoke("get-subscription-status");
            renderSuscripcionCard(lic);
          } catch {
            renderSuscripcionCard(null);
          }
        }

        updateTicketPreview();
        actualizarVisualizador();
        refreshBarcodePreview();
      } catch (e) {
        console.error("Error al cargar config de admin:", e);
        toast.show("No se pudo cargar la configuración guardada.", "error");
      }
    };

    // ── Referencias DOM: Acceso Remoto ──────────────────────────
    const tabRemoto          = document.getElementById("tab-remoto");
    const remoteStatusDot    = document.getElementById("remote-status-dot");
    const remoteStatusText   = document.getElementById("remote-status-text");
    const remoteClientsCount = document.getElementById("remote-clients-count");
    const remoteEnabledTog   = document.getElementById("remote-enabled-toggle");
    const remotePortInput    = document.getElementById("remote-port");
    const btnSaveRemote      = document.getElementById("btn-save-remote");
    const remoteTokenSection = document.getElementById("remote-token-section");
    const remoteTokenDisplay = document.getElementById("remote-token-display");
    const btnCopyToken       = document.getElementById("btn-copy-token");
    const btnRegenToken      = document.getElementById("btn-regen-token");
    const remoteApiUrl       = document.getElementById("remote-api-url");
    const remoteWsUrl        = document.getElementById("remote-ws-url");
    const btnRefreshMetrics  = document.getElementById("btn-refresh-metrics");
    const remoteMetricsGrid  = document.getElementById("remote-metrics-grid");
    const remoteCmdSelect    = document.getElementById("remote-cmd-select");
    const btnExecCmd         = document.getElementById("btn-exec-cmd");
    const remoteCmdOutput    = document.getElementById("remote-cmd-output");

    function formatBytes(b) {
      if (!b) return "—";
      if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
      if (b >= 1e6) return (b / 1e6).toFixed(0) + " MB";
      return (b / 1e3).toFixed(0) + " KB";
    }
    function formatUptime(s) {
      if (!s) return "—";
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return `${h}h ${m}m`;
    }

    function applyRemoteStatus(cfg) {
      if (!remoteStatusDot) return;
      const running = cfg.running;
      remoteStatusDot.className  = "remote-dot " + (running ? "remote-dot--on" : "remote-dot--off");
      remoteStatusText.textContent = running
        ? `Servidor activo en puerto ${cfg.port}`
        : "Servidor detenido";
      if (running && cfg.clients > 0) {
        remoteClientsCount.textContent = `${cfg.clients} cliente(s) conectado(s)`;
        remoteClientsCount.style.display = "";
      } else {
        remoteClientsCount.style.display = "none";
      }
      if (remoteEnabledTog) remoteEnabledTog.checked = !!cfg.enabled;
      if (remotePortInput)  remotePortInput.value    = cfg.port || 4827;
      if (cfg.token) {
        if (remoteTokenSection) remoteTokenSection.style.display = "";
        if (remoteTokenDisplay) remoteTokenDisplay.textContent = cfg.token;
        const port = cfg.port || 4827;
        if (remoteApiUrl) remoteApiUrl.textContent = `http://[IP_PC]:${port}/api/v1`;
        if (remoteWsUrl)  remoteWsUrl.textContent  = `ws://[IP_PC]:${port}/ws?token=${cfg.token.slice(0,8)}...`;
      }
    }

    function applyMetrics(m) {
      const g = id => document.getElementById(id);
      if (!m) return;
      g("m-cpu").textContent    = m.cpu?.loadPct != null ? `${m.cpu.loadPct}%`  : "—";
      g("m-temp").textContent   = m.cpu?.tempC   != null ? `${m.cpu.tempC} °C` : "N/D";
      g("m-ram").textContent    = m.ram ? `${m.ram.usePct}% (${formatBytes(m.ram.used)} / ${formatBytes(m.ram.total)})` : "—";
      g("m-uptime").textContent = formatUptime(m.os?.uptime);
      g("m-os").textContent     = m.os ? `${m.os.hostname} · ${m.os.version}` : "—";
      if (m.disks?.length) {
        g("m-disks").textContent = m.disks
          .map(d => `${d.mount || d.fs}: ${formatBytes(d.free)} libre / ${formatBytes(d.size)}`)
          .join("  |  ");
      }
    }

    async function loadRemoteConfig() {
      const cfg = await ipcInvoke("remote-get-config");
      applyRemoteStatus(cfg);
    }

    async function loadRemoteMetrics() {
      if (btnRefreshMetrics) btnRefreshMetrics.disabled = true;
      try {
        const m = await ipcInvoke("remote-get-metrics");
        applyMetrics(m);
      } finally {
        if (btnRefreshMetrics) btnRefreshMetrics.disabled = false;
      }
    }

    async function loadRemoteCommands() {
      if (!remoteCmdSelect) return;
      const cmds = await ipcInvoke("remote-list-commands");
      remoteCmdSelect.innerHTML = cmds.map(c =>
        `<option value="${c.key}">${c.key} — ${c.desc}</option>`
      ).join("");
    }

    if (btnSaveRemote) {
      btnSaveRemote.addEventListener("click", async () => {
        setBtnLoading(btnSaveRemote, true, "Guardando...");
        const res = await ipcInvoke("remote-save-config", {
          enabled: remoteEnabledTog?.checked || false,
          port:    Number(remotePortInput?.value) || 4827,
        });
        setBtnLoading(btnSaveRemote, false);
        if (res.success) {
          toast.show("Configuración guardada.", "success");
          await loadRemoteConfig();
        } else {
          toast.show(res.error || "Error al guardar.", "error");
        }
      });
    }

    if (btnCopyToken) {
      btnCopyToken.addEventListener("click", () => {
        const t = remoteTokenDisplay?.textContent;
        if (t && t !== "—") navigator.clipboard.writeText(t).then(() => toast.show("Token copiado.", "success"));
      });
    }

    if (btnRegenToken) {
      btnRegenToken.addEventListener("click", async () => {
        const ok = await confirmar("¿Regenerar el token? Los paneles web conectados dejarán de funcionar hasta que los actualices.");
        if (!ok) return;
        setBtnLoading(btnRegenToken, true, "...");
        const res = await ipcInvoke("remote-regenerate-token");
        setBtnLoading(btnRegenToken, false);
        if (res.success) { await loadRemoteConfig(); toast.show("Token regenerado.", "success"); }
        else toast.show(res.error || "Error.", "error");
      });
    }

    if (btnRefreshMetrics) {
      btnRefreshMetrics.addEventListener("click", loadRemoteMetrics);
    }

    if (btnExecCmd) {
      btnExecCmd.addEventListener("click", async () => {
        const cmd = remoteCmdSelect?.value;
        if (!cmd) return;
        setBtnLoading(btnExecCmd, true, "Ejecutando...");
        if (remoteCmdOutput) { remoteCmdOutput.style.display = ""; remoteCmdOutput.textContent = "Ejecutando..."; }
        const res = await ipcInvoke("remote-exec-cmd", { cmd });
        setBtnLoading(btnExecCmd, false);
        if (remoteCmdOutput) {
          remoteCmdOutput.textContent = res.output || "(sin salida)";
        }
      });
    }

    // --- 5. INIT ---
    (async () => {
      // Ocultar sección Gmail para todos excepto superadmin
      try {
        const session = await ipcInvoke("get-user-session");
        if (session?.rol !== "superadmin") {
          const gmailSection = document.getElementById("gmail-section");
          if (gmailSection) gmailSection.style.display = "none";
        } else {
          // Superadmin: mostrar tab remoto
          if (tabRemoto) tabRemoto.style.display = "";
        }
      } catch (_) {}

      // Run fast DB queries first so loadAdminConfig fires early.
      // loadAvailablePorts (serial port/printer enumeration) and
      // loadRemoteMetrics (WMI CPU-temp query) can take 5-10 s on Windows —
      // they run in the background to avoid blocking form field population.
      await Promise.all([
        loadUsers(),
        loadModules(),
        loadEmpleados(),
        loadGastosFijos(),
        loadRemoteConfig(),
        loadRemoteCommands(),
      ]);
      await loadAdminConfig();

      // Non-critical, potentially slow operations run after config is loaded.
      loadAvailablePorts();
      loadRemoteMetrics();
    })();

    // --- 6. EVENTOS ---

    // Usuarios
    on(btnNuevoUsuario, "click", () => openModal());
    on(btnCancelarModal, "click", closeModal);
    on(rolSelect, "change", togglePermisosFieldset);

    on(userForm, "submit", async (e) => {
      e.preventDefault();
      const submitBtn = userForm.querySelector('button[type="submit"]');
      setBtnLoading(submitBtn, true, "Guardando...");
      try {
        const permissions = [];
        if (rolSelect?.value === "cajero" && permisosContainer) {
          permisosContainer
            .querySelectorAll("input:checked")
            .forEach((c) => permissions.push(c.value));
        }
        const data = {
          id: userIdInput?.value || null,
          nombre: nombreInput?.value || "",
          password: passwordInput?.value || "",
          rol: rolSelect?.value || "cajero",
          permisos: permissions,
        };
        const result = await ipcInvoke("save-user", data);
        if (result?.success) {
          toast.show("Usuario guardado.");
          closeModal();
          loadUsers();
        } else {
          toast.show(
            result?.message || "No se pudo guardar el usuario.",
            "error"
          );
        }
      } catch (err) {
        console.error(err);
        toast.show("Error al guardar el usuario.", "error");
      } finally {
        setBtnLoading(submitBtn, false);
      }
    });

    on(usersTableBody, "click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;

      if (btn.classList.contains("btn-edit")) {
        const user = await ipcInvoke("get-user-by-id", id);
        user
          ? openModal(user)
          : toast.show("No se encontró el usuario.", "error");
      }

      if (btn.classList.contains("btn-eliminar")) {
        const ok = await confirmar("¿Eliminar este usuario?");
        if (!ok) return;
        const result = await ipcInvoke("delete-user", id);
        if (result?.success) {
          toast.show("Usuario eliminado.");
          loadUsers();
        } else {
          toast.show(result?.message || "No se pudo eliminar.", "error");
        }
      }
    });

    // Facturación AFIP toggle
    on(facturacionToggle, "change", async (e) => {
      try {
        const isEnabled = !!e.target.checked;
        const result = await ipcInvoke("save-facturacion-status", isEnabled);
        if (result?.success) toast.show("Configuración del módulo guardada.");
        else {
          toast.show(result?.message || "No se pudo guardar.", "error");
          e.target.checked = !isEnabled;
        }
      } catch {
        toast.show("Error al guardar facturación.", "error");
        e.target.checked = !e.target.checked;
      }
    });

    // Mercado Pago
    on(btnVerifyMP, "click", async () => {
      const accessToken = accessTokenInput?.value?.trim();
      if (!accessToken) return toast.show("Ingresá el Access Token.", "error");
      setBtnLoading(btnVerifyMP, true, "Verificando...");
      try {
        const result = await ipcInvoke("get-mp-pos-list", { accessToken });
        if (result?.success) {
          posIdInput.innerHTML =
            '<option value="">-- Selecciona una caja --</option>';
          (result.data || []).forEach((pos) => {
            if (pos.external_id) {
              const option = document.createElement("option");
              option.value = pos.external_id;
              option.textContent = `${pos.name} (ID Externo: ${pos.external_id})`;
              posIdInput.appendChild(option);
            }
          });
          toast.show(
            (result.data || []).length
              ? "Cajas cargadas."
              : "No se encontraron cajas.",
            (result.data || []).length ? "success" : "info"
          );
        } else {
          toast.show(
            `Error: ${result?.message || "Verificación fallida"}`,
            "error"
          );
          posIdInput.innerHTML =
            '<option value="">-- Verificación fallida --</option>';
        }
      } catch {
        toast.show("Error de comunicación al verificar.", "error");
      } finally {
        setBtnLoading(btnVerifyMP, false);
      }
    });

    on(mpForm, "submit", async (e) => {
      e.preventDefault();
      try {
        const data = {
          accessToken: accessTokenInput?.value?.trim(),
          userId: mpUserIdInput?.value?.trim(),
          posId: posIdInput?.value,
        };
        if (!data.posId)
          return toast.show("Seleccioná una caja (Punto de Venta).", "error");
        const result = await ipcInvoke("save-mp-config", data);
        result?.success
          ? toast.show("Configuración de MP guardada.")
          : toast.show(result?.message || "No se pudo guardar.", "error");
      } catch {
        toast.show("Error al guardar configuración de MP.", "error");
      }
    });

    // Empleados
    on(btnNuevoEmpleado, "click", () => openEmpleadoModal());
    on(btnCancelarEmpleado, "click", closeEmpleadoModal);

    on(empleadoForm, "submit", async (e) => {
      e.preventDefault();
      try {
        const data = {
          id: empleadoIdInput?.value || null,
          nombre: empleadoNombreInput?.value || "",
          funcion: empleadoFuncionInput?.value || "",
          sueldo: parseFloat(empleadoSueldoInput?.value) || 0,
        };
        const result = await ipcInvoke("save-empleado", data);
        if (result?.success) {
          toast.show("Empleado guardado.");
          closeEmpleadoModal();
          loadEmpleados();
        } else {
          toast.show(result?.message || "No se pudo guardar.", "error");
        }
      } catch {
        toast.show("Error al guardar empleado.", "error");
      }
    });

    on(empleadosContainer, "click", async (e) => {
      const editBtn = e.target.closest(".btn-edit-empleado");
      const deleteBtn = e.target.closest(".btn-delete-empleado");
      if (editBtn) {
        const id = editBtn.dataset.id;
        const empleados = await ipcInvoke("get-empleados");
        const empleado = (empleados || []).find(
          (emp) => String(emp.id) === String(id)
        );
        empleado
          ? openEmpleadoModal(empleado)
          : toast.show("Empleado no encontrado.", "error");
      }
      if (deleteBtn) {
        const ok = await confirmar("¿Eliminar este empleado?");
        if (!ok) return;
        const result = await ipcInvoke("delete-empleado", deleteBtn.dataset.id);
        if (result?.success) {
          toast.show("Empleado eliminado.");
          loadEmpleados();
        } else {
          toast.show(result?.message || "No se pudo eliminar.", "error");
        }
      }
    });

    // Gastos
    on(gastoForm, "submit", async (e) => {
      e.preventDefault();
      try {
        const data = {
          nombre: gastoNombreInput?.value || "",
          monto: parseFloat(gastoMontoInput?.value) || 0,
        };
        const result = await ipcInvoke("save-gasto-fijo", data);
        if (result?.success) {
          toast.show("Gasto guardado.");
          gastoForm.reset();
          loadGastosFijos();
        } else {
          toast.show(result?.message || "No se pudo guardar.", "error");
        }
      } catch {
        toast.show("Error al guardar gasto.", "error");
      }
    });

    on(gastosContainer, "click", async (e) => {
      const deleteBtn = e.target.closest(".btn-delete-gasto");
      if (deleteBtn) {
        const ok = await confirmar("¿Eliminar este gasto?");
        if (!ok) return;
        const result = await ipcInvoke(
          "delete-gasto-fijo",
          deleteBtn.dataset.id
        );
        if (result?.success) {
          toast.show("Gasto eliminado.");
          loadGastosFijos();
        } else {
          toast.show(result?.message || "No se pudo eliminar.", "error");
        }
      }
    });

    // AFIP
    if (afipForm) {
      on(afipCertFileInput, "change", () => {
        if (afipCertFileInput.files.length > 0)
          certFilePathDisplay.textContent = afipCertFileInput.files[0].path;
      });
      on(afipKeyFileInput, "change", () => {
        if (afipKeyFileInput.files.length > 0)
          keyFilePathDisplay.textContent = afipKeyFileInput.files[0].path;
      });
      on(afipForm, "submit", async (e) => {
        e.preventDefault();
        try {
          const data = {
            cuit: afipCuitInput?.value || "",
            ptoVta: afipPtoVtaInput?.value || "",
            certPath:
              afipCertFileInput?.files?.[0]?.path ||
              certFilePathDisplay?.textContent ||
              "",
            keyPath:
              afipKeyFileInput?.files?.[0]?.path ||
              keyFilePathDisplay?.textContent ||
              "",
          };
          const result = await ipcInvoke("save-afip-config", data);
          result?.success
            ? toast.show("Configuración de AFIP guardada.")
            : toast.show(
                "Error: " + (result?.message || "No se pudo guardar."),
                "error"
              );
        } catch {
          toast.show("Error al guardar AFIP.", "error");
        }
      });
    }

    // Hardware
    on(btnRefreshPorts, "click", loadAvailablePorts);

    on(hardwareForm, "submit", async (e) => {
      e.preventDefault();
      try {
        const result = await ipcInvoke("save-hardware-config", {
          scannerPort: scannerPortSelect?.value || "",
          printerName: printerNameSelect?.value || "",
        });
        result?.success
          ? toast.show("Configuración de hardware guardada.")
          : toast.show("Error al guardar hardware.", "error");
      } catch {
        toast.show("Error al guardar hardware.", "error");
      }
    });

    // Test print
    on(btnTestPrint, "click", async () => {
      const selectedPrinter = printerNameSelect?.value;
      if (!selectedPrinter)
        return toast.show("Seleccioná una impresora.", "error");
      setBtnLoading(btnTestPrint, true, "Imprimiendo...");
      try {
        const result = await ipcInvoke("test-print", selectedPrinter);
        result?.success
          ? toast.show("Página de prueba enviada.", "success")
          : toast.show(`Error de impresión: ${result?.message || ""}`, "error");
      } catch {
        toast.show("Error de comunicación al imprimir.", "error");
      } finally {
        setBtnLoading(btnTestPrint, false);
      }
    });

    // Balanza (formato)
    if (balanzaForm) {
      on(balanzaTipoValor, "change", () => {
        if (!balanzaValorDivisor) return;
        balanzaValorDivisor.readOnly = balanzaTipoValor.value === "precio";
        balanzaValorDivisor.value = balanzaTipoValor.value === "peso" ? 1000 : 100;
        actualizarVisualizador();
        _balanzaFormato = leerConfigBalanza();
        refreshBarcodePreview();
      });
      on(balanzaBTipoValor, "change", () => {
        if (!balanzaBValorDivisor) return;
        balanzaBValorDivisor.value = balanzaBTipoValor.value === "peso" ? 1000 : 100;
      });

      [
        balanzaPrefijo,
        balanzaCodigoInicio,
        balanzaCodigoLongitud,
        balanzaValorInicio,
        balanzaValorLongitud,
        balanzaValorDivisor,
      ].forEach((input) =>
        on(input, "input", () => {
          actualizarVisualizador();
          _balanzaFormato = leerConfigBalanza();
          refreshBarcodePreview();
        })
      );

      on(balanzaForm, "submit", async (e) => {
        e.preventDefault();
        try {
          const configData = leerConfigBalanza();
          const result = await ipcInvoke("save-balanza-config", configData);
          if (result?.success) {
            toast.show("Configuración de balanza guardada.");
            _balanzaFormato = configData;
            refreshBarcodePreview();
          } else {
            toast.show(result?.message || "No se pudo guardar.", "error");
          }
        } catch {
          toast.show("Error al guardar balanza.", "error");
        }
      });
    }

    // Conexión/gestión Kretz Report LT
    if (scaleConfigForm) {
      on(scaleConfigForm, "submit", async (e) => {
        e.preventDefault();
        try {
          const cfg = {
            transport: scaleTransport?.value || "tcp",
            ip: scaleIp?.value?.trim() || null,
            port: parseInt(scalePort?.value) || 8000,
            btAddress: scaleBtAddress?.value?.trim() || null,
            protocol: scaleProtocol?.value || "kretz-report",
            timeoutMs: parseInt(scaleTimeout?.value) || 4000,
          };
          const result = await ipcInvoke("save-scale-config", cfg);
          result?.success
            ? toast.show("Config de balanza guardada.")
            : toast.show(result?.message || "No se pudo guardar.", "error");
        } catch (err) {
          console.error(err);
          toast.show("Error al guardar config de balanza.", "error");
        }
      });

      on(btnScaleTest, "click", async () => {
        setBtnLoading(btnScaleTest, true, "Probando...");
        try {
          const result = await ipcInvoke("scale-test-connection");
          result?.success
            ? toast.show(`OK: ${result.message || "Conectado"}`)
            : toast.show(result?.message || "Fallo de conexión.", "error");
        } catch (e) {
          toast.show("Error al probar conexión.", "error");
        } finally {
          setBtnLoading(btnScaleTest, false);
        }
      });
    }

    // PLU + código de barras
    if (pluForm) {
      [pluCodeInput, pluPriceInput, barcodeAutoChk, pluBarcodeInput].forEach(
        (el) => el && on(el, "input", refreshBarcodePreview)
      );

      on(btnScaleUpsert, "click", async () => {
        try {
          const payload = {
            plu: parseInt(pluCodeInput?.value),
            name: (pluNameInput?.value || "").trim(),
            price: parseInt(pluPriceInput?.value), // centavos
            tare: parseInt(pluTareInput?.value) || 0,
            barcode: (pluBarcodeInput?.value || "").trim() || null,
            autoBarcode: !!barcodeAutoChk?.checked,
          };
          if (!payload.plu || !payload.name || !payload.price) {
            return toast.show("Completá PLU, nombre y precio.", "error");
          }
          setBtnLoading(btnScaleUpsert, true, "Enviando...");
          const result = await ipcInvoke("scale-upsert-plu", payload);
          result?.success
            ? toast.show("PLU/código actualizado en balanza.")
            : toast.show(result?.message || "No se pudo enviar.", "error");
        } catch (e) {
          toast.show("Error al enviar PLU.", "error");
        } finally {
          setBtnLoading(btnScaleUpsert, false);
        }
      });

      on(btnScaleDelete, "click", async () => {
        try {
          const plu = parseInt(pluCodeInput?.value);
          if (!plu) return toast.show("Ingresá el PLU a eliminar.", "error");
          setBtnLoading(btnScaleDelete, true, "Eliminando...");
          const result = await ipcInvoke("scale-delete-plu", { plu });
          result?.success
            ? toast.show("PLU eliminado en balanza.")
            : toast.show(result?.message || "No se pudo eliminar.", "error");
        } catch (e) {
          toast.show("Error al eliminar PLU.", "error");
        } finally {
          setBtnLoading(btnScaleDelete, false);
        }
      });

      on(btnScaleSyncAll, "click", async () => {
        const ok = await confirmar(
          "Esto enviará todos los productos pesables a la balanza. ¿Continuar?"
        );
        if (!ok) return;
        try {
          setBtnLoading(btnScaleSyncAll, true, "Sincronizando...");
          const result = await ipcInvoke("scale-sync-all-plu");
          result?.success
            ? toast.show(result?.message || "Catálogo sincronizado.")
            : toast.show(result?.message || "Fallo al sincronizar.", "error");
        } catch (e) {
          toast.show("Error al sincronizar.", "error");
        } finally {
          setBtnLoading(btnScaleSyncAll, false);
        }
      });
    }

    // Parámetros financieros
    on(generalConfigForm, "submit", async (e) => {
    e.preventDefault();
      try {
        const data = {
          recargoCredito: parseFloat(recargoCreditoInput?.value) || 0,
          descuentoEfectivo: parseFloat(descuentoEfectivoInput?.value) || 0,
          redondeo: !!redondeoToggle?.checked,
        };
        const result = await ipcInvoke("save-general-config", data);
        result?.success
          ? toast.show("Configuración general guardada.")
          : toast.show(result?.message || "No se pudo guardar.", "error");
      } catch {
        toast.show("Error al guardar configuración general.", "error");
      }
    });

    // Negocio
    if (businessInfoForm) {
      [businessNameInput, businessSloganInput, ticketFooterInput].forEach(
        (input) => on(input, "input", updateTicketPreview)
      );

      on(logoUploadInput, "change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          newLogoBase64 = ev.target.result;
          if (previewLogo) {
            previewLogo.src = newLogoBase64;
            previewLogo.style.display = "block";
          }
          updateTicketPreview();
        };
        reader.readAsDataURL(file);
      });

      on(businessAddressInput, "input", () => {
        const addr = document.getElementById("preview-address");
        if (addr) addr.textContent = businessAddressInput?.value || "";
      });

      on(businessInfoForm, "submit", async (e) => {
        e.preventDefault();
        try {
          const data = {
            nombre:     businessNameInput?.value    || "",
            direccion:  businessAddressInput?.value   || "",
            slogan:     businessSloganInput?.value     || "",
            footer:     ticketFooterInput?.value       || "",
            logoBase64: newLogoBase64,
          };
          const result = await ipcInvoke("save-business-info", data);
          if (result?.success) {
            toast.show("Información del negocio guardada.");
            const sidebarName = document.getElementById(
              "sidebar-business-name"
            );
            const sidebarLogo = document.getElementById("sidebar-logo");
            if (sidebarName) sidebarName.textContent = data.nombre;
            if (sidebarLogo && newLogoBase64) {
              sidebarLogo.src = newLogoBase64;
              sidebarLogo.style.display = "block";
            }
            newLogoBase64 = null;
            if (logoUploadInput) logoUploadInput.value = "";
          } else {
            toast.show(result?.message || "No se pudo guardar.", "error");
          }
        } catch {
          toast.show("Error al guardar datos del negocio.", "error");
        }
      });
    }

    // ── Horarios Comerciales ─────────────────────────────────────────────────
    (async function initBusinessHours() {
      const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
      const grid   = document.getElementById('business-hours-grid');
      const form   = document.getElementById('business-hours-form');
      const status = document.getElementById('business-hours-status');
      if (!grid || !form) return;

      // Construir filas para los 7 días
      const defaults = DAYS.map((_, i) => ({
        day: i, open_time: '09:00', close_time: '20:00', is_open: i < 5,
      }));

      function renderGrid(hours) {
        grid.innerHTML = '';
        (hours.length ? hours : defaults).forEach(h => {
          const day = DAYS[h.day];
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #e2e8f0;';
          row.innerHTML = `
            <label style="width:90px;font-size:13px;font-weight:600;color:#374151;flex-shrink:0">${day}</label>
            <input type="checkbox" id="open-${h.day}" ${h.is_open ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer">
            <label for="open-${h.day}" style="font-size:12px;color:#64748b;width:50px;flex-shrink:0">Abierto</label>
            <div id="times-${h.day}" style="display:${h.is_open ? 'flex' : 'none'};gap:8px;align-items:center;flex:1">
              <input type="time" id="open-time-${h.day}" value="${h.open_time}" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <span style="color:#64748b;font-size:12px">→</span>
              <input type="time" id="close-time-${h.day}" value="${h.close_time}" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
            </div>
            <div id="times-${h.day}-closed" style="display:${h.is_open ? 'none' : 'block'};font-size:12px;color:#94a3b8">Cerrado</div>
          `;
          const chk = row.querySelector(`#open-${h.day}`);
          chk.addEventListener('change', () => {
            document.getElementById(`times-${h.day}`).style.display = chk.checked ? 'flex' : 'none';
            document.getElementById(`times-${h.day}-closed`).style.display = chk.checked ? 'none' : 'block';
          });
          grid.appendChild(row);
        });
      }

      // Cargar horarios existentes
      try {
        const res = await ipcInvoke('monitoring-get-hours', await ipcInvoke('get-session-token'));
        renderGrid(res.ok && res.hours.length ? res.hours : []);
      } catch {
        renderGrid([]);
      }

      on(form, 'submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true; btn.textContent = 'Guardando...';
        status.textContent = '';

        const hours = DAYS.map((_, i) => ({
          day:        i,
          is_open:    document.getElementById(`open-${i}`)?.checked || false,
          open_time:  document.getElementById(`open-time-${i}`)?.value || '09:00',
          close_time: document.getElementById(`close-time-${i}`)?.value || '20:00',
        }));

        try {
          const token = await ipcInvoke('get-session-token');
          const res = await ipcInvoke('monitoring-set-hours', { token, hours });
          if (res.ok) {
            toast.show('Horarios guardados correctamente.');
            status.textContent = 'Guardado. El heartbeat se ajustará al nuevo horario.';
          } else {
            toast.show('Error al guardar horarios.', 'error');
          }
        } catch {
          toast.show('Error al guardar horarios.', 'error');
        } finally {
          btn.disabled = false; btn.textContent = 'Guardar Horarios';
        }
      });
    })();

    // Copiar cURL
    on(btnCopyCurl, "click", () => {
      const curlCommandCode = document.getElementById("curl-command");
      if (!curlCommandCode) return;
      navigator.clipboard
        .writeText(curlCommandCode.textContent || "")
        .then(() => toast.show("Comando copiado."))
        .catch(() => toast.show("No se pudo copiar.", "error"));
    });

    // Arqueo
    on(arqueoToggle, "change", toggleArqueoFields);

    on(arqueoConfigForm, "submit", async (e) => {
      e.preventDefault();
      try {
        const configData = {
          habilitado: !!arqueoToggle?.checked,
          horarios: {
            turno1: {
              apertura: horarioAperturaT1Input?.value || "",
              cierre: horarioCierreT1Input?.value || "",
            },
            turno2: {
              apertura: horarioAperturaT2Input?.value || "",
              cierre: horarioCierreT2Input?.value || "",
            },
          },
        };
        const result = await ipcInvoke("save-arqueo-config", configData);
        result?.success
          ? toast.show("Configuración de caja guardada.")
          : toast.show(
              `Error: ${result?.message || "No se pudo guardar."}`,
              "error"
            );
      } catch {
        toast.show("Error al guardar configuración de caja.", "error");
      }
    });


    // ── Importación masiva de productos (CSV) ──────────────────────────────
    const btnExportarCSV = document.getElementById("btn-exportar-csv");
    const btnImportarCSV = document.getElementById("btn-importar-csv");

    on(btnExportarCSV, "click", async () => {
      btnExportarCSV.disabled = true;
      btnExportarCSV.textContent = "Exportando...";
      try {
        const res = await ipcInvoke("export-productos-csv");
        toast.show(res.success ? res.message : (res.message || "Error al exportar."), res.success ? "success" : "error");
      } catch (e) {
        toast.show(e.message || "Error.", "error");
      } finally {
        btnExportarCSV.disabled = false;
        btnExportarCSV.textContent = "Descargar Plantilla (CSV)";
      }
    });

    on(btnImportarCSV, "click", async () => {
      btnImportarCSV.disabled = true;
      btnImportarCSV.textContent = "Importando...";
      try {
        const res = await ipcInvoke("import-productos-csv");
        if (res.success) {
          toast.show(res.message, "success");
        } else if (res.message !== "Importación cancelada.") {
          toast.show(res.message || "Error al importar.", "error");
        }
      } catch (e) {
        toast.show(e.message || "Error.", "error");
      } finally {
        btnImportarCSV.disabled = false;
        btnImportarCSV.textContent = "Importar Productos (CSV)";
      }
    });

    // ── Gmail config ─────────────────────────────────────────────
    const showGmailStatus = (msg, ok) => {
      if (!gmailStatus) return;
      gmailStatus.textContent = msg;
      gmailStatus.style.display = msg ? "block" : "none";
      gmailStatus.className = "gmail-status-msg " + (ok ? "gmail-ok" : "gmail-err");
    };

    // Toggle password visibility for Gmail pass field
    const gmailToggle = gmailForm?.querySelector(".toggle-password");
    if (gmailToggle && gmailPassInput) {
      gmailToggle.addEventListener("click", () => {
        const isHidden = gmailPassInput.type === "password";
        gmailPassInput.type = isHidden ? "text" : "password";
        gmailToggle.querySelector(".eye-show").style.display = isHidden ? "none" : "";
        gmailToggle.querySelector(".eye-hide").style.display = isHidden ? "" : "none";
      });
    }

    on(btnTestGmail, "click", async () => {
      const user = gmailUserInput?.value.trim();
      const pass = gmailPassInput?.value.trim();
      if (!user || !pass) {
        showGmailStatus("Completá el correo y la contraseña de aplicación para probar.", false);
        return;
      }
      btnTestGmail.disabled = true;
      btnTestGmail.textContent = "Probando...";
      showGmailStatus("", false);
      try {
        const res = await ipcInvoke("test-gmail-config", { gmailUser: user, gmailPass: pass });
        if (res.success) {
          showGmailStatus("Conexión exitosa. El correo está listo para enviar mensajes.", true);
        } else {
          showGmailStatus("Error: " + (res.message || "No se pudo conectar."), false);
        }
      } catch (e) {
        showGmailStatus("Error inesperado: " + e.message, false);
      } finally {
        btnTestGmail.disabled = false;
        btnTestGmail.textContent = "Probar conexión";
      }
    });

    on(gmailForm, "submit", async (e) => {
      e.preventDefault();
      const user = gmailUserInput?.value.trim();
      const pass = gmailPassInput?.value.trim();
      const btn = gmailForm.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }
      showGmailStatus("", false);
      try {
        const res = await ipcInvoke("save-gmail-config", { gmailUser: user, gmailPass: pass });
        if (res.success) {
          toast.show("Configuración Gmail guardada correctamente.", "success");
          showGmailStatus("", false);
        } else {
          showGmailStatus(res.message || "Error al guardar.", false);
        }
      } catch (err) {
        showGmailStatus("Error inesperado: " + err.message, false);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Guardar configuración Gmail"; }
      }
    });

  });
})();


document.getElementById("btn-admin-soporte")?.addEventListener("click", () => {
  window.electronAPI?.invoke("open-soporte").catch(() => {});
});
