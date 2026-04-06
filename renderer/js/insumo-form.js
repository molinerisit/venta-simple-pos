// renderer/js/insumo-form.js
// No bloqueante, sin readonly en stock al editar, toasts y creación inline de depto/familia.

document.addEventListener("app-ready", () => {
  // --- 1) REFS ---
  const insumoForm = document.getElementById("insumo-form");
  const formTitulo = document.getElementById("form-titulo");
  const btnSubmit = document.getElementById("btn-guardar-insumo");
  const inputId = document.getElementById("insumo-id");
  const inputNombre = document.getElementById("nombre");
  const inputStock = document.getElementById("stock");
  const inputUnidad = document.getElementById("unidad");
  const inputCosto = document.getElementById("ultimoPrecioCompra");
  const deptoSelect = document.getElementById("departamento-select");
  const familiaSelect = document.getElementById("familia-select");

  // '+' inline
  const btnNuevoDepto = document.getElementById("btn-nuevo-depto");
  const btnNuevaFamilia = document.getElementById("btn-nueva-familia");
  const nuevoDeptoContainer = document.getElementById("nuevo-depto-container");
  const nuevoDeptoNombre = document.getElementById("nuevo-depto-nombre");
  const btnGuardarDepto = document.getElementById("btn-guardar-depto");
  const btnCancelarDepto = document.getElementById("btn-cancelar-depto");
  const nuevaFamiliaContainer = document.getElementById("nueva-familia-container");
  const nuevaFamiliaNombre = document.getElementById("nueva-familia-nombre");
  const btnGuardarFamilia = document.getElementById("btn-guardar-familia");
  const btnCancelarFamilia = document.getElementById("btn-cancelar-familia");

  // Toast
  const toast = document.getElementById("toast-notification");
  let toastTimer;

  // --- 2) ESTADO ---
  let departamentosData = [];
  let familiasData = [];

  // --- 3) HELPERS ---
  const showNotification = (message, type = "success") => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = "toast";
    toast.classList.add(type, "visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
  };

  const toggleSubmitButtonState = (isLoading) => {
    if (!btnSubmit) return;
    btnSubmit.disabled = isLoading;
    btnSubmit.textContent = isLoading ? "Guardando..." : "Guardar Insumo";
  };

  const cargarClasificaciones = async () => {
    try {
      const data = await window.electronAPI.invoke("get-insumo-clasificaciones");
      departamentosData = data?.departamentos || [];
      familiasData = data?.familias || [];
      renderizarDepartamentos();
    } catch {
      showNotification("No se pudieron cargar las categorías.", "error");
    }
  };

  const renderizarDepartamentos = (idSeleccionar = null) => {
    deptoSelect.innerHTML = '<option value="">-- Departamento --</option>';
    departamentosData.forEach((d) => {
      deptoSelect.innerHTML += `<option value="${d.id}">${d.nombre}</option>`;
    });
    if (idSeleccionar) deptoSelect.value = idSeleccionar;
  };

  const actualizarFamiliasSelect = (familiaASeleccionarId = null) => {
    const deptoId = deptoSelect.value;
    familiaSelect.innerHTML = '<option value="">-- Familia --</option>';
    familiaSelect.disabled = !deptoId;
    btnNuevaFamilia.disabled = !deptoId;

    if (deptoId) {
      const familias = familiasData.filter((f) => String(f.InsumoDepartamentoId) === String(deptoId));
      familias.forEach((f) => {
        familiaSelect.innerHTML += `<option value="${f.id}">${f.nombre}</option>`;
      });
    }
    if (familiaASeleccionarId) familiaSelect.value = familiaASeleccionarId;
  };

  const poblarFormulario = (insumo) => {
    inputId.value = insumo.id;
    inputNombre.value = insumo.nombre || "";
    inputStock.value = insumo.stock ?? 0;
    inputUnidad.value = insumo.unidad || "unidad";
    inputCosto.value = insumo.ultimoPrecioCompra ?? 0;
    deptoSelect.value = insumo.InsumoDepartamentoId || "";
    actualizarFamiliasSelect(insumo.InsumoFamiliaId || null);

    // ✅ pedido del usuario: permitir editar stock directo también al editar
    inputStock.removeAttribute("readonly");
  };

  const inicializar = async () => {
    await cargarClasificaciones();
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      formTitulo.textContent = "Editar Insumo";
      const insumo = await window.electronAPI.invoke("get-insumo-by-id", id);
      if (insumo) poblarFormulario(insumo);
      else {
        showNotification("Error: No se encontró el insumo.", "error");
        formTitulo.textContent = "Insumo no encontrado";
      }
    } else {
      formTitulo.textContent = "Nuevo Insumo";
      inputStock.removeAttribute("readonly");
      actualizarFamiliasSelect();
    }
  };

  // --- 4) EVENTS ---
  deptoSelect.addEventListener("change", () => actualizarFamiliasSelect());

  btnNuevoDepto.addEventListener("click", () => {
    nuevaFamiliaContainer.style.display = "none";
    nuevoDeptoContainer.style.display = "flex";
    nuevoDeptoNombre.focus();
  });
  btnCancelarDepto.addEventListener("click", () => (nuevoDeptoContainer.style.display = "none"));
  btnGuardarDepto.addEventListener("click", async () => {
    const nombre = (nuevoDeptoNombre.value || "").trim();
    if (!nombre) return showNotification("El nombre del departamento no puede estar vacío.", "error");

    const res = await window.electronAPI.invoke("guardar-insumo-departamento", { nombre });
    if (res?.success) {
      departamentosData.push(res.data);
      renderizarDepartamentos(res.data.id);
      deptoSelect.dispatchEvent(new Event("change"));
      nuevoDeptoNombre.value = "";
      nuevoDeptoContainer.style.display = "none";
      showNotification("Departamento creado con éxito.");
    } else {
      showNotification(res?.message || "No se pudo crear el departamento.", "error");
    }
  });

  btnNuevaFamilia.addEventListener("click", () => {
    if (!deptoSelect.value) return showNotification("Seleccione un departamento primero.", "error");
    nuevoDeptoContainer.style.display = "none";
    nuevaFamiliaContainer.style.display = "flex";
    nuevaFamiliaNombre.focus();
  });
  btnCancelarFamilia.addEventListener("click", () => (nuevaFamiliaContainer.style.display = "none"));
  btnGuardarFamilia.addEventListener("click", async () => {
    const nombre = (nuevaFamiliaNombre.value || "").trim();
    const InsumoDepartamentoId = deptoSelect.value;
    if (!nombre) return showNotification("El nombre de la familia no puede estar vacío.", "error");

    const res = await window.electronAPI.invoke("guardar-insumo-familia", { nombre, InsumoDepartamentoId });
    if (res?.success) {
      familiasData.push(res.data);
      actualizarFamiliasSelect(res.data.id);
      nuevaFamiliaNombre.value = "";
      nuevaFamiliaContainer.style.display = "none";
      showNotification("Familia creada con éxito.");
    } else {
      showNotification(res?.message || "No se pudo crear la familia.", "error");
    }
  });

  insumoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    toggleSubmitButtonState(true);

    const data = {
      nombre: (inputNombre.value || "").trim(),
      unidad: (inputUnidad.value || "").trim(),
      ultimoPrecioCompra: parseFloat(inputCosto.value) || 0,
      InsumoDepartamentoId: deptoSelect.value || null,
      InsumoFamiliaId: familiaSelect.value || null,
    };
    if (inputId.value) {
      data.id = inputId.value;
      data.stock = parseFloat(inputStock.value) || 0; // ✅ editable también en edición
    } else {
      data.stock = parseFloat(inputStock.value) || 0;
    }

    try {
      const result = await window.electronAPI.invoke("guardar-insumo", data);
      if (result?.success) {
        showNotification("Insumo guardado con éxito.");
        setTimeout(() => (window.location.href = "insumos.html"), 1000);
      } else {
        showNotification(`Error: ${result?.message || "No se pudo guardar."}`, "error");
      }
    } catch {
      showNotification("Error inesperado al guardar.", "error");
    } finally {
      toggleSubmitButtonState(false);
    }
  });

  // --- START ---
  inicializar();
});
