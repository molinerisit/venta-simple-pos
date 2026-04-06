// renderer/js/facturacion.js
document.addEventListener("app-ready", () => {
  // --- Refs ---
  const tablaBody = document.getElementById("tabla-ventas-facturacion");
  const facturaModal = document.getElementById("factura-modal");
  const btnCancelarFactura = document.getElementById("btn-cancelar-factura");
  const btnConfirmarFactura = document.getElementById("btn-confirmar-factura");
  const modalVentaId = document.getElementById("modal-venta-id");
  const modalVentaTotal = document.getElementById("modal-venta-total");
  const modalTipoCompSelect = document.getElementById("modal-tipo-comp");
  const toast = document.getElementById("toast-notification");

  // --- UI helpers ---
  let toastTimer;
  const showToast = (msg, type = "success", ms = 4000) => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = "toast";
    toast.classList.add(type, "visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), ms);
  };

  const money = (n) =>
    (n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  const dt = (d) => new Date(d).toLocaleString("es-AR");

  // --- Render ---
  const renderVentas = (ventas) => {
    tablaBody.innerHTML = "";
    if (!ventas?.length) {
      tablaBody.innerHTML =
        '<tr><td colspan="6" class="empty-cell">No se encontraron ventas.</td></tr>';
      return;
    }
    ventas.forEach((v) => {
      const row = document.createElement("tr");
      const estadoHtml = v.facturada
        ? `<span class="status status-success">Facturada (CAE: ${v.Factura?.cae || "N/A"})</span>`
        : `<span class="status status-warning">Pendiente</span>`;
      const accionesHtml = v.facturada
        ? `<button class="btn btn-secundario btn-sm" disabled>Ver PDF</button>`
        : `<button class="btn btn-primario btn-sm btn-facturar" data-venta-id="${v.id}" data-total="${v.total}">Facturar</button>`;

      const nombreCliente = v.Cliente?.nombre
        ? `${v.Cliente.nombre} ${v.Cliente.apellido || ""}`
        : v.dniCliente || "Consumidor Final";

      row.innerHTML = `
        <td>${v.id}</td>
        <td>${dt(v.createdAt)}</td>
        <td>${nombreCliente}</td>
        <td>${money(v.total)}</td>
        <td>${estadoHtml}</td>
        <td style="text-align:right;">${accionesHtml}</td>
      `;
      tablaBody.appendChild(row);
    });
  };

  // --- Data ---
  const loadVentas = async () => {
    tablaBody.innerHTML =
      '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';
    try {
      const ventas = await window.electronAPI.invoke("get-ventas-con-factura");
      renderVentas(Array.isArray(ventas) ? ventas : []);
    } catch (e) {
      console.error("get-ventas-con-factura", e);
      showToast("Error al cargar las ventas.", "error");
      renderVentas([]);
    }
  };

  // --- Modal ---
  const openFacturaModal = (ventaId, total) => {
    if (!facturaModal) {
      // fallback ultra simple
      const tipoComp = +prompt("Tipo comprobante (6=B, 11=C):", "6");
      if (!tipoComp) return;
      btnConfirmarFactura.dataset.ventaId = ventaId;
      modalTipoCompSelect.value = tipoComp; // simulado
      btnConfirmarFactura.click();
      return;
    }
    modalVentaId.textContent = ventaId;
    modalVentaTotal.textContent = money(total);
    btnConfirmarFactura.dataset.ventaId = String(ventaId);
    facturaModal.classList.add("visible");
  };

  const closeFacturaModal = () => {
    facturaModal?.classList.remove("visible");
  };

  // --- Events ---
  btnCancelarFactura?.addEventListener("click", closeFacturaModal);

  tablaBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-facturar");
    if (!btn) return;
    openFacturaModal(btn.dataset.ventaId, parseFloat(btn.dataset.total));
  });

  btnConfirmarFactura?.addEventListener("click", async () => {
    const ventaId = btnConfirmarFactura.dataset.ventaId;
    const tipoComp = parseInt(modalTipoCompSelect.value, 10);

    const prev = btnConfirmarFactura.textContent;
    btnConfirmarFactura.textContent = "Procesando...";
    btnConfirmarFactura.disabled = true;

    try {
      const r = await window.electronAPI.invoke("facturar-venta", {
        ventaId,
        tipoComp,
      });
      if (r?.success) {
        showToast(r.message || "Factura emitida correctamente.");
        await loadVentas();
      } else {
        showToast(r?.message || "No se pudo facturar la venta.", "error");
      }
    } catch (e) {
      console.error("facturar-venta", e);
      showToast("Ocurrió un error inesperado.", "error");
    } finally {
      closeFacturaModal();
      btnConfirmarFactura.textContent = prev;
      btnConfirmarFactura.disabled = false;
    }
  });

  // --- Init ---
  loadVentas();
});
