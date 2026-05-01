// renderer/js/mp_transactions.js

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizePaymentMethod(tx) {
  const desc     = String(tx.description || tx.external_reference || '').toUpperCase();
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

// ─── Status & method config ───────────────────────────────────────────────────

const STATUS_CONFIG = {
  approved:     { label: 'Aprobado',    cls: 'status-approved',      icon: 'check'  },
  authorized:   { label: 'Autorizado',  cls: 'status-authorized',    icon: 'clock'  },
  pending:      { label: 'Pendiente',   cls: 'status-pending',       icon: 'clock'  },
  in_process:   { label: 'En proceso',  cls: 'status-in-process',    icon: 'clock'  },
  rejected:     { label: 'Rechazado',   cls: 'status-rejected',      icon: 'x'      },
  cancelled:    { label: 'Cancelado',   cls: 'status-cancelled',     icon: 'x'      },
  charged_back: { label: 'Contracargo', cls: 'status-charged-back',  icon: 'x'      },
  refunded:     { label: 'Devuelto',    cls: 'status-refunded',      icon: 'return' },
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

// ─── Main ─────────────────────────────────────────────────────────────────────

document.addEventListener('app-ready', () => {
  const tableBody        = document.getElementById('transactions-body');
  const btnRefresh       = document.getElementById('btn-refresh');
  const btnApply         = document.getElementById('btn-apply-filters');
  const btnSync          = document.getElementById('btn-sync-clientes');
  const filterStatus     = document.getElementById('filter-status');
  const filterMedio      = document.getElementById('filter-medio');
  const filterSearch     = document.getElementById('filter-search');
  const connBadge        = document.getElementById('conn-badge');
  const connLabel        = document.getElementById('conn-badge-label');
  const rangeTabsEl      = document.getElementById('range-tabs');
  const toggleAutoCreate = document.getElementById('toggle-auto-create');
  const detailModal      = document.getElementById('tx-detail-modal');
  const btnCloseDetail   = document.getElementById('btn-close-detail');

  let allTransactions    = [];
  let knownPayers        = { byPayerId: {}, byEmail: {} };
  let linkedPayments     = {};   // { [mpPaymentId]: { ventaId, confidence, clienteId } }
  let currentTx          = null; // transaction currently shown in detail modal
  let activeRange        = 'all';
  let activeDropdown     = null;
  let autoCreateClientes = localStorage.getItem('mp_auto_create') !== 'false';

  if (toggleAutoCreate) toggleAutoCreate.checked = autoCreateClientes;

  // ── Toast ─────────────────────────────────────────────────────────────────────
  const toast = document.getElementById('toast-notification');
  let toastTimer;
  const showToast = (msg, type = 'error') => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = `toast ${type} visible`;
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
  };

  // ── Connection badge ──────────────────────────────────────────────────────────
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

  // ── Summary cards ─────────────────────────────────────────────────────────────
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

  // ── Range tabs ────────────────────────────────────────────────────────────────
  rangeTabsEl?.addEventListener('click', (e) => {
    const tab = e.target.closest('.mp-range-tab');
    if (!tab) return;
    rangeTabsEl.querySelectorAll('.mp-range-tab').forEach(t => t.classList.remove('mp-range-tab--active'));
    tab.classList.add('mp-range-tab--active');
    activeRange = tab.dataset.value;
  });

  // ── Known payers lookup ───────────────────────────────────────────────────────
  const loadKnownPayers = async () => {
    try {
      const result = await window.electronAPI.invoke('get-mp-known-payers');
      if (result) knownPayers = result;
    } catch (_) {}
  };

  // ── Linked payments lookup ────────────────────────────────────────────────────
  const loadLinkedPayments = async () => {
    try {
      const result = await window.electronAPI.invoke('get-linked-mp-payments');
      if (result) linkedPayments = result;
    } catch (_) {}
  };

  // ── Date range filter ─────────────────────────────────────────────────────────
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

  // ── Client-side filters ───────────────────────────────────────────────────────
  const applyClientFilters = (txs) => {
    const medioFilter = filterMedio?.value  || '';
    const searchTerm  = (filterSearch?.value || '').toLowerCase().trim();

    return txs.filter(tx => {
      if (medioFilter && normalizePaymentMethod(tx).type !== medioFilter) return false;
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

  // ── Auto-create clientes ──────────────────────────────────────────────────────
  const autoSyncIfEnabled = async () => {
    if (!autoCreateClientes || !allTransactions.length) return;
    try {
      const result = await window.electronAPI.invoke('sync-mp-to-clientes', allTransactions);
      if (result?.success && (result.created > 0 || result.updated > 0)) {
        const parts = [];
        if (result.created > 0) parts.push(`${result.created} nuevo${result.created > 1 ? 's' : ''}`);
        if (result.updated > 0) parts.push(`${result.updated} actualizado${result.updated > 1 ? 's' : ''}`);
        showToast(`Clientes: ${parts.join(', ')}.`, 'success');
        await loadKnownPayers();
      }
    } catch (_) {}
  };

  // ── Load transactions from MP API ─────────────────────────────────────────────
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
        tableBody.innerHTML = `<tr><td colspan="7" class="table-empty table-empty--error">${escapeHtml(result.message)}</td></tr>`;
        showToast(result.message);
        return;
      }

      setConnBadge('connected');
      allTransactions = result.data || [];
      updateSummary(allTransactions);
      await loadKnownPayers();
      await loadLinkedPayments();
      await autoSyncIfEnabled();
      renderTable(applyClientFilters(allTransactions));
    } catch (_) {
      setConnBadge('error');
      tableBody.innerHTML = `<tr><td colspan="7" class="table-empty table-empty--error">Error de comunicación con el sistema.</td></tr>`;
      showToast('Error de comunicación con el sistema.');
    } finally {
      if (btnRefresh) btnRefresh.disabled = false;
      if (btnApply)   btnApply.disabled   = false;
    }
  };

  // ── Render table ──────────────────────────────────────────────────────────────
  const renderTable = (txs) => {
    if (!txs || txs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="table-empty">No se encontraron transacciones.</td></tr>`;
      return;
    }

    tableBody.innerHTML = txs.map(tx => {
      const date    = tx.date_created ? new Date(tx.date_created) : null;
      const dateStr = date ? date.toLocaleDateString('es-AR') : '—';
      const timeStr = date ? date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '';

      const payer  = normalizePayer(tx);
      const method = normalizePaymentMethod(tx);
      const ref    = cleanPaymentReference(tx.description);
      const amount = (tx.transaction_amount ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

      const payerIdStr   = String(tx.payer?.id || '');
      const emailLower   = (payer.email || '').toLowerCase();
      const clienteId    = (payerIdStr && knownPayers.byPayerId[payerIdStr])
                        || (emailLower && knownPayers.byEmail[emailLower])
                        || null;
      const paymentIdStr = String(tx.id || '');
      const linked       = linkedPayments[paymentIdStr];

      // Row link indicator
      let dotClass, dotTitle;
      if (linked && linked.clienteId) {
        dotClass = 'tx-link-dot--linked';
        dotTitle  = 'Cliente y venta vinculada';
      } else if (clienteId) {
        dotClass = 'tx-link-dot--partial';
        dotTitle  = 'Cliente vinculado, venta pendiente';
      } else {
        dotClass = 'tx-link-dot--none';
        dotTitle  = 'Sin datos suficientes';
      }

      // Payer cell
      let payerHtml;
      if (payer.confidence === 'low') {
        payerHtml = `
          <div class="payer-name payer-name--muted">Cliente sin identificar</div>
          <div class="payer-email">sin datos</div>`;
      } else {
        const clientBadge = clienteId
          ? `<span class="client-status client-status--ok">● Registrado</span>`
          : `<span class="client-status client-status--new">● Nuevo</span>`;
        payerHtml = `
          <div class="payer-name">${escapeHtml(payer.displayName)}</div>
          ${payer.email ? `<div class="payer-email">${escapeHtml(payer.email)}</div>` : ''}
          ${clientBadge}`;
      }

      // ⋯ Actions menu
      const menuItems = [];
      if (clienteId) {
        menuItems.push(`<button class="tx-menu-item" data-action="ver-cliente" data-cliente-id="${escapeAttr(clienteId)}">Ver cliente</button>`);
      } else if (payer.confidence !== 'low') {
        menuItems.push(`<button class="tx-menu-item" data-action="vincular-cliente" data-payer-id="${escapeAttr(payerIdStr)}" data-payment-id="${escapeAttr(paymentIdStr)}" data-name="${escapeAttr(payer.displayName)}" data-email="${escapeAttr(payer.email || '')}">Vincular cliente</button>`);
      }
      if (payer.email) {
        menuItems.push(`<button class="tx-menu-item" data-action="copiar-email" data-email="${escapeAttr(payer.email)}">Copiar email</button>`);
      }

      const actionsHtml = menuItems.length > 0
        ? `<div class="tx-actions-wrap">
            <button class="btn-dots" data-action="open-menu" title="Acciones">
              <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>
            </button>
            <div class="tx-dropdown hidden">${menuItems.join('')}</div>
           </div>`
        : `<span class="tx-no-actions">—</span>`;

      return `
        <tr class="tx-row" data-tx-id="${escapeAttr(paymentIdStr)}">
          <td>
            <div class="tx-date">${dateStr}</div>
            <div class="tx-date-time">${timeStr}</div>
          </td>
          <td>${payerHtml}</td>
          <td>${renderMethodBadge(method)}</td>
          <td><span class="tx-ref" title="${escapeAttr(ref)}">${escapeHtml(ref)}</span></td>
          <td class="text-right"><span class="tx-amount">${amount}</span></td>
          <td>${renderStatusBadge(tx.status)}</td>
          <td style="white-space:nowrap;">
            <span class="tx-link-dot ${dotClass}" title="${escapeAttr(dotTitle)}"></span>
            ${actionsHtml}
          </td>
        </tr>
      `;
    }).join('');
  };

  // ── Dropdown logic ────────────────────────────────────────────────────────────
  const closeAllDropdowns = () => {
    if (activeDropdown) {
      activeDropdown.classList.add('hidden');
      activeDropdown = null;
    }
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tx-actions-wrap')) closeAllDropdowns();
  });

  // ── Table click delegation ────────────────────────────────────────────────────
  tableBody?.addEventListener('click', async (e) => {
    // Open ⋯ dropdown
    const dotsBtn = e.target.closest('[data-action="open-menu"]');
    if (dotsBtn) {
      e.stopPropagation();
      const wrap = dotsBtn.closest('.tx-actions-wrap');
      const menu = wrap?.querySelector('.tx-dropdown');
      if (!menu) return;
      if (activeDropdown && activeDropdown !== menu) closeAllDropdowns();
      const opening = menu.classList.contains('hidden');
      menu.classList.toggle('hidden');
      activeDropdown = opening ? menu : null;
      return;
    }

    // Menu item actions
    const menuBtn = e.target.closest('.tx-menu-item[data-action]');
    if (menuBtn) {
      closeAllDropdowns();
      if (menuBtn.dataset.busy === '1') return;
      menuBtn.dataset.busy = '1';
      try {
        switch (menuBtn.dataset.action) {
          case 'ver-cliente':
            showToast('Abrí la sección Clientes para ver el detalle del cliente.', 'info');
            break;
          case 'copiar-email':
            await navigator.clipboard.writeText(menuBtn.dataset.email || '');
            showToast('Email copiado al portapapeles.', 'success');
            break;
          case 'vincular-cliente':
            showToast('Usá la sección Clientes para vincular manualmente.', 'info');
            break;
        }
      } finally {
        menuBtn.dataset.busy = '0';
      }
      return;
    }

    // Row click → detail modal
    const row = e.target.closest('tr.tx-row');
    if (row && !e.target.closest('.tx-actions-wrap')) {
      const txId = row.dataset.txId;
      if (txId) {
        const tx = allTransactions.find(t => String(t.id) === txId);
        if (tx) openDetailModal(tx);
      }
    }
  });

  // ── Transaction detail modal ──────────────────────────────────────────────────
  const openDetailModal = async (tx) => {
    if (!detailModal) return;
    currentTx = tx;

    const payer  = normalizePayer(tx);
    const method = normalizePaymentMethod(tx);
    const ref    = cleanPaymentReference(tx.description);
    const date   = tx.date_created ? new Date(tx.date_created) : null;
    const amount = (tx.transaction_amount ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

    const payerIdStr = String(tx.payer?.id || '');
    const emailLower = (payer.email || '').toLowerCase();
    const clienteId  = (payerIdStr && knownPayers.byPayerId[payerIdStr])
                    || (emailLower && knownPayers.byEmail[emailLower])
                    || null;

    const set    = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const show   = (id, vis) => { const el = document.getElementById(id); if (el) el.style.display = vis ? '' : 'none'; };

    set('detail-status-badge', renderStatusBadge(tx.status));
    setTxt('detail-payer-name', payer.displayName);
    setTxt('detail-amount', amount);
    setTxt('detail-date', date
      ? date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—');
    set('detail-method', renderMethodBadge(method));
    setTxt('detail-ref', ref);
    setTxt('detail-email', payer.email || '—');
    setTxt('detail-payment-id', String(tx.id || '—'));

    // Approval date
    const dateApproved = tx.date_approved ? new Date(tx.date_approved) : null;
    if (dateApproved) {
      setTxt('detail-date-approved', dateApproved.toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }));
      show('detail-row-date-approved', true);
    } else {
      show('detail-row-date-approved', false);
    }

    // Net received amount
    const netAmount = tx.net_received_amount ?? null;
    if (netAmount != null) {
      setTxt('detail-net-amount', netAmount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }));
      show('detail-row-net-amount', true);
    } else {
      show('detail-row-net-amount', false);
    }

    // Banco / emisor
    const banco = tx.card?.issuer?.name || null;
    if (banco) {
      setTxt('detail-banco', banco);
      show('detail-row-banco', true);
    } else {
      show('detail-row-banco', false);
    }

    // Client status
    let clientHtml;
    if (payer.confidence === 'low') {
      clientHtml = '<span class="badge-unidentified">Sin identificar</span>';
    } else {
      clientHtml = clienteId
        ? '<span class="client-status client-status--ok">● Cliente registrado</span>'
        : '<span class="client-status client-status--new">● Nuevo cliente</span>';
    }
    set('detail-client-status', clientHtml);

    // Cuotas
    if (tx.installments && tx.installments > 1) {
      setTxt('detail-installments', `${tx.installments} cuotas`);
      show('detail-row-installments', true);
    } else {
      show('detail-row-installments', false);
    }

    // Tarjeta (últimos 4 dígitos)
    const cardLast4 = tx.card?.last_four_digits;
    if (cardLast4) {
      const brand = tx.payment_method_id ? ` · ${tx.payment_method_id.toUpperCase()}` : '';
      setTxt('detail-card', `**** ${cardLast4}${brand}`);
      show('detail-row-card', true);
    } else {
      show('detail-row-card', false);
    }

    // Comisión MP
    const fees  = Array.isArray(tx.fee_details) ? tx.fee_details : [];
    const mpFee = fees.find(f => f.type === 'mercadopago_fee');
    if (mpFee?.amount) {
      setTxt('detail-fee', Math.abs(mpFee.amount).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' }));
      show('detail-row-fee', true);
    } else {
      show('detail-row-fee', false);
    }

    // Identificación (DNI/CUIT)
    const ident = tx.payer?.identification;
    if (ident?.type && ident?.number) {
      setTxt('detail-identification', `${ident.type}: ${ident.number}`);
      show('detail-row-identification', true);
    } else {
      show('detail-row-identification', false);
    }

    // Venta section
    const linked = linkedPayments[String(tx.id || '')];
    renderVentaSection(tx, linked);

    // Action buttons visibility
    show('detail-btn-ver-cliente',    !!clienteId);
    show('detail-btn-vincular-venta', !linked);
    show('detail-btn-desvincular',    !!linked);

    detailModal.classList.add('visible');
  };

  // ── Render venta section (static state) ──────────────────────────────────────
  const renderVentaSection = (_tx, linked) => {
    const el = document.getElementById('detail-venta-section');
    if (!el) return;

    if (!linked) {
      el.innerHTML = `<div class="venta-link-status venta-link-status--none">
        <span class="venta-link-icon">○</span>
        <div class="venta-link-info">
          <div class="venta-link-title">Sin venta vinculada</div>
          <div class="venta-link-meta">Usá "Vincular venta" para asociar este pago a una venta local.</div>
        </div>
      </div>`;
      return;
    }

    const confLabel  = linked.confidence != null ? `${linked.confidence}% de confianza` : '';
    const confClass  = (linked.confidence ?? 0) >= 80 ? 'venta-link-status--linked' : 'venta-link-status--pending';
    el.innerHTML = `<div class="venta-link-status ${confClass}">
      <span class="venta-link-icon">✓</span>
      <div class="venta-link-info">
        <div class="venta-link-title">Venta vinculada</div>
        <div class="venta-link-meta">ID ${escapeHtml(String(linked.ventaId))}${confLabel ? ` · ${confLabel}` : ''}</div>
      </div>
    </div>`;
  };

  // ── Render venta candidates (matching panel) ──────────────────────────────────
  const renderVentaCandidates = (_tx, matchResult) => {
    const el = document.getElementById('detail-venta-section');
    if (!el) return;

    const { candidates = [] } = matchResult;
    const autoLink = matchResult.autoLink || null;

    if (!candidates.length) {
      el.innerHTML = `<div class="venta-link-status venta-link-status--none">
        <span class="venta-link-icon">○</span>
        <div class="venta-link-info">
          <div class="venta-link-title">Sin ventas coincidentes</div>
          <div class="venta-link-meta">No se encontraron ventas locales con monto y horario cercanos.</div>
        </div>
      </div>`;
      return;
    }

    const fmtCurrency = v => (v || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    const fmtDate     = v => v ? new Date(v).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

    const autoNote = autoLink
      ? `<div style="font-size:11px;color:var(--success-color,#22c55e);font-weight:600;margin-bottom:6px;">⚡ Coincidencia automática sugerida (score ${autoLink.score})</div>`
      : '';

    const candidatesHtml = candidates.map(c => {
      const scoreClass = c.score >= 80 ? 'venta-candidate__score--high' : 'venta-candidate__score--mid';
      const productos  = c.productos && c.productos.length ? c.productos.join(', ') : '—';
      return `<div class="venta-candidate">
        <span class="venta-candidate__score ${scoreClass}">${c.score}</span>
        <div class="venta-candidate__info">
          <div class="venta-candidate__total">${fmtCurrency(c.total)}</div>
          <div class="venta-candidate__meta">${fmtDate(c.createdAt)} · ${escapeHtml(c.metodoPago || '—')} · ${escapeHtml(productos)}</div>
        </div>
        <button class="venta-candidate__btn"
                data-action="link-candidate"
                data-venta-id="${escapeAttr(String(c.ventaId))}"
                data-score="${c.score}">Vincular</button>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="venta-candidates">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Posibles ventas relacionadas</div>
      ${autoNote}
      ${candidatesHtml}
    </div>`;
  };

  // ── Close detail modal ────────────────────────────────────────────────────────
  const closeDetailModal = () => {
    detailModal?.classList.remove('visible');
    currentTx = null;
  };

  btnCloseDetail?.addEventListener('click', closeDetailModal);
  detailModal?.addEventListener('click', (e) => { if (e.target === detailModal) closeDetailModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDetailModal(); closeAllDropdowns(); }
  });

  // ── Detail action buttons ─────────────────────────────────────────────────────

  document.getElementById('detail-btn-copiar')?.addEventListener('click', async () => {
    if (!currentTx) return;
    const payer  = normalizePayer(currentTx);
    const method = normalizePaymentMethod(currentTx);
    const amount = (currentTx.transaction_amount ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    const date   = currentTx.date_created ? new Date(currentTx.date_created).toLocaleString('es-AR') : '—';
    const lines  = [
      `Pago: ${amount}`,
      `Pagador: ${payer.displayName}`,
      payer.email ? `Email: ${payer.email}` : null,
      `Medio: ${method.label}`,
      `Estado: ${STATUS_CONFIG[currentTx.status]?.label || currentTx.status || '—'}`,
      `Fecha: ${date}`,
      `ID: ${currentTx.id || '—'}`,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      showToast('Datos copiados al portapapeles.', 'success');
    } catch (_) {
      showToast('No se pudo copiar.', 'error');
    }
  });

  document.getElementById('detail-btn-ver-cliente')?.addEventListener('click', () => {
    showToast('Abrí la sección Clientes para ver el detalle del cliente.', 'info');
  });

  document.getElementById('detail-btn-vincular-venta')?.addEventListener('click', async () => {
    if (!currentTx) return;
    const btn = document.getElementById('detail-btn-vincular-venta');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Buscando...';
    try {
      const result = await window.electronAPI.invoke('match-mp-to-venta', currentTx);
      renderVentaCandidates(currentTx, result);
      btn.style.display = 'none';
    } catch (_) {
      showToast('Error al buscar ventas relacionadas.', 'error');
      btn.disabled = false;
      btn.textContent = origText;
    }
  });

  document.getElementById('detail-btn-desvincular')?.addEventListener('click', async () => {
    if (!currentTx) return;
    const paymentIdStr = String(currentTx.id || '');
    const linked = linkedPayments[paymentIdStr];
    if (!linked) return;

    const btn = document.getElementById('detail-btn-desvincular');
    btn.disabled = true;
    btn.textContent = 'Desvinculando...';
    try {
      const result = await window.electronAPI.invoke('unlink-venta-from-mp', linked.ventaId);
      if (result?.success) {
        delete linkedPayments[paymentIdStr];
        renderVentaSection(currentTx, null);
        const btnVincular = document.getElementById('detail-btn-vincular-venta');
        if (btnVincular) btnVincular.style.display = '';
        btn.style.display = 'none';
        renderTable(applyClientFilters(allTransactions));
        showToast('Venta desvinculada.', 'success');
      } else {
        showToast(result?.message || 'Error al desvincular.', 'error');
      }
    } catch (_) {
      showToast('Error al desvincular la venta.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Desvincular venta';
    }
  });

  // Delegate "Vincular" clicks inside the candidates panel
  document.getElementById('detail-venta-section')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="link-candidate"]');
    if (!btn || !currentTx) return;

    btn.disabled    = true;
    btn.textContent = 'Vinculando...';

    const ventaId      = btn.dataset.ventaId;
    const score        = Number(btn.dataset.score || 0);
    const paymentIdStr = String(currentTx.id || '');
    const payer        = normalizePayer(currentTx);
    const emailLower   = (payer.email || '').toLowerCase();
    const payerIdStr   = String(currentTx.payer?.id || '');
    const clienteId    = (payerIdStr && knownPayers.byPayerId[payerIdStr])
                      || (emailLower && knownPayers.byEmail[emailLower])
                      || undefined;

    try {
      const result = await window.electronAPI.invoke('link-venta-to-mp', {
        ventaId,
        paymentId:     paymentIdStr,
        paymentStatus: currentTx.status,
        paymentMethod: normalizePaymentMethod(currentTx).label,
        confidence:    score,
        clienteId,
      });

      if (result?.success) {
        linkedPayments[paymentIdStr] = { ventaId, confidence: score, clienteId: clienteId || null };
        renderVentaSection(currentTx, linkedPayments[paymentIdStr]);
        const btnVincular   = document.getElementById('detail-btn-vincular-venta');
        const btnDesvincular = document.getElementById('detail-btn-desvincular');
        if (btnVincular)    btnVincular.style.display    = 'none';
        if (btnDesvincular) btnDesvincular.style.display = '';
        renderTable(applyClientFilters(allTransactions));
        showToast('Venta vinculada exitosamente.', 'success');
      } else {
        showToast(result?.message || 'Error al vincular.', 'error');
        btn.disabled    = false;
        btn.textContent = 'Vincular';
      }
    } catch (_) {
      showToast('Error al vincular la venta.', 'error');
      btn.disabled    = false;
      btn.textContent = 'Vincular';
    }
  });

  // ── Manual bulk sync ──────────────────────────────────────────────────────────
  btnSync?.addEventListener('click', async () => {
    if (!allTransactions.length) {
      showToast('No hay transacciones cargadas para importar.', 'info');
      return;
    }
    const orig = btnSync.textContent;
    btnSync.disabled    = true;
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
      btnSync.disabled    = false;
      btnSync.textContent = orig;
    }
  });

  // ── Auto-create toggle ────────────────────────────────────────────────────────
  toggleAutoCreate?.addEventListener('change', async () => {
    autoCreateClientes = toggleAutoCreate.checked;
    localStorage.setItem('mp_auto_create', String(autoCreateClientes));
    if (autoCreateClientes && allTransactions.length) {
      await autoSyncIfEnabled();
      renderTable(applyClientFilters(allTransactions));
    }
  });

  // ── Filter bindings ───────────────────────────────────────────────────────────
  btnRefresh?.addEventListener('click', loadTransactions);
  btnApply?.addEventListener('click', loadTransactions);
  filterSearch?.addEventListener('input', () => renderTable(applyClientFilters(allTransactions)));
  filterMedio?.addEventListener('change', () => renderTable(applyClientFilters(allTransactions)));

  // ── Init ──────────────────────────────────────────────────────────────────────
  setConnBadge('unknown');
  loadTransactions();
});
