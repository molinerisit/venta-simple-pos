// renderer/js/mp_transactions.js

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizePaymentMethod(tx) {
  const desc    = String(tx.description || tx.external_reference || '').toUpperCase();
  const methodId = String(tx.payment_method_id || '').toLowerCase();
  const typeId   = String(tx.payment_type_id   || '').toLowerCase();

  if (desc.includes('QR') || (methodId === 'account_money' && desc.includes('QR'))) {
    return { label: 'QR', type: 'qr' };
  }
  if (typeId === 'bank_transfer') {
    return { label: 'Transferencia', type: 'transfer' };
  }
  if (typeId === 'credit_card' || typeId === 'debit_card') {
    return { label: 'Tarjeta', type: 'card' };
  }
  if (methodId === 'account_money') {
    return { label: 'Dinero en cuenta', type: 'account_money' };
  }
  return { label: 'Otro', type: 'other' };
}

function cleanPaymentReference(rawDescription) {
  if (!rawDescription) return 'Sin referencia';
  const clean = rawDescription.replace(/^\([^)]*\)\s*/i, '').trim();
  if (!clean || /c[oó]digo\s*qr/i.test(clean)) return 'Pago por QR';
  return clean.replace(/^Producto\s+de\s+/i, '') || 'Sin referencia';
}

function normalizePayer(tx) {
  const payer = tx.payer || {};

  if (payer.first_name && String(payer.first_name).trim()) {
    const displayName = [payer.first_name, payer.last_name]
      .filter(Boolean).map(s => String(s).trim()).join(' ');
    return { displayName, email: payer.email || null, source: 'mp_name', confidence: 'high' };
  }

  if (payer.email) {
    const prefix = payer.email.split('@')[0];
    const cleaned = prefix
      .replace(/[._\-]/g, ' ')
      .replace(/\s+\d+$/, '')
      .split(' ')
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .trim();
    return {
      displayName: cleaned || 'Cliente',
      email: payer.email,
      source: 'email_prefix',
      confidence: 'medium',
    };
  }

  return { displayName: 'Cliente sin identificar', email: null, source: 'unknown', confidence: 'low' };
}

const STATUS_CONFIG = {
  approved:     { label: 'Aprobado',    cls: 'status-approved',     icon: 'check'  },
  authorized:   { label: 'Autorizado',  cls: 'status-authorized',   icon: 'clock'  },
  pending:      { label: 'Pendiente',   cls: 'status-pending',      icon: 'clock'  },
  in_process:   { label: 'En proceso',  cls: 'status-in-process',   icon: 'clock'  },
  rejected:     { label: 'Rechazado',   cls: 'status-rejected',     icon: 'x'      },
  cancelled:    { label: 'Cancelado',   cls: 'status-cancelled',    icon: 'x'      },
  charged_back: { label: 'Contracargo', cls: 'status-charged-back', icon: 'x'      },
  refunded:     { label: 'Devuelto',    cls: 'status-refunded',     icon: 'return' },
};

const STATUS_ICONS = {
  check:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  clock:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  x:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  return: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>`,
};

function renderStatusBadge(rawStatus) {
  const cfg = STATUS_CONFIG[rawStatus] || { label: rawStatus || 'Desconocido', cls: 'status-unknown', icon: 'clock' };
  return `<span class="status-badge ${cfg.cls}">${STATUS_ICONS[cfg.icon] || ''}${cfg.label}</span>`;
}

function renderMethodBadge(method) {
  return `<span class="method-badge method-${method.type}">${method.label}</span>`;
}

function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

document.addEventListener('app-ready', () => {
  const tableBody    = document.getElementById('transactions-body');
  const btnRefresh   = document.getElementById('btn-refresh');
  const btnApply     = document.getElementById('btn-apply-filters');
  const btnSync      = document.getElementById('btn-sync-clientes');
  const filterStatus = document.getElementById('filter-status');
  const filterMedio  = document.getElementById('filter-medio');
  const filterSearch = document.getElementById('filter-search');
  const connBadge    = document.getElementById('conn-badge');
  const connLabel    = document.getElementById('conn-badge-label');
  const rangeTabsEl  = document.getElementById('range-tabs');

  const mpModal       = document.getElementById('mp-cliente-modal');
  const mpForm        = document.getElementById('mp-cliente-form');
  const btnCancelarMp = document.getElementById('btn-cancelar-mp-modal');
  const btnGuardarMp  = document.getElementById('btn-guardar-mp-cliente');

  let allTransactions = [];
  let knownPayers     = { byPayerId: {}, byEmail: {} };
  let activeRange     = 'all';

  // Toast
  const toast = document.getElementById('toast-notification');
  let toastTimer;
  const showToast = (msg, type = 'error') => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = `toast ${type} visible`;
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
  };

  // Connection badge
  const setConnBadge = (state) => {
    if (!connBadge) return;
    connBadge.className = `conn-badge conn-badge--${state}`;
    const labels = {
      connected:    'Conectado',
      disconnected: 'Sin conexión',
      error:        'Error de sincronización',
      unknown:      'Verificando',
    };
    if (connLabel) connLabel.textContent = labels[state] || state;
  };

  // Summary cards
  const updateSummary = (txs) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const totalHoy = txs
      .filter(tx => tx.status === 'approved' && new Date(tx.date_created) >= today)
      .reduce((s, tx) => s + (tx.transaction_amount || 0), 0);

    const aprobados  = txs.filter(tx => tx.status === 'approved').length;
    const pendientes = txs.filter(tx => ['pending', 'authorized', 'in_process'].includes(tx.status)).length;
    const rechazados = txs.filter(tx => ['rejected', 'cancelled', 'charged_back'].includes(tx.status)).length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('stat-total-hoy',  totalHoy.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }));
    set('stat-aprobados',  aprobados);
    set('stat-pendientes', pendientes);
    set('stat-rechazados', rechazados);
    set('stat-ultima-sync', new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }));
  };

  // Range tabs
  rangeTabsEl?.addEventListener('click', (e) => {
    const tab = e.target.closest('.mp-range-tab');
    if (!tab) return;
    rangeTabsEl.querySelectorAll('.mp-range-tab').forEach(t => t.classList.remove('mp-range-tab--active'));
    tab.classList.add('mp-range-tab--active');
    activeRange = tab.dataset.value;
  });

  // Load known payers (for "Ver cliente" vs "Crear cliente" logic)
  const loadKnownPayers = async () => {
    try {
      const result = await window.electronAPI.invoke('get-mp-known-payers');
      if (result) knownPayers = result;
    } catch (_) { /* non-critical */ }
  };

  // Build date range for API
  const buildDateFilter = () => {
    const now = new Date();
    switch (activeRange) {
      case 'today':
        return { dateFrom: new Date(now.setHours(0, 0, 0, 0)).toISOString(), dateTo: null };
      case 'yesterday': {
        const s = new Date(); s.setDate(s.getDate() - 1); s.setHours(0, 0, 0, 0);
        const e = new Date(); e.setDate(e.getDate() - 1); e.setHours(23, 59, 59, 999);
        return { dateFrom: s.toISOString(), dateTo: e.toISOString() };
      }
      case 'last7days':
        return { dateFrom: new Date(Date.now() - 7  * 86400000).toISOString(), dateTo: null };
      case 'last30days':
        return { dateFrom: new Date(Date.now() - 30 * 86400000).toISOString(), dateTo: null };
      default:
        return { dateFrom: null, dateTo: null };
    }
  };

  // Client-side filters (after API load)
  const applyClientFilters = (txs) => {
    const medioFilter = filterMedio?.value  || '';
    const searchTerm  = (filterSearch?.value || '').toLowerCase().trim();

    return txs.filter(tx => {
      if (medioFilter) {
        if (normalizePaymentMethod(tx).type !== medioFilter) return false;
      }
      if (searchTerm) {
        const payer    = normalizePayer(tx);
        const ref      = cleanPaymentReference(tx.description);
        const haystack = [payer.displayName, payer.email || '', ref, String(tx.transaction_amount || '')]
          .join(' ').toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }
      return true;
    });
  };

  // Load from MP API
  const loadTransactions = async () => {
    const { dateFrom, dateTo } = buildDateFilter();
    const filters = { dateFrom, dateTo, status: filterStatus?.value || '' };

    tableBody.innerHTML = `<tr><td colspan="7" class="table-empty">Cargando...</td></tr>`;
    if (btnRefresh) btnRefresh.disabled = true;
    if (btnApply)   btnApply.disabled   = true;

    try {
      const result = await window.electronAPI.invoke('get-mp-transactions', filters);

      if (!result.success) {
        setConnBadge('error');
        tableBody.innerHTML = `<tr><td colspan="7" class="table-empty" style="color:var(--danger-color)">${result.message}</td></tr>`;
        showToast(result.message);
        return;
      }

      setConnBadge('connected');
      allTransactions = result.data || [];
      updateSummary(allTransactions);
      await loadKnownPayers();
      renderTable(applyClientFilters(allTransactions));
    } catch (err) {
      setConnBadge('error');
      tableBody.innerHTML = `<tr><td colspan="7" class="table-empty" style="color:var(--danger-color)">Error de comunicación con el sistema.</td></tr>`;
      showToast('Error de comunicación con el sistema.');
    } finally {
      if (btnRefresh) btnRefresh.disabled = false;
      if (btnApply)   btnApply.disabled   = false;
    }
  };

  // Render table rows
  const renderTable = (txs) => {
    if (!txs || txs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="table-empty">No se encontraron transacciones.</td></tr>`;
      return;
    }

    tableBody.innerHTML = txs.map(tx => {
      const date    = tx.date_created ? new Date(tx.date_created) : null;
      const dateStr = date ? date.toLocaleDateString('es-AR')                              : '—';
      const timeStr = date ? date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

      const payer  = normalizePayer(tx);
      const method = normalizePaymentMethod(tx);
      const ref    = cleanPaymentReference(tx.description);
      const amount = (tx.transaction_amount ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

      let payerHtml;
      if (payer.confidence === 'low') {
        payerHtml = `<span class="payer-name">${payer.displayName}</span><span class="badge-unidentified">Sin identificar</span>`;
      } else {
        payerHtml = `<div class="payer-name">${payer.displayName}</div>`;
        if (payer.email) payerHtml += `<div class="payer-email">${payer.email}</div>`;
      }

      const payerIdStr  = String(tx.payer?.id || '');
      const emailLower  = (payer.email || '').toLowerCase();
      const clienteId   = (payerIdStr && knownPayers.byPayerId[payerIdStr])
                       || (emailLower && knownPayers.byEmail[emailLower])
                       || null;

      const actionBtn = clienteId
        ? `<button class="btn-xs btn-xs--ghost" data-action="ver-cliente" data-cliente-id="${clienteId}">Ver cliente</button>`
        : `<button class="btn-xs btn-xs--primary" data-action="crear-cliente"
              data-payer-id="${escapeAttr(payerIdStr)}"
              data-payment-id="${escapeAttr(tx.id || '')}"
              data-name="${escapeAttr(payer.displayName)}"
              data-email="${escapeAttr(payer.email || '')}"
            >Crear cliente</button>`;

      const copyBtn = payer.email
        ? `<button class="btn-xs btn-xs--ghost" data-action="copiar-email" data-email="${escapeAttr(payer.email)}" title="Copiar email">Copiar email</button>`
        : '';

      return `
        <tr>
          <td>
            <div class="tx-date">${dateStr}</div>
            <div class="tx-date-time">${timeStr}</div>
          </td>
          <td>${payerHtml}</td>
          <td>${renderMethodBadge(method)}</td>
          <td><span class="tx-ref" title="${escapeAttr(ref)}">${ref}</span></td>
          <td class="text-right"><span class="tx-amount">${amount}</span></td>
          <td>${renderStatusBadge(tx.status)}</td>
          <td><div class="tx-actions">${actionBtn}${copyBtn}</div></td>
        </tr>
      `;
    }).join('');
  };

  // Action delegation
  tableBody?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.dataset.busy === '1') return;
    btn.dataset.busy = '1';
    try {
      switch (btn.dataset.action) {
        case 'crear-cliente':
          openMpModal({ payerId: btn.dataset.payerId, paymentId: btn.dataset.paymentId, name: btn.dataset.name, email: btn.dataset.email });
          break;
        case 'ver-cliente':
          showToast('Abrí la sección Clientes para ver el detalle del cliente.', 'info');
          break;
        case 'copiar-email':
          await navigator.clipboard.writeText(btn.dataset.email || '');
          showToast('Email copiado al portapapeles.', 'success');
          break;
      }
    } finally {
      btn.dataset.busy = '0';
    }
  });

  // MP Cliente Modal
  const openMpModal = ({ payerId, paymentId, name, email }) => {
    document.getElementById('mp-payer-id').value   = payerId    || '';
    document.getElementById('mp-payment-id').value = paymentId  || '';
    document.getElementById('mp-nombre').value     = name       || '';
    document.getElementById('mp-email').value      = email      || '';
    document.getElementById('mp-telefono').value   = '';
    document.getElementById('mp-dni').value        = '';
    document.getElementById('mp-descuento').value  = '0';
    mpModal?.classList.add('visible');
    document.getElementById('mp-nombre')?.focus();
  };

  const closeMpModal = () => mpModal?.classList.remove('visible');

  btnCancelarMp?.addEventListener('click', closeMpModal);
  mpModal?.addEventListener('click', (e) => { if (e.target === mpModal) closeMpModal(); });

  mpForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!btnGuardarMp) return;
    btnGuardarMp.disabled = true;

    const data = {
      mercadoPagoPayerId: document.getElementById('mp-payer-id').value  || null,
      nombre:    (document.getElementById('mp-nombre').value    || '').trim(),
      email:     (document.getElementById('mp-email').value     || '').trim()  || null,
      telefono:  (document.getElementById('mp-telefono').value  || '').trim()  || null,
      dni:       (document.getElementById('mp-dni').value       || '').replace(/\D/g, '') || null,
      descuento: parseFloat(document.getElementById('mp-descuento').value) || 0,
      origenCliente: 'mercado_pago',
    };

    try {
      const result = await window.electronAPI.invoke('guardar-cliente-desde-mp', data);
      if (result?.exists) {
        showToast('Este cliente ya existe en la base de datos.', 'info');
        closeMpModal();
      } else if (result?.success) {
        showToast('Cliente guardado correctamente.', 'success');
        closeMpModal();
        await loadKnownPayers();
        renderTable(applyClientFilters(allTransactions));
      } else {
        showToast(result?.message || 'Error al guardar el cliente.', 'error');
      }
    } catch (_) {
      showToast('Error al guardar el cliente.', 'error');
    } finally {
      btnGuardarMp.disabled = false;
    }
  });

  // Sync MP payers → Clientes (bulk)
  btnSync?.addEventListener('click', async () => {
    if (!allTransactions.length) {
      showToast('No hay transacciones cargadas para importar.', 'info');
      return;
    }
    const orig = btnSync.textContent;
    btnSync.disabled   = true;
    btnSync.textContent = 'Importando...';
    try {
      const result = await window.electronAPI.invoke('sync-mp-to-clientes', allTransactions);
      if (result?.success) {
        showToast(`Importación completada: ${result.created} nuevos, ${result.updated} actualizados.`, 'success');
        await loadKnownPayers();
        renderTable(applyClientFilters(allTransactions));
      } else {
        showToast(result?.message || 'Error al importar clientes.', 'error');
      }
    } catch (_) {
      showToast('Error al importar clientes.', 'error');
    } finally {
      btnSync.disabled   = false;
      btnSync.textContent = orig;
    }
  });

  // Filter event bindings
  btnRefresh?.addEventListener('click', loadTransactions);
  btnApply?.addEventListener('click', loadTransactions);
  filterSearch?.addEventListener('input', () => renderTable(applyClientFilters(allTransactions)));
  filterMedio?.addEventListener('change', () => renderTable(applyClientFilters(allTransactions)));

  // Init
  setConnBadge('unknown');
  loadTransactions();
});
