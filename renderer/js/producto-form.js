// renderer/js/producto-form.js (Versión Completa y Funcional)
document.addEventListener("app-ready", () => {
  // --- 1. REFERENCIAS ---
  const productoForm = document.getElementById("producto-form");
  const formTitulo = document.getElementById("form-titulo");
  const btnSubmit = document.getElementById("btn-guardar-producto");
  const inputId = document.getElementById("producto-id");
  const inputNombre = document.getElementById("nombre");
  const inputCodigo = document.getElementById("codigo");
  const inputCodigoBarras = document.getElementById("codigo_barras");
  const deptoSelect = document.getElementById("departamento-select");
  const familiaSelect = document.getElementById("familia-select");
  const btnNuevoDepto = document.getElementById("btn-nuevo-depto");
  const btnNuevaFamilia = document.getElementById("btn-nueva-familia");
  const inputStock = document.getElementById("stock");
  const inputUnidad = document.getElementById("unidad");
  const inputFechaVencimiento = document.getElementById("fecha_vencimiento");
  const inputPrecioCompra = document.getElementById("precioCompra");
  const inputPrecioVenta = document.getElementById("precioVenta");
  const inputImagenProducto = document.getElementById("imagen_producto");
  const imagenPreview = document.getElementById("imagen-preview");
  const gananciaDisplay = document.getElementById("ganancia-unidad");
  const margenDisplay = document.getElementById("margen-ganancia");
  const toast = document.getElementById("toast-notification");
  let toastTimer;

  // Balanza/PLU
  const pesableChk = document.getElementById("pesable");
  const manejaLotesChk = document.getElementById("maneja_lotes");
  const pluRow = document.getElementById("plu-row");
  const pluInput = document.getElementById("plu");
  const pluHelp = document.getElementById("plu-help");

  // Elementos del formulario inline de Departamento
  const nuevoDeptoContainer = document.getElementById("nuevo-depto-container");
  const nuevoDeptoNombre = document.getElementById("nuevo-depto-nombre");
  const btnGuardarDepto = document.getElementById("btn-guardar-depto");
  const btnCancelarDepto = document.getElementById("btn-cancelar-depto");

  // Elementos del formulario inline de Familia
  const nuevaFamiliaContainer = document.getElementById("nueva-familia-container");
  const nuevaFamiliaNombre = document.getElementById("nueva-familia-nombre");
  const btnGuardarFamilia = document.getElementById("btn-guardar-familia");
  const btnCancelarFamilia = document.getElementById("btn-cancelar-familia");

  // --- MODAL AJUSTE PRECIO ---
  const modalAjustePrecio = document.getElementById("modal-ajuste-precio");
  const btnActual = document.getElementById("modal-precio-actual");
  const btn40 = document.getElementById("modal-aplicar-40");
  const btn50 = document.getElementById("modal-aplicar-50");
  const btn60 = document.getElementById("modal-aplicar-60");
  const celda40 = document.getElementById("precio40"); 
  const celda50 = document.getElementById("precio50");
  const celda60 = document.getElementById("precio60");
  const precioCompraActualizadoDisplay = document.getElementById("precio-compra-actualizado");
  // --- 2. ESTADO Y FUNCIONES ---
  let departamentosData = [];
  let familiasData = [];
  let imagenBase64 = null;
  
  // Duplicate validation state
  let _dupNombre = false;
  let _dupCodigo = false;
  let _dupTimer  = null;
  let _catalogSuggestion = null;

  const parseFloatOrZero = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    return Math.max(0, parseFloat(String(val).replace(",", ".")) || 0);
  };

  const showNotification = (message, type = "success") => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = "toast";
    toast.classList.add(type, "visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2500);
  };

  const toggleSubmitButtonState = (isLoading) => {
    if (!btnSubmit) return;
    btnSubmit.disabled = isLoading;
    btnSubmit.textContent = isLoading ? "Guardando..." : "Guardar Producto";
  };

  // Markup (Margen sobre Costo)
  const calcularRentabilidad = () => {
    const compra = parseFloatOrZero(inputPrecioCompra.value);
    const venta = parseFloatOrZero(inputPrecioVenta.value);
    const ganancia = venta - compra;
    
    // Markup (Margen sobre Costo) = (Ganancia / Compra) * 100
    const margen = compra > 0 ? (ganancia / compra) * 100 : 0;
    
    gananciaDisplay.textContent = `$${ganancia.toFixed(2)}`;
    margenDisplay.textContent = `${margen.toFixed(0)}%`;

    margenDisplay.style.color = margen < 40 ? 'red' : 'green';
    return margen;
  };

  const cargarClasificaciones = async () => { 
      try {
          const data = await window.electronAPI.invoke("get-clasificaciones");
          departamentosData = data.departamentos || [];
          familiasData = data.familias || [];
          renderizarDepartamentos();
      } catch (e) {
          showNotification("No se pudieron cargar las categorías.", "error");
      }
    };

  const renderizarDepartamentos = (idSeleccionar = null) => { 
      deptoSelect.innerHTML = '<option value="">-- Departamento --</option>';
      departamentosData.forEach((depto) => {
          deptoSelect.innerHTML += `<option value="${depto.id}">${depto.nombre}</option>`;
      });
      if (idSeleccionar) deptoSelect.value = idSeleccionar;
    };

  const actualizarFamiliasSelect = (familiaASeleccionarId = null) => { 
      const deptoId = deptoSelect.value;
      familiaSelect.innerHTML = '<option value="">-- Familia --</option>';
      familiaSelect.disabled = !deptoId;
      btnNuevaFamilia.disabled = !deptoId;
      if (deptoId) {
          const familiasFiltradas = familiasData.filter((f) => String(f.DepartamentoId) === String(deptoId));
          familiasFiltradas.forEach((fam) => {
              familiaSelect.innerHTML += `<option value="${fam.id}">${fam.nombre}</option>`;
          });
      }
      if (familiaASeleccionarId) familiaSelect.value = familiaASeleccionarId;
    };

  const refreshPluUI = () => { 
      const isPesable = !!pesableChk?.checked;

      if (isPesable) {
          pluRow.style.display = "flex";
          pluInput.value = inputCodigo.value;
          pluInput.readOnly = true;
          if (pluHelp) pluHelp.textContent = "El PLU será el mismo que el 'Código (Único)'.";
      } else {
          pluRow.style.display = "none";
      }
    };

  const poblarFormulario = (producto) => {
    inputId.value = producto.id;
    inputNombre.value = producto.nombre || "";
    inputCodigo.value = producto.codigo || "";
    inputCodigoBarras.value = producto.codigo_barras || "";
    inputStock.value = producto.stock ?? 0;
    inputUnidad.value = producto.unidad || "unidad";
    inputPrecioCompra.value = producto.precioCompra ?? 0;
    inputPrecioVenta.value = producto.precioVenta ?? 0;
    inputFechaVencimiento.value = producto.fecha_vencimiento || "";

    if (producto.imagen_url) {
      imagenPreview.src = `app://${String(producto.imagen_url).replace(/\\/g, "/")}`;
      imagenPreview.classList.remove("imagen-preview-oculta");
    }

    const deptoId =
        producto.DepartamentoId ||
        producto.Familia?.DepartamentoId ||
        producto.familia?.DepartamentoId ||
        null;

    if (deptoId) {
        deptoSelect.value = deptoId;
        actualizarFamiliasSelect(
            producto.FamiliaId ||
            producto.Familia?.id ||
            producto.familia?.id ||
            null
        );
    }

    pesableChk.checked = !!producto.pesable;
    if (manejaLotesChk) manejaLotesChk.checked = !!producto.maneja_lotes;

    calcularRentabilidad();
    refreshPluUI();
  };

  const inicializar = async () => { 
      await cargarClasificaciones();

      const urlParams = new URLSearchParams(window.location.search);
      const productoId = urlParams.get("id");

      if (productoId) {
          formTitulo.textContent = "Editar Producto";
          const producto = await window.electronAPI.invoke("get-producto-by-id", productoId);
          if (producto) {
              poblarFormulario(producto);
          } else {
              showNotification("Error: No se encontró el producto.", "error");
          }
      } else {
          formTitulo.textContent = "Nuevo Producto";
          actualizarFamiliasSelect();
          refreshPluUI();
          // Auto-generate SKU for new products
          try {
            const sku = await window.electronAPI.invoke("get-next-sku");
            if (sku && inputCodigo && !inputCodigo.value.trim()) {
              inputCodigo.value = sku;
              refreshPluUI();
            }
          } catch (e) {
            console.warn("[sku]", e.message);
          }
      }
    };


  // ── Validación de duplicados ─────────────────────────────────────────────────
  const productoIdActual = () => inputId?.value || null;

  function setDupAlert(fieldEl, alertId, message) {
    let el = document.getElementById(alertId);
    if (!el) {
      el = document.createElement('p');
      el.id = alertId;
      el.style.cssText = 'color:#dc2626;font-size:12px;margin:2px 0 0;display:none;';
      fieldEl.parentNode.insertBefore(el, fieldEl.nextSibling);
    }
    if (message) {
      el.innerHTML = message;
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  function updateSubmitByDups() {
    if (!btnSubmit) return;
    if (_dupNombre || _dupCodigo) {
      btnSubmit.disabled = true;
      btnSubmit.title = 'Hay productos duplicados — corregí antes de guardar';
    } else {
      btnSubmit.disabled = false;
      btnSubmit.title = '';
    }
  }

  async function checkDuplicates({ nombre, codigoBarras }) {
    const res = await window.electronAPI.invoke('check-producto-duplicado', {
      nombre:       nombre       ?? inputNombre?.value.trim()       ?? null,
      codigoBarras: codigoBarras ?? inputCodigoBarras?.value.trim() ?? null,
      productoId:   productoIdActual(),
    });

    _dupNombre = !!res.duplicadoNombre;
    _dupCodigo = !!res.duplicadoCodigo;

    if (nombre !== undefined) {
      setDupAlert(inputNombre, 'dup-alert-nombre',
        res.duplicadoNombre
          ? `Ya existe un producto con ese nombre: <strong>${res.duplicadoNombre.nombre}</strong>`
          : null
      );
    }
    if (codigoBarras !== undefined) {
      setDupAlert(inputCodigoBarras, 'dup-alert-codigo',
        res.duplicadoCodigo
          ? `Este código ya está registrado para: <strong>${res.duplicadoCodigo.nombre}</strong>`
          : null
      );
    }
    updateSubmitByDups();
  }

  function scheduleDupCheck(field) {
    clearTimeout(_dupTimer);
    _dupTimer = setTimeout(() => {
      const args = {};
      if (field === 'nombre')  args.nombre       = inputNombre?.value.trim();
      if (field === 'codigo')  args.codigoBarras = inputCodigoBarras?.value.trim();
      checkDuplicates(args);
    }, 300);
  }

  // ── Catálogo maestro — sugerencia de autocompletado ────────────────────────
  function _showCatalogBanner(data) {
    _catalogSuggestion = data;
    let banner = document.getElementById('catalog-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'catalog-banner';
      banner.style.cssText = [
        'background:#f0f9ff','border:1px solid #0ea5e9','border-radius:8px',
        'padding:12px 14px','margin:8px 0 0','font-size:13px','line-height:1.4',
      ].join(';');
      const anchor = inputCodigoBarras?.closest('.form-campo') || inputCodigoBarras?.parentNode;
      if (anchor) anchor.after(banner);
    }
    const conf = Math.round((data.confidence || 0) * 100);
    banner.innerHTML =
      '<div style="font-weight:600;color:#0369a1;margin-bottom:6px;">Encontramos este producto en el catálogo sugerido</div>' +
      '<div style="margin-bottom:3px;"><strong>' + (data.canonical_name || '') + '</strong></div>' +
      (data.department ? '<div style="color:#475569;">Departamento: ' + data.department + '</div>' : '') +
      (data.family     ? '<div style="color:#475569;">Familia: '      + data.family     + '</div>' : '') +
      (data.brand      ? '<div style="color:#475569;">Marca: '        + data.brand      + '</div>' : '') +
      (data.unit       ? '<div style="color:#475569;">Unidad: '       + data.unit       + '</div>' : '') +
      '<div style="color:#94a3b8;font-size:11px;margin-top:3px;">Confianza: ' + conf + '% · ' + (data.sources_count || 1) + ' fuentes</div>' +
      '<div style="margin-top:8px;display:flex;gap:8px;">' +
        '<button type="button" id="btn-usar-catalogo" style="background:#0ea5e9;color:#fff;border:none;border-radius:6px;padding:5px 14px;cursor:pointer;font-size:12px;font-weight:500;">Usar sugerencia</button>' +
        '<button type="button" id="btn-ignorar-catalogo" style="background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:12px;">Ignorar</button>' +
      '</div>';
    document.getElementById('btn-usar-catalogo')?.addEventListener('click', _applyCatalog);
    document.getElementById('btn-ignorar-catalogo')?.addEventListener('click', _hideCatalogBanner);
    banner.style.display = 'block';
  }

  function _hideCatalogBanner() {
    const banner = document.getElementById('catalog-banner');
    if (banner) banner.style.display = 'none';
    _catalogSuggestion = null;
  }

  function _applyCatalog() {
    if (!_catalogSuggestion) return;
    const d = _catalogSuggestion;
    if (d.canonical_name && inputNombre && !inputNombre.value.trim()) {
      inputNombre.value = d.canonical_name;
      inputNombre.dispatchEvent(new Event('input'));
    }
    if (d.department && deptoSelect) {
      const opt = Array.from(deptoSelect.options).find(o =>
        o.text.toLowerCase().includes((d.department || '').toLowerCase())
      );
      if (opt) { deptoSelect.value = opt.value; deptoSelect.dispatchEvent(new Event('change')); }
    }
    if (d.unit && inputUnidad && !inputUnidad.value.trim()) {
      inputUnidad.value = d.unit;
    }
    _hideCatalogBanner();
  }

  async function _checkCatalog(barcode) {
    if (!barcode || barcode.length < 3) { _hideCatalogBanner(); return; }
    if (inputId?.value) return; // editing existing product — skip
    try {
      const result = await window.electronAPI.invoke('buscar-en-catalogo', barcode);
      if (result) _showCatalogBanner(result);
      else _hideCatalogBanner();
    } catch (e) {
      console.warn('[catalog]', e.message);
    }
  }

  // --- 3. EVENTOS ---


  inputPrecioCompra.addEventListener("input", calcularRentabilidad);
  inputPrecioVenta.addEventListener("input", calcularRentabilidad);
  inputNombre?.addEventListener("input", () => scheduleDupCheck('nombre'));
  inputCodigoBarras?.addEventListener("input", () => scheduleDupCheck('codigo'));
  inputCodigoBarras?.addEventListener("change", () => scheduleDupCheck('codigo'));
  inputCodigoBarras?.addEventListener("blur",   () => _checkCatalog(inputCodigoBarras.value.trim()));
  deptoSelect.addEventListener("change", () => actualizarFamiliasSelect());

  // --- Eventos de Clasificación ---
  btnNuevoDepto.addEventListener("click", () => {
    nuevaFamiliaContainer.style.display = "none";
    nuevoDeptoContainer.style.display = "flex";
    nuevoDeptoNombre.focus();
  });
  btnCancelarDepto.addEventListener("click", () => {
    nuevoDeptoContainer.style.display = "none";
  });
  btnGuardarDepto.addEventListener("click", async () => { 
    const nombre = (nuevoDeptoNombre.value || "").trim();
    if (!nombre) return showNotification("El nombre no puede estar vacío.", "error");

    const res = await window.electronAPI.invoke("guardar-departamento", { nombre });
    if (res?.success) {
      await cargarClasificaciones();
      deptoSelect.value = res.data.id;
      deptoSelect.dispatchEvent(new Event("change"));
      nuevoDeptoNombre.value = "";
      nuevoDeptoContainer.style.display = "none";
      showNotification("Departamento creado.");
    } else {
      showNotification(`Error: ${res?.message || "No se pudo crear el departamento."}`, "error");
    }
  });

  btnNuevaFamilia.addEventListener("click", () => { 
    if (!deptoSelect.value) return showNotification("Seleccione un departamento primero.", "error");
    nuevoDeptoContainer.style.display = "none";
    nuevaFamiliaContainer.style.display = "flex";
    nuevaFamiliaNombre.focus();
  });
  btnCancelarFamilia.addEventListener("click", () => { 
    nuevaFamiliaContainer.style.display = "none";
  });
  btnGuardarFamilia.addEventListener("click", async () => { 
    const nombre = (nuevaFamiliaNombre.value || "").trim();
    const DepartamentoId = deptoSelect.value;
    if (!nombre) return showNotification("El nombre no puede estar vacío.", "error");

    const res = await window.electronAPI.invoke("guardar-familia", { nombre, DepartamentoId });
    if (res?.success) {
      await cargarClasificaciones();
      deptoSelect.value = DepartamentoId;
      actualizarFamiliasSelect(res.data.id);

      nuevaFamiliaNombre.value = "";
      nuevaFamiliaContainer.style.display = "none";
      showNotification("Familia creada.");
    } else {
      showNotification(`Error: ${res?.message || "No se pudo crear la familia."}`, "error");
    }
  });

  // --- Eventos de Imagen y PLU ---
  inputImagenProducto.addEventListener("change", (e) => { 
        const file = e.target.files?.[0];
        if (!file) {
            imagenPreview.classList.add("imagen-preview-oculta");
            imagenBase64 = null;
            return;
        }
        const reader = new FileReader();
        reader.onload = (re) => {
            imagenPreview.src = re.target.result;
            imagenPreview.classList.remove("imagen-preview-oculta");
            imagenBase64 = re.target.result;
        };
        reader.readAsDataURL(file);
    });

  pesableChk.addEventListener("change", refreshPluUI);
  inputCodigo.addEventListener("input", refreshPluUI);


  // --- GUARDAR PRODUCTO ---
  productoForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Block save if duplicates are detected
    await checkDuplicates({ nombre: inputNombre?.value.trim(), codigoBarras: inputCodigoBarras?.value.trim() });
    if (_dupNombre || _dupCodigo) {
      toggleSubmitButtonState(false);
      return;
    }

    toggleSubmitButtonState(true);

    try {
      const isPesable = !!pesableChk.checked;
      const codigoVal = inputCodigo.value.trim();
      let pluToSend = null;

      if (isPesable) {
        if (!codigoVal) {
          toggleSubmitButtonState(false);
          return showNotification("El 'Código (Único)' no puede estar vacío si es pesable.", "error");
        }
        pluToSend = codigoVal;
      }

      const compra = parseFloatOrZero(inputPrecioCompra.value);
      const venta = parseFloatOrZero(inputPrecioVenta.value);
      
      // Resto de datos para enviar
      const productoData = {
        id: inputId.value || undefined,
        nombre: inputNombre.value.trim(),
        codigo: codigoVal,
        stock: parseFloatOrZero(inputStock.value),
        unidad: inputUnidad.value || "unidad",
        precioCompra: compra,
        precioVenta: venta,
        codigo_barras: (inputCodigoBarras.value || "").trim() || null,
        fecha_vencimiento: inputFechaVencimiento.value || null,
        FamiliaId: familiaSelect.value || null,
        DepartamentoId: deptoSelect.value || null,
        imagen_base64: imagenBase64,
        activo: venta > 0,
        pesable: isPesable,
        maneja_lotes: !!(manejaLotesChk?.checked),
        plu: pluToSend,
      };

      const result = await window.electronAPI.invoke("guardar-producto", productoData);

      if (result?.success) {
        showNotification("Producto guardado con éxito.", "success");
        setTimeout(() => (window.location.href = "productos.html"), 900);
      } else {
        showNotification(`Error: ${result?.message || "No se pudo guardar el producto."}`, "error");
      }
    } catch (error) {
      console.error(error);
      showNotification("Ocurrió un error inesperado.", "error");
    } finally {
      toggleSubmitButtonState(false);
    }
  });

  attachEnterNav(productoForm, { submitBtn: btnSubmit });

  // --- ARRANQUE ---
  (async () => {
    await inicializar();
    calcularRentabilidad();
  })();
});