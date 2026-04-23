// renderer/js/caja.js
document.addEventListener("app-ready", () => {
  // --- 1. ESTADO & REFS ---
  const CajaState = {
    ventaActual: [],
    clienteActual: null,
    metodoPagoSeleccionado: null,
    ultimoReciboTexto: null,
    sesion: null,
    arqueoActual: null,
    barcodeBuffer: [],
    barcodeTimer: null,
    isRendering: false,
    ultimoMPPaymentId: null,
    ultimaExternalReference: null,
    totalFinalRedondeado: 0,
    confirmarVentaPending: false, 
    confirmarVentaTimer: null
  };

  // DOM
  const mainInput = document.getElementById("main-input");
  const tableContainer = document.querySelector(".productos-seleccionados");
  const tablaBody = document.getElementById("tabla-productos");
  const totalDisplay = document.getElementById("total-display");
  const itemsCountDisplay = document.getElementById("items-count-display");
  const subtotalDisplay = document.getElementById("subtotal-display");
  const descuentoDisplay = document.getElementById("descuento-display");
  const descuentoFila = document.querySelector(".descuento-fila");
  const descuentoEfectivoDisplay = document.getElementById(
    "descuento-efectivo-display"
  );
  const descuentoEfectivoFila = document.querySelector(
    ".descuento-efectivo-fila"
  );
  const recargoDisplay = document.getElementById("recargo-display");
  const recargoFila = document.querySelector(".recargo-fila");
  const dniInput = document.getElementById("dni-cliente");
  const btnBuscarCliente = document.getElementById("btn-buscar-cliente");
  const clienteInfo = document.getElementById("cliente-info");
  const paymentButtons = document.querySelectorAll(".payment-methods button");
  const efectivoArea = document.getElementById("efectivo-area");
  const montoPagadoInput = document.getElementById("monto-pagado");
  const vueltoDisplay = document.getElementById("vuelto-display");
  const btnRegistrarVenta = document.getElementById("registrar-venta-btn");
  const btnCancelarVenta = document.getElementById("cancelar-venta-btn");
  const btnImprimirTicket = document.getElementById("imprimir-ticket-btn");
  const generarFacturaCheckbox = document.getElementById(
    "generar-factura-check"
  );

  // Modales/Toast
  const modalContainer = document.getElementById("modal-container");
  const modalMessage = document.getElementById("modal-message");
  const modalAcceptBtn = document.getElementById("modal-accept-btn");
  const toastNotification = document.getElementById("toast-notification");
  const bloqueoSuperposicion = document.getElementById(
    "bloqueo-panel-superposicion"
  );

  // Modal Venta Exitosa
  const ventaExitosaModal = document.getElementById("venta-exitosa-modal");
  const exTotal = document.getElementById("ex-total");
  const exMetodoPago = document.getElementById("ex-metodo-pago");
  const resumenPagoMP = document.getElementById("resumen-pago-mp");
  const exMpId = document.getElementById("ex-mp-id");
  const exBtnImprimirMP = document.getElementById("ex-btn-imprimir-mp");
  const exBtnCerrar = document.getElementById("ex-btn-cerrar");

  // Arqueo
  const abrirCajaBtn   = document.getElementById("abrir-caja-btn");
  const cerrarCajaBtn  = document.getElementById("cerrar-caja-btn");
  const movimientoBtn  = document.getElementById("movimiento-caja-btn");
  const informeXBtn    = document.getElementById("informe-x-btn");
  const aperturaCajaModal = document.getElementById("apertura-caja-modal");
  const aperturaCajaForm = document.getElementById("apertura-caja-form");
  const montoInicialInput = document.getElementById("monto-inicial");
  const cancelarAperturaBtn = document.getElementById("cancelar-apertura-btn");
  const cierreCajaModal = document.getElementById("cierre-caja-modal");
  const resumenCierreCaja = document.getElementById("resumen-cierre-caja");
  const cierreCajaForm = document.getElementById("cierre-caja-form");
  const montoFinalRealInput = document.getElementById("monto-final-real");
  const observacionesCierreInput = document.getElementById(
    "observaciones-cierre"
  );
  const cancelarCierreBtn = document.getElementById("cancelar-cierre-btn");

  // --- 2. UTILIDADES UI ---
  const formatCurrency = (value) =>
    (value || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });

  // ⬇️ AÑADE ESTA FUNCIÓN NUEVA ⬇️
  const aplicarRedondeo = (total) => {
    // Obtener la base de 100 (ej: 544 -> 500)
    const base = Math.floor(total / 100) * 100;
    // Obtener el "resto" (ej: 544 -> 44)
    const resto = total - base;

    // Regla 1: Si es <= 44, redondear hacia abajo (a 00)
    if (resto <= 44) {
      return base; // ej: 500
    }
    // Regla 2: Si es >= 45 Y <= 50, redondear a 50
    else if (resto >= 45 && resto <= 50) {
      return base + 50; // ej: 500 + 50 = 550
    }
    // Regla 3: Si es > 50 (ej: 51), redondear hacia arriba (a 100)
    else {
      return base + 100; // ej: 500 + 100 = 600
    }
  };

  // ⬇️ PEGA ESTA NUEVA FUNCIÓN AQUÍ ⬇️
  const formatCurrencyForTicket = (value) => {
    // Redondea el número (quita decimales)
    const num = Math.round(Number(value) || 0);
    // Lo convierte a string sin puntos ni comas
    return `$${num}`; // Ejemplo: $1000
  };

  // Compute effective line subtotal applying an offer (mirrors server logic)
  const calcularSubtotalConOferta = (oferta, precioVenta, cantidad) => {
    const pv = Number(precioVenta);
    const qty = Number(cantidad);
    if (!oferta) return pv * qty;
    switch (oferta.tipo) {
      case 'porcentaje': {
        const pct = Number(oferta.valor) || 0;
        return Math.round(pv * qty * (1 - pct / 100) * 100) / 100;
      }
      case '2x1':
        return pv * Math.ceil(qty / 2);
      case '3x2':
        return pv * (qty - Math.floor(qty / 3));
      default:
        return pv * qty;
    }
  };

  const getOfertaLabel = (oferta) => {
    if (!oferta) return null;
    if (oferta.nombre) return oferta.nombre;
    if (oferta.tipo === 'porcentaje') return oferta.valor + '% OFF';
    return oferta.tipo.toUpperCase();
  };

  const showErrorModal = (message) => {
    if (!modalContainer) return;
    modalMessage.textContent = message;
    modalContainer.classList.remove("oculto");
    modalAcceptBtn.focus();
  };

  const hideErrorModal = () => {
    if (!modalContainer) return;
    modalContainer.classList.add("oculto");
    mainInput?.focus();
  };

  const showToast = (message, type = "success") => {
    if (!toastNotification) return;
    toastNotification.textContent = message;
    toastNotification.className = `toast ${type} visible`;
    setTimeout(() => toastNotification.classList.remove("visible"), 3000);
  };

  const toggleButtonLoading = (button, isLoading, originalText) => {
    if (!button) return;
    if (!button.dataset.originalText && originalText) {
      button.dataset.originalText = originalText;
    }
    button.disabled = isLoading;
    button.textContent = isLoading
      ? "Procesando..."
      : button.dataset.originalText || originalText;
  };

  const mostrarModalVentaExitosa = (result) => {
    if (!ventaExitosaModal) return;
    exTotal.textContent = formatCurrency(result.datosRecibo.total);
    exMetodoPago.textContent = result.datosRecibo.metodoPago || "-";
    if (result.datosPagoMP) {
      exMpId.textContent = result.datosPagoMP.id;
      resumenPagoMP.classList.remove("oculto");
    } else {
      resumenPagoMP.classList.add("oculto");
    }
    ventaExitosaModal.classList.add("visible");
  };

  const bloquearUI = (mensaje) => {
    if (!bloqueoSuperposicion) return;
    bloqueoSuperposicion.querySelector("p").textContent = mensaje;
    bloqueoSuperposicion.classList.remove("oculto");
    mainInput && (mainInput.disabled = true);
    document
      .querySelectorAll(
        ".acciones-panel button, .venta-panel input, .venta-panel button"
      )
      .forEach((el) => {
        if (!el.closest(".arqueo-actions")) el.disabled = true;
      });
  };

  const desbloquearUI = () => {
    if (!bloqueoSuperposicion) return;
    bloqueoSuperposicion.classList.add("oculto");
    mainInput && (mainInput.disabled = false);
    document
      .querySelectorAll(
        ".acciones-panel button, .venta-panel input, .venta-panel button"
      )
      .forEach((el) => (el.disabled = false));
    mainInput?.focus();
  };

  const getCfg = () => ({
    dtoEf: Number(CajaState.sesion?.config?.config_descuento_efectivo) || 0,
    recCredito: Number(CajaState.sesion?.config?.config_recargo_credito) || 0,
    redondeo: CajaState.sesion?.config?.config_redondeo_automatico || {
      habilitado: false,
    },
    arqueo: CajaState.sesion?.config?.config_arqueo_caja || {
      habilitado: false,
    },
    nombreNegocio: CajaState.sesion?.config?.nombre_negocio || "Mi Negocio",
    sloganNegocio: CajaState.sesion?.config?.slogan_negocio || "",
    footerTicket:
      CajaState.sesion?.config?.footer_ticket || "¡Gracias por su compra!",
    impresora: CajaState.sesion?.config?.config_puerto_impresora || null,
  });

  const actualizarEstadoVisualCaja = () => {
    const cfg = getCfg();
    if (!cfg.arqueo.habilitado) {
      abrirCajaBtn?.classList.add("oculto");
      cerrarCajaBtn?.classList.add("oculto");
      movimientoBtn?.classList.add("oculto");
      informeXBtn?.classList.add("oculto");
      desbloquearUI();
      return;
    }
    if (CajaState.arqueoActual) {
      abrirCajaBtn?.classList.add("oculto");
      cerrarCajaBtn?.classList.remove("oculto");
      movimientoBtn?.classList.remove("oculto");
      informeXBtn?.classList.remove("oculto");
      desbloquearUI();
    } else {
      abrirCajaBtn?.classList.remove("oculto");
      cerrarCajaBtn?.classList.add("oculto");
      movimientoBtn?.classList.add("oculto");
      informeXBtn?.classList.add("oculto");
      bloquearUI("Debes realizar la apertura de caja para comenzar a vender.");
    }
  };

  const actualizarCalculoVuelto = () => {
    if (CajaState.metodoPagoSeleccionado !== "Efectivo") {
      if (vueltoDisplay) {
        vueltoDisplay.textContent = formatCurrency(0);
        vueltoDisplay.style.color = ""; // color normal
      }
      return;
    }

    const totalTexto = totalDisplay?.textContent || "$0";
    const clean = totalTexto
      .replace(/[^\d,-]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const total = parseFloat(clean) || 0;
    const pagado = parseFloat(montoPagadoInput?.value) || 0;

    const diferencia = pagado - total; // puede ser negativo o positivo
    CajaState.vueltoActual = diferencia;

    if (!vueltoDisplay) return;

    if (diferencia < 0) {
      vueltoDisplay.textContent = `- ${formatCurrency(Math.abs(diferencia))}`;
      vueltoDisplay.style.color = "red";
    } else {
      vueltoDisplay.textContent = formatCurrency(diferencia);
      vueltoDisplay.style.color = "green";
    }
  };

  // --- 3. RENDER & NEGOCIO ---
  const renderizarVenta = () => {
    if (CajaState.isRendering) return;
    CajaState.isRendering = true;

    requestAnimationFrame(() => {
      if (!tablaBody) {
        CajaState.isRendering = false;
        return;
      }
      tablaBody.innerHTML = "";

      const totalItems = CajaState.ventaActual.reduce(
        (acc, i) => acc + i.cantidad,
        0
      );
      itemsCountDisplay && (itemsCountDisplay.textContent = totalItems);

      let subtotal = 0;
      CajaState.ventaActual.forEach((item, index) => {
        const itemSubtotal = calcularSubtotalConOferta(item.oferta, item.precioUnitario, item.cantidad);
        subtotal += itemSubtotal;

        const row = document.createElement("tr");
        const imagenSrc = item.producto?.imagen_url
          ? `app://${item.producto.imagen_url.replace(/\\/g, "/")}`
          : "app://images/logo.png";
        row.innerHTML = `
          <td><img src="${imagenSrc}" alt="${
          item.nombreProducto
        }" width="40" height="40"
                   style="object-fit:cover;border-radius:4px;" onerror="this.style.display='none';"></td>
          <td>${item.nombreProducto}${item.oferta ? "<span class=\"oferta-badge\">" + getOfertaLabel(item.oferta) + "</span>" : ""}</td>
          <td><input type="number" class="cantidad-input" value="${
            item.cantidad
          }" data-index="${index}"
                   min="0.01" step="any" style="width:70px;"></td>
          <td>${item.oferta ? "<span class=\"precio-tachado\">" + formatCurrency(item.precioUnitario) + "</span>" : formatCurrency(item.precioUnitario)}</td>
          <td>${formatCurrency(itemSubtotal)}</td>
          <td><button data-index="${index}" class="btn-delete-item" title="Quitar">X</button></td>
        `;
        tablaBody.appendChild(row);
      });

      const cfg = getCfg();

      // Descuentos y recargos
      let dCliente = 0;
      if ((CajaState.clienteActual?.descuento || 0) > 0) {
        dCliente = subtotal * (CajaState.clienteActual.descuento / 100);
        descuentoFila?.classList.remove("oculto");
      } else {
        descuentoFila?.classList.add("oculto");
      }

      let dEfectivo = 0;
      if (CajaState.metodoPagoSeleccionado === "Efectivo" && cfg.dtoEf > 0) {
        dEfectivo = (subtotal - dCliente) * (cfg.dtoEf / 100);
        descuentoEfectivoFila?.classList.remove("oculto");
      } else {
        descuentoEfectivoFila?.classList.add("oculto");
      }

      const descuentos = dCliente + dEfectivo;

      let recargo = 0;
      if (
        CajaState.metodoPagoSeleccionado === "Crédito" &&
        cfg.recCredito > 0
      ) {
        recargo = (subtotal - descuentos) * (cfg.recCredito / 100);
        recargoFila?.classList.remove("oculto");
      } else {
        recargoFila?.classList.add("oculto");
      }

      let total = subtotal - descuentos + recargo;

      // 2. Aplica el redondeo si está activo
      if (cfg.redondeo.habilitado) {
        total = aplicarRedondeo(total);
      }

      // 3. Guarda el total final (redondeado o no) en el estado
      CajaState.totalFinalRedondeado = total;
      subtotalDisplay &&
        (subtotalDisplay.textContent = formatCurrency(subtotal));
      descuentoDisplay &&
        (descuentoDisplay.textContent = `-${formatCurrency(dCliente)}`);
      descuentoEfectivoDisplay &&
        (descuentoEfectivoDisplay.textContent = `-${formatCurrency(
          dEfectivo
        )}`);
      recargoDisplay &&
        (recargoDisplay.textContent = `+${formatCurrency(recargo)}`);
      totalDisplay && (totalDisplay.textContent = formatCurrency(total));

      actualizarCalculoVuelto();
      setTimeout(() => {
        if (tableContainer) {
          tableContainer.scrollTop = tableContainer.scrollHeight;
        }
      }, 0);

      CajaState.isRendering = false;
    }); // fin de requestAnimationFrame
  };

  const limpiarEstadoParaNuevaVentaSiCorresponde = () => {
    if (CajaState.ventaActual.length === 0) {
      CajaState.ultimoReciboTexto = null;
      CajaState.ultimoMPPaymentId = null;
      btnImprimirTicket && (btnImprimirTicket.disabled = true);
    }
  };

  const agregarProductoALaVenta = (
    producto,
    cantidad = 1,
    precioOverride = null
  ) => {
    limpiarEstadoParaNuevaVentaSiCorresponde();

    if (!producto || (producto.id && producto.activo === false)) {
      showErrorModal(
        `El producto "${producto?.nombre || "-"}" no está activo o no existe.`
      );
      return;
    }

    const itemExistente = CajaState.ventaActual.find(
      (i) =>
        i.producto && i.producto.id === producto.id && precioOverride === null
    );

    if (itemExistente) {
      itemExistente.cantidad += cantidad;
    } else {
      CajaState.ventaActual.push({
        producto,
        nombreProducto: producto.nombre,
        precioUnitario:
          precioOverride !== null ? precioOverride : producto.precioVenta,
        cantidad,
        oferta: precioOverride === null ? (producto.ofertaActiva || null) : null,
      });
    }
    renderizarVenta();
  };

  const agregarIngresoManual = (monto) => {
    limpiarEstadoParaNuevaVentaSiCorresponde();
    CajaState.ventaActual.push({
      producto: null,
      nombreProducto: "Ingreso Manual",
      precioUnitario: monto,
      cantidad: 1,
    });
    renderizarVenta();
  };

  // ── Dropdown de sugerencias fuzzy ──────────────────────────────────────────
  let _suggestionBox = null;

  function getSuggestionBox() {
    if (_suggestionBox) return _suggestionBox;
    const box = document.createElement('ul');
    box.id = 'fuzzy-suggestions';
    box.style.cssText = [
      'position:fixed','z-index:9999','background:#fff',
      'border:1px solid #cbd5e1','border-radius:8px','box-shadow:0 4px 16px rgba(0,0,0,.12)',
      'list-style:none','margin:0','padding:4px 0','min-width:260px',
      'max-height:220px','overflow-y:auto','display:none',
    ].join(';');
    document.body.appendChild(box);
    _suggestionBox = box;
    return box;
  }

  function positionSuggestionBox() {
    if (!mainInput || !_suggestionBox) return;
    const rect = mainInput.getBoundingClientRect();
    _suggestionBox.style.left  = rect.left + 'px';
    _suggestionBox.style.top   = (rect.bottom + 4) + 'px';
    _suggestionBox.style.width = rect.width + 'px';
  }

  function hideSuggestions() {
    if (_suggestionBox) _suggestionBox.style.display = 'none';
  }

  function showSuggestions(results) {
    const box = getSuggestionBox();
    box.innerHTML = '';
    results.forEach((p) => {
      const li = document.createElement('li');
      li.style.cssText = 'padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;';
      const scoreLabel = Math.round((p._score || 0) * 100);
      li.innerHTML = `<span>${p.nombre}</span><span style="color:#64748b;font-size:12px;">${formatCurrency(p.precioVenta)}</span>`;
      li.title = `Similitud: ${scoreLabel}%`;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hideSuggestions();
        agregarProductoALaVenta(p, 1, null);
        if (mainInput) mainInput.value = '';
      });
      li.addEventListener('mouseover', () => li.style.background = '#f8fafc');
      li.addEventListener('mouseout',  () => li.style.background = '');
      box.appendChild(li);
    });
    positionSuggestionBox();
    box.style.display = 'block';
  }

  // Un valor es "código de barras" si es solo dígitos o es muy largo (scanner)
  const esCodigoBarras = (val) => /^[0-9-]+$/.test(val.trim());

  const procesarEntrada = async (valor) => {
    if (!valor) return;
    hideSuggestions();
    try {
      const esNumeroValido = /^[0-9]+(.[0-9]+)?$/.test(valor);
      const numero = parseFloat(valor);

      // Códigos numéricos (barcodes): busqueda-inteligente sin fuzzy
      if (esCodigoBarras(valor)) {
        const encontrado = await window.electronAPI.invoke("busqueda-inteligente", valor);
        if (encontrado) {
          agregarProductoALaVenta(encontrado, encontrado.cantidad || 1, encontrado.precioVenta);
        } else if (esNumeroValido && numero > 0 && numero <= 999999) {
          agregarIngresoManual(numero);
        } else {
          showErrorModal(`Producto no encontrado para: "${valor}"`);
        }
        if (mainInput) mainInput.value = '';
        return;
      }

      // Texto de nombre: búsqueda fuzzy con ranking
      const results = await window.electronAPI.invoke("buscar-productos-nombre", valor);

      if (results.length === 0) {
        showErrorModal(`No se encontró ningún producto para: "${valor}"`);
        if (mainInput) mainInput.value = '';
      } else if (results.length === 1 || (results[0]._score >= 0.85)) {
        // Coincidencia clara → agregar directo
        agregarProductoALaVenta(results[0], 1, null);
        if (mainInput) mainInput.value = '';
      } else {
        // Múltiples opciones → mostrar dropdown para elegir
        showSuggestions(results.slice(0, 6));
        // No limpiamos el input para que el usuario pueda refinar la búsqueda
      }
    } catch (e) {
      console.error("procesarEntrada", e);
      showErrorModal("Ocurrió un error al buscar el producto.");
      if (mainInput) mainInput.value = '';
    }
  };


  const generarReciboTexto = (ventaId, datosRecibo) => {
    const cfg = getCfg();
    const cajero = CajaState.sesion?.user?.nombre || "N/A";

    const ANCHO_LINEA = 28; // Mantenemos 28 caracteres (súper seguro)

    let texto = "";

    // --- Helpers de formato ---
    const centrar = (txt) => {
      const linea = String(txt || "").substring(0, ANCHO_LINEA);
      const espacios = Math.floor((ANCHO_LINEA - linea.length) / 2);
      return " ".repeat(espacios) + linea + "\n";
    };

    const separador = (char = "-") => char.repeat(ANCHO_LINEA) + "\n";
    // --- Fin Helpers ---

    if (cfg.nombreNegocio) texto += centrar(cfg.nombreNegocio);
    if (cfg.sloganNegocio) texto += centrar(cfg.sloganNegocio);

    texto += separador();
    texto += `COMPROBANTE NRO: ${String(ventaId).padStart(6, "0")}\n`;
    texto += `FECHA: ${new Date().toLocaleString("es-AR")}\n`;
    texto += `CAJERO: ${cajero}\n`;
    if (datosRecibo.dniCliente)
      texto += `CLIENTE DNI: ${datosRecibo.dniCliente}\n`;
    texto += separador();

    let subtotal = 0;
    datosRecibo.items.forEach((it) => {
      const itemSubtotal = it.cantidad * it.precioUnitario;
      subtotal += itemSubtotal;

      // ⬇️ CAMBIO AQUÍ: Usamos la nueva función ⬇️
      const pu = formatCurrencyForTicket(it.precioUnitario); // -> $1000
      const sub = formatCurrencyForTicket(itemSubtotal); // -> $1000

      const nombreProd = (it.nombreProducto || "Item").substring(
        0,
        ANCHO_LINEA
      );
      texto += nombreProd + "\n";

      if (it.ofertaLabel) texto += ` ** ${it.ofertaLabel} **
`;
      const detalleIzq = ` (${it.cantidad} x ${pu}) = ${sub}`;
      texto += detalleIzq.substring(0, ANCHO_LINEA) + "\n";
    });

    texto += separador();

    // ⬇️ CAMBIO AQUÍ: Usamos la nueva función ⬇️
    texto += `SUBTOTAL: ${formatCurrencyForTicket(subtotal)}\n`;
    if (datosRecibo.descuento > 0)
      texto += `DESCUENTO: -${formatCurrencyForTicket(
        datosRecibo.descuento
      )}\n`;
    if (datosRecibo.recargo > 0)
      texto += `RECARGO: +${formatCurrencyForTicket(datosRecibo.recargo)}\n`;

    texto += separador("=");
    texto += `TOTAL: ${formatCurrencyForTicket(datosRecibo.total)}\n`;
    texto += separador("=");

    texto += `METODO PAGO: ${datosRecibo.metodoPago}\n`;

    if (datosRecibo.metodoPago === "Efectivo") {
      // ⬇️ CAMBIO AQUÍ: Usamos la nueva función ⬇️
      texto += `PAGA CON: ${formatCurrencyForTicket(
        datosRecibo.montoPagado
      )}\n`;
      texto += `VUELTO: ${formatCurrencyForTicket(datosRecibo.vuelto)}\n`;
    }

    if (cfg.footerTicket) {
      texto += "\n" + centrar(cfg.footerTicket);
    }

    texto += `\n.`; // corte

    return texto;
  };

  const resetearVenta = () => {
    CajaState.ventaActual = [];
    CajaState.metodoPagoSeleccionado = null;
    CajaState.clienteActual = null;
    CajaState.ultimaExternalReference = null;
    if (mainInput) mainInput.value = "";
    if (dniInput) dniInput.value = "";
    if (clienteInfo) clienteInfo.textContent = "";
    if (montoPagadoInput) montoPagadoInput.value = "";
    paymentButtons.forEach((btn) => btn.classList.remove("active"));
    efectivoArea?.classList.add("oculto");
    btnRegistrarVenta && (btnRegistrarVenta.disabled = false);
    generarFacturaCheckbox && (generarFacturaCheckbox.checked = false);
    toggleButtonLoading(btnRegistrarVenta, false, "Registrar Venta");
    renderizarVenta();
    mainInput?.focus();
  };

  // --- 4. INICIALIZACIÓN ---
  const inicializarPagina = async () => {
    try {
      if (!window.APP_SESSION) {
        showErrorModal("Error crítico: La sesión no se ha cargado.");
        return bloquearUI("Error de sesión.");
      }
      CajaState.sesion = window.APP_SESSION;

      const cfg = getCfg();
      if (cfg.arqueo.habilitado) {
        const estadoCaja = await window.electronAPI.invoke("get-estado-caja");
        if (estadoCaja.error) throw new Error(estadoCaja.error);
        CajaState.arqueoActual = estadoCaja.cajaAbierta;
      } else {
        CajaState.arqueoActual = true;
      }
      actualizarEstadoVisualCaja();
      resetearVenta();
    } catch (e) {
      console.error("init caja:", e);
      showErrorModal(`Error crítico al iniciar: ${e.message}.`);
      bloquearUI("Error de inicialización.");
    }
  };

  // --- 5. EVENTOS ---
  document.addEventListener("keydown", (event) => {
    // si hay modal de error visible
    if (modalContainer && !modalContainer.classList.contains("oculto")) {
      if (event.key === "Enter") {
        event.preventDefault();
        modalAcceptBtn.click();
      }
      return;
    }
    // si está modal de venta exitosa
    if (ventaExitosaModal && ventaExitosaModal.classList.contains("visible")) {
      if (event.key === "Enter") {
        event.preventDefault();
        exBtnCerrar?.click();
      }
      return;
    }

    // Hotkeys rápidos
    let isHot = true;
    switch (event.key) {
      case "/":
        document.querySelector('button[data-metodo="Efectivo"]')?.click();
        break;
      case "*":
        document.querySelector('button[data-metodo="Débito"]')?.click();
        break;
      case "-":
        document.querySelector('button[data-metodo="Crédito"]')?.click();
        break;
      case "+":
        document.querySelector('button[data-metodo="QR"]')?.click();
        break;
      // case "ñ": // ❌ ELIMINADO: Ya no se usa para registrar venta
      // case "Ñ": // ❌ ELIMINADO
      //    if (!btnRegistrarVenta?.disabled) btnRegistrarVenta.click();
      //    break;
      case "{":
        if (!btnImprimirTicket?.disabled) btnImprimirTicket.click();
        break;
      case ".":
        btnCancelarVenta?.click();
        break;
      case "+":
      case "´":
        dniInput?.focus();
        break;
      default:
        isHot = false;
        break;
    }
    if (isHot) {
      event.preventDefault();
      return;
    }

    // Lectura de Enter contextual
    const active = document.activeElement;
    const typing =
      active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");

if (event.key === "Enter") {
      event.preventDefault();
      const mainVal = mainInput?.value?.trim();
      const barcodeVal = CajaState.barcodeBuffer.join("");

      // 1. PRIORIDAD MÁXIMA: Si hay texto en el input principal, PROCESAR ENTRADA
      // Esto evita que se cierre la venta si estabas escribiendo un precio manual o código
      if (active?.id === "main-input" && mainVal) {
        // Reseteamos cualquier intento de cierre de venta pendiente por seguridad
        CajaState.confirmarVentaPending = false; 
        procesarEntrada(mainVal);
        
        // Limpieza standard
        CajaState.barcodeBuffer = [];
        clearTimeout(CajaState.barcodeTimer);
        return;
      }

      // 2. LÓGICA DE SEGURIDAD (DOBLE ENTER) PARA VENTA RÁPIDA
      // Solo entra aquí si el input está VACÍO, hay productos y no hay método seleccionado
      if (active?.id === "main-input" && CajaState.ventaActual.length > 0 && !CajaState.metodoPagoSeleccionado) {
        
        // Si NO estamos en estado de confirmación, pedimos el primer Enter
        if (!CajaState.confirmarVentaPending) {
            CajaState.confirmarVentaPending = true;
            showToast("⚠️ Presiona Enter otra vez para confirmar (Efectivo)", "warning");
            // W5-F6: Visual state — pulse border on confirm button during the 2s window
            btnRegistrarVenta?.classList.add('confirm-pending');

            // Reiniciamos el timer si existía
            clearTimeout(CajaState.confirmarVentaTimer);

            // El usuario tiene 2 segundos para dar el segundo Enter
            CajaState.confirmarVentaTimer = setTimeout(() => {
                CajaState.confirmarVentaPending = false;
                btnRegistrarVenta?.classList.remove('confirm-pending');
            }, 2000);
            return; // Detenemos aquí, esperando el segundo Enter
        }

        // SI LLEGAMOS ACÁ, ES EL SEGUNDO ENTER (Confirmado)
        CajaState.confirmarVentaPending = false; // Reset flag
        clearTimeout(CajaState.confirmarVentaTimer);
        btnRegistrarVenta?.classList.remove('confirm-pending'); // W5-F6: clear visual state

        // --- Procedimiento de Venta Rápida (Efectivo) ---
        const totalFloat = CajaState.totalFinalRedondeado || 0;
        
        // Forzar selección visual Efectivo
        CajaState.metodoPagoSeleccionado = "Efectivo";
        paymentButtons.forEach((b) => b.classList.remove("active"));
        document.querySelector('button[data-metodo="Efectivo"]')?.classList.add("active");
        efectivoArea?.classList.remove("oculto");

        // Setear monto pagado exacto
        if (montoPagadoInput) montoPagadoInput.value = totalFloat.toFixed(2); 

        // Registrar
        btnRegistrarVenta?.click();

        CajaState.barcodeBuffer = [];
        clearTimeout(CajaState.barcodeTimer);
        mainInput.value = ""; 
        return; 
      }

      // 3. Otros casos de Enter (Botones, lector de barras rápido, búsqueda de cliente)
      if (active?.id === "monto-pagado" || active?.id === "registrar-venta-btn") { 
        btnRegistrarVenta?.click();
      } else if (active?.id === "dni-cliente") {
        btnBuscarCliente?.click();
      } else if (barcodeVal.length > 2) {
        procesarEntrada(barcodeVal);
      }
      
      CajaState.barcodeBuffer = [];
      clearTimeout(CajaState.barcodeTimer);
      return;
    }

    // buffer de lector si no estoy tipeando en inputs
    if (typing) return;
    if (event.key.length > 1) return;
    mainInput?.focus();
    CajaState.barcodeBuffer.push(event.key);
    clearTimeout(CajaState.barcodeTimer);
    CajaState.barcodeTimer = setTimeout(() => {
      if (CajaState.barcodeBuffer.length > 2) {
        procesarEntrada(CajaState.barcodeBuffer.join(""));
      }
      CajaState.barcodeBuffer = [];
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (_suggestionBox && !_suggestionBox.contains(e.target) && e.target !== mainInput) {
      hideSuggestions();
    }
  });

  modalAcceptBtn?.addEventListener("click", hideErrorModal);

  btnBuscarCliente?.addEventListener("click", async () => {
    const dni = (dniInput?.value || "").trim();
    if (!dni) {
      CajaState.clienteActual = null;
      clienteInfo && (clienteInfo.textContent = "");
      renderizarVenta();
      return;
    }
    toggleButtonLoading(btnBuscarCliente, true, "Buscar");
    try {
      const cliente = await window.electronAPI.invoke(
        "get-cliente-by-dni",
        dni
      );
      if (cliente) {
        CajaState.clienteActual = cliente;
        clienteInfo &&
          (clienteInfo.textContent = `Cliente: ${cliente.nombre || dni} (${
            cliente.descuento || 0
          }% desc.)`);
      } else {
        CajaState.clienteActual = null;
        clienteInfo &&
          (clienteInfo.textContent = `Cliente no encontrado: ${dni}`);
      }
    } catch (e) {
      console.error("buscar cliente:", e);
      showErrorModal("No se pudo buscar el cliente.");
      CajaState.clienteActual = null;
      clienteInfo && (clienteInfo.textContent = "");
    } finally {
      toggleButtonLoading(btnBuscarCliente, false, "Buscar");
      renderizarVenta();
    }
  });

  tablaBody?.addEventListener("input", (e) => {
    if (!e.target.classList.contains("cantidad-input")) return;
    const index = parseInt(e.target.dataset.index, 10);
    const nueva = parseFloat(e.target.value);
    if (!isNaN(nueva) && nueva >= 0) {
      if (nueva === 0) CajaState.ventaActual.splice(index, 1);
      else CajaState.ventaActual[index].cantidad = nueva;
    } else {
      e.target.value = CajaState.ventaActual[index].cantidad;
    }
    renderizarVenta();
  });

  tablaBody?.addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn-delete-item")) return;
    const index = parseInt(e.target.dataset.index, 10);
    CajaState.ventaActual.splice(index, 1);
    renderizarVenta();
  });

  paymentButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const metodo = button.dataset.metodo;

      // ===================================================================
      // 🟢 INICIO: CORRECCIÓN DEL BOTÓN QR
      // ===================================================================
      if (metodo === "QR") {
        const totalString = totalDisplay?.textContent || "$0";
        const clean = totalString.replace(/[^\d,]/g, "").replace(",", ".");
        const total = parseFloat(clean) || 0;

        if (total <= 0) {
          showErrorModal("No hay un monto para cobrar.");
          return;
        }

        toggleButtonLoading(button, true, "QR");

        // 1. Generar una referencia única para esta venta
        const externalReference = `VENTA-${Date.now()}`;

        // 🟢 PREPARAR LOS ITEMS PARA LA API
        // Mapeamos el carrito al formato que el backend espera
        // La API de MP requiere 'title', 'quantity', 'unit_price'
        const itemsParaMP = CajaState.ventaActual.map((item) => ({
          title: item.nombreProducto,
          quantity: item.cantidad,
          unit_price: item.precioUnitario,
        }));

        try {
          // 2. Llamar al backend con 'total_amount' Y 'items'
          const result = await window.electronAPI.invoke("create-mp-order", {
            total_amount: total, // El total final (con descuentos/recargos)
            external_reference: externalReference,
            title: "Venta de productos",
            description: "Cobro en local",
            items: itemsParaMP, // 👈 ENVIAMOS LOS ITEMS
          });

          // 3. Revisar la respuesta correcta del backend
          // (La respuesta exitosa tiene 'ok: true' y 'data.qr_data')
          if (result?.ok && result.data?.qr_data) {
            // 4. Guardar la referencia ANTES de abrir el modal
            CajaState.ultimaExternalReference = externalReference;

            // 5. Abrir el modal con los datos del QR
            window.electronAPI.send("open-qr-modal", {
              total: total,
              externalReference: externalReference,
              qrData: result.data.qr_data, // 🟢 AÑADIDO: Enviar data del QR al modal
            });
          } else {
            // 'result.error' viene de doFetch en el backend
            showErrorModal(`Error MP: ${result?.error || "fallo desconocido"}`);
          }
        } catch (e) {
          console.error("create-mp-order:", e);
          showErrorModal("Error de comunicación con Mercado Pago.");
        } finally {
          toggleButtonLoading(button, false, "QR");
        }
        return;
      }
      // ===================================================================
      // 🟢 FIN: CORRECCIÓN DEL BOTÓN QR
      // ===================================================================

      // Lógica para otros métodos de pago
      CajaState.metodoPagoSeleccionado = metodo;
      paymentButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      if (metodo === "Efectivo") {
        efectivoArea?.classList.remove("oculto");
        montoPagadoInput?.focus();
      } else {
        efectivoArea?.classList.add("oculto");
        // 🟢 CAMBIO AÑADIDO: Si no es Efectivo, forzar el foco al botón de registro
        // Esto permite usar ENTER inmediatamente después de un hotkey de pago
        btnRegistrarVenta?.focus(); 
      }
      renderizarVenta();
    });
  });

  montoPagadoInput?.addEventListener("input", actualizarCalculoVuelto);
  // W5-F5: Confirmation guard — only prompt when the cart has items.
  btnCancelarVenta?.addEventListener("click", async () => {
    if (CajaState.ventaActual.length === 0) { resetearVenta(); return; }
    const ok = await window.AppDialog.confirm({
      title: '¿Cancelar la venta?',
      message: `Se perderán los ${CajaState.ventaActual.length} ítem${CajaState.ventaActual.length !== 1 ? 's' : ''} del carrito.`,
      confirmText: 'Cancelar Venta',
      cancelText: 'Volver',
      type: 'warning',
      danger: true,
    });
    if (ok) resetearVenta();
  });

  btnRegistrarVenta?.addEventListener("click", async () => {
    if (CajaState.ventaActual.length === 0) {
      showErrorModal("No hay productos en la venta.");
      return;
    }

    // Si no seleccionó método, asumimos Efectivo para no bloquear el registro.
    if (!CajaState.metodoPagoSeleccionado) {
      CajaState.metodoPagoSeleccionado = "Efectivo";
      // marcar visualmente el botón Efectivo si existe
      paymentButtons.forEach((b) => b.classList.remove("active"));
      document
        .querySelector('button[data-metodo="Efectivo"]')
        ?.classList.add("active");
      efectivoArea?.classList.remove("oculto");
    }

    const debeFacturar = !!generarFacturaCheckbox?.checked;
    if (debeFacturar && !CajaState.clienteActual) {
      showErrorModal("Para generar una factura, debe asignar un cliente.");
      return;
    }

    // Aseguramos que esté calculado el vuelto actual
    actualizarCalculoVuelto();

    toggleButtonLoading(btnRegistrarVenta, true, "Registrar Venta");

    const ventaData = {
      detalles: CajaState.ventaActual.map((i) => ({
        ProductoId: i.producto ? i.producto.id : null,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        nombreProducto: i.nombreProducto,
      })),
      metodoPago: CajaState.metodoPagoSeleccionado,
      ClienteId: CajaState.clienteActual?.id || null,
      dniCliente: CajaState.clienteActual?.dni || null,
      montoPagado: parseFloat(montoPagadoInput?.value) || 0,
      vuelto: CajaState.vueltoActual || 0,
      UsuarioId: CajaState.sesion?.user?.id || null,
      externalReference: CajaState.ultimaExternalReference,
    };

    try {
      const canal = debeFacturar
        ? "registrar-venta-y-facturar"
        : "registrar-venta";
      const result = await window.electronAPI.invoke(canal, ventaData);

      if (result?.success) {
        if (result.datosRecibo) {
          CajaState.ultimoReciboTexto = generarReciboTexto(
            result.ventaId,
            result.datosRecibo
          );
          btnImprimirTicket && (btnImprimirTicket.disabled = false);
        }
        if (result.datosPagoMP) {
          CajaState.ultimoMPPaymentId = result.datosPagoMP.id;
        }
        btnRegistrarVenta.disabled = true;
        mostrarModalVentaExitosa(result);
      } else {
        // Si el backend reclamó "monto insuficiente" mostramos toast con faltante en vez de modal
        const msg = (result?.message || "").toLowerCase();
        if (
          msg.includes("insuficiente") ||
          msg.includes("no alcanza") ||
          msg.includes("falta")
        ) {
          const faltante =
            CajaState.vueltoActual < 0 ? Math.abs(CajaState.vueltoActual) : 0;
          if (faltante > 0) {
            showToast(`Faltan ${formatCurrency(faltante)}`, "error");
          } else {
            showToast(result.message || "Monto insuficiente", "error");
          }
          // no abrir modal de error para este caso
        } else {
          showErrorModal(
            `Error: ${result?.message || "No se pudo registrar la venta."}`
          );
        }
        toggleButtonLoading(btnRegistrarVenta, false, "Registrar Venta");
      }
    } catch (e) {
      console.error("registrar-venta:", e);
      // Si la excepción contiene "insuficiente" tratamos igual que arriba
      const errMsg = (e?.message || "").toLowerCase();
      if (errMsg.includes("insuficiente") || errMsg.includes("falta")) {
        const faltante =
          CajaState.vueltoActual < 0 ? Math.abs(CajaState.vueltoActual) : 0;
        if (faltante > 0) {
          showToast(`Faltan ${formatCurrency(faltante)}`, "error");
        } else {
          showToast("Monto insuficiente", "error");
        }
      } else {
        showErrorModal("Ocurrió un error crítico al registrar la venta.");
      }
      toggleButtonLoading(btnRegistrarVenta, false, "Registrar Venta");
    }
  });

  btnImprimirTicket?.addEventListener("click", async () => {
    if (!CajaState.ultimoReciboTexto) {
      showErrorModal("No hay recibo para imprimir.");
      return;
    }
    const impresora = getCfg().impresora;
    if (!impresora) {
      showErrorModal("La impresora no está configurada.");
      return;
    }
    toggleButtonLoading(btnImprimirTicket, true, "Imprimir Ticket");
    try {
      const result = await window.electronAPI.invoke("imprimir-ticket", {
        recibo: CajaState.ultimoReciboTexto,
        nombreImpresora: impresora,
      });
      if (result?.success)
        showToast("✅ Ticket enviado a la impresora.", "success");
      else
        showErrorModal(
          `Error de impresión: ${result?.message || "desconocido"}`
        );
    } catch (e) {
      console.error("imprimir-ticket:", e);
      showErrorModal("Ocurrió un error crítico con el sistema de impresión.");
    } finally {
      toggleButtonLoading(btnImprimirTicket, false, "Imprimir Ticket");
      mainInput?.focus();
    }
  });

  // Eventos desde el proceso principal (Mercado Pago)
  window.electronAPI.on("mp-payment-approved", (data) => {
    // 🟢 CORRECCIÓN: 'data' ahora es un objeto { externalReference, paymentData }
    showToast("✅ ¡Pago Aprobado! Registrando la venta...", "success");
    CajaState.metodoPagoSeleccionado = "QR";
    CajaState.ultimaExternalReference = data.externalReference;
    CajaState.ultimoMPPaymentId = data.paymentData?.id || null; // Guardar el ID de pago
    paymentButtons.forEach((btn) => btn.classList.remove("active"));
    document.querySelector('button[data-metodo="QR"]')?.classList.add("active");
    setTimeout(() => btnRegistrarVenta?.click(), 300);
  });

  window.electronAPI.on("mp-payment-cancelled", () => {
    showErrorModal("El cobro con QR fue cancelado.");
    CajaState.metodoPagoSeleccionado = null;
    paymentButtons.forEach((btn) => btn.classList.remove("active"));
  });

  // Venta exitosa
  exBtnCerrar?.addEventListener("click", () => {
    ventaExitosaModal?.classList.remove("visible");
    resetearVenta();
  });

  exBtnImprimirMP?.addEventListener("click", async () => {
    if (!CajaState.ultimoMPPaymentId) return;
    toggleButtonLoading(exBtnImprimirMP, true, "Imprimir Comprobante MP");
    try {
      const result = await window.electronAPI.invoke(
        "imprimir-comprobante-mp",
        {
          paymentId: CajaState.ultimoMPPaymentId,
        }
      );
      if (result?.success)
        showToast("Comprobante enviado a la impresora.", "success");
      else
        showErrorModal(
          `Error al imprimir: ${result?.message || "desconocido"}`
        );
    } catch (e) {
      showErrorModal("Error de comunicación al imprimir el comprobante.");
    } finally {
      toggleButtonLoading(exBtnImprimirMP, false, "Imprimir Comprobante MP");
    }
  });

  // Arqueo
  abrirCajaBtn?.addEventListener("click", () => {
    if (!aperturaCajaModal) return;
    montoInicialInput && (montoInicialInput.value = "");
    aperturaCajaModal.classList.remove("oculto");
    montoInicialInput?.focus();
  });

  cancelarAperturaBtn?.addEventListener("click", () => {
    aperturaCajaModal?.classList.add("oculto");
  });

  aperturaCajaForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const montoInicial = parseFloat(montoInicialInput?.value);
    if (isNaN(montoInicial) || montoInicial < 0) {
      showToast("Por favor, ingresa un monto inicial válido.", "error");
      return;
    }
    const result = await window.electronAPI.invoke("abrir-caja", {
      montoInicial,
      usuarioId: CajaState.sesion?.user?.id,
    });
    if (result?.success) {
      CajaState.arqueoActual = result.arqueo;
      aperturaCajaModal?.classList.add("oculto");
      actualizarEstadoVisualCaja();
      showToast("Caja abierta exitosamente.");
    } else {
      showErrorModal(result?.message || "No se pudo abrir la caja.");
    }
  });

  cancelarCierreBtn?.addEventListener("click", () => {
    cierreCajaModal?.classList.add("oculto");
  });

  cierreCajaForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const montoFinalReal = parseFloat(montoFinalRealInput?.value);
    if (isNaN(montoFinalReal) || montoFinalReal < 0) {
      showToast(
        "Por favor, ingresa un monto final en efectivo válido.",
        "error"
      );
      return;
    }
    const result = await window.electronAPI.invoke("cerrar-caja", {
      arqueoId: CajaState.arqueoActual?.id,
      montoFinalReal,
      observaciones: (observacionesCierreInput?.value || "").trim(),
    });
    if (result?.success) {
      CajaState.arqueoActual = null;
      cierreCajaModal?.classList.add("oculto");
      actualizarEstadoVisualCaja();
      showToast("Caja cerrada exitosamente.");
    } else {
      showErrorModal(result?.message || "No se pudo cerrar la caja.");
    }
  });

  cerrarCajaBtn?.addEventListener("click", async () => {
    if (!CajaState.arqueoActual) return;
    if (!cierreCajaModal) return;

    resumenCierreCaja.innerHTML = `<p>Calculando resumen...</p>`;
    montoFinalRealInput && (montoFinalRealInput.value = "");
    observacionesCierreInput && (observacionesCierreInput.value = "");
    cierreCajaModal.classList.remove("oculto");

    const result = await window.electronAPI.invoke(
      "get-resumen-cierre",
      CajaState.arqueoActual.id
    );

    if (result?.success) {
      const r = result.resumen;
      const mov = Array.isArray(r.movimientos) ? r.movimientos : [];
      const ingresos = mov.filter(m => m.tipo === 'INGRESO');
      const egresos  = mov.filter(m => m.tipo === 'EGRESO');

      // Detalle de movimientos
      const fmtMov = (list) => list.length === 0
        ? '<li style="color:#94a3b8;">Sin movimientos</li>'
        : list.map(m => {
            const hora = new Date(m.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
            const comp = m.comprobante ? ` <em style="color:#64748b;">(${m.comprobante})</em>` : '';
            return `<li><strong>${formatCurrency(m.monto)}</strong> — ${m.concepto}${comp} <span style="color:#94a3b8;font-size:.8em;">${hora}</span></li>`;
          }).join('');

      const otrosMetodos = (r.totalDebito || 0) + (r.totalCredito || 0) + (r.totalQR || 0) + (r.totalTransfer || 0) + (r.totalCtaCte || 0);

      resumenCierreCaja.innerHTML = `
        <table class="resumen-cierre-table">
          <tr><td>Fondo inicial</td><td>${formatCurrency(r.montoInicial)}</td></tr>
          <tr><td>+ Ventas efectivo</td><td>${formatCurrency(r.totalEfectivo)}</td></tr>
          <tr><td>+ Ingresos extra (${ingresos.length})</td><td>${formatCurrency(r.totalIngresosExtra || 0)}</td></tr>
          <tr><td>− Egresos / Pagos (${egresos.length})</td><td style="color:#ef4444;">−${formatCurrency(r.totalEgresosExtra || 0)}</td></tr>
          <tr class="resumen-total-row"><td><strong>= Efectivo esperado</strong></td><td><strong>${formatCurrency(r.montoEstimado)}</strong></td></tr>
        </table>
        ${mov.length > 0 ? `
        <div class="resumen-movimientos">
          <p style="font-weight:600;margin:.75rem 0 .35rem;">Movimientos administrativos</p>
          ${ingresos.length > 0 ? `<p style="font-size:.8em;color:#16a34a;margin:.2rem 0;">↑ Ingresos</p><ul class="mov-list">${fmtMov(ingresos)}</ul>` : ''}
          ${egresos.length > 0  ? `<p style="font-size:.8em;color:#ef4444;margin:.2rem 0;">↓ Egresos</p><ul class="mov-list">${fmtMov(egresos)}</ul>` : ''}
        </div>` : ''}
        <hr style="margin:.75rem 0;">
        <p style="font-size:.88em;color:#64748b;">
          <strong>Otros métodos:</strong>
          Déb. ${formatCurrency(r.totalDebito || 0)} &nbsp;·&nbsp;
          Cré. ${formatCurrency(r.totalCredito || 0)} &nbsp;·&nbsp;
          QR ${formatCurrency(r.totalQR || 0)}
          ${r.totalTransfer ? ` &nbsp;·&nbsp; Transfer. ${formatCurrency(r.totalTransfer)}` : ''}
          ${r.totalCtaCte ? ` &nbsp;·&nbsp; CtaCte ${formatCurrency(r.totalCtaCte)}` : ''}
        </p>
      `;
      if (montoFinalRealInput)
        montoFinalRealInput.value = (r.montoEstimado || 0).toFixed(2);
    } else {
      resumenCierreCaja.innerHTML = `<p style="color:red;">Error al calcular: ${
        result?.message || "desconocido"
      }</p>`;
    }
    montoFinalRealInput?.focus();
  });

  // --- 5b. MOVIMIENTOS ADMINISTRATIVOS DE CAJA ---
  const movimientoModal      = document.getElementById("movimiento-caja-modal");
  const movimientoForm       = document.getElementById("movimiento-caja-form");
  const cerrarMovimientoBtn  = document.getElementById("cerrar-movimiento-modal-btn");
  const cancelarMovimientoBtn = document.getElementById("cancelar-movimiento-btn");
  const submitMovimientoBtn  = document.getElementById("submit-movimiento-btn");
  const movMontoInput        = document.getElementById("movimiento-monto");
  const movConceptoInput     = document.getElementById("movimiento-concepto");
  const movComprobanteInput  = document.getElementById("movimiento-comprobante");
  const movComprobanteWrap   = document.getElementById("movimiento-comprobante-wrap");
  const movTipoRadios        = document.querySelectorAll('input[name="movimiento-tipo"]');

  const abrirMovimientoModal = () => {
    if (!movimientoModal) return;
    movimientoForm?.reset();
    if (movComprobanteWrap) movComprobanteWrap.style.display = "none";
    movimientoModal.classList.remove("oculto");
    movMontoInput?.focus();
  };

  const cerrarMovimientoModal = () => {
    movimientoModal?.classList.add("oculto");
    mainInput?.focus();
  };

  // Mostrar/ocultar campo comprobante según tipo
  movTipoRadios.forEach(radio => {
    radio.addEventListener("change", () => {
      const esEgreso = radio.value === "EGRESO" && radio.checked;
      if (movComprobanteWrap) {
        movComprobanteWrap.style.display = esEgreso ? "block" : "none";
        if (movComprobanteInput) movComprobanteInput.required = esEgreso;
      }
    });
  });

  movimientoBtn?.addEventListener("click", abrirMovimientoModal);
  cerrarMovimientoBtn?.addEventListener("click", cerrarMovimientoModal);
  cancelarMovimientoBtn?.addEventListener("click", cerrarMovimientoModal);

  // W5-F12: Informe X — snapshot de totales sin cerrar la caja
  informeXBtn?.addEventListener("click", async () => {
    const res = await window.electronAPI.invoke("get-informe-x");
    if (!res?.success) {
      showToast(res?.message || "No se pudo obtener el Informe X.", "error");
      return;
    }
    window.AppDialog.informeX(res.resumen);
  });

  movimientoForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!CajaState.arqueoActual?.id) {
      showToast("No hay una caja abierta.", "error");
      return;
    }

    const tipo       = document.querySelector('input[name="movimiento-tipo"]:checked')?.value || "INGRESO";
    const monto      = parseFloat(movMontoInput?.value);
    const concepto   = (movConceptoInput?.value || "").trim();
    const comprobante = (movComprobanteInput?.value || "").trim();

    if (!monto || monto <= 0) {
      showToast("El monto debe ser mayor a cero.", "error");
      return;
    }
    if (!concepto) {
      showToast("El concepto es obligatorio.", "error");
      return;
    }
    if (tipo === "EGRESO" && !comprobante) {
      showToast("El número de comprobante es obligatorio para egresos.", "error");
      return;
    }

    if (submitMovimientoBtn) submitMovimientoBtn.disabled = true;

    try {
      const result = await window.electronAPI.invoke("registrar-movimiento-caja", {
        arqueoId: CajaState.arqueoActual.id,
        tipo,
        monto,
        concepto,
        comprobante,
      });

      if (result?.success) {
        const tipoLabel = tipo === "INGRESO" ? "Ingreso" : "Egreso";
        showToast(`${tipoLabel} registrado: ${formatCurrency(monto)}`);
        cerrarMovimientoModal();
      } else {
        showToast(result?.message || "No se pudo registrar el movimiento.", "error");
      }
    } catch (err) {
      console.error("registrar-movimiento-caja:", err);
      showToast("Error al registrar el movimiento.", "error");
    } finally {
      if (submitMovimientoBtn) submitMovimientoBtn.disabled = false;
    }
  });

  // --- 6. ACCESO RÁPIDO ---
  // Carga y renderiza los productos marcados como acceso_rapido: true.
  // No toca ninguna lógica de venta existente; usa agregarProductoALaVenta() directamente.
  const cargarAccesoRapido = async () => {
    const section = document.getElementById("quick-access-section");
    const list    = document.getElementById("quick-access-products");
    if (!section || !list) return;

    try {
      const productos = await window.electronAPI.invoke("get-quick-access-products");

      if (!productos || productos.length === 0) {
        section.classList.add("oculto");
        return;
      }

      list.innerHTML = "";
      productos.forEach((p) => {
        const btn = document.createElement("button");
        btn.className = "quick-access-btn";
        btn.textContent = p.nombre;
        btn.title = `${p.nombre}  •  ${formatCurrency(p.precioVenta)}`;
        btn.addEventListener("click", () => {
          agregarProductoALaVenta(p, 1, null);
          mainInput?.focus();
        });
        list.appendChild(btn);
      });

      section.classList.remove("oculto");
    } catch (e) {
      console.error("[AccesoRápido] Error:", e);
      section.classList.add("oculto");
    }
  };

  // --- ARRANQUE ---
  inicializarPagina();
  cargarAccesoRapido();
});
