// renderer/js/lotes.js

document.addEventListener('app-ready', () => {
  const tbody      = document.getElementById('lotes-tbody');
  const searchInput = document.getElementById('lotes-search');
  const filterSel  = document.getElementById('lotes-filter');
  const btnNuevo   = document.getElementById('btn-nuevo-lote');
  const toast      = document.getElementById('toast-notification');

  // Modal
  const modal        = document.getElementById('lote-modal');
  const modalTitulo  = document.getElementById('lote-modal-titulo');
  const loteId       = document.getElementById('lote-id');
  const loteProducto = document.getElementById('lote-producto');
  const loteNumero   = document.getElementById('lote-numero');
  const loteCantidad = document.getElementById('lote-cantidad');
  const loteIngreso  = document.getElementById('lote-ingreso');
  const loteVenc     = document.getElementById('lote-vencimiento');
  const loteNotas    = document.getElementById('lote-notas');
  const btnGuardar   = document.getElementById('lote-modal-guardar');
  const btnCancelar  = document.getElementById('lote-modal-cancelar');

  let allLotes = [];
  let allProductos = [];
  let toastTimer;

  // ── Helpers ─────────────────────────────────────────
  const showToast = (msg, type = 'success') => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = `toast ${type} visible`;
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2800);
  };

  const ipc = (channel, data) => window.electronAPI.invoke(channel, data);

  const today = () => new Date().toISOString().slice(0, 10);

  /** Días hasta el vencimiento (negativo = ya venció) */
  const diasParaVencer = (fechaStr) => {
    const venc = new Date(fechaStr + 'T00:00:00');
    const hoy  = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.round((venc - hoy) / 86400000);
  };

  const estadoBadge = (dias) => {
    if (dias < 0)  return { cls: 'vencido',  label: 'Vencido' };
    if (dias === 0) return { cls: 'hoy',     label: 'Vence hoy' };
    if (dias <= 30) return { cls: 'proximo', label: `${dias}d` };
    return               { cls: 'ok',       label: `${dias}d` };
  };

  const fmt = (dateStr) => {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  };

  // ── Cargar datos ─────────────────────────────────────
  const cargarProductos = async () => {
    allProductos = await ipc('get-productos');
    loteProducto.innerHTML = allProductos
      .map((p) => `<option value="${p.id}">${p.nombre}${p.codigo_barras ? ' — ' + p.codigo_barras : ''}</option>`)
      .join('');
  };

  const cargarLotes = async () => {
    allLotes = await ipc('get-lotes');
    renderTabla();
  };

  // ── Render tabla ──────────────────────────────────────
  const renderTabla = () => {
    const q = (searchInput.value || '').toLowerCase();
    const f = filterSel.value;

    const filtrados = allLotes.filter((l) => {
      // Búsqueda por texto
      const prod = l.producto;
      if (q && prod) {
        const match =
          prod.nombre?.toLowerCase().includes(q) ||
          prod.codigo_barras?.toLowerCase().includes(q) ||
          prod.codigo?.toLowerCase().includes(q) ||
          (l.numero_lote || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      // Filtro estado
      const dias = diasParaVencer(l.fecha_vencimiento);
      if (f === 'vigentes' && dias < 0) return false;
      if (f === 'proximos' && (dias < 0 || dias > 30)) return false;
      if (f === 'vencidos' && dias >= 0) return false;
      return true;
    });

    if (!filtrados.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:2rem;">Sin lotes.</td></tr>';
      return;
    }

    const frag = document.createDocumentFragment();
    filtrados.forEach((l) => {
      const dias  = diasParaVencer(l.fecha_vencimiento);
      const badge = estadoBadge(dias);
      const prod  = l.producto;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${prod ? prod.nombre : '—'}</td>
        <td>${l.numero_lote || '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>${l.cantidad}</td>
        <td>${fmt(l.fecha_ingreso)}</td>
        <td>${fmt(l.fecha_vencimiento)}</td>
        <td class="col-estado"><span class="badge-venc ${badge.cls}">${badge.label}</span></td>
        <td style="text-align:right;">
          <button class="btn btn-sm btn-info"   data-action="editar"   data-id="${l.id}">Editar</button>
          <button class="btn btn-sm btn-danger"  data-action="eliminar" data-id="${l.id}">Eliminar</button>
        </td>`;
      frag.appendChild(tr);
    });
    tbody.innerHTML = '';
    tbody.appendChild(frag);
  };

  // ── Modal helpers ─────────────────────────────────────
  const abrirModal = (titulo, datos = {}) => {
    modalTitulo.textContent = titulo;
    loteId.value       = datos.id || '';
    loteProducto.value = datos.ProductoId || '';
    loteNumero.value   = datos.numero_lote || '';
    loteCantidad.value = datos.cantidad ?? '';
    loteIngreso.value  = datos.fecha_ingreso || today();
    loteVenc.value     = datos.fecha_vencimiento || '';
    loteNotas.value    = datos.notas || '';
    modal.classList.add('visible');
    loteProducto.focus();
  };

  const cerrarModal = () => modal.classList.remove('visible');

  // ── Eventos ───────────────────────────────────────────
  searchInput.addEventListener('input', renderTabla);
  filterSel.addEventListener('change', renderTabla);

  btnNuevo.addEventListener('click', () => abrirModal('Nuevo Lote'));
  btnCancelar.addEventListener('click', cerrarModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModal(); });

  // Delegación: editar / eliminar en tabla
  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;

    if (action === 'editar') {
      const lote = allLotes.find((l) => l.id === id);
      if (lote) abrirModal('Editar Lote', lote);
      return;
    }

    if (action === 'eliminar') {
      if (!confirm('¿Eliminar este lote? Esta acción no se puede deshacer.')) return;
      const res = await ipc('eliminar-lote', id);
      if (res.success) {
        showToast('Lote eliminado.');
        await cargarLotes();
      } else {
        showToast(res.message || 'Error al eliminar.', 'error');
      }
    }
  });

  // Guardar (crear o actualizar)
  btnGuardar.addEventListener('click', async () => {
    if (!loteProducto.value) { showToast('Seleccioná un producto.', 'error'); return; }
    if (!loteVenc.value)     { showToast('Ingresá la fecha de vencimiento.', 'error'); return; }

    const payload = {
      id:               loteId.value || undefined,
      ProductoId:       loteProducto.value,
      numero_lote:      loteNumero.value.trim(),
      cantidad:         parseFloat(loteCantidad.value) || 0,
      fecha_ingreso:    loteIngreso.value || today(),
      fecha_vencimiento: loteVenc.value,
      notas:            loteNotas.value.trim(),
    };

    const channel = payload.id ? 'actualizar-lote' : 'crear-lote';
    const res = await ipc(channel, payload);

    if (res.success) {
      showToast(payload.id ? 'Lote actualizado.' : 'Lote creado.');
      cerrarModal();
      await cargarLotes();
    } else {
      showToast(res.message || 'Error al guardar.', 'error');
    }
  });

  // ── Inicio ────────────────────────────────────────────
  (async () => {
    await cargarProductos();
    await cargarLotes();
  })();
});
