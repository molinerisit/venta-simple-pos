// renderer/js/cuentas-corrientes.js
document.addEventListener("app-ready", () => {
  // --- REFS ---
  const tabs = document.querySelectorAll(".tab-button");
  const tabContents = document.querySelectorAll(".tab-content");
  const clientesTbody = document.getElementById("clientes-deuda-tbody");
  const proveedoresTbody = document.getElementById("proveedores-deuda-tbody");

  // Modal
  const pagoModal = document.getElementById("pago-modal");
  const pagoModalTitulo = document.getElementById("pago-modal-titulo");
  const pagoModalEntidad = document.getElementById("pago-modal-entidad");
  const pagoModalDeudaActual = document.getElementById("pago-modal-deuda-actual");
  const pagoModalMonto = document.getElementById("pago-modal-monto");
  const pagoModalHelp = document.getElementById("pago-modal-help");
  const pagoModalCancelar = document.getElementById("pago-modal-cancelar");
  const pagoModalConfirmar = document.getElementById("pago-modal-confirmar");

  // Toast
  const toast = document.getElementById("toast-notification");
  let toastTimer;

  // --- UTILS ---
  const showToast = (msg, type = "success", ms = 3000) => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = "toast";
    toast.classList.add(type, "visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), ms);
  };

  const money = (v) => (v || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  const setLoadingTbody = (tbody, colspan = 4) => {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${colspan}" class="text-center">Cargando...</td></tr>`;
  };

  // --- LOADERS ---
  const cargarClientesConDeuda = async () => {
    if (!clientesTbody) return;
    setLoadingTbody(clientesTbody);
    try {
      const { success, data } = await window.electronAPI.invoke("get-clientes-con-deuda");
      clientesTbody.innerHTML = "";
      if (success && Array.isArray(data) && data.length > 0) {
        clientesTbody.innerHTML = data
          .map(
            (c) => `
          <tr>
            <td>${c.apellido || ""}, ${c.nombre || ""}</td>
            <td>${c.dni || "-"}</td>
            <td>${money(c.deuda)}</td>
            <td style="text-align:right;">
              <button class="btn btn-success btn-sm btn-pagar-cliente"
                data-id="${c.id}" data-nombre="${(c.apellido || "") + ", " + (c.nombre || "")}"
                data-deuda="${c.deuda || 0}">Registrar Pago</button>
            </td>
          </tr>`
          )
          .join("");
      } else {
        clientesTbody.innerHTML =
          '<tr class="empty-row"><td colspan="4">No hay clientes con deudas pendientes.</td></tr>';
      }
    } catch (e) {
      console.error("get-clientes-con-deuda", e);
      clientesTbody.innerHTML =
        '<tr class="empty-row"><td colspan="4" style="color:red;">Error al cargar datos.</td></tr>';
      showToast("Error al cargar deudas de clientes.", "error");
    }
  };

  const cargarProveedoresConDeuda = async () => {
    if (!proveedoresTbody) return;
    setLoadingTbody(proveedoresTbody);
    try {
      const { success, data } = await window.electronAPI.invoke("get-proveedores-con-deuda");
      proveedoresTbody.innerHTML = "";
      if (success && Array.isArray(data) && data.length > 0) {
        proveedoresTbody.innerHTML = data
          .map(
            (p) => `
          <tr>
            <td>${p.nombreEmpresa || "-"}</td>
            <td>${p.nombreRepartidor || "N/A"}</td>
            <td>${money(p.deuda)}</td>
            <td style="text-align:right;">
              <button class="btn btn-success btn-sm btn-abonar-proveedor"
                data-id="${p.id}" data-nombre="${p.nombreEmpresa || "-"}"
                data-deuda="${p.deuda || 0}">Registrar Abono</button>
            </td>
          </tr>`
          )
          .join("");
      } else {
        proveedoresTbody.innerHTML =
          '<tr class="empty-row"><td colspan="4">No hay deudas pendientes con proveedores.</td></tr>';
      }
    } catch (e) {
      console.error("get-proveedores-con-deuda", e);
      proveedoresTbody.innerHTML =
        '<tr class="empty-row"><td colspan="4" style="color:red;">Error al cargar datos.</td></tr>';
      showToast("Error al cargar deudas de proveedores.", "error");
    }
  };

  // --- TABS ---
  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      tabContents.forEach((c) => c.classList.remove("active"));
      const target = document.getElementById(`tab-${btn.dataset.tab}`);
      target?.classList.add("active");
    });
  });

  // --- MODAL ---
  let pagoEnCurso = null;

  const abrirModal = (tipo, id, nombre, deuda) => {
    pagoEnCurso = { tipo, id, deuda };
    pagoModalTitulo.textContent =
      tipo === "cliente" ? "Registrar Pago de Cliente" : "Registrar Abono a Proveedor";
    pagoModalEntidad.textContent = nombre || "-";
    pagoModalDeudaActual.textContent = money(deuda || 0);
    pagoModalMonto.value = "";
    pagoModalMonto.max = deuda || "";
    pagoModalHelp.textContent = deuda ? `Máximo: ${money(deuda)}` : "";
    pagoModal.classList.add("visible");
    pagoModalMonto.focus();
  };

  const cerrarModal = () => {
    pagoModal.classList.remove("visible");
    pagoEnCurso = null;
  };

  pagoModalCancelar.addEventListener("click", cerrarModal);

  // Enter dentro del modal confirma
  pagoModal.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pagoModalConfirmar.click();
    }
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
      let result;
      if (pagoEnCurso.tipo === "cliente") {
        result = await window.electronAPI.invoke("registrar-pago-cliente", {
          clienteId: pagoEnCurso.id,
          monto,
        });
      } else {
        result = await window.electronAPI.invoke("registrar-abono-proveedor", {
          proveedorId: pagoEnCurso.id,
          monto,
        });
      }

      if (result?.success) {
        showToast(result.message || "Operación registrada con éxito.");
        cerrarModal();
        await Promise.all([cargarClientesConDeuda(), cargarProveedoresConDeuda()]);
      } else {
        showToast(result?.message || "No se pudo completar la operación.", "error");
      }
    } catch (e) {
      console.error("registrar pago", e);
      showToast("Ocurrió un error al registrar la operación.", "error");
    } finally {
      pagoModalConfirmar.disabled = false;
    }
  });

  // Delegación de botones
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    if (btn.classList.contains("btn-pagar-cliente")) {
      const { id, nombre, deuda } = btn.dataset;
      abrirModal("cliente", id, nombre, parseFloat(deuda || "0"));
    }
    if (btn.classList.contains("btn-abonar-proveedor")) {
      const { id, nombre, deuda } = btn.dataset;
      abrirModal("proveedor", id, nombre, parseFloat(deuda || "0"));
    }
  });

  // --- INIT ---
  const init = () => {
    cargarClientesConDeuda();
    cargarProveedoresConDeuda();
  };
  init();
});
