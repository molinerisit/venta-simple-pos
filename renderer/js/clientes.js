// renderer/js/clientes.js
// - Toasts no bloqueantes
// - Modal de confirmación propio (sin window.confirm)
// - Pequeños anti-rebotes para evitar “click doble”

document.addEventListener("app-ready", () => {
  // --- Refs ---
  const tablaBody = document.querySelector("#clientes-table tbody");
  const modal = document.getElementById("cliente-modal");
  const modalTitulo = document.getElementById("modal-titulo");
  const clienteForm = document.getElementById("cliente-form");
  const btnNuevoCliente = document.getElementById("btn-nuevo-cliente");
  const btnCancelarModal = document.getElementById("btn-cancelar-modal");
  const inputId = document.getElementById("cliente-id");
  const inputDni = document.getElementById("dni");
  const inputNombre = document.getElementById("nombre");
  const inputDescuento = document.getElementById("descuento");
  const btnGuardar = document.getElementById("btn-guardar-cliente");
  const toast = document.getElementById("toast-notification");

  let toastTimer;

  // --- Confirm modal ligero (no bloquea UI) ---
  const confirmOverlay = document.createElement("div");
  confirmOverlay.className = "confirm-overlay";
  confirmOverlay.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h4 id="confirm-title">Confirmar eliminación</h4>
      <p id="confirm-msg">¿Estás seguro de eliminar este cliente?</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secundario" data-action="cancelar">Cancelar</button>
        <button type="button" class="btn btn-danger" data-action="aceptar">Eliminar</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmOverlay);

  const confirmar = (mensaje) =>
    new Promise((resolve) => {
      confirmOverlay.querySelector("#confirm-msg").textContent =
        mensaje || "¿Estás seguro?";
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

  // --- Utils ---
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

  const bloquearFondo = (activar) => {
    const main = document.getElementById("main-content");
    if (!main) return;
    if (activar) {
      main.setAttribute("inert", "");
      document.body.style.overflow = "hidden";
      modal?.setAttribute("aria-hidden", "false");
    } else {
      main.removeAttribute("inert");
      document.body.style.overflow = "";
      modal?.setAttribute("aria-hidden", "true");
    }
  };

  const cerrarModal = () => {
    modal?.classList.remove("visible");
    bloquearFondo(false);
    // evitar que quede focus capturado
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  };

  const abrirModal = (cliente = null) => {
    clienteForm?.reset();
    if (cliente) {
      modalTitulo.textContent = "Editar Cliente";
      inputId.value = cliente.id;
      inputDni.value = cliente.dni || "";
      inputNombre.value = cliente.nombre || "";
      inputDescuento.value = cliente.descuento ?? 0;
    } else {
      modalTitulo.textContent = "Nuevo Cliente";
      inputId.value = "";
      inputDescuento.value = "0";
    }
    modal?.classList.add("visible");
    bloquearFondo(true);
    inputDni?.focus();
  };

  const cargarClientes = async () => {
    try {
      const lista = await window.electronAPI.invoke("get-clientes");
      if (!lista || lista.length === 0) {
        tablaBody.innerHTML =
          '<tr><td colspan="4" class="text-center">No se encontraron clientes.</td></tr>';
        return;
      }
      const rows = lista
        .map(
          (c) => `
          <tr>
            <td>${c.dni}</td>
            <td>${c.nombre}</td>
            <td>${c.descuento || 0}%</td>
            <td class="acciones-btn">
              <button class="btn-edit btn btn-info" data-id="${c.id}" title="Editar">✏️</button>
              <button class="btn-delete btn btn-danger" data-id="${c.id}" title="Eliminar">🗑️</button>
            </td>
          </tr>`
        )
        .join("");
      tablaBody.innerHTML = rows;
    } catch (error) {
      console.error("Error al cargar clientes:", error);
      showNotification("No se pudieron cargar los clientes.", "error");
      tablaBody.innerHTML =
        '<tr><td colspan="4" class="text-center" style="color:red;">Error al cargar.</td></tr>';
    }
  };

  const cargarClientePorId = async (id) => {
    try {
      const cliente = await window.electronAPI.invoke("get-cliente-by-id", id);
      if (cliente) return cliente;
    } catch (_) { /* fallback */ }
    try {
      const lista = await window.electronAPI.invoke("get-clientes");
      return lista.find((c) => c.id === id) || null;
    } catch {
      return null;
    }
  };

  // --- Listeners ---
  btnNuevoCliente?.addEventListener("click", () => abrirModal());
  btnCancelarModal?.addEventListener("click", cerrarModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) cerrarModal();
  });

  clienteForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!btnGuardar) return;

    btnGuardar.disabled = true;

    const clienteData = {
      dni: (inputDni.value || "").trim(),
      nombre: (inputNombre.value || "").trim(),
      descuento: parseFloat(inputDescuento.value) || 0,
    };
    if (inputId.value) clienteData.id = inputId.value;

    try {
      const result = await window.electronAPI.invoke(
        "guardar-cliente",
        clienteData
      );
      if (result?.success) {
        showNotification("Cliente guardado con éxito.");
        cerrarModal();
        await cargarClientes();
      } else {
        showNotification(
          `Error al guardar: ${result?.message || "Error desconocido"}`,
          "error"
        );
      }
    } catch (error) {
      showNotification("Ocurrió un error inesperado al guardar.", "error");
    } finally {
      btnGuardar.disabled = false;
    }
  });

  tablaBody?.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) return;

    // antirebote por botón
    if (target.dataset.busy === "1") return;
    target.dataset.busy = "1";

    const clienteId = target.dataset.id;
    if (!clienteId) {
      target.dataset.busy = "0";
      return;
    }

    try {
      if (target.classList.contains("btn-edit")) {
        const clienteAEditar = await cargarClientePorId(clienteId);
        if (clienteAEditar) abrirModal(clienteAEditar);
        else showNotification("No se encontró el cliente.", "error");
        return;
      }

      if (target.classList.contains("btn-delete")) {
        const ok = await confirmar("¿Eliminar este cliente? Esta acción no se puede deshacer.");
        if (!ok) return;

        target.disabled = true;
        const result = await window.electronAPI.invoke(
          "eliminar-cliente",
          clienteId
        );
        if (result?.success) {
          showNotification("Cliente eliminado.");
          await cargarClientes();
        } else {
          showNotification(
            `Error al eliminar: ${result?.message || "desconocido"}`,
            "error"
          );
          target.disabled = false;
        }
      }
    } catch (err) {
      console.error(err);
      showNotification("Ocurrió un error al procesar la acción.", "error");
    } finally {
      target.dataset.busy = "0";
      target.disabled = false;
    }
  });

  // --- Arranque ---
  cargarClientes();
});
