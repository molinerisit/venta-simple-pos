// renderer/js/setup.js (VERSIÓN FINAL)
document.addEventListener('DOMContentLoaded', () => {
    // ── Step 2: negocio info ──────────────────────────────────────────────────
    const cardNegocio   = document.getElementById('card-negocio');
    const negocioForm   = document.getElementById('negocio-form');
    const negNombre     = document.getElementById('neg-nombre');
    const negDireccion  = document.getElementById('neg-direccion');
    const negMsg        = document.getElementById('negocio-message');
    const btnSkip       = document.getElementById('btn-skip-negocio');

    function goToStep2() {
      const step1Card = document.querySelector('.auth-card');
      if (step1Card) step1Card.style.display = 'none';
      if (cardNegocio) cardNegocio.style.display = 'block';
      if (negNombre) negNombre.focus();
    }

    async function finishSetup({ nombre, direccion }) {
      try {
        await window.electronAPI.invoke('save-business-info', { nombre, direccion });
      } catch (_) {}
      window.electronAPI.send('setup-complete');
    }

    if (negocioForm) {
      attachEnterNav(negocioForm);
      negocioForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = negocioForm.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Guardando...';
        await finishSetup({
          nombre:    negNombre?.value.trim()    || '',
          direccion: negDireccion?.value.trim() || '',
        });
      });
    }

    if (btnSkip) {
      btnSkip.addEventListener('click', () => finishSetup({ nombre: '', direccion: '' }));
    }
    const setupForm = document.getElementById('setup-form');
    const nombreInput = document.getElementById('nombre');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    // ✅ CORREGIDO: Apunta al ID correcto que añadimos en el HTML
    const messageDiv = document.getElementById('message'); 
    const submitButton = setupForm.querySelector('button[type="submit"]');

    // Password visibility toggle
    const toggleBtn = document.querySelector('.toggle-password');
    if (toggleBtn && passwordInput) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        toggleBtn.querySelector('.eye-show').style.display = isHidden ? 'none' : '';
        toggleBtn.querySelector('.eye-hide').style.display = isHidden ? '' : 'none';
      });
    }

    if (!setupForm) {
        console.error("El formulario de setup no fue encontrado en el DOM.");
        return;
    }

    attachEnterNav(setupForm);

    setupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Deshabilitar el botón para evitar envíos múltiples
        submitButton.disabled = true;
        submitButton.textContent = 'Creando...';
        messageDiv.textContent = ''; // Limpiar mensajes anteriores
        messageDiv.className = 'auth-message';

        const nombre = nombreInput.value;
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput.value;

        try {
            const result = await window.electronAPI.invoke('submit-setup', { nombre, email, password });

            if (result.success) {
                messageDiv.textContent = '¡Administrador creado con éxito! Redirigiendo al login...';
                messageDiv.className = 'auth-message success';

                // Esperamos un momento para que el usuario vea el mensaje
                setTimeout(() => {
                    goToStep2();
                }, 800);

            } else {
                // El error viene del backend (ej: usuario duplicado)
                messageDiv.textContent = `Error: ${result.message}`;
                messageDiv.className = 'auth-message error';
                submitButton.disabled = false; // Habilitar el botón de nuevo si hay error
                submitButton.textContent = 'Crear y Empezar';
            }
        } catch (error) {
            // Error de comunicación con el backend
            console.error("Error en el invoke de 'submit-setup':", error);
            messageDiv.textContent = 'Error de comunicación. Intente de nuevo.';
            messageDiv.className = 'auth-message error';
            submitButton.disabled = false;
            submitButton.textContent = 'Crear y Empezar';
        }
    });
});