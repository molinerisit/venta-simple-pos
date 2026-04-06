document.addEventListener('DOMContentLoaded', () => {
    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    // Tarjeta de Ingresos
    const totalFacturadoEl = document.getElementById('rep-total-facturado');
    const cmvEl = document.getElementById('rep-cmv');
    const gananciaBrutaEl = document.getElementById('rep-ganancia-bruta');
    
    // Tarjeta de Egresos
    const sueldosEl = document.getElementById('rep-sueldos');
    const gastosFijosEl = document.getElementById('rep-gastos-fijos');
    const comprasproductoEl = document.getElementById('rep-compras-producto');
    const totalGastosEl = document.getElementById('rep-total-gastos');
    
    // Tarjeta de Resumen
    const gananciaNetaEl = document.getElementById('rep-ganancia-neta');

    // Filtros (igual que en el dashboard)
    const filterButtons = document.querySelectorAll('.btn-filter');
    const deptoFilter = document.getElementById('depto-filter');
    const familiaFilter = document.getElementById('familia-filter');
    const dateFromInput = document.getElementById('date-from');
    const dateToInput = document.getElementById('date-to');
    const btnApplyCustom = document.getElementById('btn-apply-custom');

    let departamentosData = [];

    // --- FUNCIONES AUXILIARES ---
    const formatearMoneda = (valor) => (valor || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

    const getFechasFromRange = (range) => {
        const hoy = new Date();
        let dateFrom = new Date();
        let dateTo = new Date();
        dateTo.setHours(23, 59, 59, 999);

        switch (range) {
            case 'today':
                dateFrom.setHours(0, 0, 0, 0);
                break;
            case 'week':
                const primerDiaSemana = hoy.getDate() - hoy.getDay() + (hoy.getDay() === 0 ? -6 : 1);
                dateFrom = new Date(hoy.setDate(primerDiaSemana));
                dateFrom.setHours(0, 0, 0, 0);
                break;
            case 'month':
                dateFrom = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                dateFrom.setHours(0, 0, 0, 0);
                break;
        }
        return { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() };
    };

    // --- FUNCIÓN PRINCIPAL DE CARGA ---
    const cargarReporte = async () => {
        let filters = {};
        const activeFilter = document.querySelector('.btn-filter.active');

        if (activeFilter) {
            filters = getFechasFromRange(activeFilter.dataset.range);
        } else if(dateFromInput.value && dateToInput.value) {
            filters = { dateFrom: dateFromInput.value, dateTo: dateToInput.value };
        } else {
            return; // No hacer nada si no hay filtros válidos
        }
        
        filters.departamentoId = deptoFilter.value || null;
        filters.familiaId = familiaFilter.value || null;
        
        try {
            const { success, report, message } = await window.electronAPI.invoke('get-rentabilidad-report', filters);
            
            if(!success) {
                alert(`Error al cargar el reporte: ${message}`);
                return;
            }

            // Actualizar Tarjeta de Ingresos
            totalFacturadoEl.textContent = formatearMoneda(report.totalFacturado);
            cmvEl.textContent = formatearMoneda(report.cmv);
            gananciaBrutaEl.textContent = formatearMoneda(report.gananciaBruta);
            
            // Actualizar Tarjeta de Egresos
            sueldosEl.textContent = formatearMoneda(report.sueldos);
            gastosFijosEl.textContent = formatearMoneda(report.gastosFijos);
            comprasproductoEl.textContent = formatearMoneda(report.comprasproducto);
            totalGastosEl.textContent = formatearMoneda(report.totalGastos);
            
            // Actualizar Resumen Final
            gananciaNetaEl.textContent = formatearMoneda(report.gananciaNeta);
            // Cambiar color basado en si es positivo o negativo
            gananciaNetaEl.style.color = report.gananciaNeta >= 0 ? '#fff' : '#ff7675';

        } catch (error) {
            console.error("Error crítico al invocar 'get-rentabilidad-report':", error);
            alert("Ocurrió un error grave al comunicarse con el sistema.");
        }
    };
    
    const cargarFiltrosCategorias = async () => {
        departamentosData = await window.electronAPI.invoke('get-departamentos-con-familias');
        deptoFilter.innerHTML = '<option value="">Todos los Departamentos</option>';
        departamentosData.forEach(depto => {
            deptoFilter.add(new Option(depto.nombre, depto.id));
        });
    };

    // --- EVENT LISTENERS ---
    deptoFilter.addEventListener('change', () => {
        const deptoId = deptoFilter.value;
        familiaFilter.innerHTML = '<option value="">Todas las Familias</option>';
        if (deptoId) {
            const depto = departamentosData.find(d => d.id == deptoId);
            if (depto && depto.Familias) {
                depto.Familias.forEach(fam => {
                    familiaFilter.add(new Option(fam.nombre, fam.id));
                });
            }
            familiaFilter.disabled = false;
        } else {
            familiaFilter.disabled = true;
        }
        cargarReporte();
    });

    familiaFilter.addEventListener('change', cargarReporte);
    
    filterButtons.forEach(btn => btn.addEventListener('click', (e) => {
        filterButtons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        const range = e.target.dataset.range;
        const filters = getFechasFromRange(range);
        dateFromInput.value = filters.dateFrom.split('T')[0];
        dateToInput.value = filters.dateTo.split('T')[0];
        cargarReporte();
    }));
    
    btnApplyCustom.addEventListener('click', () => {
        if(dateFromInput.value && dateToInput.value) {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            cargarReporte();
        } else {
            alert('Por favor, seleccione una fecha de inicio y de fin.');
        }
    });

    // --- ARRANQUE ---
    document.addEventListener('app-ready', () => {
        cargarFiltrosCategorias();
        // Cargar los datos iniciales con el filtro 'Hoy' por defecto
        document.querySelector('.btn-filter[data-range="today"]').click();
    });
});