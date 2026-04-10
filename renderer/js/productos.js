// Optimizado: DocumentFragment, confirm modal no bloqueante, yields y alertas específicas.

document.addEventListener("app-ready", () => {
  // --- 1) REFS ---
  const tablaBody = document.getElementById("productos-table-body");
  const btnNuevoProducto = document.getElementById("btn-nuevo-producto");
  const searchInput = document.getElementById("search-input");
  const alertasContainer = document.getElementById("alertas-container");
  const toast = document.getElementById("toast-notification");
  const contadorDisplay = document.getElementById("contador-productos");
const filterSort = document.getElementById("filter-sort");
  // Configuración
  const MARGEN_ADVERTENCIA = 39; // %
  let toastTimer;

  // Confirm modal (no bloqueante)
  const confirmOverlay = document.createElement("div");
  confirmOverlay.className = "confirm-overlay";
  confirmOverlay.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h4 id="confirm-title">Confirmar eliminación</h4>
      <p id="confirm-msg">¿Estás seguro de eliminar este producto?</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secundario" data-action="cancelar">Cancelar</button>
        <button type="button" class="btn btn-danger" data-action="aceptar">Eliminar</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmOverlay);

  // --- 2) ESTADO ---
  let listaDeProductos = [];

  // --- 3) HELPERS ---
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const idle = () =>
    new Promise((r) =>
      window.requestIdleCallback
        ? requestIdleCallback(() => r(), { timeout: 150 })
        : setTimeout(r, 0)
    );

  const showNotification = (message, type = "success") => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = "toast";
    toast.classList.add(type, "visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2500);
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
  // === NUEVA LÓGICA DE ALERTAS ESPECÍFICAS ===
  // ------------------------------
  const generarAlertasEspecificas = (productos) => {
    if (!alertasContainer) return;
    alertasContainer.innerHTML = "";

    const fragment = document.createDocumentFragment();
    
    const LIMITE_STOCK_BAJO = 5.0;
    const DIAS_PARA_VENCIMIENTO = 7;

    // Fechas base: Hora 00:00:00 para comparar días completos
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const limiteVencimiento = new Date(hoy);
    limiteVencimiento.setDate(hoy.getDate() + DIAS_PARA_VENCIMIENTO);

    // Helper para crear HTML de alerta
    const crearElementoAlerta = (mensaje, tipo) => {
      const div = document.createElement("div");
      // Usamos clases como 'alerta-vencido', 'alerta-stock', etc. para CSS
      div.className = `alerta alerta-${tipo}`; 
      
      let icon = "⚠️";
      if (tipo === "vencido") icon = "⛔"; 
      if (tipo === "vencimiento") icon = "⏰";
      if (tipo === "stock") icon = "📦";
      if (tipo === "margen") icon = "📉";

      div.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.2em;">${icon}</span>
            <span>${mensaje}</span>
        </div>
        <button class="alerta-cerrar" title="Cerrar">&times;</button>
      `;
      
      div.querySelector(".alerta-cerrar").addEventListener("click", () => div.remove());
      return div;
    };

    for (const p of productos) {
      if (!p || !p.activo) continue;

      const nombre = p.nombre || "Producto";
      const stock = formatFloat(p.stock ?? p.Stock ?? 0);
      const precioCompra = formatFloat(p.precioCompra ?? p.precio_compra ?? p.costo ?? 0);
      const precioVenta = formatFloat(p.precioVenta ?? p.precio_venta ?? p.precio ?? 0);

      // 1) VENCIMIENTOS
      if (p.fecha_vencimiento) {
        // Split seguro para evitar problemas de timezone UTC
        const [year, month, day] = String(p.fecha_vencimiento).split("-");
        // Mes en JS es 0-index
        const fechaVenc = new Date(year, month - 1, day);
        
        if (!isNaN(fechaVenc.getTime())) {
            const fechaStr = `${day}/${month}/${year}`; // Formato visual

            if (fechaVenc < hoy) {
                // YA VENCIDO
                const msg = `<strong>${nombre}</strong> venció el <strong>${fechaStr}</strong>.`;
                fragment.appendChild(crearElementoAlerta(msg, "vencido"));
            } else if (fechaVenc >= hoy && fechaVenc <= limiteVencimiento) {
                // PRÓXIMO A VENCER
                // Diferencia en milisegundos
                const diffTime = fechaVenc - hoy;
                // Convertir a días (redondear hacia arriba)
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let textoTiempo = "";
                if (diffDays === 0) textoTiempo = "HOY";
                else if (diffDays === 1) textoTiempo = "MAÑANA";
                else textoTiempo = `en ${diffDays} días`;

                const msg = `<strong>${nombre}</strong> vence <strong>${textoTiempo}</strong> (${fechaStr}).`;
                fragment.appendChild(crearElementoAlerta(msg, "vencimiento"));
            }
        }
      }

      // 2) STOCK BAJO
      if (stock <= LIMITE_STOCK_BAJO) {
        const msg = `<strong>${nombre}</strong>: Stock crítico (<strong>${stock}</strong> un.).`;
        fragment.appendChild(crearElementoAlerta(msg, "stock"));
      }

      // 3) MARGEN BAJO
      // Solo calculamos si está a la venta
      if (precioVenta > 0) {
        let margen = 0;
        if (precioCompra > 0) {
           margen = ((precioVenta - precioCompra) / precioCompra) * 100;
        }
        // Si el margen es bajo (y tenemos costo o asumimos 0)
        if (margen < MARGEN_ADVERTENCIA) {
            const msg = `<strong>${nombre}</strong> tiene margen bajo (<strong>${margen.toFixed(0)}%</strong>).`;
            fragment.appendChild(crearElementoAlerta(msg, "margen"));
        }
      }
    }

    alertasContainer.appendChild(fragment);
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
      const count = productos ? productos.length : 0;
      contadorDisplay.textContent = `(${count} productos)`;
    }

    if (!productos || productos.length === 0) {
      tablaBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 2rem;">No se encontraron productos.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();

    const LIMITE_STOCK_BAJO = 5.0;
    const DIAS_PARA_VENCIMIENTO = 7;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const limiteVencimiento = new Date(hoy);
    limiteVencimiento.setDate(hoy.getDate() + DIAS_PARA_VENCIMIENTO);

    productos.forEach((p) => {
      const tr = document.createElement("tr");
      const estadoClass = p.activo ? "estado-activo" : "estado-inactivo";
      const estadoTexto = p.activo ? "Activo" : "Inactivo";
      const departamento = p.familia?.departamento?.nombre || "N/A";
      const familia = p.familia?.nombre || "N/A";
      const codigoBarras = p.codigo_barras || p.codigoBarras || "-";

      // Calculos
      const stock = formatFloat(p.stock);
      const precioCompra = formatFloat(p.precioCompra ?? p.precio_compra ?? p.costo ?? 0);
      const precioVenta = formatFloat(p.precioVenta ?? p.precio_venta ?? p.precio ?? 0);
      
      const margen =
        precioVenta > 0 && precioCompra > 0
          ? ((precioVenta - precioCompra) / precioCompra) * 100
          : 0;

      // Badge Margen
      let badgeClass = "";
      let badgeStyle = "";
      if (precioVenta <= 0) {
        badgeClass = "margen-none";
        badgeStyle = "background:#e0e0e0;color:#333;";
      } else if (margen > 50) {
        badgeClass = "margen-alto-50";
        badgeStyle = "background:#2e7d32;color:#fff;"; // verde
      } else if (margen >= 39) {
        badgeClass = "margen-alto-40";
        badgeStyle = "background:#1565c0;color:#fff;"; // azul
      } else {
        badgeClass = "margen-bajo";
        badgeStyle = "background:#c62828;color:#fff;"; // rojo
      }

      // Resaltado de Fila (Prioridad)
      let filaClase = "";
      
      // 1. Vencimiento (Prioridad máxima visual)
      if (p.fecha_vencimiento) {
        const [y, m, d] = String(p.fecha_vencimiento).split("-");
        const f = new Date(y, m - 1, d);
        if (!isNaN(f.getTime())) {
            if (f < hoy) filaClase = "fila-vencido"; // Nueva clase CSS sugerida
            else if (f >= hoy && f <= limiteVencimiento) filaClase = "fila-prox-vencer";
        }
      }
      
      // 2. Stock (Si no está vencido)
      if (!filaClase && p.activo && stock <= LIMITE_STOCK_BAJO) {
        filaClase = "fila-bajo-stock";
      }
      
      // 3. Compra (Si no hay otros problemas graves)
      if (!filaClase && (!precioCompra || precioCompra <= 0)) {
        filaClase = "fila-sin-compra";
      }
      
      // 4. Margen
      if (!filaClase && precioVenta > 0 && margen < MARGEN_ADVERTENCIA) {
        filaClase = "fila-margen-bajo";
      }

      if (filaClase) tr.classList.add(filaClase);

      const margenDisplay = `${precioVenta > 0 ? margen.toFixed(1) : "-"}%`;
      const margenTd = `<td><span class="margen-badge ${badgeClass}" style="display:inline-block;padding:6px 8px;border-radius:6px;font-weight:700;${badgeStyle}" title="Margen: ${margenDisplay}">${margenDisplay}</span></td>`;

      tr.innerHTML = `
        ${margenTd}
        <td>${codigoBarras}</td>
        <td>${p.nombre}</td>
        <td>${departamento}</td>
        <td>${familia}</td>
        <td>${p.codigo || "N/A"}</td>
        <td>${formatFloat(p.stock)} ${p.unidad || ""}</td>
        <td>${formatCurrency(p.precioVenta ?? p.precio_venta ?? p.precio)}</td>
        <td style="text-align:center;"><span class="${estadoClass}">${estadoTexto}</span></td>
        <td class="acciones-btn">
          <button class="btn-toggle-active btn btn-sm" data-id="${p.id}" title="Activar/Desactivar">🔄</button>
          <button class="btn-edit btn btn-info btn-sm" data-id="${p.id}" title="Editar">✏️</button>
          <button class="btn-delete btn btn-danger btn-sm" data-id="${p.id}" title="Eliminar">🗑️</button>
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

    // 1. Filtro por texto
    let dataFiltrada = q
      ? listaDeProductos.filter(
          (p) =>
            (p.nombre || "").toLowerCase().includes(q) ||
            ((p.codigo_barras || p.codigoBarras || "") + "").toLowerCase().includes(q) ||
            ((p.codigo || "") + "").toLowerCase().includes(q)
        )
      : listaDeProductos;

    // 2. Aplicar Ordenamiento
    dataFiltrada = aplicarOrdenamiento(dataFiltrada, criterioOrden);

    await renderizarTabla(dataFiltrada);
  };

  filterSort?.addEventListener("change", () => {
      filtrarYRenderizar();
  });
  
  // (Mantener el evento de searchInput existente)
  searchInput?.addEventListener("input", () => {
    window.requestAnimationFrame(filtrarYRenderizar);
  });

  const cargarProductos = async () => {
    try {
      tablaBody.innerHTML = '<tr><td colspan="10" class="text-center">Cargando…</td></tr>';
      const data = await window.electronAPI.invoke("get-productos");
      listaDeProductos = Array.isArray(data) ? data : [];
      
      // Generar las alertas nuevas específicas
      generarAlertasEspecificas(listaDeProductos);
      
      await filtrarYRenderizar();
    } catch (e) {
      console.error("Error al cargar productos:", e);
      showNotification("No se pudieron cargar los productos.", "error");
      tablaBody.innerHTML = '<tr><td colspan="10" class="text-center" style="color:red;">Error al cargar.</td></tr>';
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