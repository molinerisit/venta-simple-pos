// renderer/js/insumos.js
// Confirm modal no bloqueante, renders suaves, toasts sin bloquear.

document.addEventListener("app-ready", () => {
  // --- 1) REFS ---
  const tablaBody = document.getElementById("insumos-table-body");
  const btnNuevoInsumo = document.getElementById("btn-nuevo-insumo");
  const searchInput = document.getElementById("search-input");
  const toast = document.getElementById("toast-notification");
  let toastTimer;

  // Confirm modal liviano
  const confirmOverlay = document.createElement("div");
  confirmOverlay.className = "confirm-overlay";
  confirmOverlay.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h4 id="confirm-title">Confirmar eliminación</h4>
      <p id="confirm-msg">¿Estás seguro de eliminar este insumo?</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secundario" data-action="cancelar">Cancelar</button>
        <button type="button" class="btn btn-danger" data-action="aceptar">Eliminar</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmOverlay);

  // --- 2) HELPERS ---
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  const idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 120 }) : setTimeout(r, 0)));
  const showNotification = (msg, type = "success") => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = "toast";
    toast.classList.add(type, "visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2500);
  };
  const confirmar = (mensaje) =>
    new Promise((resolve) => {
      confirmOverlay.querySelector("#confirm-msg").textContent = mensaje || "¿Estás seguro?";
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

  const formatCurrency = (n) => (n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  // --- Stat cards ---
  const actualizarStatCards = (insumos) => {
    const bajoStock = insumos.filter(i => Number(i.stock || 0) <= 5).length;

    // Gasto del mes: sum of (ultimoPrecioCompra) for all insumos as approximation
    const gastoMes = insumos.reduce((acc, i) => acc + (parseFloat(i.ultimoPrecioCompra || 0)), 0);

    // Última compra: find most recent updatedAt among insumos
    let ultimaCompra = "—";
    const fechas = insumos
      .map(i => i.fechaUltimaCompra || i.updatedAt)
      .filter(Boolean)
      .map(d => new Date(d))
      .filter(d => !isNaN(d));
    if (fechas.length > 0) {
      const maxFecha = new Date(Math.max(...fechas));
      ultimaCompra = maxFecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }

    const elGastoMes      = document.getElementById("stat-gasto-mes");
    const elBajoStock     = document.getElementById("stat-bajo-stock");
    const elUltimaCompra  = document.getElementById("stat-ultima-compra");
    const iconBajoStock   = document.getElementById("stat-bajo-stock-icon");

    if (elGastoMes)     elGastoMes.textContent    = formatCurrency(gastoMes);
    if (elBajoStock) {
      elBajoStock.textContent = bajoStock;
      if (iconBajoStock) {
        iconBajoStock.className = bajoStock > 0
          ? "stat-card-icon stat-card-icon--amber"
          : "stat-card-icon stat-card-icon--green";
      }
    }
    if (elUltimaCompra) elUltimaCompra.textContent = ultimaCompra;
  };

  const renderizarTabla = async (insumos) => {
    tablaBody.innerHTML = "";
    await nextFrame();

    actualizarStatCards(Array.isArray(insumos) ? insumos : []);

    if (!insumos || insumos.length === 0) {
      tablaBody.innerHTML = `<tr><td colspan="8" class="text-center">No se encontraron insumos.</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    insumos.forEach((i) => {
      const sinStock = Number(i.stock || 0) <= 0;
      const badgeCls = sinStock ? "badge-stock badge-stock--sin" : "badge-stock badge-stock--ok";
      const badgeTxt = sinStock ? "Sin stock" : "Normal";

      const categoria = [i.departamentoNombre, i.familiaNombre].filter(Boolean).join(" / ") || "—";
      const fechaCompra = i.fechaUltimaCompra || i.updatedAt;
      const fechaFmt = fechaCompra
        ? new Date(fechaCompra).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i.nombre}</td>
        <td>${categoria}</td>
        <td>${i.stock}</td>
        <td>${i.unidad || ""}</td>
        <td>${formatCurrency(i.ultimoPrecioCompra)}</td>
        <td>${fechaFmt}</td>
        <td><span class="${badgeCls}">${badgeTxt}</span></td>
        <td class="acciones-btn">
          <button class="btn-edit btn btn-info" data-id="${i.id}" title="Editar">✏️</button>
          <button class="btn-delete btn btn-danger" data-id="${i.id}" title="Eliminar">🗑️</button>
        </td>
      `;
      frag.appendChild(tr);
    });
    tablaBody.appendChild(frag);
    await idle();
  };

  const cargarInsumos = async (filtro = "") => {
    try {
      tablaBody.innerHTML = '<tr><td colspan="8" class="text-center">Cargando…</td></tr>';
      const data = await window.electronAPI.invoke("get-insumos", filtro);
      await renderizarTabla(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error al cargar insumos:", e);
      showNotification("No se pudieron cargar los insumos.", "error");
      tablaBody.innerHTML = '<tr><td colspan="8" class="text-center" style="color:red;">Error al cargar.</td></tr>';
    }
  };

  // --- 3) EVENTS ---
  btnNuevoInsumo?.addEventListener("click", () => {
    window.location.href = "insumo-form.html";
  }, { passive: true });

  searchInput?.addEventListener("input", () => {
    window.requestAnimationFrame(() => cargarInsumos(searchInput.value));
  });

  tablaBody?.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id || id === "null" || id === "undefined") return;

    // antirebote
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";

    try {
      if (btn.classList.contains("btn-edit")) {
        await nextFrame();
        window.location.href = `insumo-form.html?id=${id}`;
        return;
      }

      if (btn.classList.contains("btn-delete")) {
        const ok = await confirmar("¿Eliminar este insumo? Esta acción no se puede deshacer.");
        if (!ok) return;
        btn.disabled = true;

        const res = await window.electronAPI.invoke("eliminar-insumo", id);
        if (res?.success) {
          showNotification("Insumo eliminado con éxito.");
          setTimeout(() => cargarInsumos(searchInput.value), 0);
        } else {
          showNotification(res?.message || "No se pudo eliminar.", "error");
          btn.disabled = false;
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

  // --- START ---
  cargarInsumos();
});
