document.addEventListener("app-ready", () => {
  // --- REFS ---
  const filtroFecha = document.getElementById("filtro-fecha");
  const busquedaInput = document.getElementById("busqueda-producto");
  const btnAplicarFiltros = document.getElementById("btn-aplicar-filtros");
  const tablaBody = document.querySelector("#ventas-table tbody");
  const totalVentasDisplay = document.getElementById("total-ventas");
  const cantidadVentasDisplay = document.getElementById("cantidad-ventas");

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

  // --- DATA ---
  const cargarVentas = async () => {
    setLoading();
    const filtros = {
      fecha: filtroFecha.value,
      busqueda: (busquedaInput.value || "").trim(),
    };

    try {
      const ventas = await window.electronAPI.invoke("get-ventas", filtros);

      if (!Array.isArray(ventas)) {
        console.error("Formato inesperado:", ventas);
        tablaBody.innerHTML =
          '<tr><td colspan="11" class="error-cell">Error: formato de datos incorrecto.</td></tr>';
        actualizarResumen([]);
        return;
      }

      renderTabla(ventas);
      actualizarResumen(ventas);
    } catch (e) {
      console.error("Error al obtener ventas:", e);
      tablaBody.innerHTML =
        '<tr><td colspan="11" class="error-cell">Hubo un error al cargar las ventas.</td></tr>';
      actualizarResumen([]);
    }
  };

  // ===================================================================
  // 🟢 INICIO: LÓGICA DE TABLA CORREGIDA
  // ===================================================================

  const renderTabla = (ventas) => {
    tablaBody.innerHTML = "";
    if (ventas.length === 0) {
      tablaBody.innerHTML =
        '<tr><td colspan="11" class="empty-cell">No se encontraron ventas con estos filtros.</td></tr>';
      return;
    }

    const fragment = document.createDocumentFragment();

    ventas.forEach((v, index) => {
      const row = document.createElement("tr");
      row.dataset.index = index;

      const nombreCliente = v.Cliente?.nombre
        ? `${v.Cliente.nombre} ${v.Cliente.apellido || ""}`
        : v.dniCliente || "Consumidor Final";

      let detalles = [];
      if (v.detalles) {
        try {
          if (typeof v.detalles === "string") {
            detalles = JSON.parse(v.detalles);
          } else if (Array.isArray(v.detalles)) {
            detalles = v.detalles;
          }
        } catch {
          detalles = [];
        }
      }

      window[`__venta_detalles_${index}`] = detalles;

      const subtotal = detalles.reduce((acc, it) => {
        // Usa el subtotal si existe, si no, calcúlalo
        const itemSub =
          it.subtotal || (it.cantidad || 0) * (it.precioUnitario || 0);
        return acc + itemSub;
      }, 0);

      const idSimplificado = shortId(v.id) || index + 1;

      row.innerHTML = `
        <td>${idSimplificado}</td>
        <td>${dt(v.createdAt)}</td>
        <td>${nombreCliente}</td>
        <td>${v.metodoPago || "N/A"}</td>
        <td>${money(subtotal)}</td>
        <td class="valor-negativo">${money(-v.montoDescuento || 0)}</td>
        <td class="valor-positivo">${money(v.recargo || 0)}</td>
        <td class="col-total">${money(v.total || 0)}</td>
        <td>${
          v.metodoPago === "Efectivo" ? money(v.montoPagado || 0) : "N/A"
        }</td>
        <td>${v.metodoPago === "Efectivo" ? money(v.vuelto || 0) : "N/A"}</td>
        <td class="col-detalles">
          <button class="btn-toggle" data-index="${index}">Ver Detalles</button>
        </td>
      `;
      fragment.appendChild(row);
    });

    tablaBody.appendChild(fragment);

    // --- Botones de ver/ocultar ---
    tablaBody.querySelectorAll(".btn-toggle").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = btn.dataset.index;
        const filaActual = btn.closest("tr");
        const idFilaDetalles = `detalles-fila-${index}`;
        const filaDetallesExistente = document.getElementById(idFilaDetalles);

        if (filaDetallesExistente) {
          filaDetallesExistente.remove();
          btn.textContent = "Ver Detalles";
          filaActual.classList.remove("fila-activa");
        } else {
          const detalles = window[`__venta_detalles_${index}`] || [];

          // 🟢 CORRECCIÓN: Usar una Lista de Descripción (<dl>) en lugar de <Table>
          const detallesHtml =
            detalles.length > 0
              ? `<dl class="detalles-lista">
                   ${detalles
                     .map((d) => {
                       const subtotalItem =
                         d.subtotal ||
                         (d.cantidad || 0) * (d.precioUnitario || 0);
                       return `
                           <div>
                             <dt>${d.cantidad || 0} x ${
                         d.nombreProducto || "N/A"
                       } <span>(${money(d.precioUnitario || 0)} c/u)</span></dt>
                             <dd>${money(subtotalItem)}</dd>
                           </div>
                         `;
                     })
                     .join("")}
                 </dl>`
              : "<span>Sin detalles</span>";

          const nuevaFila = document.createElement("tr");
          nuevaFila.id = idFilaDetalles;
          nuevaFila.classList.add("detalles-fila");

          nuevaFila.innerHTML = `
            <td colspan="11">
              <div class="detalles-container-expandido">
                ${detallesHtml}
              </div>
            </td>
          `;

          filaActual.after(nuevaFila);
          btn.textContent = "Ocultar";
          filaActual.classList.add("fila-activa");
        }
      });
    });
  };

  // ===================================================================
  // 🟢 FIN: LÓGICA DE TABLA CORREGIDA
  // ===================================================================

  const actualizarResumen = (ventas) => {
    const total = ventas.reduce((acc, v) => acc + (v.total || 0), 0);
    totalVentasDisplay.textContent = money(total);
    cantidadVentasDisplay.textContent = ventas.length;
  };

  // --- EVENTS ---
  btnAplicarFiltros.addEventListener("click", cargarVentas);
  busquedaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") cargarVentas();
  });
  filtroFecha.addEventListener("change", cargarVentas);

  // --- INIT ---
  cargarVentas();
});
