// renderer/js/registrarcompra.js
(function () {
  // Flag anti-doble-inicialización cuando se navega rápido entre vistas
  let initialized = false;

  // --- 1) Refs DOM ---
  const proveedorSelect = document.getElementById("proveedor-select");
  const nroFacturaInput = document.getElementById("nro-factura-input");
  const fechaDisplay = document.getElementById("fecha-display");
  const productoSearchInput = document.getElementById("producto-search-input");
  const suggestionsContainer = document.getElementById("search-suggestions");
  const compraTableBody = document.getElementById("compra-table-body");
  const btnRegistrarCompra = document.getElementById("btn-registrar-compra");
  const toastNotification = document.getElementById("toast-notification");
  const subtotalDisplay = document.getElementById("subtotal-display");
  const descuentoInput = document.getElementById("descuento-input");
  const recargoInput = document.getElementById("recargo-input");
  const totalCompraDisplay = document.getElementById("total-compra-display");
  const metodoPagoSelect = document.getElementById("metodo-pago-select");
  const montoAbonadoInput = document.getElementById("monto-abonado-input");

  // --- 2) Estado ---
  let compraActual = [];
  let todosLosProductos = [];
  let UsuarioActivo = null;
  let toastTimeout;
  let suggestTimer;

  // --- 3) Utils UI ---
  const formatCurrency = (n) =>
    (n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  const showToast = (message, type = "success") => {
    if (!toastNotification) return;
    clearTimeout(toastTimeout);
    toastNotification.textContent = message;
    toastNotification.className = "toast";
    toastNotification.classList.add(type, "visible");
    toastTimeout = setTimeout(() => {
      toastNotification.classList.remove("visible");
    }, 3000);
  };

  const toggleButtonLoading = (isLoading) => {
    if (!btnRegistrarCompra) return;
    btnRegistrarCompra.disabled = isLoading;
    btnRegistrarCompra.textContent = isLoading
      ? "Procesando..."
      : "Finalizar y Cargar Stock";
  };

  // --- 4) Cálculos / Render ---
  const actualizarTotalesGenerales = () => {
    const subtotalGeneral = compraActual.reduce(
      (acc, item) => acc + (item.subtotal || 0),
      0
    );
    const descuento = parseFloat(descuentoInput?.value) || 0;
    const recargo = parseFloat(recargoInput?.value) || 0;
    const totalFinal = subtotalGeneral - descuento + recargo;
    const montoAbonado = parseFloat(montoAbonadoInput?.value) || 0;

    if (subtotalDisplay) subtotalDisplay.textContent = formatCurrency(subtotalGeneral);
    if (totalCompraDisplay) totalCompraDisplay.textContent = formatCurrency(totalFinal);
    const saldoPendienteDisplay = document.getElementById("saldo-pendiente-display");
    if (saldoPendienteDisplay) saldoPendienteDisplay.textContent = formatCurrency(totalFinal - montoAbonado);
  };

  const renderizarTabla = () => {
    if (!compraTableBody) return;
    compraTableBody.innerHTML = "";
    compraActual.forEach((item, index) => {
      const row = document.createElement("tr");
      row.dataset.index = String(index);

      const variacion = item.costoUnitario - item.precioCompra;
      const porcVariacion =
        item.precioCompra > 0 ? (variacion / item.precioCompra) * 100 : 0;
      const margenNuevo =
        item.nuevoPrecioVenta > 0 && item.costoUnitario > 0
          ? ((item.nuevoPrecioVenta - item.costoUnitario) / item.nuevoPrecioVenta) * 100
          : 0;

      row.innerHTML = `
        <td>${item.nombre}</td>
        <td><input type="number" class="input-calc" name="cantidad" value="${item.cantidad}" step="any"></td>
        <td><input type="number" class="input-calc" name="costoUnitario" value="${item.costoUnitario.toFixed(2)}" step="0.01"></td>
        <td><input type="number" class="input-calc subtotal-input" name="subtotal" value="${item.subtotal.toFixed(2)}" step="0.01"></td>
        <td>${formatCurrency(item.precioCompra)}</td>
        <td class="${porcVariacion > 0 ? "variacion-positiva" : porcVariacion < 0 ? "variacion-negativa" : ""}">${porcVariacion.toFixed(0)}%</td>
        <td>${formatCurrency(item.precioVenta)}</td>
        <td>${item.margenActual.toFixed(0)}%</td>
        <td>
          <div class="input-group-venta">
            <input type="number" class="input-calc" name="nuevoPrecioVenta" value="${item.nuevoPrecioVenta.toFixed(2)}" step="0.01">
            <input type="checkbox" class="actualizar-precio-check" ${item.actualizarPrecioVenta ? "checked" : ""}>
          </div>
        </td>
        <td class="${margenNuevo < item.margenActual ? "margen-bajo" : ""}">${margenNuevo.toFixed(0)}%</td>
        <td><button class="btn-remove-item btn btn-danger btn-sm" title="Quitar">X</button></td>
      `;
      compraTableBody.appendChild(row);
    });
    actualizarTotalesGenerales();
  };

  const añadirProductoACompra = (producto) => {
    if (compraActual.some((p) => p.productoId === producto.id)) {
      showToast("El producto ya está en la lista de compra.", "error");
      productoSearchInput?.focus();
      return;
    }
    const precioCompra = producto.precioCompra || 0;
    const precioVenta = producto.precioVenta || 0;
    const margenActual =
      precioVenta > 0 && precioCompra > 0
        ? ((precioVenta - precioCompra) / precioVenta) * 100
        : 0;

    compraActual.push({
      productoId: producto.id,
      nombre: producto.nombre,
      precioCompra,
      precioVenta,
      margenActual,
      cantidad: 1,
      costoUnitario: precioCompra,
      subtotal: precioCompra,
      nuevoPrecioVenta: precioVenta,
      actualizarPrecioVenta: true,
    });

    renderizarTabla();
    if (productoSearchInput) {
      productoSearchInput.value = "";
      productoSearchInput.focus();
    }
    if (suggestionsContainer) suggestionsContainer.innerHTML = "";
  };

  const mostrarSugerencias = (texto) => {
    if (!suggestionsContainer) return;
    suggestionsContainer.innerHTML = "";
    if (!texto) return;

    const filtrados = todosLosProductos
      .filter((p) => p.nombre.toLowerCase().includes(texto.toLowerCase()))
      .slice(0, 8);

    const frag = document.createDocumentFragment();
    filtrados.forEach((p) => {
      const div = document.createElement("div");
      div.className = "suggestion-item";
      div.textContent = p.nombre;
      div.addEventListener("mousedown", (e) => {
        // mousedown para no perder el foco/blur antes del click
        e.preventDefault();
        añadirProductoACompra(p);
      });
      frag.appendChild(div);
    });
    suggestionsContainer.appendChild(frag);
  };

  // --- 5) Init + Eventos ---
  const inicializar = async () => {
    if (initialized) return;
    initialized = true;

    if (fechaDisplay) fechaDisplay.value = new Date().toLocaleDateString("es-AR");

    const sessionData = window.APP_SESSION || {};
    UsuarioActivo = sessionData.user;
    if (!UsuarioActivo) {
      showToast("Error de sesión. No se puede continuar.", "error");
      btnRegistrarCompra && (btnRegistrarCompra.disabled = true);
      return;
    }

    try {
      const proveedores = await window.electronAPI.invoke("get-proveedores");
      if (proveedorSelect) {
        proveedorSelect.innerHTML = '<option value="">-- Seleccione un Proveedor --</option>';
        proveedores.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.nombreEmpresa;
          proveedorSelect.appendChild(opt);
        });
      }
      todosLosProductos = await window.electronAPI.invoke("get-productos");
    } catch (error) {
      console.error(error);
      showToast("Error al cargar datos iniciales.", "error");
    }
  };

  // Búsqueda por Enter (código o nombre)
  productoSearchInput?.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const texto = productoSearchInput.value.trim();
    if (!texto) return;

    try {
      const producto = await window.electronAPI.invoke("busqueda-inteligente", texto);
      if (producto) añadirProductoACompra(producto);
      else showToast("Producto no encontrado", "error");
    } catch (err) {
      console.error(err);
      showToast("Error al buscar producto.", "error");
    }
  });

  // Sugerencias con debounce
  productoSearchInput?.addEventListener("input", () => {
    clearTimeout(suggestTimer);
    const texto = productoSearchInput.value;
    suggestTimer = setTimeout(() => mostrarSugerencias(texto), 120);
  });

  // Edición de filas (delegación)
  compraTableBody?.addEventListener("input", (e) => {
    const target = e.target;
    const row = target.closest("tr");
    if (!row) return;

    const index = Number(row.dataset.index || -1);
    const item = compraActual[index];
    if (!item) return;

    if (target.classList.contains("input-calc")) {
      const name = target.name;
      const value = parseFloat(target.value) || 0;
      item[name] = value;

      if (name === "cantidad" || name === "costoUnitario") {
        item.subtotal = item.cantidad * item.costoUnitario;
        const subInp = row.querySelector('[name="subtotal"]');
        if (subInp) subInp.value = item.subtotal.toFixed(2);
      } else if (name === "subtotal") {
        if (item.cantidad > 0) {
          item.costoUnitario = item.subtotal / item.cantidad;
          const costInp = row.querySelector('[name="costoUnitario"]');
          if (costInp) costInp.value = item.costoUnitario.toFixed(2);
        }
      }

      if (name === "costoUnitario" || name === "subtotal") {
        // mantener margen actual como referencia de precio sugerido
        if (item.margenActual > 0 && item.margenActual < 100) {
          const margenDecimalInverso = 1 - item.margenActual / 100;
          item.nuevoPrecioVenta = item.costoUnitario / margenDecimalInverso;
        } else {
          item.nuevoPrecioVenta = item.costoUnitario;
        }
        const pvInp = row.querySelector('[name="nuevoPrecioVenta"]');
        if (pvInp) pvInp.value = item.nuevoPrecioVenta.toFixed(2);
      }

      actualizarTotalesGenerales();
    }

    if (target.classList.contains("actualizar-precio-check")) {
      item.actualizarPrecioVenta = target.checked;
    }
  });

  [descuentoInput, recargoInput, montoAbonadoInput, metodoPagoSelect]
    .filter(Boolean)
    .forEach((input) => {
      input.addEventListener("input", actualizarTotalesGenerales);
      input.addEventListener("change", actualizarTotalesGenerales);
    });

  compraTableBody?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-item");
    if (!btn) return;
    const idx = Number(btn.closest("tr")?.dataset.index || -1);
    if (idx >= 0) {
      compraActual.splice(idx, 1);
      renderizarTabla();
    }
  });

  btnRegistrarCompra?.addEventListener("click", async () => {
    if (!proveedorSelect?.value) {
      showToast("Debe seleccionar un proveedor.", "error");
      return;
    }
    if (compraActual.length === 0) {
      showToast("Debe añadir al menos un producto a la compra.", "error");
      return;
    }

    toggleButtonLoading(true);

    const data = {
      proveedorId: proveedorSelect.value,
      nroFactura: (nroFacturaInput?.value || "").trim(),
      UsuarioId: UsuarioActivo.id,
      items: compraActual,
      pago: {
        descuento: descuentoInput?.value,
        recargo: recargoInput?.value,
        metodoPago: metodoPagoSelect?.value,
        montoAbonado: montoAbonadoInput?.value,
      },
    };

    try {
      const result = await window.electronAPI.invoke("registrar-compra-producto", data);
      if (result?.success) {
        showToast(result.message || "Compra registrada.");
        // Para evitar estados colgados, reseteamos UI sin bloquear con refrescos largos
        setTimeout(() => {
          // limpieza de estado rápido
          compraActual = [];
          renderizarTabla();
          proveedorSelect && (proveedorSelect.value = "");
          nroFacturaInput && (nroFacturaInput.value = "");
          descuentoInput && (descuentoInput.value = "0");
          recargoInput && (recargoInput.value = "0");
          montoAbonadoInput && (montoAbonadoInput.value = "0");
          metodoPagoSelect && (metodoPagoSelect.value = "Efectivo");
          toggleButtonLoading(false);
        }, 600);
      } else {
        showToast(result?.message || "No se pudo registrar la compra.", "error");
        toggleButtonLoading(false);
      }
    } catch (error) {
      console.error(error);
      showToast("Error crítico al registrar la compra.", "error");
      toggleButtonLoading(false);
    }
  });

  // Importante: iniciar cuando el sidebar termina (permite sesión y permisos listos)
  document.addEventListener("app-ready", inicializar, { once: true });
})();
