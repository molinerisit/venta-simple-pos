// renderer/js/ofertas.js
(() => {
  "use strict";

  let __INIT_DONE__ = false;

  const boot = () => {
    if (__INIT_DONE__) return;
    __INIT_DONE__ = true;

    // ── DOM refs ──────────────────────────────────────────────────
    const btnNuevaOferta       = document.getElementById("btn-nueva-oferta");
    const modalOferta          = document.getElementById("modal-oferta");
    const btnCerrarModal       = document.getElementById("btn-cerrar-modal-oferta");
    const btnCancelarOferta    = document.getElementById("btn-cancelar-oferta");
    const formOferta           = document.getElementById("form-oferta");
    const ofertaId             = document.getElementById("oferta-id");
    const modalTitulo          = document.getElementById("modal-oferta-titulo");
    const productoSearch       = document.getElementById("oferta-producto-search");
    const productoDropdown     = document.getElementById("oferta-producto-dropdown");
    const productoIdHidden     = document.getElementById("oferta-producto-id");
    const productoHint         = document.getElementById("oferta-producto-seleccionado");
    const campoValor           = document.getElementById("campo-valor");
    const ofertaValor          = document.getElementById("oferta-valor");
    const ofertaNombre         = document.getElementById("oferta-nombre");
    const ofertaFechaInicio    = document.getElementById("oferta-fecha-inicio");
    const ofertaFechaFin       = document.getElementById("oferta-fecha-fin");
    const tablaBody            = document.getElementById("ofertas-table-body");
    const contadorEl           = document.getElementById("contador-ofertas");
    const statTotal            = document.getElementById("stat-total");
    const statActivas          = document.getElementById("stat-activas");
    const statVencidas         = document.getElementById("stat-vencidas");
    const toast                = document.getElementById("toast-notification");

    // ── Estado ───────────────────────────────────────────────────
    let allOfertas   = [];
    let allProductos = [];
    let toastTimer;
    let searchTimer;

    // ── Utilidades ───────────────────────────────────────────────
    const showToast = (msg, type = "success", ms = 3000) => {
      if (!toast) return;
      clearTimeout(toastTimer);
      toast.textContent = msg;
      toast.className = "toast";
      toast.classList.add(type, "visible");
      toastTimer = setTimeout(() => toast.classList.remove("visible"), ms);
    };

    const DIAS_NOMBRES = ["", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];

    const formatDias = (diasStr) => {
      if (!diasStr) return "Todos los días";
      try {
        const arr = JSON.parse(diasStr).map(Number);
        if (!arr || arr.length === 0) return "Todos los días";
        return arr.map(d => DIAS_NOMBRES[d] || d).join(", ");
      } catch { return "Todos los días"; }
    };

    const formatFecha = (f) => {
      if (!f) return "—";
      const [y, m, d] = f.split("-");
      return `${d}/${m}/${y}`;
    };

    const isoHoy = () => new Date().toISOString().slice(0, 10);

    const isVencida = (oferta) => {
      if (!oferta.activa) return false;
      if (!oferta.fecha_fin) return false;
      return oferta.fecha_fin < isoHoy();
    };

    const isActivaHoy = (oferta) => {
      if (!oferta.activa) return false;
      const hoy = isoHoy();
      if (oferta.fecha_inicio && oferta.fecha_inicio > hoy) return false;
      if (oferta.fecha_fin && oferta.fecha_fin < hoy) return false;
      if (oferta.dias_semana) {
        try {
          const arr = JSON.parse(oferta.dias_semana).map(Number);
          if (arr.length > 0) {
            const d = new Date().getDay();
            const isoD = d === 0 ? 7 : d;
            if (!arr.includes(isoD)) return false;
          }
        } catch { /* ignore */ }
      }
      return true;
    };

    const tipoLabel = (tipo, valor) => {
      switch (tipo) {
        case "porcentaje": return `${valor}% OFF`;
        case "2x1":        return "2 x 1";
        case "3x2":        return "3 x 2";
        default:           return tipo;
      }
    };

    const tipoClass = (tipo) => {
      switch (tipo) {
        case "porcentaje": return "oferta-tipo-pct";
        case "2x1":        return "oferta-tipo-2x1";
        case "3x2":        return "oferta-tipo-3x2";
        default:           return "";
      }
    };

    // ── Carga de datos ───────────────────────────────────────────
    const loadOfertas = async () => {
      try {
        allOfertas = await window.electronAPI.invoke("get-ofertas") || [];
        renderTabla();
      } catch (e) {
        console.error("[ofertas]", e);
        showToast("Error al cargar las ofertas.", "error");
      }
    };

    const loadProductos = async () => {
      try {
        const data = await window.electronAPI.invoke("get-productos");
        allProductos = Array.isArray(data) ? data : [];
      } catch (e) {
        console.error("[ofertas] productos:", e);
      }
    };

    // ── Renderizado de tabla ─────────────────────────────────────
    const renderTabla = () => {
      if (!tablaBody) return;

      const hoy = isoHoy();
      let totalActivas = 0;
      let totalVencidas = 0;

      tablaBody.innerHTML = "";

      if (allOfertas.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="7" style="text-align:center;color:#9ca3af;padding:32px;">
          No hay ofertas creadas. Hacé clic en "Nueva Oferta" para empezar.
        </td>`;
        tablaBody.appendChild(tr);
        actualizarStats(0, 0, 0);
        return;
      }

      allOfertas.forEach((o) => {
        const vencida  = isVencida(o);
        const activaHoy = isActivaHoy(o);
        if (vencida)  totalVencidas++;
        if (activaHoy) totalActivas++;

        let estadoBadge;
        if (vencida) {
          estadoBadge = `<span class="badge badge-red">Vencida</span>`;
        } else if (!o.activa) {
          estadoBadge = `<span class="badge badge-gray">Inactiva</span>`;
        } else if (activaHoy) {
          estadoBadge = `<span class="badge badge-green">Activa hoy</span>`;
        } else {
          estadoBadge = `<span class="badge badge-amber">Programada</span>`;
        }

        const productoNombre = o.producto
          ? `<strong>${o.producto.nombre}</strong><br><small class="text-muted">${o.producto.codigo || ""}</small>`
          : `<small class="text-muted">—</small>`;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${productoNombre}</td>
          <td><span class="oferta-tipo-chip ${tipoClass(o.tipo)}">${tipoLabel(o.tipo, o.valor)}</span></td>
          <td>${o.nombre || "—"}</td>
          <td>${formatDias(o.dias_semana)}</td>
          <td>${formatFecha(o.fecha_inicio)} – ${formatFecha(o.fecha_fin)}</td>
          <td>${estadoBadge}</td>
          <td style="text-align:right;">
            <button class="btn btn-sm btn-secundario btn-editar-oferta" data-id="${o.id}" title="Editar">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="btn btn-sm ${o.activa ? 'btn-secundario' : 'btn-success'} btn-toggle-oferta"
                    data-id="${o.id}" title="${o.activa ? 'Desactivar' : 'Activar'}">
              ${o.activa ? "Pausar" : "Activar"}
            </button>
            <button class="btn btn-sm btn-danger btn-eliminar-oferta" data-id="${o.id}" title="Eliminar">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          </td>
        `;
        tablaBody.appendChild(tr);
      });

      actualizarStats(allOfertas.length, totalActivas, totalVencidas);
    };

    const actualizarStats = (total, activas, vencidas) => {
      if (contadorEl) contadorEl.textContent = total;
      if (statTotal)   statTotal.textContent  = total;
      if (statActivas) statActivas.textContent = activas;
      if (statVencidas) statVencidas.textContent = vencidas;
    };

    // ── Modal ────────────────────────────────────────────────────
    const abrirModal = (oferta = null) => {
      if (!modalOferta) return;
      formOferta.reset();
      ofertaId.value = "";
      productoIdHidden.value = "";
      productoSearch.value = "";
      productoHint.textContent = "";
      campoValor.style.display = "";

      if (oferta) {
        modalTitulo.textContent = "Editar Oferta";
        ofertaId.value = oferta.id;
        productoIdHidden.value = oferta.ProductoId;
        productoSearch.value = oferta.producto?.nombre || "";
        productoHint.textContent = oferta.producto
          ? `Seleccionado: ${oferta.producto.nombre} (${oferta.producto.codigo})`
          : "";

        // Set radio
        const radio = formOferta.querySelector(`input[name="oferta-tipo"][value="${oferta.tipo}"]`);
        if (radio) radio.checked = true;
        toggleCampoValor(oferta.tipo);

        if (oferta.tipo === "porcentaje") ofertaValor.value = oferta.valor || "";
        ofertaNombre.value = oferta.nombre || "";
        ofertaFechaInicio.value = oferta.fecha_inicio || "";
        ofertaFechaFin.value = oferta.fecha_fin || "";

        // Set day checkboxes
        let dias = [];
        if (oferta.dias_semana) {
          try { dias = JSON.parse(oferta.dias_semana).map(String); } catch { dias = []; }
        }
        formOferta.querySelectorAll('input[name="dia"]').forEach((cb) => {
          cb.checked = dias.includes(cb.value);
        });
      } else {
        modalTitulo.textContent = "Nueva Oferta";
        toggleCampoValor("porcentaje");
      }

      modalOferta.classList.remove("oculto");
      productoSearch.focus();
    };

    const cerrarModal = () => {
      modalOferta?.classList.add("oculto");
      productoDropdown?.classList.add("oculto");
    };

    const toggleCampoValor = (tipo) => {
      if (campoValor) {
        campoValor.style.display = tipo === "porcentaje" ? "" : "none";
      }
    };

    // ── Búsqueda de producto en el modal ────────────────────────
    let dropdownTimer;
    const buscarProductos = (q) => {
      clearTimeout(dropdownTimer);
      if (!q || q.length < 2) {
        productoDropdown?.classList.add("oculto");
        return;
      }
      dropdownTimer = setTimeout(() => {
        const ql = q.toLowerCase();
        const matches = allProductos.filter(
          (p) =>
            p.nombre.toLowerCase().includes(ql) ||
            (p.codigo && p.codigo.toLowerCase().includes(ql)) ||
            (p.codigo_barras && p.codigo_barras.includes(q))
        ).slice(0, 8);

        if (!productoDropdown) return;
        productoDropdown.innerHTML = "";
        if (matches.length === 0) {
          productoDropdown.innerHTML = `<div class="oferta-dropdown-item oferta-dropdown-empty">Sin resultados</div>`;
          productoDropdown.classList.remove("oculto");
          return;
        }
        matches.forEach((p) => {
          const item = document.createElement("div");
          item.className = "oferta-dropdown-item";
          item.innerHTML = `<strong>${p.nombre}</strong> <small>${p.codigo || ""}</small>`;
          item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            productoIdHidden.value = p.id;
            productoSearch.value = p.nombre;
            productoHint.textContent = `Seleccionado: ${p.nombre} (${p.codigo || ""})`;
            productoDropdown.classList.add("oculto");
          });
          productoDropdown.appendChild(item);
        });
        productoDropdown.classList.remove("oculto");
      }, 200);
    };

    // ── Guardar oferta ───────────────────────────────────────────
    const guardarOferta = async (e) => {
      e.preventDefault();

      const productoId_ = productoIdHidden.value;
      if (!productoId_) {
        showToast("Seleccioná un producto.", "error");
        productoSearch.focus();
        return;
      }

      const tipo = formOferta.querySelector('input[name="oferta-tipo"]:checked')?.value;
      if (!tipo) {
        showToast("Seleccioná un tipo de oferta.", "error");
        return;
      }

      const dias = Array.from(formOferta.querySelectorAll('input[name="dia"]:checked'))
        .map((cb) => Number(cb.value));

      const payload = {
        id: ofertaId.value || undefined,
        ProductoId: productoId_,
        tipo,
        valor: tipo === "porcentaje" ? Number(ofertaValor.value) : null,
        nombre: ofertaNombre.value.trim() || null,
        dias_semana: dias,
        fecha_inicio: ofertaFechaInicio.value || null,
        fecha_fin:    ofertaFechaFin.value    || null,
        activa: true,
      };

      const btn = formOferta.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }

      try {
        const r = await window.electronAPI.invoke("guardar-oferta", payload);
        if (r?.success) {
          showToast("Oferta guardada correctamente.");
          cerrarModal();
          await loadOfertas();
        } else {
          showToast(r?.message || "Error al guardar.", "error");
        }
      } catch (err) {
        console.error(err);
        showToast("Error inesperado.", "error");
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Guardar Oferta"; }
      }
    };

    // ── Event Listeners ──────────────────────────────────────────
    btnNuevaOferta?.addEventListener("click", () => abrirModal());
    btnCerrarModal?.addEventListener("click", cerrarModal);
    btnCancelarOferta?.addEventListener("click", cerrarModal);
    formOferta?.addEventListener("submit", guardarOferta);

    // Tipo cambia → mostrar/ocultar campo valor
    formOferta?.querySelectorAll('input[name="oferta-tipo"]').forEach((radio) => {
      radio.addEventListener("change", () => toggleCampoValor(radio.value));
    });

    // Búsqueda de producto
    productoSearch?.addEventListener("input", (e) => buscarProductos(e.target.value));
    productoSearch?.addEventListener("blur", () => {
      setTimeout(() => productoDropdown?.classList.add("oculto"), 150);
    });

    // Acciones de tabla (event delegation)
    tablaBody?.addEventListener("click", async (e) => {
      const btnEditar   = e.target.closest(".btn-editar-oferta");
      const btnToggle   = e.target.closest(".btn-toggle-oferta");
      const btnEliminar = e.target.closest(".btn-eliminar-oferta");

      if (btnEditar) {
        const id = btnEditar.dataset.id;
        const oferta = allOfertas.find((o) => o.id === id);
        if (oferta) abrirModal(oferta);
        return;
      }

      if (btnToggle) {
        const id = btnToggle.dataset.id;
        btnToggle.disabled = true;
        try {
          const r = await window.electronAPI.invoke("toggle-oferta-activa", id);
          if (r?.success) {
            await loadOfertas();
          } else {
            showToast(r?.message || "Error.", "error");
          }
        } finally {
          btnToggle.disabled = false;
        }
        return;
      }

      if (btnEliminar) {
        const id = btnEliminar.dataset.id;
        const oferta = allOfertas.find((o) => o.id === id);
        const ok = window.confirm(
          `¿Eliminás la oferta "${oferta?.nombre || oferta?.tipo || ""}" de ${oferta?.producto?.nombre || "este producto"}?`
        );
        if (!ok) return;
        try {
          const r = await window.electronAPI.invoke("eliminar-oferta", id);
          if (r?.success) {
            showToast("Oferta eliminada.");
            await loadOfertas();
          } else {
            showToast(r?.message || "Error.", "error");
          }
        } catch (err) {
          console.error(err);
          showToast("Error inesperado.", "error");
        }
        return;
      }
    });

    // ESC cierra modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") cerrarModal();
    });

    // ── Init ──────────────────────────────────────────────────────
    Promise.all([loadOfertas(), loadProductos()]);
  };

  document.addEventListener("app-ready", boot, { once: true });
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(() => { if (!__INIT_DONE__) boot(); }, 500);
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(() => { if (!__INIT_DONE__) boot(); }, 500);
    });
  }
})();
