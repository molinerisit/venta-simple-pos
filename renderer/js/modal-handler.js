// renderer/js/modal-handler.js
function GESTIONAR_MODAL_INPUT() {
    const inputModal = document.getElementById("input-modal");
    if (!inputModal) return { solicitarInput: () => Promise.resolve(null) };

    const inputModalTitulo = document.getElementById("input-modal-titulo");
    const inputModalValor = document.getElementById("input-modal-valor");
    const inputModalGuardar = document.getElementById("input-modal-guardar");
    const inputModalCancelar = document.getElementById("input-modal-cancelar");

    const solicitarInput = (titulo) => {
        return new Promise((resolve) => {
            inputModalTitulo.textContent = titulo;
            inputModalValor.value = "";
            inputModal.classList.add("visible");
            inputModalValor.focus();

            // Usamos .once para que los listeners se limpien solos después de usarse
            const options = { once: true };

            const guardarListener = () => {
                const valor = inputModalValor.value.trim();
                cerrarYResolver(valor);
            };

            const cancelarListener = () => {
                cerrarYResolver(null);
            };

            const enterListener = (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    guardarListener();
                }
            };

            const cerrarYResolver = (value) => {
                inputModal.classList.remove("visible");
                // Removemos los listeners explícitamente por si acaso
                inputModalGuardar.removeEventListener("click", guardarListener);
                inputModalCancelar.removeEventListener("click", cancelarListener);
                inputModalValor.removeEventListener("keydown", enterListener);
                resolve(value);
            };

            inputModalGuardar.addEventListener("click", guardarListener, options);
            inputModalCancelar.addEventListener("click", cancelarListener, options);
            inputModalValor.addEventListener("keydown", enterListener); // Este no puede ser 'once'
        });
    };

    return { solicitarInput };
}