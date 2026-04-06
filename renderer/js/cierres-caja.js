// renderer/js/cierres-caja.js
document.addEventListener("app-ready", () => {
  // --- REFERENCIAS ---
  const tablaBody = document.getElementById("cierres-table-body");
  const toast = document.getElementById("toast-notification");
  let toastTimer;

  // --- UTILIDADES ---
  const showNotification = (message, type = "success") => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = "toast";
    toast.classList.add(type, "visible");
    toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 3000);
  };

  const formatCurrency = (value) =>
    (value || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  // --- CARGA ---
  const cargarCierres = async () => {
    if (!tablaBody) return;
    tablaBody.innerHTML =
      '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';

    try {
      const cierres = await window.electronAPI.invoke("get-all-cierres-caja");

      if (!Array.isArray(cierres) || cierres.length === 0) {
        tablaBody.innerHTML =
          '<tr><td colspan="6" class="text-center">No hay cierres de caja registrados.</td></tr>';
        return;
      }

      const filasHtml = cierres
        .map((c) => {
          const diferenciaClass =
            c.diferencia < 0
              ? "valor-negativo"
              : c.diferencia > 0
              ? "valor-positivo"
              : "";
          const fechaCierre = c.fechaCierre
            ? new Date(c.fechaCierre).toLocaleString("es-AR")
            : "-";

          return `
            <tr>
              <td>${fechaCierre}</td>
              <td>${c.usuario?.nombre || "N/A"}</td>
              <td>${formatCurrency(c.montoFinalEstimado)}</td>
              <td>${formatCurrency(c.montoFinalReal)}</td>
              <td class="${diferenciaClass}">${formatCurrency(c.diferencia)}</td>
              <td class="acciones-btn">
                <button class="btn-print btn btn-info" data-id="${c.id}" title="Imprimir comprobante">📄</button>
              </td>
            </tr>
          `;
        })
        .join("");

      tablaBody.innerHTML = filasHtml;
    } catch (error) {
      console.error("Error al cargar cierres de caja:", error);
      tablaBody.innerHTML =
        '<tr><td colspan="6" class="text-center" style="color:red;">Error al cargar los datos.</td></tr>';
      showNotification("Error al cargar los cierres de caja.", "error");
    }
  };

  // --- EVENTOS ---
  tablaBody?.addEventListener("click", async (event) => {
    const btn = event.target.closest(".btn-print");
    if (!btn) return;
    const cierreId = btn.dataset.id;
    showNotification(`Impresión para cierre #${cierreId} no implementada.`, "info");

    // Futuro:
    // await window.electronAPI.invoke('imprimir-ticket-arqueo', { id: cierreId })
  });

  // --- ARRANQUE ---
  cargarCierres();
});
