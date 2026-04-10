// renderer/js/dashboard.js (Versión final completa)
document.addEventListener("app-ready", () => {
  // --- REFS ---
  const filterButtons = document.querySelectorAll(".btn-filter");
  const deptoFilter = document.getElementById("depto-filter");
  const familiaFilter = document.getElementById("familia-filter");
  const dateFromInput = document.getElementById("date-from");
  const dateToInput = document.getElementById("date-to");
  const btnApplyCustom = document.getElementById("btn-apply-custom");

  const totalFacturadoCard = document.getElementById("total-facturado");
  const gananciaBrutaCard = document.getElementById("ganancia-bruta");
  const totalComprasCard = document.getElementById("total-compras");
  const totalGastosCard = document.getElementById("total-gastos");
  const numeroVentasCard = document.getElementById("numero-ventas");
  const ticketPromedioCard = document.getElementById("ticket-promedio");

  const ventasChartCtx = document.getElementById("ventas-chart")?.getContext("2d");
  const cierresCajaBody = document.getElementById("cierres-caja-tbody");

  const fullRankingBody = document.getElementById("full-ranking-tbody");
  const inactiveProductsBody = document.getElementById("inactive-products-tbody");
  const rankingSortSelect = document.getElementById("ranking-sort-by");
  const salesByCatalogBody = document.getElementById("sales-by-catalog-tbody");
  const peakHoursCtx = document.getElementById("peak-hours-chart")?.getContext("2d");
  const paymentMethodsCtx = document.getElementById("payment-methods-chart")?.getContext("2d");

  // --- REFS PARA NAVEGACIÓN Y PDF ---
  const btnExportPDF = document.getElementById("btn-export-pdf");
  const btnGotoRentabilidad = document.getElementById("btn-goto-rentabilidad");
  const btnGotoCierres = document.getElementById("btn-goto-cierres");


  // --- STATE ---
  let ventasChartInstance = null;
  let familiasData = [];
  let fullRankingData = [];
  let peakHoursChartInstance = null;
  let paymentMethodsChartInstance = null;
  
  // --- ESTADO PARA TABLAS PDF ---
  let inactiveProductsData = [];
  let salesByCatalogData = [];

  const money = (v) => (v || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  // --- RENDER ---
  const renderTarjetas = (stats) => {
    totalFacturadoCard.textContent = money(stats.totalFacturado);
    gananciaBrutaCard.textContent = money(stats.gananciaBruta);
    totalComprasCard.textContent = money(stats.totalComprasproducto);
    totalGastosCard.textContent = money(stats.totalGastosFijos);
    numeroVentasCard.textContent = stats.numeroVentas || 0;
    ticketPromedioCard.textContent = money(stats.ticketPromedio);
  };

  const renderGraficoVentas = (ventasPorDia) => {
    if (!ventasChartCtx) return;
    if (ventasChartInstance) ventasChartInstance.destroy();
    const labels = ventasPorDia.map((v) =>
      new Date(v.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
    );
    const data = ventasPorDia.map((v) => v.total_diario);

    const gradient = ventasChartCtx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, "rgba(14,165,233,0.28)");
    gradient.addColorStop(1, "rgba(14,165,233,0.00)");

    ventasChartInstance = new Chart(ventasChartCtx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Ventas por Día",
          data,
          borderColor: "#0ea5e9",
          borderWidth: 2,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: "#0ea5e9",
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#64748b" } },
          y: { grid: { color: "#e2e8f0" }, border: { dash: [3,3] }, ticks: { font: { size: 11 }, color: "#64748b" } },
        },
      },
    });
  };

  const renderCierresCaja = (cierres) => {
    if (!cierresCajaBody) return;
    if (!cierres || cierres.length === 0) {
      cierresCajaBody.innerHTML = "<tr><td colspan='4'>No hay cierres de caja registrados.</td></tr>";
      return;
    }
    const moneyFmt = (v) => (v || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
    cierresCajaBody.innerHTML = cierres
      .map(
        (c) => `
      <tr>
        <td>${new Date(c.fechaCierre).toLocaleString("es-AR")}</td>
        <td>${c.usuario?.nombre || "N/A"}</td>
        <td class="${c.diferencia < 0 ? "valor-negativo" : "valor-positivo"}">${moneyFmt(c.diferencia)}</td>
        <td><button class="btn btn-info btn-sm" onclick="alert('Imprimir cierre ${c.id}')">Imprimir</button></td>
      </tr>`
      )
      .join("");
  };

  const renderFullRanking = () => {
    if (!fullRankingBody) return;
    const sortValue = rankingSortSelect.value;
    const [sortBy, order] = sortValue.split("_");
    const sortedData = [...fullRankingData].sort((a, b) => {
      let valA, valB;
      if (sortBy === 'cantidad') { valA = a.total_cantidad; valB = b.total_cantidad; } 
      else if (sortBy === 'facturado') { valA = a.total_facturado_producto; valB = b.total_facturado_producto; } 
      else { valA = a.total_ganancia; valB = b.total_ganancia; }
      return order === 'desc' ? valB - valA : valA - valB;
    });
    if (sortedData.length === 0) {
      fullRankingBody.innerHTML = "<tr><td colspan='5'>No hay datos de ranking para este período.</td></tr>";
      return;
    }
    fullRankingBody.innerHTML = sortedData.map(p => `
      <tr>
        <td>${p.producto.nombre}</td>
        <td><strong>${Number(p.total_cantidad || 0).toFixed(2)}</strong></td>
        <td>${money(p.total_facturado_producto)}</td>
        <td style="color: ${p.total_ganancia < 0 ? 'var(--danger-color, #e74c3c)' : 'var(--success-color, #2ecc71)'}">
          <strong>${money(p.total_ganancia)}</strong>
        </td>
        <td style="color: ${Number(p.producto.stock || 0) <= 0 ? 'var(--danger-color, #e74c3c)' : 'inherit'}">
          ${Number(p.producto.stock || 0).toFixed(2)}
        </td>
      </tr>
    `).join("");
  };

  const renderInactiveProducts = (productos) => {
    if (!inactiveProductsBody) return;

    // Actualizar badge de cantidad
    const badge = document.getElementById("inactive-count-badge");
    if (badge) {
      badge.textContent = productos?.length > 0 ? `${productos.length} sin ventas` : "sin ventas";
    }

    if (!productos || productos.length === 0) {
      inactiveProductsBody.innerHTML = "<tr><td colspan='2' style='text-align:center;color:#64748b;'>¡Todo se está vendiendo!</td></tr>";
      return;
    }
    inactiveProductsBody.innerHTML = productos
      .sort((a, b) => b.stock - a.stock)
      .map(p => `
      <tr>
        <td>${p.nombre}</td>
        <td><strong style="color:#d97706">${Number(p.stock || 0).toFixed(2)}</strong></td>
      </tr>
    `).join("");
  };

  const renderSalesByCatalog = (catalogData) => {
    if (!salesByCatalogBody) return;
    if (!catalogData || catalogData.length === 0) {
      salesByCatalogBody.innerHTML = "<tr><td colspan='3'>No hay ventas para mostrar.</td></tr>";
      return;
    }
    salesByCatalogBody.innerHTML = catalogData.map(item => {
      const depto = item.producto?.departamento?.nombre || "N/A";
      const familia = item.producto?.familia?.nombre || "N/A";
      return `
        <tr>
          <td>${depto}</td>
          <td>${familia}</td>
          <td><strong>${money(item.total_catalogo)}</strong></td>
        </tr>
      `;
    }).join("");
  };

  const renderPeakHoursChart = (salesData) => {
    if (!peakHoursCtx) return;
    if (peakHoursChartInstance) peakHoursChartInstance.destroy();
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const data = Array(24).fill(0);
    salesData.forEach(item => {
      const hora = parseInt(item.hora, 10);
      if (!isNaN(hora) && hora >= 0 && hora <= 23) {
        data[hora] = item.total_por_hora;
      }
    });
    const labels = hours.map(h => `${h.toString().padStart(2, '0')}:00`);

    // Calcular hora pico y actualizar badge
    const maxVal = Math.max(...data);
    const peakBadge = document.getElementById("peak-hour-badge");
    const peakValue = document.getElementById("peak-hour-value");
    if (maxVal > 0 && peakBadge && peakValue) {
      const peakIdx = data.indexOf(maxVal);
      peakValue.textContent = labels[peakIdx];
      peakBadge.style.display = "inline-flex";
    } else if (peakBadge) {
      peakBadge.style.display = "none";
    }

    // Colores: destacar la barra de hora pico en ámbar, resto en sky
    const bgColors = data.map((v) => v === maxVal && maxVal > 0 ? "#f59e0b" : "#0ea5e9");
    const alphas   = data.map((v) => v === maxVal && maxVal > 0 ? "cc" : "55");
    const barBg    = bgColors.map((c, i) => c + alphas[i]);

    peakHoursChartInstance = new Chart(peakHoursCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Total Vendido",
          data,
          backgroundColor: barBg,
          borderRadius: 4,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: "#e2e8f0" }, ticks: { font: { size: 10 }, color: "#64748b" } },
          x: { grid: { display: false }, ticks: { autoSkip: true, maxTicksLimit: 12, font: { size: 10 }, color: "#64748b" } },
        },
      },
    });
  };

  const renderPaymentMethodsChart = (paymentData) => {
    if (!paymentMethodsCtx) return;
    if (paymentMethodsChartInstance) paymentMethodsChartInstance.destroy();

    const labels = paymentData.map(p => p.metodoPago || "N/A");
    const data = paymentData.map(p => p.total_por_metodo);

    paymentMethodsChartInstance = new Chart(paymentMethodsCtx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          label: "Total por Método",
          data,
          backgroundColor: ["#10b981","#0ea5e9","#8b5cf6","#f59e0b","#ec4899","#ef4444"],
          borderColor: "#fff",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { font: { size: 11 }, padding: 10, color: "#374151", boxWidth: 12, boxHeight: 12 },
          },
        },
      },
    });
  };


  // --- DATA ---
  const setLoading = () => {
    totalFacturadoCard.textContent = "Cargando...";
    gananciaBrutaCard.textContent = "Cargando...";
    totalComprasCard.textContent = "Cargando...";
    totalGastosCard.textContent = "Cargando...";
    numeroVentasCard.textContent = "...";
    ticketPromedioCard.textContent = "...";
  };

  const getDateRange = () => {
    const active = document.querySelector(".btn-filter.active");
    const range = active ? active.dataset.range : "today";
    const today = new Date();
    let from = new Date(today), to = new Date(today);
    switch (range) {
      case "week": from.setDate(today.getDate() - today.getDay()); break;
      case "month": from.setDate(1); break;
      case "custom":
        from = new Date(dateFromInput.value);
        to = new Date(dateToInput.value);
        break;
      case "today": default: break;
    }
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    return [from, to];
  };

  const cargarStats = async () => {
    setLoading();
    if(fullRankingBody) fullRankingBody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    if(inactiveProductsBody) inactiveProductsBody.innerHTML = '<tr><td colspan="2">Cargando...</td></tr>';
    if(salesByCatalogBody) salesByCatalogBody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';

    const [dateFrom, dateTo] = getDateRange();
    const departamentoId = deptoFilter.value || null;
    const familiaId = familiaFilter.value || null;

    try {
      const result = await window.electronAPI.invoke("get-dashboard-stats", {
        dateFrom, dateTo, departamentoId, familiaId,
      });
      if (!result?.success) throw new Error(result?.message || "Fallo desconocido");

      // Renderizados
      renderTarjetas(result.stats);
      renderGraficoVentas(result.stats.ventasPorDia || []);
      
      // --- GUARDAR DATOS EN ESTADO ---
      fullRankingData = result.stats.fullSalesRanking || [];
      inactiveProductsData = result.stats.inactiveProducts || []; // Guardar
      salesByCatalogData = result.stats.salesByCatalog || [];   // Guardar

      renderFullRanking(); 
      renderInactiveProducts(inactiveProductsData); // Usar la variable de estado
      
      // Renderizar widgets
      renderSalesByCatalog(salesByCatalogData); // Usar la variable de estado
      renderPeakHoursChart(result.stats.salesByHour || []);
      renderPaymentMethodsChart(result.stats.salesByPaymentMethod || []);

    } catch (e) {
      console.error("dashboard stats", e);
    }
  };

  const cargarCierres = async () => {
    if (!cierresCajaBody) return;
    try {
      const cierres = await window.electronAPI.invoke("get-all-cierres-caja");
      renderCierresCaja(cierres);
    } catch (e) {
      console.error("cierres-caja", e);
      cierresCajaBody.innerHTML =
        "<tr><td colspan='4' style='color:red;'>Error al cargar datos.</td></tr>";
    }
  };


  // --- FUNCIÓN PARA EXPORTAR PDF ---
  const handleExportPDF = async () => {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      console.error("jsPDF no está cargado.");
      alert("Error al exportar: Faltan librerías. Revise la conexión a internet.");
      return;
    }

    btnExportPDF.disabled = true;
    btnExportPDF.textContent = "Generando...";

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4'); // 'p'ortrait, 'mm', A4
      const pageHeight = doc.internal.pageSize.height;
      let currentY = 22; // Margen superior para el título

      // --- TÍTULO Y DATOS PRINCIPALES ---
      doc.setFontSize(18);
      doc.text("Reporte de Estadísticas", 14, currentY);
      currentY += 8;
      
      const dateRangeText = document.querySelector(".btn-filter.active")?.textContent || "Rango Personalizado";
      const deptoText = deptoFilter.options[deptoFilter.selectedIndex].text;
      const familiaText = familiaFilter.options[familiaFilter.selectedIndex].text;

      doc.setFontSize(11);
      doc.text(`Período: ${dateRangeText}`, 14, currentY);
      currentY += 6;
      if (deptoFilter.value) doc.text(`Filtro: ${deptoText} > ${familiaText}`, 14, currentY);
      else doc.text("Filtro: Todos los Departamentos", 14, currentY);
      currentY += 10;
      
      doc.setFontSize(12);
      doc.text(`Total Facturado: ${totalFacturadoCard.textContent}`, 14, currentY);
      doc.text(`Ganancia Bruta: ${gananciaBrutaCard.textContent}`, 100, currentY);
      currentY += 7;
      doc.text(`Número de Ventas: ${numeroVentasCard.textContent}`, 14, currentY);
      doc.text(`Ticket Promedio: ${ticketPromedioCard.textContent}`, 100, currentY);
      currentY += 10;


      // --- GRÁFICOS ---
      const lineChartImg = ventasChartInstance.toBase64Image('image/png', 1);
      const pieChartImg = paymentMethodsChartInstance.toBase64Image('image/png', 1);
      const barChartImg = peakHoursChartInstance.toBase64Image('image/png', 1);

      doc.setFontSize(14);
      doc.text("Ventas del Período", 14, currentY);
      currentY += 5;
      doc.addImage(lineChartImg, 'PNG', 14, currentY, 180, 80); // x, y, ancho, alto
      currentY += 90;

      doc.text("Métodos de Pago", 14, currentY);
      doc.text("Horarios Pico", 108, currentY);
      currentY += 5;
      doc.addImage(pieChartImg, 'PNG', 14, currentY, 90, 90);
      doc.addImage(barChartImg, 'PNG', 108, currentY, 90, 90);
      
      // --- TABLAS (en una nueva página) ---
      doc.addPage();
      currentY = 22;

      // 1. Ranking de Ventas
      doc.setFontSize(14);
      doc.text("Ranking de Ventas (Completo)", 14, currentY);
      currentY += 7;

      const rankingHead = [['Producto', 'Cant.', 'Facturado', 'Ganancia', 'Stock']];
      // Usamos 'fullRankingData' (los datos puros)
      const rankingBody = fullRankingData.map(p => [
        p.producto.nombre,
        Number(p.total_cantidad || 0).toFixed(2),
        money(p.total_facturado_producto),
        money(p.total_ganancia),
        Number(p.producto.stock || 0).toFixed(2)
      ]);

      doc.autoTable({
        startY: currentY,
        head: rankingHead,
        body: rankingBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
      });
      currentY = doc.autoTable.previous.finalY + 15; // Posición Y después de la tabla

      // 2. Ventas por Catálogo
      if (currentY > pageHeight - 50) { doc.addPage(); currentY = 22; }

      doc.setFontSize(14);
      doc.text("Ventas por Catálogo", 14, currentY);
      currentY += 7;

      const catalogHead = [['Departamento', 'Familia', 'Total Vendido']];
      // Usamos 'salesByCatalogData' (los datos puros)
      const catalogBody = salesByCatalogData.map(s => [
        s.producto?.departamento?.nombre || 'N/A',
        s.producto?.familia?.nombre || 'N/A',
        money(s.total_catalogo)
      ]);

      doc.autoTable({
        startY: currentY,
        head: catalogHead,
        body: catalogBody,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
      });
      currentY = doc.autoTable.previous.finalY + 15;

      // 3. Productos Inactivos
      if (currentY > pageHeight - 50) { doc.addPage(); currentY = 22; }

      doc.setFontSize(14);
      doc.text("Productos Inactivos (con stock)", 14, currentY);
      currentY += 7;

      const inactiveHead = [['Producto', 'Stock Actual']];
      // Usamos 'inactiveProductsData' (los datos puros)
      const inactiveBody = inactiveProductsData.map(p => [
        p.nombre,
        Number(p.stock || 0).toFixed(2)
      ]);

      doc.autoTable({
        startY: currentY,
        head: inactiveHead,
        body: inactiveBody,
        theme: 'striped',
        headStyles: { fillColor: [231, 76, 60] }, // Rojo para alerta
      });

      // --- GUARDAR ---
      doc.save('reporte_dashboard.pdf'); // Esto dispara la descarga

    } catch (error) {
      console.error("Error al generar PDF:", error);
      alert("Hubo un error al generar el PDF.");
    } finally {
      btnExportPDF.disabled = false;
      btnExportPDF.textContent = "📄 Exportar a PDF";
    }
  };


  // --- LISTENERS ---
  filterButtons.forEach((btn) =>
    btn.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector(".custom-range").style.display = "none";
      cargarStats();
    })
  );
  dateFromInput.addEventListener("change", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    document.querySelector(".custom-range").style.display = "flex";
  });
  dateToInput.addEventListener("change", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    document.querySelector(".custom-range").style.display = "flex";
  });
  btnApplyCustom.addEventListener("click", () => {
    const customRangeDiv = document.querySelector(".custom-range");
    const newButton = document.createElement("button");
    newButton.className = "btn btn-filter active";
    newButton.dataset.range = "custom";
    newButton.textContent = `${new Date(dateFromInput.value).toLocaleDateString()} - ${new Date(
      dateToInput.value
    ).toLocaleDateString()}`;
    document.querySelectorAll('button[data-range="custom"]').forEach((b) => b.remove());
    customRangeDiv.insertAdjacentElement("beforebegin", newButton);
    newButton.addEventListener("click", () => {
      filterButtons.forEach((b) => b.classList.remove("active"));
      newButton.classList.add("active");
      customRangeDiv.style.display = "flex";
      cargarStats();
    });
    cargarStats();
  });
  deptoFilter.addEventListener("change", () => {
    const deptoId = deptoFilter.value ? parseInt(deptoFilter.value, 10) : null;
    familiaFilter.innerHTML = '<option value="">Todas las Familias</option>';
    if (deptoId) {
      const filtradas = familiasData.filter((f) => f.DepartamentoId === deptoId);
      filtradas.forEach((f) => (familiaFilter.innerHTML += `<option value="${f.id}">${f.nombre}</option>`));
      familiaFilter.disabled = false;
    } else {
      familiaFilter.disabled = true;
    }
    cargarStats();
  });
  familiaFilter.addEventListener("change", cargarStats);

  // --- Listener para ordenar ranking ---
  if (rankingSortSelect) {
    rankingSortSelect.addEventListener("change", renderFullRanking);
  }

  // --- LISTENERS DE NAVEGACIÓN Y PDF ---
  if (btnGotoRentabilidad) {
    btnGotoRentabilidad.addEventListener("click", () => {
      window.location.href = "rentabilidad.html";
    });
  }
  if (btnGotoCierres) {
    btnGotoCierres.addEventListener("click", () => {
      window.location.href = "cierres-caja.html";
    });
  }
  if (btnExportPDF) {
    btnExportPDF.addEventListener("click", handleExportPDF);
  }

  // --- INIT ---
  (async () => {
    try {
      const deptos = await window.electronAPI.invoke("get-departamentos");
      familiasData = await window.electronAPI.invoke("get-familias");
      deptoFilter.innerHTML = '<option value="">Todos los Departamentos</option>';
      deptos.forEach((d) => (deptoFilter.innerHTML += `<option value="${d.id}">${d.nombre}</option>`));
    } catch (e) {
      console.error("cargar filtros", e);
    }
    await cargarStats();
    await cargarCierres();
  })();
});