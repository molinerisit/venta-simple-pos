// renderer/js/mp_transactions.js (VERSIÓN FINAL Y ROBUSTA)

document.addEventListener('app-ready', () => { // Usamos app-ready por consistencia
    // --- REFERENCIAS ---
    const filterForm = document.getElementById('filter-form');
    const tableBody = document.querySelector('#transactions-table tbody');
    const btnRefresh = document.getElementById('btn-refresh');
    const toast = document.getElementById('toast-notification');
    let toastTimer;

    // --- FUNCIONES ---
    const showToast = (message, type = "error") => { // Por defecto es error para notificar problemas
        if (!toast) return;
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.className = 'toast';
        toast.classList.add(type, 'visible');
        toastTimer = setTimeout(() => {
            toast.classList.remove('visible');
        }, 3000);
    };

    const loadTransactions = async () => {
        const range = document.getElementById('range').value;
        const status = document.getElementById('status').value;

        // Construir filtros de fecha para la API de MP
        const now = new Date();
        let dateFrom = null;
        // La API de MP espera el formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
        const dateTo = now.toISOString();

        switch(range) {
            case 'today':
                dateFrom = new Date(now.setHours(0, 0, 0, 0)).toISOString();
                break;
            case 'last7days':
                dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                break;
            case 'last30days':
                dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                break;
        }

        const filters = { dateFrom, dateTo, status };
        console.log("[MP Transactions] Cargando transacciones con filtros:", filters);
        
        // 🟢 CORREGIDO: Colspan 5 para coincidir con el HTML
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando...</td></tr>';
        toggleButtonLoading(btnRefresh, true, "Refrescar");

        try {
            const result = await window.electronAPI.invoke('get-mp-transactions', filters);
            console.log("[MP Transactions] Resultado recibido del backend:", result);

            if (!result.success) {
                // 🟢 CORREGIDO: Colspan 5
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red;">${result.message}</td></tr>`;
                showToast(result.message);
                return;
            }
            renderTable(result.data);
        } catch (error) {
            console.error("[MP Transactions] Error crítico al invocar 'get-mp-transactions':", error);
            const errorMessage = "Error de comunicación con el sistema.";
            // 🟢 CORREGIDO: Colspan 5
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:red;">${errorMessage}</td></tr>`;
            showToast(errorMessage);
        } finally {
            toggleButtonLoading(btnRefresh, false, "Refrescar");
        }
    };
    
    const renderTable = (transactions) => {
        if (!transactions || transactions.length === 0) {
            // 🟢 CORREGIDO: Colspan 5
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No se encontraron transacciones.</td></tr>';
            return;
        }

        tableBody.innerHTML = transactions.map(tx => {
            // Validaciones para evitar errores de renderizado
            const formattedDate = tx.date_created ? new Date(tx.date_created).toLocaleString('es-AR') : 'Fecha no disponible';
            
            // 🟢 1. OBTENER PAGADOR (Nombre o Email)
            const payerName = (tx.payer?.first_name ? `${tx.payer.first_name} ${tx.payer.last_name || ''}`.trim() : tx.payer?.email);
            const payer = payerName || 'N/A';

            // 🟢 2. OBTENER DESCRIPCIÓN Y TIPO DE OPERACIÓN
            const description = tx.description || tx.external_reference || 'Sin descripción';
            const opType = tx.operation_type ? `(${tx.operation_type})` : ''; // ej: (regular_payment)

            const amount = (tx.transaction_amount ?? 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
            const status = tx.status || 'desconocido';
            
            // 🟢 3. CORREGIR EL HTML DE LA FILA (AHORA 5 CELDAS)
            return `
                <tr>
                    <td>${formattedDate}</td>
                    <td>${payer}</td>
                    <td>${opType} ${description}</td>
                    <td>${amount}</td>
                    <td><span class="status-badge status-${status}">${status}</span></td>
                </tr>
            `;
        }).join('');
    };

    const toggleButtonLoading = (button, isLoading, originalText) => {
        if (button) {
            if (!button.dataset.originalText && originalText) {
                button.dataset.originalText = originalText;
            }
            button.disabled = isLoading;
            button.textContent = isLoading ? "Cargando..." : (button.dataset.originalText || originalText);
        }
    };

    // --- EVENT LISTENERS ---
    if (filterForm) {
      filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        loadTransactions();
      });
    }

    if (btnRefresh) {
        btnRefresh.addEventListener('click', loadTransactions);
    }

    // --- CARGA INICIAL ---
    loadTransactions();
});