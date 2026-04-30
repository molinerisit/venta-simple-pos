// renderer/js/cuenta-corriente-proveedores.js
document.addEventListener("app-ready", () => {
  const tbody = document.getElementById("proveedores-deuda-tbody");
  const statTotal     = document.getElementById("stat-total-deuda");
  const statCantidad  = document.getElementById("stat-proveedores-deuda");
  const statAbonos    = document.getElementById("stat-abonos-mes");

  const pagoModal        = document.getElementById("pago-modal");
  const pagoModalEntidad = document.getElementById("pago-modal-entidad");
  const pagoModalDeuda   = document.getElementById("pago-modal-deuda-actual");
  const pagoModalMonto   = document.getElementById("pago-modal-monto");
  const pagoModalHelp    = document.getElementById("pago-modal-help");
  const pagoModalCancelar   = document.getElementById("pago-modal-cancelar");
  const pagoModalConfirmar  = document.getElementById("pago-modal-confirmar");

  const toast = document.getElementById("toast-notification");
  let toastTimer;
  let pagoEnCurso = null;

  const showToast = (msg, type = "success", ms = 3000) => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = "toast";
    toast.classList.add(type, "visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), ms);
  };

  const money = (v) =>
    (v || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

  const cargar = async () => {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">Cargando...</td></tr>`;
    try {
      const { success, data } = await window.electronAPI.invoke("get-proveedores-con-deuda");
      tbody.innerHTML = "";
      if (success && Array.isArray(data) && data.length > 0) {
        const total = data.reduce((acc, p) => acc + parseFloat(p.deuda || 0), 0);
        if (statTotal)    statTotal.textContent    = money(total);
        if (statCantidad) statCantidad.textContent = data.length;
        if (statAbonos)   statAbonos.textContent   = "—";

        tbody.innerHTML = data
          .map((p) => `
          <tr>
            <td><strong>${p.nombreEmpresa || "—"}</strong></td>
            <td>${p.nombreRepartidor || "N/A"}</td>
            <td>${money(p.deuda)}</td>
            <td>${fmtDate(p.updatedAt)}</td>
            <td style="text-align:right;">
              <button class="btn btn-success btn-sm btn-abonar-proveedor"
                data-id="${p.id}"
                data-nombre="${p.nombreEmpresa || "—"}"
                data-deuda="${p.deuda || 0}">Registrar Abono</button>
            </td>
          </tr>`)
          .join("");
      } else {
        if (statTotal)    statTotal.textContent    = money(0);
        if (statCantidad) statCantidad.textContent = "0";
        if (statAbonos)   statAbonos.textContent   = "—";
        tbody.innerHTML =
          '<tr class="empty-row"><td colspan="5">No hay deudas pendientes con proveedores.</td></tr>';
      }
    } catch (e) {
      console.error("cuenta-corriente-proveedores", e);
      tbody.innerHTML =
        '<tr class="empty-row"><td colspan="5" style="color:red;">Error al cargar datos.</td></tr>';
      showToast("Error al cargar deudas de proveedores.", "error");
    }
  };

  const abrirModal = (id, nombre, deuda) => {
    pagoEnCurso = { id, deuda };
    pagoModalEntidad.textContent   = nombre || "—";
    pagoModalDeuda.textContent     = money(deuda || 0);
    pagoModalMonto.value           = "";
    pagoModalMonto.max             = deuda || "";
    pagoModalHelp.textContent      = deuda ? `Máximo: ${money(deuda)}` : "";
    pagoModal.classList.add("visible");
    pagoModalMonto.focus();
  };

  const cerrarModal = () => {
    pagoModal.classList.remove("visible");
    pagoEnCurso = null;
  };

  pagoModalCancelar.addEventListener("click", cerrarModal);

  pagoModal.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); pagoModalConfirmar.click(); }
    if (e.key === "Escape") cerrarModal();
  });

  pagoModalConfirmar.addEventListener("click", async () => {
    const monto = parseFloat(pagoModalMonto.value);
    if (!monto || monto <= 0) {
      showToast("Ingrese un monto válido.", "error");
      pagoModalMonto.focus();
      return;
    }
    if (pagoEnCurso?.deuda && monto > pagoEnCurso.deuda + 0.0001) {
      showToast("El monto no puede superar la deuda.", "error");
      pagoModalMonto.focus();
      return;
    }

    pagoModalConfirmar.disabled = true;
    try {
      const result = await window.electronAPI.invoke("registrar-abono-proveedor", {
        proveedorId: pagoEnCurso.id,
        monto,
      });
      if (result?.success) {
        showToast(result.message || "Abono registrado con éxito.");
        cerrarModal();
        await cargar();
      } else {
        showToast(result?.message || "No se pudo completar la operación.", "error");
      }
    } catch (e) {
      console.error("registrar-abono-proveedor", e);
      showToast("Ocurrió un error al registrar el abono.", "error");
    } finally {
      pagoModalConfirmar.disabled = false;
    }
  });

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-abonar-proveedor");
    if (!btn) return;
    const { id, nombre, deuda } = btn.dataset;
    abrirModal(id, nombre, parseFloat(deuda || "0"));
  });

  cargar();
});
