// renderer/js/setup.js (VERSIÓN FINAL)
document.addEventListener('DOMContentLoaded', () => {
    const setupForm = document.getElementById('setup-form');
    const nombreInput = document.getElementById('nombre');
    const passwordInput = document.getElementById('password');
    // ✅ CORREGIDO: Apunta al ID correcto que añadimos en el HTML
    const messageDiv = document.getElementById('message'); 
    const submitButton = setupForm.querySelector('button[type="submit"]');

    if (!setupForm) {
        console.error("El formulario de setup no fue encontrado en el DOM.");
        return;
    }

    setupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Deshabilitar el botón para evitar envíos múltiples
        submitButton.disabled = true;
        submitButton.textContent = 'Creando...';
        messageDiv.textContent = ''; // Limpiar mensajes anteriores

        const nombre = nombreInput.value;
        const password = passwordInput.value;

        try {
            const result = await window.electronAPI.invoke('submit-setup', { nombre, password });

            if (result.success) {
                messageDiv.textContent = '¡Administrador creado con éxito! Redirigiendo al login...';
                messageDiv.style.color = 'green';
                
                // Esperamos un momento para que el usuario vea el mensaje
                setTimeout(() => {
                    // ✅ Enviamos el mensaje al proceso principal para que cambie de ventana
                    window.electronAPI.send('setup-complete');
                }, 1500); // 1.5 segundos

            } else {
                // El error viene del backend (ej: usuario duplicado)
                messageDiv.textContent = `Error: ${result.message}`;
                messageDiv.style.color = 'red';
                submitButton.disabled = false; // Habilitar el botón de nuevo si hay error
                submitButton.textContent = 'Crear y Empezar';
            }
        } catch (error) {
            // Error de comunicación con el backend
            console.error("Error en el invoke de 'submit-setup':", error);
            messageDiv.textContent = 'Error de comunicación. Intente de nuevo.';
            messageDiv.style.color = 'red';
            submitButton.disabled = false;
            submitButton.textContent = 'Crear y Empezar';
        }
    });
});