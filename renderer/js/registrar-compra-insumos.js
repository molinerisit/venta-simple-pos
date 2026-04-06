// En: renderer/js/registrar-compra-insumos.js (CÓDIGO COMPLETO)

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. REFERENCIAS AL DOM ---
  const proveedorSelect = document.getElementById("proveedor-select");
  const nroFacturaInput = document.getElementById("nro-factura-input");
  const fechaDisplay = document.getElementById("fecha-display");
  const insumoSearchInput = document.getElementById("insumo-search-input");
  const searchSuggestions = document.getElementById("search-suggestions");
  const tablaBody = document.getElementById("compra-table-body");
  const subtotalDisplay = document.getElementById("subtotal-display");
  const descuentoInput = document.getElementById("descuento-input");
  const recargoInput = document.getElementById("recargo-input");
  const totalCompraDisplay = document.getElementById("total-compra-display");
  const metodoPagoSelect = document.getElementById("metodo-pago-select");
  const montoAbonadoInput = document.getElementById("monto-abonado-input");
  const saldoPendienteDisplay = document.getElementById("saldo-pendiente-display");
  const btnRegistrarCompra = document.getElementById("btn-registrar-compra");
  const toast = document.getElementById('toast-notification');

  // --- 2. ESTADO DE LA APLICACIÓN ---
  let itemsCompra = [];
  let listaProveedores = [];
  let listaInsumos = [];
  let UsuarioActivo = null;

  // --- 3. FUNCIONES AUXILIARES ---
  const showToast = (message, type = 'success') => {
    toast.textContent = message;
    toast.className = `toast ${type} visible`;
    setTimeout(() => toast.classList.remove('visible'), 3000);
  };

  const formatCurrency = (value) => value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

  const actualizarTotales = () => {
    const subtotal = itemsCompra.reduce((acc, item) => acc + item.subtotal, 0);
    const descuento = parseFloat(descuentoInput.value) || 0;
    const recargo = parseFloat(recargoInput.value) || 0;
    const totalCompra = subtotal - descuento + recargo;
    const montoAbonado = parseFloat(montoAbonadoInput.value) || 0;
    const saldoPendiente = totalCompra - montoAbonado;

    subtotalDisplay.textContent = formatCurrency(subtotal);
    totalCompraDisplay.textContent = formatCurrency(totalCompra);
    saldoPendienteDisplay.textContent = formatCurrency(saldoPendiente > 0 ? saldoPendiente : 0);
  };

  // --- 4. RENDERIZADO Y MANIPULACIÓN DEL DOM ---
  const renderizarTabla = () => {
    tablaBody.innerHTML = "";
    if (itemsCompra.length === 0) {
      tablaBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem;">Busque un insumo para comenzar.</td></tr>`;
      actualizarTotales();
      return;
    }

    itemsCompra.forEach((item, index) => {
      const row = document.createElement("tr");
      row.dataset.index = index;
      row.innerHTML = `
        <td>${item.nombre}</td>
        <td><input type="number" class="form-input cantidad-input" value="${item.cantidad}" step="any"></td>
        <td><input type="number" class="form-input costo-input" value="${item.costoUnitario}" step="0.01"></td>
        <td>${formatCurrency(item.subtotal)}</td>
        <td><button class="btn btn-danger btn-sm btn-eliminar">X</button></td>
      `;
      tablaBody.appendChild(row);
    });
    actualizarTotales();
  };
  
  const agregarInsumoACompra = (insumo) => {
    if (itemsCompra.some(item => item.insumoId === insumo.id)) {
        showToast(`El insumo "${insumo.nombre}" ya está en la lista.`, 'error');
        return;
    }
    itemsCompra.push({
        insumoId: insumo.id,
        nombre: insumo.nombre,
        cantidad: 1,
        costoUnitario: insumo.ultimoPrecioCompra || 0,
        subtotal: insumo.ultimoPrecioCompra || 0,
    });
    renderizarTabla();
    const nuevaFila = tablaBody.querySelector(`tr:last-child`);
    if(nuevaFila) {
      const inputCantidad = nuevaFila.querySelector('.cantidad-input');
      inputCantidad.focus();
      inputCantidad.select();
    }
  };

  // --- 5. LÓGICA DE BÚSQUEDA ---
  const mostrarSugerencias = (query) => {
      searchSuggestions.innerHTML = '';
      if (!query) {
          searchSuggestions.classList.add('hidden');
          return;
      }
      const sugerencias = listaInsumos.filter(i => i.nombre.toLowerCase().includes(query)).slice(0, 10);
      if(sugerencias.length > 0) {
        sugerencias.forEach(i => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = i.nombre;
            div.addEventListener('click', () => {
                agregarInsumoACompra(i);
                insumoSearchInput.value = '';
                mostrarSugerencias('');
            });
            searchSuggestions.appendChild(div);
        });
        searchSuggestions.classList.remove('hidden');
      } else {
        searchSuggestions.classList.add('hidden');
      }
  };

  // --- 6. EVENT LISTENERS ---
  insumoSearchInput.addEventListener('input', () => mostrarSugerencias(insumoSearchInput.value.toLowerCase()));

  tablaBody.addEventListener('input', (e) => {
    const fila = e.target.closest('tr');
    if (!fila) return;
    const index = parseInt(fila.dataset.index);
    const item = itemsCompra[index];
    if (e.target.classList.contains('cantidad-input') || e.target.classList.contains('costo-input')) {
        item.cantidad = parseFloat(fila.querySelector('.cantidad-input').value) || 0;
        item.costoUnitario = parseFloat(fila.querySelector('.costo-input').value) || 0;
        item.subtotal = item.cantidad * item.costoUnitario;
        renderizarTabla();
    }
  });

  tablaBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-eliminar')) {
      const index = parseInt(e.target.closest('tr').dataset.index);
      itemsCompra.splice(index, 1);
      renderizarTabla();
    }
  });
  
  tablaBody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const activeElement = document.activeElement;
      if (!activeElement.matches('.form-input')) return;
      e.preventDefault();
      if (activeElement.classList.contains('cantidad-input')) {
          activeElement.closest('tr').querySelector('.costo-input').focus();
      } else if (activeElement.classList.contains('costo-input')) {
          insumoSearchInput.focus();
      }
  });

  [descuentoInput, recargoInput, montoAbonadoInput].forEach(input => input.addEventListener('input', actualizarTotales));

  metodoPagoSelect.addEventListener('change', () => {
    const totalCompra = itemsCompra.reduce((acc, item) => acc + item.subtotal, 0) - (parseFloat(descuentoInput.value) || 0) + (parseFloat(recargoInput.value) || 0);
    if (metodoPagoSelect.value === 'Cuenta Corriente') {
      montoAbonadoInput.value = 0;
    } else {
      montoAbonadoInput.value = totalCompra.toFixed(2);
    }
    actualizarTotales();
  });

  btnRegistrarCompra.addEventListener('click', async () => {
    if (!proveedorSelect.value) return showToast('Debe seleccionar un proveedor.', 'error');
    if (itemsCompra.length === 0) return showToast('Debe agregar al menos un insumo.', 'error');
    if (!UsuarioActivo || !UsuarioActivo.id) return showToast('Error de sesión.', 'error');

    const compraData = {
      proveedorId: proveedorSelect.value,
      nroFactura: nroFacturaInput.value,
      UsuarioId: UsuarioActivo.id,
      items: itemsCompra,
      pago: {
        descuento: descuentoInput.value,
        recargo: recargoInput.value,
        metodoPago: metodoPagoSelect.value,
        montoAbonado: montoAbonadoInput.value,
      }
    };
    
    btnRegistrarCompra.disabled = true;
    btnRegistrarCompra.textContent = 'Procesando...';

    // Llamada al handler específico de insumos
    const result = await window.electronAPI.invoke('registrar-compra-insumos', compraData);

    if (result.success) {
      showToast(result.message, 'success');
      setTimeout(() => { window.location.href = 'insumos.html'; }, 1500);
    } else {
      showToast(result.message, 'error');
      btnRegistrarCompra.disabled = false;
      btnRegistrarCompra.textContent = 'Finalizar y Cargar Stock';
    }
  });

  // --- 7. INICIALIZACIÓN DE LA PÁGINA ---
  const inicializar = async () => {
    UsuarioActivo = window.APP_SESSION?.user;
    fechaDisplay.value = new Date().toLocaleDateString('es-AR');
    
    // Filtramos para mostrar solo proveedores de 'insumos' o 'ambos'
    listaProveedores = await window.electronAPI.invoke('get-proveedores');
    const proveedoresDeInsumos = listaProveedores.filter(p => p.tipo === 'insumos' || p.tipo === 'ambos');
    
    proveedorSelect.innerHTML = '<option value="">-- Seleccione Proveedor de Insumos --</option>';
    proveedoresDeInsumos.forEach(p => {
      proveedorSelect.innerHTML += `<option value="${p.id}">${p.nombreEmpresa}</option>`;
    });

    listaInsumos = await window.electronAPI.invoke('get-insumos');
    renderizarTabla();
    insumoSearchInput.focus();
  };

  document.addEventListener('app-ready', inicializar);
});