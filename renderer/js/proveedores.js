// renderer/js/proveedores.js
// Optimizado: re-render con DocumentFragment, yields al event loop y confirmación no bloqueante.

document.addEventListener('app-ready', () => {
  // --- 1. REFERENCIAS ---
  const tablaBody = document.getElementById('proveedores-table-body');
  const btnNuevoProveedor = document.getElementById('btn-nuevo-proveedor');

  // Toast
  const toast = document.getElementById('toast-notification');
  let toastTimer;

  // Confirm modal (inyectamos una sola vez para no depender de confirm())
  const confirmOverlay = document.createElement('div');
  confirmOverlay.className = 'confirm-overlay';
  confirmOverlay.innerHTML = `
    <div class="confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <h4 id="confirm-title">Confirmar eliminación</h4>
      <p id="confirm-msg">¿Estás seguro de eliminar este proveedor?</p>
      <div class="confirm-actions">
        <button type="button" class="btn btn-secundario" data-action="cancelar">Cancelar</button>
        <button type="button" class="btn btn-danger" data-action="aceptar">Eliminar</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmOverlay);

  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  const idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 150 }) : setTimeout(r, 0)));

  const showNotification = (message, type = "success") => {
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = 'toast';
    toast.classList.add(type, 'visible');
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
  };

  // Confirmación asíncrona
  const confirmar = (mensaje = '¿Estás seguro?') => {
    return new Promise((resolve) => {
      confirmOverlay.querySelector('#confirm-msg').textContent = mensaje;
      confirmOverlay.classList.add('visible');

      const onClick = (ev) => {
        const act = ev.target?.dataset?.action;
        if (!act) return;
        ev.stopPropagation();
        ev.preventDefault();
        confirmOverlay.classList.remove('visible');
        confirmOverlay.removeEventListener('click', onClick);
        resolve(act === 'aceptar');
      };
      confirmOverlay.addEventListener('click', onClick, { once: false });
    });
  };

  // --- 2. FUNCIONES ---
  const buildTipoTexto = (tipo) => ({ producto: 'Mercadería', insumos: 'Insumos', ambos: 'Ambos' }[tipo] || 'No especificado');

  const renderTabla = async (lista) => {
    if (!tablaBody) return;
    tablaBody.innerHTML = ''; // limpiar rápido
    await nextFrame();        // ceder un frame antes del render pesado

    const frag = document.createDocumentFragment();

    (lista || []).forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${p.nombreEmpresa}</td>
        <td>${p.nombreRepartidor || 'N/A'}</td>
        <td>${p.telefono || 'N/A'}</td>
        <td>${p.diasReparto || 'N/A'}</td>
        <td>${p.limitePedido || 'N/A'}</td>
        <td>${buildTipoTexto(p.tipo)}</td>
        <td class="acciones-btn">
          <button class="btn-edit btn btn-info" data-id="${p.id}" title="Editar">✏️</button>
          <button class="btn-delete btn btn-danger" data-id="${p.id}" title="Eliminar">🗑️</button>
        </td>
      `;
      frag.appendChild(tr);
    });

    tablaBody.appendChild(frag);
    await idle(); // dar respiro tras DOM insert
  };

  const cargarProveedores = async () => {
    if (!tablaBody) return;
    tablaBody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando…</td></tr>';

    try {
      const lista = await window.electronAPI.invoke('get-proveedores');
      if (!lista || lista.length === 0) {
        tablaBody.innerHTML = '<tr><td colspan="7" class="text-center">No hay proveedores registrados.</td></tr>';
        return;
      }
      await renderTabla(lista);
    } catch (err) {
      console.error('Error al cargar proveedores:', err);
      tablaBody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:red;">Error al cargar proveedores.</td></tr>';
      showNotification('Error al cargar proveedores.', 'error');
    }
  };

  // --- 3. EVENT LISTENERS ---
  if (btnNuevoProveedor) {
    btnNuevoProveedor.addEventListener('click', () => {
      window.location.href = 'proveedor-form.html';
    }, { passive: true });
  }

  if (tablaBody) {
    // Delegación
    tablaBody.addEventListener('click', async (event) => {
      const btn = event.target.closest('button');
      if (!btn) return;

      const id = btn.dataset.id;
      if (!id || id === 'undefined' || id === 'null') {
        showNotification('ID inválido. Refrescá la página.', 'error');
        return;
      }

      // Evitar doble click frenético
      if (btn.dataset.busy === '1') return;
      btn.dataset.busy = '1';

      try {
        if (btn.classList.contains('btn-edit')) {
          await nextFrame();
          window.location.href = `proveedor-form.html?id=${id}`;
          return;
        }

        if (btn.classList.contains('btn-delete')) {
          const ok = await confirmar('¿Eliminar este proveedor? Esta acción no se puede deshacer.');
          if (!ok) return;

          btn.disabled = true;
          const result = await window.electronAPI.invoke('eliminar-proveedor', id);
          if (result?.success) {
            showNotification('Proveedor eliminado.');
            // Cargar de nuevo sin bloquear el hilo
            setTimeout(() => { cargarProveedores(); }, 0);
          } else {
            showNotification(result?.message || 'No se pudo eliminar.', 'error');
          }
        }
      } catch (e) {
        console.error(e);
        showNotification('Ocurrió un error al procesar la acción.', 'error');
      } finally {
        btn.disabled = false;
        btn.dataset.busy = '0';
        await nextFrame(); // devolver el control
      }
    });
  }

  // --- ARRANQUE ---
  cargarProveedores();
});
