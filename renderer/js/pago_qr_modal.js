// renderer/js/pago_qr_modal.js

document.addEventListener("DOMContentLoaded", () => {
  // --- REFERENCIAS AL DOM (IDs originales de tu archivo) ---
  const amountEl = document.getElementById("qr-amount");
  const statusMsgEl = document.getElementById("status-message");
  const btnCancelar = document.getElementById("btn-cancelar-pago");

  const spinnerEl = document.getElementById("spinner");
  const successIconEl = document.getElementById("success-icon");
  const errorIconEl = document.getElementById("error-icon");

  // --- ESTADO ---
  let pollingInterval;
  let externalReference;

  // --- FUNCIONES ---
  const formatCurrency = (value) =>
    (value || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });

  const setUIState = (state) => {
    if (spinnerEl) spinnerEl.classList.toggle("oculto", state !== "polling");
    if (successIconEl) successIconEl.classList.toggle("oculto", state !== "success");
    if (errorIconEl) errorIconEl.classList.toggle("oculto", state !== "error");
  };

  const startPolling = () => {
    if (!externalReference) {
      statusMsgEl.textContent = "Error: Falta la referencia.";
      setUIState("error");
      return;
    }

    // Limpiar intervalo anterior si existiera
    clearInterval(pollingInterval);

    pollingInterval = setInterval(async () => {
      try {
        console.log("Polling... ", externalReference); // Log para saber que está vivo
        const result = await window.electronAPI.invoke(
          "check-mp-payment-status",
          { externalReference }
        );

        // ======================================================
        // 🟢 INICIO: ESTA ES LA CORRECCIÓN PRINCIPAL
        // ======================================================
        
        // El backend ahora devuelve { ok: true, data: { status: '...' } }
        if (result.ok) {
          const status = result.data.status;
          const paymentData = result.data.paymentData;

          if (statusMsgEl) statusMsgEl.textContent = `Estado: ${status}...`;

          if (status === "approved") {
            handlePaymentSuccess(paymentData); // Pasamos los datos del pago
          } else if (status === "rejected" || status === "cancelled") {
            handlePaymentFailure(`Pago ${status}.`);
          }
          // Si es "pending", no hace nada, y el loop (setInterval) continúa
          
        } else {
          // El backend devolvió { ok: false, error: '...' }
          handlePaymentFailure(result.error || "Error al consultar estado.");
        }
        // ======================================================
        // 🟢 FIN: CORRECCIÓN PRINCIPAL
        // ======================================================

      } catch (error) {
        console.error("Error en polling:", error);
        handlePaymentFailure("Error de comunicación con el sistema.");
      }
    }, 3000); // Preguntar cada 3 segundos
  };

  const handlePaymentSuccess = (paymentData) => { // 🟢 Recibe paymentData
    clearInterval(pollingInterval);
    setUIState("success");
    if (statusMsgEl) statusMsgEl.textContent = "¡Pago Aprobado!";
    if (btnCancelar) btnCancelar.disabled = true;
    
    // 🟢 Enviar la referencia Y los datos del pago a la ventana de caja
    window.electronAPI.send("mp-payment-approved", { 
      externalReference: externalReference,
      paymentData: paymentData 
    });
    
    setTimeout(() => window.close(), 2000);
  };

  const handlePaymentFailure = (message) => {
    clearInterval(pollingInterval);
    setUIState("error");
    if (statusMsgEl) statusMsgEl.textContent = message;
    if (btnCancelar) btnCancelar.textContent = "Cerrar";
  };

  // --- EVENT LISTENERS ---
  window.electronAPI.on("venta-data", (data) => {
    // 🟢 CORRECCIÓN: No necesitamos 'qrData' aquí,
    // porque tu modal original no lo renderiza (usa QR físico).
    if (!data || typeof data.total !== "number" || !data.externalReference) {
      setUIState("error");
      if (statusMsgEl) statusMsgEl.textContent = "Error: Datos de la venta inválidos.";
      console.error("Datos recibidos en modal:", data);
      return;
    }

    externalReference = data.externalReference;
    // 🟢 Usamos la función formatCurrency para mostrar el $
    if (amountEl) amountEl.textContent = formatCurrency(data.total);

    if (statusMsgEl) statusMsgEl.textContent = "Esperando pago del cliente...";
    setUIState("polling");
    startPolling(); // Inicia la verificación de estado
  });

  btnCancelar.addEventListener("click", () => {
    clearInterval(pollingInterval);
    window.electronAPI.send("payment-cancelled");
    window.close();
  });

  window.onbeforeunload = () => {
    clearInterval(pollingInterval);
  };
});