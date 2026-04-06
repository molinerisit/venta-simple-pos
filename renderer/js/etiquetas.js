// renderer/js/etiquetas.js
(() => {
  "use strict";

  let __INIT_DONE__ = false;
  const boot = () => {
    if (__INIT_DONE__) return;
    __INIT_DONE__ = true;

    // --- Referencias al DOM ---
    const mainTitle = document.getElementById("main-title");
    const configEtiquetas = document.getElementById("config-etiquetas");
    const configLista = document.getElementById("config-lista");
    const productList = document.getElementById("product-list");
    const searchInput = document.getElementById("search-input");
    const deptoFilter = document.getElementById("depto-filter");
    const familiaFilter = document.getElementById("familia-filter");
    const btnSelectAll = document.getElementById("select-all");
    const btnDeselectAll = document.getElementById("deselect-all");
    const btnGenerar = document.getElementById("btn-generar");
    const logoFileInput = document.getElementById("logoFile");
    const toast = document.getElementById("toast-notification");
    const logoSizeInput = document.getElementById("logoSize");
    const logoSizeValue = document.getElementById("logoSizeValue");

    // --- Estado ---
    let allProducts = [];
    let allDepartamentos = [];
    let allFamilias = []; // 🟢 CORRECCIÓN: Cache para todas las familias
    let MODO = "etiquetas";
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
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
    });

    const debounce = (fn, delay = 150) => (...args) => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => fn(...args), delay);
    };

    // --- Configuración Inicial ---
    const setupPageForMode = () => {
      const params = new URLSearchParams(window.location.search);
      MODO = params.get("modo") || "etiquetas";
      
      if (MODO === "lista") {
        if (mainTitle) mainTitle.textContent = "Generar Lista de Precios";
        if (configEtiquetas) configEtiquetas.style.display = "none";
        if (configLista) configLista.style.display = "block";
      } else {
        if (mainTitle) mainTitle.textContent = "Generar Etiquetas de Góndola";
        if (configEtiquetas) configEtiquetas.style.display = "block";
        if (configLista) configLista.style.display = "none";
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
        return;
      }

      const frag = document.createDocumentFragment();
      products.forEach((p) => {
        const item = document.createElement("label");
        item.className = "product-item";

        // Datos para filtrado (seguros contra nulls)
        const deptoId = p.familia?.departamento?.id ? String(p.familia.departamento.id) : 
                        (p.familia?.DepartamentoId ? String(p.familia.DepartamentoId) : "");
        
        const familiaId = p.familia?.id ? String(p.familia.id) : "";

        item.dataset.deptoId = deptoId;
        item.dataset.familiaId = familiaId;
        item.title = p.nombre || "";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "product-checkbox";
        cb.value = p.id != null ? String(p.id) : "";

        const name = document.createElement("span");
        name.textContent = p.nombre || "Sin Nombre";
        
        // 🟢 CORRECCIÓN: Añadir el precio de venta al lado del producto
        const price = document.createElement("span");
        price.className = "product-price";
        // Aseguramos el formato de moneda ARS
        const precioVenta = Number(p.precioVenta || 0);
        price.textContent = precioVenta.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

        item.appendChild(cb);
        item.appendChild(name);
        item.appendChild(price); // <-- Agregar el precio
        frag.appendChild(item);
      });
      productList.appendChild(frag);
    };

    // --- Filtrado en Cliente ---
    const filterProducts = () => {
      if (!productList) return;
      const q = (searchInput?.value || "").toLowerCase();
      const d = deptoFilter?.value || "all";
      const f = familiaFilter?.value || "all";

      const items = productList.getElementsByClassName("product-item");
      let visible = 0;

      for (const item of items) {
        const nameEl = item.querySelector("span");
        const nombre = (nameEl?.textContent || "").toLowerCase();
        
        const matchesSearch = !q || nombre.includes(q);
        const matchesDepto = d === "all" || item.dataset.deptoId === d;
        const matchesFamilia = f === "all" || item.dataset.familiaId === f;

        const show = matchesSearch && matchesDepto && matchesFamilia;
        
        // Usamos la clase .hidden del CSS nuevo
        item.classList.toggle("hidden", !show);

        if (show) visible++;
      }

      // Manejo mensaje vacío
      let empty = productList.querySelector(".product-empty");
      if (visible === 0) {
        if (!empty) {
          empty = document.createElement("div");
          empty.className = "product-empty";
          empty.textContent = "No hay coincidencias con los filtros.";
          productList.appendChild(empty);
        }
      } else if (empty) {
        empty.remove();
      }
    };

    // --- Carga de Datos ---
    const loadData = async () => {
      try {
        // 🟢 CORRECCIÓN: Obtener también las familias del backend
        const { productos, departamentos, familias } = await window.electronAPI.invoke("get-data-for-seleccion");
        
        allProducts = Array.isArray(productos) ? productos : [];
        allDepartamentos = Array.isArray(departamentos) ? departamentos : [];
        allFamilias = Array.isArray(familias) ? familias : []; // 🟢 Guardar en el estado
        
        renderProducts(allProducts);

        // Llenar combo departamentos
        if (deptoFilter) {
          deptoFilter.innerHTML = '<option value="all">Todos los Departamentos</option>';
          for (const d of allDepartamentos) {
            const opt = document.createElement("option");
            opt.value = d.id;
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

    // --- Event Listeners ---
    if (searchInput) {
        searchInput.addEventListener("input", debounce(filterProducts));
        searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") e.preventDefault(); });
    }

    if (deptoFilter && familiaFilter) {
      deptoFilter.addEventListener("change", () => {
        const deptoId = deptoFilter.value;
        familiaFilter.innerHTML = '<option value="all">Todas las Familias</option>';
        
        if (deptoId === "all") {
          familiaFilter.disabled = true;
        } else {
          // 🟢 CORRECCIÓN: Filtra las familias por el deptoId seleccionado
          const familiasFiltradas = allFamilias.filter(f => String(f.DepartamentoId) === deptoId);
          
          for (const f of familiasFiltradas) {
            const opt = document.createElement("option");
            opt.value = f.id;
            opt.textContent = f.nombre;
            familiaFilter.appendChild(opt);
          }
          
          familiaFilter.disabled = familiasFiltradas.length === 0;
        }
        filterProducts();
      });

      familiaFilter.addEventListener("change", filterProducts);
    }

    // BOTÓN SELECCIONAR VISIBLES (Marca SOLO los visibles por filtros)
    if (btnSelectAll) {
        btnSelectAll.addEventListener("click", () => {
            // 🟢 CORRECCIÓN: Selecciona solo los que NO tienen la clase 'hidden'
            const checkboxes = productList.querySelectorAll(".product-item:not(.hidden) .product-checkbox");
            checkboxes.forEach(cb => cb.checked = true);
            showToast(`Seleccionados ${checkboxes.length} productos visibles.`);
        });
    }

    if (btnDeselectAll) {
        btnDeselectAll.addEventListener("click", () => {
            productList.querySelectorAll(".product-checkbox").forEach(cb => cb.checked = false);
        });
    }

    if (logoSizeInput && logoSizeValue) {
      logoSizeInput.addEventListener("input", (e) => {
        logoSizeValue.textContent = e.target.value;
      });
    }

    // Generar Vista Previa
    if (btnGenerar) {
        btnGenerar.addEventListener("click", async () => {
            // Recolectar IDs
            const checkboxes = document.querySelectorAll(".product-checkbox:checked");
            const idsRaw = Array.from(checkboxes).map(cb => cb.value);

            if (idsRaw.length === 0) {
                showToast("Seleccioná al menos un producto.", "error");
                return;
            }

            let logoBase64 = null;
            if (logoFileInput && logoFileInput.files.length > 0) {
                try { 
                    logoBase64 = await getBase64(logoFileInput.files[0]); 
                } catch { 
                    showToast("Error al leer el logo.", "error"); 
                    return; 
                }
            }

            const config = {
                modo: MODO,
                ancho: parseFloat(document.getElementById("ancho")?.value || "5"),
                alto: parseFloat(document.getElementById("alto")?.value || "3"),
                colorBorde: document.getElementById("colorBorde")?.value || "#000000",
                colorFondo: document.getElementById("colorFondo")?.value || "#ffffff",
                logoBase64,
                logoSize: parseInt(document.getElementById("logoSize")?.value || "30", 10),
                listaTitulo: document.getElementById("listaTitulo")?.value || "Lista de Precios",
                columnas: Array.from(document.querySelectorAll('#config-lista input[type="checkbox"]:checked')).map(cb => cb.value),
            };

            btnGenerar.disabled = true;
            const prevText = btnGenerar.textContent;
            btnGenerar.textContent = "Generando...";

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
                btnGenerar.disabled = false;
                btnGenerar.textContent = prevText;
            }
        });
    }

    // Arranque
    setupPageForMode();
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