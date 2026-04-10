// renderer/js/form-enter-nav.js
// Attaches Enter-key navigation to a form's visible, enabled input fields.
// On the last field, triggers the submit button instead of submitting the form directly.
//
// Usage:
//   attachEnterNav(formElement);
//   attachEnterNav(formElement, { submitBtn: document.getElementById('my-btn') });

window.attachEnterNav = function (formEl, { submitBtn } = {}) {
  if (!formEl) return;

  const TEXT_TYPES = new Set([
    'text', 'password', 'number', 'email', 'tel',
    'date', 'search', 'url', 'time',
  ]);

  formEl.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;

    const el = e.target;

    // Only intercept Enter on text-like inputs; let selects, textareas, etc. behave normally
    if (el.tagName !== 'INPUT' || !TEXT_TYPES.has(el.type)) return;

    e.preventDefault();

    // Collect all visible, enabled fields inside the form
    const fields = Array.from(
      formEl.querySelectorAll(
        'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]),' +
        'select,' +
        'textarea'
      )
    ).filter(f => !f.disabled && f.offsetParent !== null);

    const idx = fields.indexOf(el);
    if (idx < 0) return;

    if (idx < fields.length - 1) {
      const next = fields[idx + 1];
      next.focus();
      // Select text content for easy overwriting (skip number inputs to avoid browser quirks)
      if (typeof next.select === 'function' && next.type !== 'number') {
        next.select();
      }
    } else {
      // Last field — trigger submit
      const btn =
        submitBtn ||
        formEl.querySelector('button[type=submit]:not([disabled])') ||
        (formEl.id
          ? document.querySelector(`button[type=submit][form="${formEl.id}"]:not([disabled])`)
          : null);

      if (btn) {
        btn.click();
      } else {
        formEl.requestSubmit?.();
      }
    }
  });
};
