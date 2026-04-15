// renderer/js/etiquetas.js
(() => {
  "use strict";

  let __INIT_DONE__ = false;
  const boot = () => {
    if (__INIT_DONE__) return;
    __INIT_DONE__ = true;

    // --- Referencias al DOM ---
    const productList          = document.getElementById("product-list");
    const searchInput          = document.getElementById("search-input");
    const deptoFilter          = document.getElementById("depto-filter");
    const familiaFilter        = document.getElementById("familia-filter");
    const btnRecientes         = document.getElementById("btn-recientes");
    const btnSelectAll         = document.getElementById("select-all");
    const btnDeselectAll       = document.getElementById("deselect-all");
    const btnImprimirEtiquetas = document.getElementById("btn-imprimir-etiquetas");
    const btnImprimirLista     = document.getElementById("btn-imprimir-lista");
    const logoFileInput        = document.getElementById("logoFile");
    const logoSizeInput        = document.getElementById("logoSize");
    const logoSizeValue        = document.getElementById("logoSizeValue");
    const etqContador          = document.getElementById("etq-contador");
    const toast                = document.getElementById("toast-notification");

    // Nuevos controles de UI
    const sizeChipsContainer   = document.getElementById("etq-size-chips");
    const colorBtnsContainer   = document.getElementById("etq-color-btns");
    const advToggle            = document.getElementById("etq-adv-toggle");
    const advBody              = document.getElementById("etq-adv-body");
    const logoBtnEl            = document.getElementById("etq-logo-btn");
    const logoSizeWrap         = document.getElementById("etq-logo-size-wrap");
    const fileHint             = document.getElementById("etq-file-hint");
    const previewZone          = document.getElementById("etq-preview-zone");
    const emptyState           = document.getElementById("etq-empty-state");
    const selectedState        = document.getElementById("etq-selected-state");
    const selectedCount        = document.getElementById("etq-selected-count");

    // --- Estado ---
    let allProducts    = [];
    let allFamilias    = [];
    let showRecentsOnly = false;
    let toastTimer, filterTimer;

    // --- Utilidades ---
    const showToast = (msg, type = "success", ms = 3000) => {
      if (!toast) return;
      clearTimeout(toastTimer);
      toast.textContent = msg;
      toast.className = "toast";
      toast.classList.add(type, "visible");
      toastTimer = setTimeout(() => toast.classList.remove("visible"), ms);
    };

    const getBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload  = () => resolve(reader.result);
      reader.onerror = reject;
    });

    const debounce = (fn, delay = 150) => (...args) => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => fn(...args), delay);
    };

    // --- Actualiza contador, estado de botones y zona de preview ---
    const updateSelectionState = () => {
      const checked = productList
        ? productList.querySelectorAll(".product-checkbox:checked").length
        : 0;
      const total = productList
        ? productList.querySelectorAll(".product-checkbox").length
        : 0;

      if (etqContador) {
        etqContador.textContent = checked > 0
          ? `${checked} de ${total} seleccionado${checked !== 1 ? "s" : ""}`
          : `${total} producto${total !== 1 ? "s" : ""}`;
      }

      const hasSelection = checked > 0;
      if (btnImprimirEtiquetas) btnImprimirEtiquetas.disabled = !hasSelection;
      if (btnImprimirLista)     btnImprimirLista.disabled     = !hasSelection;

      // Actualizar zona de preview
      if (previewZone) previewZone.classList.toggle("has-selection", hasSelection);
      if (emptyState)    emptyState.style.display    = hasSelection ? "none" : "flex";
      if (selectedState) selectedState.style.display = hasSelection ? "flex" : "none";
      if (selectedCount) {
        selectedCount.textContent = `${checked} producto${checked !== 1 ? "s" : ""} ${checked !== 1 ? "listos" : "listo"} para imprimir`;
      }
    };

    // --- Renderizado de Lista ---
    const renderProducts = (products) => {
      if (!productList) return;
      productList.innerHTML = "";

      if (!Array.isArray(products) || products.length === 0) {
        const empty = document.createElement("div");
        empty.className = "product-empty";
        empty.textContent = "Sin productos para mostrar.";
        productList.appendChild(empty);
        updateSelectionState();
        return;
      }

      const frag = document.createDocumentFragment();
      products.forEach((p) => {
        const item = document.createElement("label");
        item.className = "product-item";

        const deptoId   = p.familia?.departamento?.id
          ? String(p.familia.departamento.id)
          : (p.familia?.DepartamentoId ? String(p.familia.DepartamentoId) : "");
        const familiaId = p.familia?.id ? String(p.familia.id) : "";

        item.dataset.deptoId   = deptoId;
        item.dataset.familiaId = familiaId;
        item.dataset.updatedAt = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
        item.title = p.nombre || "";

        const cb     = document.createElement("input");
        cb.type      = "checkbox";
        cb.className = "product-checkbox";
        cb.value     = p.id != null ? String(p.id) : "";

        // Bloque de información (nombre + código/familia)
        const info   = document.createElement("div");
        info.className = "product-info";

        const nameEl = document.createElement("p");
        nameEl.className = "product-name";
        nameEl.textContent = p.nombre || "Sin Nombre";

        const subParts = [];
        if (p.codigoBarras) subParts.push(p.codigoBarras);
        else if (p.codigo)  subParts.push(p.codigo);
        if (p.familia?.nombre) subParts.push(p.familia.nombre);

        info.appendChild(nameEl);
        if (subParts.length > 0) {
          const subEl = document.createElement("p");
          subEl.className = "product-sub";
          subEl.textContent = subParts.join(" • ");
          info.appendChild(subEl);
        }

        const price  = document.createElement("span");
        price.className = "product-price";
        price.textContent = Number(p.precioVenta || 0)
          .toLocaleString("es-AR", { style: "currency", currency: "ARS" });

        item.appendChild(cb);
        item.appendChild(info);
        item.appendChild(price);
        frag.appendChild(item);
      });
      productList.appendChild(frag);
      updateSelectionState();
    };

    // --- Filtrado en cliente ---
    const filterProducts = () => {
      if (!productList) return;
      const q = (searchInput?.value || "").toLowerCase();
      const d = deptoFilter?.value  || "all";
      const f = familiaFilter?.value || "all";

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const items   = productList.getElementsByClassName("product-item");
      let visible   = 0;

      for (const item of items) {
        const nameEl = item.querySelector(".product-name");
        const subEl  = item.querySelector(".product-sub");
        const nombre = (nameEl?.textContent || "").toLowerCase();
        const sub    = (subEl?.textContent  || "").toLowerCase();

        const matchesSearch   = !q || nombre.includes(q) || sub.includes(q);
        const matchesDepto    = d === "all" || item.dataset.deptoId   === d;
        const matchesFamilia  = f === "all" || item.dataset.familiaId === f;
        const matchesRecents  = !showRecentsOnly || Number(item.dataset.updatedAt) >= sevenDaysAgo;
        const show = matchesSearch && matchesDepto && matchesFamilia && matchesRecents;

        item.classList.toggle("hidden", !show);
        if (show) visible++;
      }

      let empty = productList.querySelector(".product-empty");
      if (visible === 0) {
        if (!empty) {
          empty = document.createElement("div");
          empty.className = "product-empty";
          empty.textContent = "No hay coincidencias con los filtros.";
          productList.appendChild(empty);
        }
      } else {
        empty?.remove();
      }
    };

    // --- Carga de Datos ---
    const loadData = async () => {
      try {
        const { productos, departamentos, familias } = await window.electronAPI.invoke("get-data-for-seleccion");

        allProducts = Array.isArray(productos) ? productos : [];
        allFamilias = Array.isArray(familias)  ? familias  : [];

        renderProducts(allProducts);

        if (deptoFilter) {
          deptoFilter.innerHTML = '<option value="all">Todas las categorías</option>';
          for (const d of (Array.isArray(departamentos) ? departamentos : [])) {
            const opt = document.createElement("option");
            opt.value       = d.id;
            opt.textContent = d.nombre;
            deptoFilter.appendChild(opt);
          }
        }

        filterProducts();
      } catch (e) {
        console.error("[etiquetas] Error cargando datos:", e);
        showToast("No se pudieron cargar los productos.", "error");
        renderProducts([]);
      }
    };

    // --- Función auxiliar: recopilar config y llamar al IPC ---
    const invocarImpresion = async (modo) => {
      const checkboxes = productList
        ? productList.querySelectorAll(".product-checkbox:checked")
        : [];
      const idsRaw = Array.from(checkboxes).map(cb => cb.value);

      if (idsRaw.length === 0) {
        showToast("Seleccioná al menos un producto.", "error");
        return;
      }

      let logoBase64 = null;
      if (logoFileInput && logoFileInput.files.length > 0) {
        try   { logoBase64 = await getBase64(logoFileInput.files[0]); }
        catch { showToast("Error al leer el logo.", "error"); return; }
      }

      const config = {
        modo,
        ancho:       parseFloat(document.getElementById("ancho")?.value      || "6"),
        alto:        parseFloat(document.getElementById("alto")?.value        || "4"),
        colorBorde:  document.getElementById("colorBorde")?.value             || "#000000",
        colorFondo:  document.getElementById("colorFondo")?.value             || "#ffffff",
        logoBase64,
        logoSize:    parseInt(document.getElementById("logoSize")?.value      || "30", 10),
        listaTitulo: document.getElementById("listaTitulo")?.value            || "Lista de Precios",
        columnas:    Array.from(
          document.querySelectorAll('input[name="columnas"]:checked')
        ).map(cb => cb.value),
        showName:    document.getElementById("showName")?.checked    ?? true,
        showBarcode: document.getElementById("showBarcode")?.checked ?? true,
      };

      const btn = modo === "etiquetas" ? btnImprimirEtiquetas : btnImprimirLista;
      if (btn) { btn.disabled = true; btn.textContent = "Generando…"; }

      try {
        const r = await window.electronAPI.invoke("generar-vista-impresion", {
          productoIds: idsRaw,
          config,
        });
        if (r?.success === false) {
          showToast(r.message || "Error al generar vista.", "error");
        } else {
          showToast("Vista previa generada correctamente.");
        }
      } catch (e) {
        console.error("Error IPC:", e);
        showToast("Ocurrió un error inesperado.", "error");
      } finally {
        updateSelectionState();
        if (btn) btn.textContent = modo === "etiquetas" ? "Imprimir etiquetas" : "Imprimir lista";
      }
    };

    // --- Event Listeners ---

    if (searchInput) {
      searchInput.addEventListener("input", debounce(filterProducts));
      searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
    }

    // Cascade depto → familia
    if (deptoFilter && familiaFilter) {
      deptoFilter.addEventListener("change", () => {
        const deptoId = deptoFilter.value;
        familiaFilter.innerHTML = '<option value="all">Todas las familias</option>';

        if (deptoId === "all") {
          familiaFilter.disabled = true;
        } else {
          const filtradas = allFamilias.filter(f => String(f.DepartamentoId) === deptoId);
          for (const f of filtradas) {
            const opt = document.createElement("option");
            opt.value       = f.id;
            opt.textContent = f.nombre;
            familiaFilter.appendChild(opt);
          }
          familiaFilter.disabled = filtradas.length === 0;
        }
        filterProducts();
      });

      familiaFilter.addEventListener("change", filterProducts);
    }

    // Seleccionar/deseleccionar visibles
    if (btnSelectAll) {
      btnSelectAll.addEventListener("click", () => {
        const visibles = productList
          ? productList.querySelectorAll(".product-item:not(.hidden) .product-checkbox")
          : [];
        visibles.forEach(cb => { cb.checked = true; });
        updateSelectionState();
        showToast(`Seleccionados ${visibles.length} productos visibles.`);
      });
    }

    if (btnDeselectAll) {
      btnDeselectAll.addEventListener("click", () => {
        productList?.querySelectorAll(".product-checkbox")
          .forEach(cb => { cb.checked = false; });
        updateSelectionState();
      });
    }

    if (btnRecientes) {
      btnRecientes.addEventListener("click", () => {
        showRecentsOnly = !showRecentsOnly;
        btnRecientes.classList.toggle("active", showRecentsOnly);
        filterProducts();
      });
    }

    if (productList) {
      productList.addEventListener("change", updateSelectionState);
    }

    // Chips de tamaño
    if (sizeChipsContainer) {
      sizeChipsContainer.addEventListener("click", (e) => {
        const chip = e.target.closest(".etq-chip");
        if (!chip) return;
        sizeChipsContainer.querySelectorAll(".etq-chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        const anchoInput = document.getElementById("ancho");
        const altoInput  = document.getElementById("alto");
        if (anchoInput) anchoInput.value = chip.dataset.w;
        if (altoInput)  altoInput.value  = chip.dataset.h;
      });
    }

    // Botones de color de fondo
    if (colorBtnsContainer) {
      colorBtnsContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".etq-color-btn");
        if (!btn) return;
        colorBtnsContainer.querySelectorAll(".etq-color-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const fondoInput = document.getElementById("colorFondo");
        if (fondoInput) fondoInput.value = btn.dataset.color;
        // Ajustar colorBorde contrastante
        const bordeInput = document.getElementById("colorBorde");
        if (bordeInput) bordeInput.value = btn.dataset.color === "#ffffff" ? "#000000" : "#ffffff";
      });
    }

    // Sección avanzada (colapsable)
    if (advToggle && advBody) {
      advToggle.addEventListener("click", () => {
        const isOpen = advBody.classList.toggle("open");
        advToggle.classList.toggle("open", isOpen);
      });
    }

    // Botón subir logo → dispara el input file
    if (logoBtnEl && logoFileInput) {
      logoBtnEl.addEventListener("click", () => logoFileInput.click());

      logoFileInput.addEventListener("change", () => {
        const file = logoFileInput.files[0];
        if (file) {
          if (fileHint)    fileHint.textContent = file.name;
          if (logoSizeWrap) logoSizeWrap.style.display = "";
        } else {
          if (fileHint)    fileHint.textContent = "Formatos: PNG, JPG. Máximo 1MB.";
          if (logoSizeWrap) logoSizeWrap.style.display = "none";
        }
      });
    }

    // Slider de logo
    if (logoSizeInput && logoSizeValue) {
      logoSizeInput.addEventListener("input", (e) => {
        logoSizeValue.textContent = e.target.value;
      });
    }

    // Botones de impresión
    if (btnImprimirEtiquetas) {
      btnImprimirEtiquetas.addEventListener("click", () => invocarImpresion("etiquetas"));
    }

    if (btnImprimirLista) {
      btnImprimirLista.addEventListener("click", () => invocarImpresion("lista"));
    }

    // Arranque
    loadData();
  };

  // Inicialización segura
  document.addEventListener("app-ready", boot, { once: true });
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(() => { if (!__INIT_DONE__) boot(); }, 500);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => { if (!__INIT_DONE__) boot(); }, 500);
    });
  }
})();
