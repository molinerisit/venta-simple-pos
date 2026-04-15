document.addEventListener("app-ready", () => {
  // --- REFS ---
  const filtroFecha  = document.getElementById("filtro-fecha");
  const busquedaInput = document.getElementById("busqueda-producto");
  const filtroMetodo = document.getElementById("filtro-metodo");
  const btnAplicarFiltros = document.getElementById("btn-aplicar-filtros");
  const tablaBody = document.querySelector("#ventas-table tbody");

  // Side panel refs
  const backdrop       = document.getElementById("venta-panel-backdrop");
  const sidePanel      = document.getElementById("venta-side-panel");
  const btnClosePanel  = document.getElementById("panel-close-btn");
  const btnCerrarPanel = document.getElementById("panel-btn-cerrar");
  const btnImprimirPanel = document.getElementById("panel-btn-imprimir");

  // --- UTILS ---
  const money = (n) =>
    (n || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const dt = (d) =>
    d
      ? new Date(d).toLocaleString("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }) + " hs"
      : "N/A";

  const shortId = (id) => {
    if (!id) return "N/A";
    return id.length > 6 ? id.slice(-4) : id;
  };

  const setLoading = () => {
    tablaBody.innerHTML =
      '<tr><td colspan="11" class="text-center">Cargando ventas...</td></tr>';
  };

  // --- SIDE PANEL ---
  // Map indexed by row index → full venta data
  const ventaMap = new Map();

  const openPanel = (venta) => {
    const detalles = venta.__detalles || [];
    const nombreCliente = venta.Cliente?.nombre
      ? `${venta.Cliente.nombre} ${venta.Cliente.apellido || ""}`.trim()
      : venta.dniCliente || "Consumidor Final";

    // Header
    document.getElementById("panel-sale-id").textContent =
      `Venta #${shortId(venta.id)}`;
    document.getElementById("panel-sale-date").textContent = dt(venta.createdAt);

    // Info section
    document.getElementById("panel-cliente").textContent = nombreCliente;
    const metodoBadge = document.getElementById("panel-metodo");
    metodoBadge.textContent = venta.metodoPago || "N/A";
    metodoBadge.className   = "vsp-info-value vsp-metodo-badge vsp-metodo-" +
      (venta.metodoPago || "").toLowerCase().replace(/\s+/g, "-");

    // Products table
    const tbody = document.getElementById("panel-products-tbody");
    if (detalles.length > 0) {
      tbody.innerHTML = detalles.map((d) => {
        const sub = d.subtotal || (d.cantidad || 0) * (d.precioUnitario || 0);
        return `<tr>
          <td>${d.nombreProducto || "N/A"}</td>
          <td class="vsp-num">${d.cantidad || 0}</td>
          <td class="vsp-num">${money(d.precioUnitario || 0)}</td>
          <td class="vsp-num">${money(sub)}</td>
        </tr>`;
      }).join("");
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="vsp-empty-products">Sin productos registrados</td></tr>';
    }

    // Summary
    const itemsSubtotal = detalles.reduce(
      (acc, d) => acc + (d.subtotal || (d.cantidad || 0) * (d.precioUnitario || 0)),
      0
    );
    const descuento = venta.montoDescuento || 0;
    const recargo   = venta.recargo || 0;
    const total     = venta.total || 0;

    document.getElementById("panel-subtotal").textContent = money(itemsSubtotal);

    const discountRow   = document.getElementById("panel-discount-row");
    const surchargeRow  = document.getElementById("panel-surcharge-row");
    const pagadoRow     = document.getElementById("panel-pagado-row");
    const vueltoRow     = document.getElementById("panel-vuelto-row");

    if (descuento > 0) {
      discountRow.style.display = "";
      document.getElementById("panel-descuento").textContent = `-${money(descuento)}`;
    } else {
      discountRow.style.display = "none";
    }

    if (recargo > 0) {
      surchargeRow.style.display = "";
      document.getElementById("panel-recargo").textContent = `+${money(recargo)}`;
    } else {
      surchargeRow.style.display = "none";
    }

    document.getElementById("panel-total").textContent = money(total);

    if (venta.metodoPago === "Efectivo") {
      pagadoRow.style.display = "";
      vueltoRow.style.display = "";
      document.getElementById("panel-pagado").textContent = money(venta.montoPagado || 0);
      document.getElementById("panel-vuelto").textContent = money(venta.vuelto || 0);
    } else {
      pagadoRow.style.display = "none";
      vueltoRow.style.display = "none";
    }

    // Store current venta for print
    sidePanel._currentVenta = venta;

    // Open
    backdrop.classList.add("open");
    sidePanel.classList.add("open");
    sidePanel.setAttribute("aria-hidden", "false");
    document.body.classList.add("panel-open");
  };

  const closePanel = () => {
    backdrop.classList.remove("open");
    sidePanel.classList.remove("open");
    sidePanel.setAttribute("aria-hidden", "true");
    document.body.classList.remove("panel-open");
  };

  btnClosePanel?.addEventListener("click", closePanel);
  btnCerrarPanel?.addEventListener("click", closePanel);
  backdrop?.addEventListener("click", closePanel);

  btnImprimirPanel?.addEventListener("click", () => {
    window.print();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sidePanel.classList.contains("open")) closePanel();
  });

  // --- DATA ---
  const cargarVentas = async () => {
    setLoading();
    ventaMap.clear();

    const filtros = {
      fecha:       filtroFecha.value,
      busqueda:    (busquedaInput.value || "").trim(),
      metodoPago:  filtroMetodo.value || "",
    };

    try {
      const ventas = await window.electronAPI.invoke("get-ventas", filtros);

      if (!Array.isArray(ventas)) {
        console.error("Formato inesperado:", ventas);
        tablaBody.innerHTML =
          '<tr><td colspan="11" class="error-cell">Error: formato de datos incorrecto.</td></tr>';
        return;
      }

      renderTabla(ventas);
    } catch (e) {
      console.error("Error al obtener ventas:", e);
      tablaBody.innerHTML =
        '<tr><td colspan="11" class="error-cell">Hubo un error al cargar las ventas.</td></tr>';
    }
  };

  const renderTabla = (ventas) => {
    tablaBody.innerHTML = "";
    if (ventas.length === 0) {
      tablaBody.innerHTML =
        '<tr><td colspan="11" class="empty-cell">No se encontraron ventas con estos filtros.</td></tr>';
      return;
    }

    const fragment = document.createDocumentFragment();

    ventas.forEach((v, index) => {
      // Parse detalles
      let detalles = [];
      if (v.detalles) {
        try {
          detalles = typeof v.detalles === "string" ? JSON.parse(v.detalles) : v.detalles;
        } catch { detalles = []; }
      }

      // Store full venta for panel
      ventaMap.set(index, { ...v, __detalles: detalles });

      const nombreCliente = v.Cliente?.nombre
        ? `${v.Cliente.nombre} ${v.Cliente.apellido || ""}`.trim()
        : v.dniCliente || "Consumidor Final";

      const subtotal = detalles.reduce((acc, it) => {
        return acc + (it.subtotal || (it.cantidad || 0) * (it.precioUnitario || 0));
      }, 0);

      const idSimplificado = shortId(v.id) || index + 1;

      // Payment method badge class
      const metodoCls = "badge-metodo badge-metodo--" +
        (v.metodoPago || "").toLowerCase().replace(/\s+/g, "-");

      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="col-id">${idSimplificado}</td>
        <td class="col-fecha">${dt(v.createdAt)}</td>
        <td>${nombreCliente}</td>
        <td><span class="${metodoCls}">${v.metodoPago || "N/A"}</span></td>
        <td class="col-num">${money(subtotal)}</td>
        <td class="col-num valor-negativo">${v.montoDescuento > 0 ? "-" + money(v.montoDescuento) : "—"}</td>
        <td class="col-num valor-positivo">${v.recargo > 0 ? "+" + money(v.recargo) : "—"}</td>
        <td class="col-num col-total">${money(v.total || 0)}</td>
        <td class="col-num">${v.metodoPago === "Efectivo" ? money(v.montoPagado || 0) : "—"}</td>
        <td class="col-num">${v.metodoPago === "Efectivo" ? money(v.vuelto || 0) : "—"}</td>
        <td class="col-detalles">
          <button class="btn-ver-detalle" data-index="${index}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Ver detalles
          </button>
        </td>
      `;
      fragment.appendChild(row);
    });

    tablaBody.appendChild(fragment);

    // Button events
    tablaBody.querySelectorAll(".btn-ver-detalle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.dataset.index, 10);
        const venta = ventaMap.get(index);
        if (venta) openPanel(venta);
      });
    });
  };

  // --- EVENTS ---
  btnAplicarFiltros.addEventListener("click", cargarVentas);
  busquedaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") cargarVentas();
  });
  filtroFecha.addEventListener("change", cargarVentas);
  filtroMetodo?.addEventListener("change", cargarVentas);

  // --- INIT ---
  cargarVentas();
});
