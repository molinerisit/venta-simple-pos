// renderer/js/proveedor-form.js
// Optimizado: toasts no invasivos, yields al event loop y escritura liviana.

document.addEventListener("app-ready", () => {
  // --- 1. REFERENCIAS ---
  const proveedorForm = document.getElementById("proveedor-form");
  const formTitulo = document.getElementById("form-titulo");
  const btnSubmit = document.getElementById("btn-guardar-proveedor");
  const inputId = document.getElementById("proveedor-id");
  const inputNombreEmpresa = document.getElementById("nombreEmpresa");
  const inputNombreRepartidor = document.getElementById("nombreRepartidor");
  const inputTelefono = document.getElementById("telefono");
  const inputDiasReparto = document.getElementById("diasReparto");
  const tipoSelect = document.getElementById("proveedor-tipo");
  const productosCheckboxContainer = document.getElementById("lista-productos-checkbox");
  const insumosCheckboxContainer = document.getElementById("lista-insumos-checkbox");
  const fieldsetProductos = document.getElementById("fieldset-productos");
  const fieldsetInsumos = document.getElementById("fieldset-insumos");
  const inputLimitePedido = document.getElementById("limitePedido");

  // Toast
  const toast = document.getElementById('toast-notification');
  let toastTimer;

  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

  // --- 2. FUNCIONES ---
  const showNotification = (message, type = "success") => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = 'toast';
    toast.classList.add(type, 'visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
  };

  const toggleSubmitButtonState = (isLoading) => {
    if (btnSubmit) {
      btnSubmit.disabled = isLoading;
      btnSubmit.textContent = isLoading ? "Guardando..." : "Guardar Proveedor";
    }
  };

  const actualizarVisibilidadFieldsets = () => {
    const tipo = tipoSelect.value;
    fieldsetProductos.style.display = (tipo === "producto" || tipo === "ambos") ? "block" : "none";
    fieldsetInsumos.style.display  = (tipo === "insumos"  || tipo === "ambos") ? "block" : "none";
  };

  const poblarFormulario = (proveedor) => {
    inputId.value = proveedor.id;
    inputNombreEmpresa.value = proveedor.nombreEmpresa;
    inputNombreRepartidor.value = proveedor.nombreRepartidor || "";
    inputTelefono.value = proveedor.telefono || "";
    inputDiasReparto.value = proveedor.diasReparto || "";
    inputLimitePedido.value = proveedor.limitePedido || "";
    tipoSelect.value = proveedor.tipo;

    if (proveedor.productoIds?.length) {
      proveedor.productoIds.forEach((id) => {
        const cb = productosCheckboxContainer.querySelector(`input[value="${id}"]`);
        if (cb) cb.checked = true;
      });
    }
    if (proveedor.insumoIds?.length) {
      proveedor.insumoIds.forEach((id) => {
        const cb = insumosCheckboxContainer.querySelector(`input[value="${id}"]`);
        if (cb) cb.checked = true;
      });
    }
    actualizarVisibilidadFieldsets();
  };

  const inicializarFormulario = async () => {
    try {
      const { productos = [], insumos = [] } = await window.electronAPI.invoke("get-productos-insumos");

      // Render con fragment para reducir reflow
      const fragP = document.createDocumentFragment();
      productos.forEach((p) => {
        const wrap = document.createElement('div');
        wrap.className = 'checkbox-item';
        wrap.innerHTML = `<input type="checkbox" id="prod-${p.id}" name="productos" value="${p.id}"><label for="prod-${p.id}">${p.nombre}</label>`;
        fragP.appendChild(wrap);
      });
      productosCheckboxContainer.innerHTML = "";
      productosCheckboxContainer.appendChild(fragP);

      const fragI = document.createDocumentFragment();
      insumos.forEach((i) => {
        const wrap = document.createElement('div');
        wrap.className = 'checkbox-item';
        wrap.innerHTML = `<input type="checkbox" id="insumo-${i.id}" name="insumos" value="${i.id}"><label for="insumo-${i.id}">${i.nombre}</label>`;
        fragI.appendChild(wrap);
      });
      insumosCheckboxContainer.innerHTML = "";
      insumosCheckboxContainer.appendChild(fragI);

      const urlParams = new URLSearchParams(window.location.search);
      const proveedorId = urlParams.get("id");

      if (proveedorId) {
        formTitulo.textContent = "Editar Proveedor";
        const proveedor = await window.electronAPI.invoke("get-proveedor-by-id", proveedorId);
        if (proveedor) {
          poblarFormulario(proveedor);
        } else {
          showNotification("No se encontró el proveedor.", "error");
          formTitulo.textContent = "Proveedor no encontrado";
          proveedorForm.style.display = "none";
        }
      } else {
        formTitulo.textContent = "Nuevo Proveedor";
        actualizarVisibilidadFieldsets();
      }
    } catch (error) {
      console.error("Error al inicializar el formulario:", error);
      showNotification("Error crítico al cargar datos.", "error");
    }
  };

  // --- 3. EVENT LISTENERS ---
  tipoSelect.addEventListener("change", actualizarVisibilidadFieldsets, { passive: true });

  proveedorForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    toggleSubmitButtonState(true);

    const productoIds = Array.from(productosCheckboxContainer.querySelectorAll("input:checked")).map((cb) => cb.value);
    const insumoIds   = Array.from(insumosCheckboxContainer.querySelectorAll("input:checked")).map((cb) => cb.value);

    const proveedorData = {
      nombreEmpresa: inputNombreEmpresa.value.trim(),
      nombreRepartidor: inputNombreRepartidor.value.trim(),
      telefono: inputTelefono.value.trim(),
      diasReparto: inputDiasReparto.value.trim(),
      limitePedido: inputLimitePedido.value.trim(),
      tipo: tipoSelect.value,
    };
    if (inputId.value) proveedorData.id = inputId.value;

    try {
      const result = await window.electronAPI.invoke("guardar-proveedor", { proveedorData, productoIds, insumoIds });
      if (result?.success) {
        showNotification("Proveedor guardado con éxito.");
        await nextFrame(); // ceder un frame antes de navegar
        window.location.href = "proveedores.html";
      } else {
        showNotification(`Error al guardar: ${result?.message || "Desconocido"}`, "error");
      }
    } catch (error) {
      console.error(error);
      showNotification("Error inesperado al guardar.", "error");
    } finally {
      toggleSubmitButtonState(false);
    }
  });

  // --- ARRANQUE ---
  inicializarFormulario();
});
