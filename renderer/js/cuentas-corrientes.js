// renderer/js/cuentas-corrientes.js
document.addEventListener("app-ready", () => {
  const clientesTbody = document.getElementById("clientes-deuda-tbody");

  const pagoModal          = document.getElementById("pago-modal");
  const pagoModalTitulo    = document.getElementById("pago-modal-titulo");
  const pagoModalEntidad   = document.getElementById("pago-modal-entidad");
  const pagoModalDeudaActual = document.getElementById("pago-modal-deuda-actual");
  const pagoModalMonto     = document.getElementById("pago-modal-monto");
  const pagoModalHelp      = document.getElementById("pago-modal-help");
  const pagoModalCancelar  = document.getElementById("pago-modal-cancelar");
  const pagoModalConfirmar = document.getElementById("pago-modal-confirmar");

  const toast = document.getElementById("toast-notification");
  let toastTimer;

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

  const actualizarStatCards = (clientes) => {
    const totalDeuda    = document.getElementById("stat-total-deuda");
    const clientesDeuda = document.getElementById("stat-clientes-deuda");
    const pagosMes      = document.getElementById("stat-pagos-mes");
    if (totalDeuda) {
      const suma = clientes.reduce((acc, c) => acc + parseFloat(c.deuda || 0), 0);
      totalDeuda.textContent = money(suma);
    }
    if (clientesDeuda) clientesDeuda.textContent = clientes.length;
    if (pagosMes) pagosMes.textContent = "—";
  };

  const cargarClientesConDeuda = async () => {
    if (!clientesTbody) return;
    clientesTbody.innerHTML = `<tr><td colspan="5" class="text-center">Cargando...</td></tr>`;
    try {
      const { success, data } = await window.electronAPI.invoke("get-clientes-con-deuda");
      clientesTbody.innerHTML = "";
      if (success && Array.isArray(data) && data.length > 0) {
        actualizarStatCards(data);
        clientesTbody.innerHTML = data
          .map((c) => {
            const nombre = `${c.apellido || ""}, ${c.nombre || ""}`.trim().replace(/^,\s*/, "");
            const deuda  = parseFloat(c.deuda || 0);
            const estado = deuda > 0
              ? '<span class="badge-estado badge-estado--deudor">Con deuda</span>'
              : '<span class="badge-estado badge-estado--activo">Al día</span>';
            return `
          <tr>
            <td><strong>${nombre}</strong><br><small style="color:#64748b;">${c.dni || ""}</small></td>
            <td>${money(deuda)}</td>
            <td>${fmtDate(c.ultimoMovimiento || c.updatedAt)}</td>
            <td>${estado}</td>
            <td style="text-align:right;">
              <button class="btn btn-success btn-sm btn-pagar-cliente"
                data-id="${c.id}" data-nombre="${nombre}"
                data-deuda="${c.deuda || 0}">Registrar Pago</button>
            </td>
          </tr>`;
          })
          .join("");
      } else {
        actualizarStatCards([]);
        clientesTbody.innerHTML =
          '<tr class="empty-row"><td colspan="5">No hay clientes con deudas pendientes.</td></tr>';
      }
    } catch (e) {
      console.error("get-clientes-con-deuda", e);
      clientesTbody.innerHTML =
        '<tr class="empty-row"><td colspan="5" style="color:red;">Error al cargar datos.</td></tr>';
      showToast("Error al cargar deudas de clientes.", "error");
    }
  };

  // --- MODAL ---
  let pagoEnCurso = null;

  const abrirModal = (id, nombre, deuda) => {
    pagoEnCurso = { id, deuda };
    if (pagoModalTitulo)    pagoModalTitulo.textContent    = "Registrar Pago de Cliente";
    if (pagoModalEntidad)   pagoModalEntidad.textContent   = nombre || "—";
    if (pagoModalDeudaActual) pagoModalDeudaActual.textContent = money(deuda || 0);
    pagoModalMonto.value    = "";
    pagoModalMonto.max      = deuda || "";
    pagoModalHelp.textContent = deuda ? `Máximo: ${money(deuda)}` : "";
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
      const result = await window.electronAPI.invoke("registrar-pago-cliente", {
        clienteId: pagoEnCurso.id,
        monto,
      });
      if (result?.success) {
        showToast(result.message || "Pago registrado con éxito.");
        cerrarModal();
        await cargarClientesConDeuda();
      } else {
        showToast(result?.message || "No se pudo completar la operación.", "error");
      }
    } catch (e) {
      console.error("registrar-pago-cliente", e);
      showToast("Ocurrió un error al registrar el pago.", "error");
    } finally {
      pagoModalConfirmar.disabled = false;
    }
  });

  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-pagar-cliente");
    if (!btn) return;
    const { id, nombre, deuda } = btn.dataset;
    abrirModal(id, nombre, parseFloat(deuda || "0"));
  });

  cargarClientesConDeuda();
});
