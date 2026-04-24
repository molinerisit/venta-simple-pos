/**
 * ui-notifications.js — Sistema global de notificaciones y diálogos
 *
 * Expone:
 *   window.AppToast.show(message, type, duration)
 *   window.AppToast.success / .error / .warning / .info
 *   window.AppDialog.confirm({ title, message, confirmText, cancelText, type })  → Promise<boolean>
 *   window.AppDialog.alert({ title, message, type, confirmText })                → Promise<void>
 *
 * Retrocompatibilidad automática:
 *   Intercepta el elemento #toast-notification vía MutationObserver y redirige
 *   sus cambios al nuevo sistema. Sin necesidad de modificar los showToast existentes.
 */
(function () {
  'use strict';

  /* ─── SVG icons ─────────────────────────────────────── */
  const ICONS = {
    success: `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd"/></svg>`,
    error:   `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd"/></svg>`,
    warning: `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>`,
    info:    `<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd"/></svg>`,
  };

  const COLORS = {
    success: '#10b981',
    error:   '#ef4444',
    warning: '#f59e0b',
    info:    '#3b82f6',
  };

  /* ─── Toast container ───────────────────────────────── */
  let _container = null;

  function getContainer() {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.createElement('div');
    _container.id = 'app-toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(_container);
    return _container;
  }

  /* ─── AppToast ──────────────────────────────────────── */
  window.AppToast = {
    show(message, type = 'success', duration = 4000) {
      const container = getContainer();
      const color = COLORS[type] || COLORS.info;
      const icon  = ICONS[type]  || ICONS.info;

      const el = document.createElement('div');
      el.className = `app-toast app-toast--${type}`;
      el.setAttribute('role', 'status');
      el.style.setProperty('--toast-color', color);

      el.innerHTML = `
        <div class="app-toast__icon">${icon}</div>
        <p class="app-toast__msg">${message}</p>
        <button class="app-toast__close" aria-label="Cerrar notificación" tabindex="0">
          <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12" aria-hidden="true">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
          </svg>
        </button>
        ${duration > 0 ? `<div class="app-toast__bar" style="animation-duration:${duration}ms"></div>` : ''}
      `;

      const dismiss = () => {
        el.classList.add('app-toast--out');
        el.addEventListener('animationend', () => el.remove(), { once: true });
        setTimeout(() => el.remove(), 500);
      };

      el.querySelector('.app-toast__close').addEventListener('click', dismiss);
      container.appendChild(el);

      // Trigger entrance
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('app-toast--in')));

      let timer;
      if (duration > 0) {
        timer = setTimeout(dismiss, duration);
      }

      // Pause progress bar on hover
      el.addEventListener('mouseenter', () => {
        el.classList.add('app-toast--paused');
        clearTimeout(timer);
      });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('app-toast--paused');
        if (duration > 0) timer = setTimeout(dismiss, 1200);
      });

      return { dismiss };
    },

    success(msg, dur) { return this.show(msg, 'success', dur); },
    error  (msg, dur) { return this.show(msg, 'error',   dur); },
    warning(msg, dur) { return this.show(msg, 'warning', dur); },
    info   (msg, dur) { return this.show(msg, 'info',    dur); },
  };

  /* ─── AppDialog ─────────────────────────────────────── */
  function buildOverlay(iconHtml, title, message, actions, color) {
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';

    overlay.innerHTML = `
      <div class="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-dlg-title">
        <div class="app-dialog__icon-wrap" style="--dlg-color:${color}">
          ${iconHtml}
        </div>
        <h2 class="app-dialog__title" id="app-dlg-title">${title}</h2>
        ${message ? `<p class="app-dialog__msg">${message}</p>` : ''}
        <div class="app-dialog__actions">${actions}</div>
      </div>
    `;

    return overlay;
  }

  function showDialog(overlay) {
    document.body.appendChild(overlay);
    // Double rAF to ensure transition triggers
    requestAnimationFrame(() => requestAnimationFrame(() => {
      overlay.classList.add('app-dialog-overlay--in');
      overlay.querySelector('.app-dialog').classList.add('app-dialog--in');
    }));
  }

  function closeDialog(overlay, resolve, value) {
    overlay.classList.remove('app-dialog-overlay--in');
    overlay.querySelector('.app-dialog').classList.remove('app-dialog--in');
    setTimeout(() => { overlay.remove(); resolve(value); }, 260);
  }

  window.AppDialog = {
    confirm({
      title       = '¿Confirmar acción?',
      message     = '',
      confirmText = 'Confirmar',
      cancelText  = 'Cancelar',
      type        = 'warning',
      danger      = false,
    } = {}) {
      return new Promise((resolve) => {
        const color = COLORS[type] || COLORS.warning;
        const confirmColor = danger ? COLORS.error : color;
        const iconBig = (ICONS[type] || ICONS.warning).replace('viewBox="0 0 20 20"', 'viewBox="0 0 20 20" width="26" height="26"');

        const actions = `
          <button class="app-dialog__btn app-dialog__btn--cancel">${cancelText}</button>
          <button class="app-dialog__btn app-dialog__btn--confirm" style="--btn-color:${confirmColor}">${confirmText}</button>
        `;

        const overlay = buildOverlay(iconBig, title, message, actions, color);

        const close = (val) => closeDialog(overlay, resolve, val);

        overlay.querySelector('.app-dialog__btn--confirm').addEventListener('click', () => close(true));
        overlay.querySelector('.app-dialog__btn--cancel').addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        overlay.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') { close(false); e.stopPropagation(); }
          if (e.key === 'Enter')  { close(true);  e.stopPropagation(); e.preventDefault(); }
        });

        showDialog(overlay);
        setTimeout(() => overlay.querySelector('.app-dialog__btn--confirm')?.focus(), 50);
      });
    },

    alert({
      title       = 'Aviso',
      message     = '',
      type        = 'info',
      confirmText = 'Entendido',
    } = {}) {
      return new Promise((resolve) => {
        const color = COLORS[type] || COLORS.info;
        const iconBig = (ICONS[type] || ICONS.info).replace('viewBox="0 0 20 20"', 'viewBox="0 0 20 20" width="26" height="26"');

        const actions = `
          <button class="app-dialog__btn app-dialog__btn--confirm" style="--btn-color:${color}">${confirmText}</button>
        `;

        const overlay = buildOverlay(iconBig, title, message, actions, color);

        const close = () => closeDialog(overlay, resolve, undefined);

        overlay.querySelector('.app-dialog__btn--confirm').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); });

        showDialog(overlay);
        setTimeout(() => overlay.querySelector('.app-dialog__btn--confirm')?.focus(), 50);
      });
    },

    /**
     * Informe X — modal especial con tabla de totales
     */
    informeX(resumen) {
      return new Promise((resolve) => {
        const fmt = (v) => (v || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
        const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const desde = new Date(resumen.desde).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        const rows = [
          ['Efectivo',      fmt(resumen.totalEfectivo)],
          ['Débito',        fmt(resumen.totalDebito)],
          ['Crédito',       fmt(resumen.totalCredito)],
          ['QR / MP',       fmt(resumen.totalQR)],
          ['Transferencia', fmt(resumen.totalTransfer)],
          ['Cta. Cte.',     fmt(resumen.totalCtaCte)],
        ].filter(([, v]) => v !== fmt(0));

        const tableRows = rows.map(([label, val]) =>
          `<tr><td>${label}</td><td class="ix-val">${val}</td></tr>`
        ).join('');

        const overlay = document.createElement('div');
        overlay.className = 'app-dialog-overlay';
        overlay.innerHTML = `
          <div class="app-dialog app-dialog--wide" role="dialog" aria-modal="true" aria-label="Informe X">
            <div class="app-dialog__icon-wrap" style="--dlg-color:#3b82f6">
              <svg viewBox="0 0 20 20" fill="currentColor" width="26" height="26" aria-hidden="true">
                <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd"/>
              </svg>
            </div>
            <h2 class="app-dialog__title">Informe X — ${hora}</h2>
            <p class="app-dialog__msg" style="margin-bottom:12px">Desde apertura (${desde}) · ${resumen.cantidadVentas} ventas</p>

            <table class="ix-table">
              <tbody>${tableRows}</tbody>
              <tfoot>
                <tr class="ix-total"><td>Total ventas</td><td class="ix-val">${fmt(resumen.totalVentas)}</td></tr>
                <tr><td>Ingresos extra</td><td class="ix-val ix-pos">${fmt(resumen.totalIngresosExtra)}</td></tr>
                <tr><td>Egresos extra</td><td class="ix-val ix-neg">−${fmt(resumen.totalEgresosExtra)}</td></tr>
                <tr class="ix-total ix-cash"><td>Efectivo esperado</td><td class="ix-val">${fmt(resumen.montoEstimado)}</td></tr>
              </tfoot>
            </table>

            <div class="app-dialog__actions" style="margin-top:20px">
              <button class="app-dialog__btn app-dialog__btn--confirm" style="--btn-color:#3b82f6">Cerrar</button>
            </div>
          </div>
        `;

        const close = () => closeDialog(overlay, resolve, undefined);
        overlay.querySelector('.app-dialog__btn--confirm').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') close(); });

        showDialog(overlay);
        setTimeout(() => overlay.querySelector('.app-dialog__btn--confirm')?.focus(), 50);
      });
    },
  };

  /* ─── Retrocompatibilidad: intercepta #toast-notification ─── */
  function upgradeOldToast() {
    const old = document.getElementById('toast-notification');
    if (!old) return;

    // Hide the legacy element — new system takes over completely
    old.style.cssText = 'display:none!important';

    const observer = new MutationObserver(() => {
      if (!old.classList.contains('visible')) return;
      const type = old.classList.contains('error')   ? 'error'
                 : old.classList.contains('warning')  ? 'warning'
                 : old.classList.contains('success')  ? 'success'
                 : 'info';
      const msg = old.textContent.trim();
      if (msg) {
        window.AppToast.show(msg, type);
        // Immediately strip .visible so the observer doesn't double-fire
        old.classList.remove('visible');
      }
    });

    observer.observe(old, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', upgradeOldToast);
  } else {
    upgradeOldToast();
  }

})();
