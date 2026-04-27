// Optimizado: DocumentFragment, confirm modal no bloqueante, yields y alertas específicas.

document.addEventListener("app-ready", () => {
  // --- 1) REFS ---
  const tablaBody = document.getElementById("productos-table-body");
  const btnNuevoProducto = document.getElementById("btn-nuevo-producto");
  const searchInput = document.getElementById("search-input");
  const alertasContainer = document.getElementById("alertas-container");
  const contadorDisplay = document.getElementById("contador-productos");
  const filterSort = document.getElementById("filter-sort");

  // Stat card refs
  const statTotal       = document.getElementById("stat-total");
  const statStockCrit   = document.getElementById("stat-stock-critico");
  const statVencimiento = document.getElementById("stat-vencimiento");
  const statSinCosto    = document.getElementById("stat-sin-costo");

  // Configuración
  const MARGEN_ADVERTENCIA    = 39;  // %
  const LIMITE_STOCK_BAJO     = 5.0;
  const DIAS_PARA_VENCIMIENTO = 7;

  // Confirm modal (no bloqueante)
  const confirmOverlay = document.createElement("div");
  confirmOverlay.className = "confirm-overlay";
  confirmOverlay.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h4 id="confirm-title">Confirmar eliminación</h4>
      <p id="confirm-msg">¿Estás seguro de eliminar este producto?</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secundario btn-sm" data-action="cancelar">Cancelar</button>
        <button type="button" class="btn btn-danger btn-sm" data-action="aceptar">Eliminar</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmOverlay);

  // --- 2) ESTADO ---
  let listaDeProductos = [];
  let filtroActivo = 'todos';

  // Filter pills
  const pillsContainer = document.getElementById('filter-activo-pills');
  const pills = pillsContainer ? pillsContainer.querySelectorAll('.pill') : [];

  // --- 3) HELPERS ---
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const idle = () =>
    new Promise((r) =>
      window.requestIdleCallback
        ? requestIdleCallback(() => r(), { timeout: 150 })
        : setTimeout(r, 0)
    );

  const showNotification = (message, type = "success") => {
    if (window.toast?.show) {
      window.toast.show(message, type === "error" ? "error" : "success");
    } else {
      console.log(`[${type}] ${message}`);
    }
  };

  const confirmar = (mensaje = "¿Estás seguro?") =>
    new Promise((resolve) => {
      confirmOverlay.querySelector("#confirm-msg").textContent = mensaje;
      confirmOverlay.classList.add("visible");
      const onClick = (ev) => {
        const action = ev.target?.dataset?.action;
        if (!action) return;
        ev.stopPropagation();
        ev.preventDefault();
        confirmOverlay.classList.remove("visible");
        confirmOverlay.removeEventListener("click", onClick);
        resolve(action === "aceptar");
      };
      confirmOverlay.addEventListener("click", onClick);
    });

  const formatFloat = (val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      return parseFloat(val.replace(",", ".")) || 0;
    }
    return 0;
  };

  const formatCurrency = (val) => {
    return (formatFloat(val) || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  };

  // ------------------------------
  // === STAT CARDS ===
  // ------------------------------
  const renderStatCards = (productos) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limiteVenc = new Date(hoy);
    limiteVenc.setDate(hoy.getDate() + DIAS_PARA_VENCIMIENTO);

    let stockCritico = 0;
    let proximosVencer = 0;
    let sinCosto = 0;

    for (const p of productos) {
      if (!p.activo) continue;
      const stock        = formatFloat(p.stock ?? 0);
      const precioCompra = formatFloat(p.precioCompra ?? p.precio_compra ?? p.costo ?? 0);

      if (stock <= LIMITE_STOCK_BAJO) stockCritico++;
      if (precioCompra <= 0) sinCosto++;
      if (p.fecha_vencimiento) {
        const [y, m, d] = String(p.fecha_vencimiento).split("-");
        const f = new Date(y, m - 1, d);
        if (!isNaN(f.getTime()) && f >= hoy && f <= limiteVenc) proximosVencer++;
      }
    }

    if (statTotal)       statTotal.textContent       = productos.length;
    if (statStockCrit)   {
      statStockCrit.textContent  = stockCritico;
      statStockCrit.className    = "stat-card-value" + (stockCritico > 0 ? " value-warning" : "");
    }
    if (statVencimiento) {
      statVencimiento.textContent = proximosVencer;
      statVencimiento.className   = "stat-card-value" + (proximosVencer > 0 ? " value-danger" : "");
    }
    if (statSinCosto)    {
      statSinCosto.textContent   = sinCosto;
      statSinCosto.className     = "stat-card-value" + (sinCosto > 0 ? " value-warning" : "");
    }
  };

  // ------------------------------
  // === ALERT SUMMARY BAR ===
  // ------------------------------
  const generarAlertasEspecificas = (productos) => {
    if (!alertasContainer) return;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limiteVenc = new Date(hoy);
    limiteVenc.setDate(hoy.getDate() + DIAS_PARA_VENCIMIENTO);

    const vencidos = [];
    const porVencer = [];
    const stockBajo = [];
    const margenBajo = [];

    for (const p of productos) {
      if (!p.activo) continue;
      const nombre       = p.nombre || "Producto";
      const stock        = formatFloat(p.stock ?? 0);
      const precioCompra = formatFloat(p.precioCompra ?? p.precio_compra ?? p.costo ?? 0);
      const precioVenta  = formatFloat(p.precioVenta ?? p.precio_venta ?? p.precio ?? 0);

      if (p.fecha_vencimiento) {
        const [y, m, d] = String(p.fecha_vencimiento).split("-");
        const f = new Date(y, m - 1, d);
        if (!isNaN(f.getTime())) {
          if (f < hoy) vencidos.push(nombre);
          else if (f <= limiteVenc) porVencer.push(nombre);
        }
      }
      if (stock <= LIMITE_STOCK_BAJO) stockBajo.push(nombre);
      if (precioVenta > 0) {
        const margen = precioCompra > 0
          ? ((precioVenta - precioCompra) / precioCompra) * 100
          : 0;
        if (margen < MARGEN_ADVERTENCIA) margenBajo.push(nombre);
      }
    }

    const pills = [];
    if (vencidos.length)   pills.push({ cls: "pill--danger",  text: `${vencidos.length} vencido${vencidos.length !== 1 ? "s" : ""}`,       title: vencidos.join(", ") });
    if (porVencer.length)  pills.push({ cls: "pill--warning", text: `${porVencer.length} próximo${porVencer.length !== 1 ? "s" : ""} a vencer`, title: porVencer.join(", ") });
    if (stockBajo.length)  pills.push({ cls: "pill--amber",   text: `${stockBajo.length} stock crítico`,                                   title: stockBajo.join(", ") });
    if (margenBajo.length) pills.push({ cls: "pill--info",    text: `${margenBajo.length} margen bajo`,                                    title: margenBajo.join(", ") });

    if (!pills.length) {
      alertasContainer.innerHTML = "";
      return;
    }

    alertasContainer.innerHTML = `
      <div class="alert-summary">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span class="alert-summary__label">Atención:</span>
        ${pills.map(p => `<span class="alert-pill ${p.cls}" title="${p.title}">${p.text}</span>`).join("")}
      </div>
    `;
  };


const aplicarOrdenamiento = (productos, criterio) => {
    // Creamos una copia para no afectar la lista original
    const lista = [...productos];

    return lista.sort((a, b) => {
      // Helpers de valores
      const stockA = formatFloat(a.stock);
      const stockB = formatFloat(b.stock);
      const costoA = formatFloat(a.precioCompra ?? a.precio_compra ?? 0);
      const costoB = formatFloat(b.precioCompra ?? b.precio_compra ?? 0);
      const ventaA = formatFloat(a.precioVenta ?? a.precio_venta ?? 0);
      const ventaB = formatFloat(b.precioVenta ?? b.precio_venta ?? 0);

      switch (criterio) {
        case "recientes":
          // Ordenar por fecha de creación (más nuevo primero)
          // Asume que tienes createdAt, si no, usa ID o fecha update
          const dateA = new Date(a.createdAt || 0);
          const dateB = new Date(b.createdAt || 0);
          return dateB - dateA;

        case "margen_asc":
          // Calcular margen A
          let margenA = 100; 
          if (ventaA > 0 && costoA > 0) margenA = ((ventaA - costoA) / costoA) * 100;
          else if (ventaA > 0 && costoA <= 0) margenA = 100; // Si no tiene costo, fingimos margen alto para que no moleste, o bajo si prefieres
          
          // Calcular margen B
          let margenB = 100;
          if (ventaB > 0 && costoB > 0) margenB = ((ventaB - costoB) / costoB) * 100;
          
          return margenA - margenB; // Menor a Mayor

        case "vencimiento_asc":
          // Los que tienen fecha van primero. Los nulos al final.
          const vA = a.fecha_vencimiento ? new Date(a.fecha_vencimiento).getTime() : 9999999999999;
          const vB = b.fecha_vencimiento ? new Date(b.fecha_vencimiento).getTime() : 9999999999999;
          return vA - vB;

        case "stock_asc":
            return stockA - stockB;

        case "sin_costo":
            // Ponemos primero los que tienen costo 0 o null
            const tieneCostoA = costoA > 0 ? 1 : 0;
            const tieneCostoB = costoB > 0 ? 1 : 0;
            return tieneCostoA - tieneCostoB; // 0 va antes que 1

        case "nombre":
        default:
          return (a.nombre || "").localeCompare(b.nombre || "");
      }
    });
  };

  // ------------------------------
  // === RENDER TABLA ===
  // ------------------------------
  const renderizarTabla = async (productos) => {
    if (!tablaBody) return;
    tablaBody.innerHTML = "";
    await nextFrame();

    if (contadorDisplay) {
      contadorDisplay.textContent = productos ? productos.length : 0;
    }

    if (!productos || productos.length === 0) {
      tablaBody.innerHTML = `<tr><td colspan="7" class="td-empty">No se encontraron productos.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limiteVencimiento = new Date(hoy);
    limiteVencimiento.setDate(hoy.getDate() + DIAS_PARA_VENCIMIENTO);

    productos.forEach((p) => {
      const tr = document.createElement("tr");

      const departamento  = p.familia?.departamento?.nombre || "";
      const familia       = p.familia?.nombre || "";
      const codigoBarras  = p.codigo_barras || p.codigoBarras || "";

      const stock        = formatFloat(p.stock);
      const precioCompra = formatFloat(p.precioCompra ?? p.precio_compra ?? p.costo ?? 0);
      const precioVenta  = formatFloat(p.precioVenta ?? p.precio_venta ?? p.precio ?? 0);

      const margen = precioVenta > 0 && precioCompra > 0
        ? ((precioVenta - precioCompra) / precioCompra) * 100
        : null;

      // Row accent class
      let rowAccent = "";
      if (p.fecha_vencimiento) {
        const [y, m, d] = String(p.fecha_vencimiento).split("-");
        const f = new Date(y, m - 1, d);
        if (!isNaN(f.getTime())) {
          if (f < hoy) rowAccent = "row--vencido";
          else if (f <= limiteVencimiento) rowAccent = "row--por-vencer";
        }
      }
      if (!rowAccent && p.activo && stock <= LIMITE_STOCK_BAJO) rowAccent = "row--stock-bajo";
      if (rowAccent) tr.classList.add(rowAccent);
      if (!p.activo) tr.classList.add("row--inactivo");

      // Margin badge class
      let margenBadgeClass = "margen-badge--sin";
      let margenText = "—";
      if (precioVenta > 0) {
        margenText = margen !== null ? `${margen.toFixed(1)}%` : "0%";
        if (margen === null || margen < MARGEN_ADVERTENCIA) margenBadgeClass = "margen-badge--bajo";
        else if (margen <= 50) margenBadgeClass = "margen-badge--ok";
        else margenBadgeClass = "margen-badge--alto";
      }

      // Stock badge
      const stockBadgeClass = p.activo && stock <= LIMITE_STOCK_BAJO ? "stock-badge--low" : "";
      const stockText = `${formatFloat(stock)}${p.unidad ? " " + p.unidad : ""}`;

      // Estado
      const estadoClass = p.activo ? "estado-activo" : "estado-inactivo";
      const estadoTexto = p.activo ? "Activo" : "Inactivo";

      tr.innerHTML = `
        <td>
          <div class="prod-name">${p.nombre}</div>
          ${codigoBarras ? `<div class="prod-barcode">${codigoBarras}</div>` : ""}
        </td>
        <td>
          ${departamento ? `<div class="prod-depto">${departamento}</div>` : ""}
          ${familia ? `<div class="prod-familia">${familia}</div>` : ""}
        </td>
        <td><span class="stock-badge ${stockBadgeClass}">${stockText}</span></td>
        <td class="td-right">${formatCurrency(precioVenta)}</td>
        <td><span class="margen-badge ${margenBadgeClass}">${margenText}</span></td>
        <td><span class="${estadoClass}">${estadoTexto}</span></td>
        <td class="acciones-btn">
          <button class="btn-toggle-active action-btn" data-id="${p.id}" title="${p.activo ? "Desactivar" : "Activar"}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
          </button>
          <button class="btn-edit action-btn action-btn--edit" data-id="${p.id}" title="Editar">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-delete action-btn action-btn--delete" data-id="${p.id}" title="Eliminar">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </td>
      `;
      frag.appendChild(tr);
    });

    tablaBody.appendChild(frag);
    await idle();
  };

  // ------------------------------
  // === FILTRADO Y CARGA ===
  // ------------------------------
  const filtrarYRenderizar = async () => {
    const q = (searchInput.value || "").toLowerCase().trim();
    const criterioOrden = filterSort ? filterSort.value : "nombre";

    // 1. Filtro por estado activo/inactivo
    let dataFiltrada = listaDeProductos;
    if (filtroActivo === 'activo')   dataFiltrada = dataFiltrada.filter(p => p.activo);
    if (filtroActivo === 'inactivo') dataFiltrada = dataFiltrada.filter(p => !p.activo);

    // 2. Filtro por texto
    if (q) {
      dataFiltrada = dataFiltrada.filter(
        (p) =>
          (p.nombre || "").toLowerCase().includes(q) ||
          ((p.codigo_barras || p.codigoBarras || "") + "").toLowerCase().includes(q) ||
          ((p.codigo || "") + "").toLowerCase().includes(q)
      );
    }

    // 3. Aplicar Ordenamiento
    dataFiltrada = aplicarOrdenamiento(dataFiltrada, criterioOrden);

    await renderizarTabla(dataFiltrada);
  };

  filterSort?.addEventListener("change", () => {
      filtrarYRenderizar();
  });

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('pill--active'));
      pill.classList.add('pill--active');
      filtroActivo = pill.dataset.filtro || 'todos';
      filtrarYRenderizar();
    });
  });
  
  // (Mantener el evento de searchInput existente)
  searchInput?.addEventListener("input", () => {
    window.requestAnimationFrame(filtrarYRenderizar);
  });

  const cargarProductos = async () => {
    try {
      tablaBody.innerHTML = '<tr><td colspan="7" class="td-empty">Cargando productos…</td></tr>';
      const data = await window.electronAPI.invoke("get-productos");
      listaDeProductos = Array.isArray(data) ? data : [];
      renderStatCards(listaDeProductos);
      generarAlertasEspecificas(listaDeProductos);
      await filtrarYRenderizar();
    } catch (e) {
      console.error("Error al cargar productos:", e);
      showNotification("No se pudieron cargar los productos.", "error");
      tablaBody.innerHTML = '<tr><td colspan="7" class="td-empty" style="color:var(--danger-color);">Error al cargar productos.</td></tr>';
    }
  };

  

  // --- 4) EVENTS ---
  btnNuevoProducto?.addEventListener(
    "click",
    () => { window.location.href = "producto-form.html"; },
    { passive: true }
  );

  searchInput?.addEventListener("input", () => {
    window.requestAnimationFrame(filtrarYRenderizar);
  });

  tablaBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;

    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";

    try {
      if (btn.classList.contains("btn-edit")) {
        await nextFrame();
        window.location.href = `producto-form.html?id=${id}`;
        return;
      }

      if (btn.classList.contains("btn-delete")) {
        const ok = await confirmar("¿Eliminar este producto? Esta acción no se puede deshacer.");
        if (!ok) return;
        btn.disabled = true;
        const res = await window.electronAPI.invoke("eliminar-producto", id);
        if (res?.success) {
          showNotification("Producto eliminado.");
          setTimeout(() => cargarProductos(), 0);
        } else {
          showNotification(res?.message || "No se pudo eliminar.", "error");
        }
      }

      if (btn.classList.contains("btn-toggle-active")) {
        btn.disabled = true;
        const res = await window.electronAPI.invoke("toggle-producto-activo", id);
        if (res?.success) {
          showNotification("Estado actualizado.");
          setTimeout(() => cargarProductos(), 0);
        } else {
          btn.disabled = false;
          showNotification(res?.message || "No se pudo actualizar.", "error");
        }
      }
    } catch (err) {
      console.error(err);
      showNotification("Ocurrió un error al procesar la acción.", "error");
    } finally {
      btn.dataset.busy = "0";
      btn.disabled = false;
      await nextFrame();
    }
  });

  // --- 5) START ---
  cargarProductos();
});