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
  
  // Valor de referencia del precio de compra de la DB (CLAVE)
  let precioCompraOriginal = 0; 
  
  // FLAG DE ESTADO DEL PRECIO: Indica si ya se ha tomado una decisión sobre la subida de precio
  let precioBloqueado = false; 

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

    // Inicializar precioCompraOriginal y precioBloqueado
    precioCompraOriginal = parseFloatOrZero(inputPrecioCompra.value); 
    precioBloqueado = false; 

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
          // Si es nuevo producto, inicializamos la referencia a 0.
          precioCompraOriginal = parseFloatOrZero(inputPrecioCompra.value); 
      }
    };


  // --- 3. EVENTOS ---

  // ELIMINADO: No hay listener 'change' en inputPrecioCompra para evitar actualización de precioCompraOriginal antes del submit.

  inputPrecioCompra.addEventListener("input", calcularRentabilidad);
  inputPrecioVenta.addEventListener("input", calcularRentabilidad);
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


  // --- GUARDAR PRODUCTO (LÓGICA BLOQUEANTE) ---
  productoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const nuevoPrecioCompra = parseFloatOrZero(inputPrecioCompra.value);
    
    // 1. CHEQUEO BLOQUEANTE: Si el precio de compra subió Y no se ha tomado una decisión
    if (nuevoPrecioCompra > precioCompraOriginal && !precioBloqueado) {
        
        // Evitamos que se guarde el producto y mostramos el modal
        toggleSubmitButtonState(false);
        
        const ventaActual = parseFloatOrZero(inputPrecioVenta.value);
        const precio40 = nuevoPrecioCompra * 1.40;
        const precio50 = nuevoPrecioCompra * 1.50;
        const precio60 = nuevoPrecioCompra * 1.60;
        const gananciaActual = ventaActual - nuevoPrecioCompra;
        const markupActual = nuevoPrecioCompra > 0 ? (gananciaActual / nuevoPrecioCompra) * 100 : 0;
        precioCompraActualizadoDisplay.textContent = `$${nuevoPrecioCompra.toFixed(2)}`;
        // Llenar el modal con datos
        celda40.textContent = `$${precio40.toFixed(2)}`;
        celda50.textContent = `$${precio50.toFixed(2)}`;
        celda60.textContent = `$${precio60.toFixed(2)}`;
        btnActual.textContent = `Mantener precio actual (Markup: ${markupActual.toFixed(0)}%)`;
        
        modalAjustePrecio.classList.add("visible");
        
        // 2. Definir Handlers y establecer el FLAG después de la decisión
        const handleDecision = (newPrice) => {
            // Limpiamos los eventos click para evitar múltiples disparos
            btnActual.onclick = null;
            btn40.onclick = null;
            btn50.onclick = null;
            btn60.onclick = null;

            if (newPrice !== null) {
                inputPrecioVenta.value = newPrice.toFixed(2);
            }
            
            // CLAVE: Establecemos el flag y actualizamos el precio original.
            precioBloqueado = true;
            precioCompraOriginal = nuevoPrecioCompra;
            modalAjustePrecio.classList.remove("visible");
            calcularRentabilidad();
            
            // CLAVE: Disparamos el submit de nuevo (simulando Enter)
            productoForm.dispatchEvent(new Event('submit'));
        };

        btnActual.onclick = () => handleDecision(null); // No cambia inputPrecioVenta
        btn40.onclick = () => handleDecision(precio40);
        btn50.onclick = () => handleDecision(precio50);
        btn60.onclick = () => handleDecision(precio60);

        return; // Detenemos el submit aquí
    }

    // 3. Si llegamos aquí, guardamos (precio no subió o usuario ya decidió)

    toggleSubmitButtonState(true);
    precioBloqueado = false; // Resetear el flag después de guardar

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
        activo: true,
        pesable: isPesable,
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