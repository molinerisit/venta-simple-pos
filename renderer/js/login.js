document.addEventListener("DOMContentLoaded", () => {
  // --- Cargar logo y nombre del negocio desde configuración ---
  (async () => {
    try {
      const config = await window.electronAPI.invoke("get-admin-config");
      if (!config) return;

      const logoImg  = document.getElementById("auth-logo-img");
      const brandEl  = document.getElementById("auth-brand-name");

      if (config.nombre_negocio && brandEl) {
        brandEl.textContent = config.nombre_negocio;
      }

      if (config.logo_url && logoImg) {
        const src = `app://${config.logo_url}`;
        // Only swap if the image loads successfully; keep default on error
        const probe = new Image();
        probe.onload  = () => { logoImg.src = src; };
        probe.onerror = () => { /* keep ventasimple.png */ };
        probe.src = src;
      }
    } catch (_) {
      // Config not available yet (first run) — keep defaults silently
    }
  })();

  const loginForm = document.getElementById("login-form");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const errorMessage = document.getElementById("error-message");
  const submitButton = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

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

  attachEnterNav(loginForm);

  if (loginForm && submitButton) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // Deshabilitar el botón para prevenir clics múltiples
      submitButton.disabled = true;
      submitButton.textContent = "Ingresando...";

      // Limpiar errores anteriores
      if (errorMessage) errorMessage.textContent = "";

      const nombreUsuario = usernameInput.value;
      const passUsuario = passwordInput.value;

      try {
        const result = await window.electronAPI.invoke("login-attempt", {
          nombre: nombreUsuario,
          password: passUsuario,
        });

        if (result.success) {
          // --- LÓGICA CLAVE ---
          // Si el login fue exitoso en el backend, no hacemos NADA aquí.
          // El backend ya ha recibido la orden de cerrar esta ventana
          // y abrir la ventana principal. Simplemente esperamos.
          console.log("Login exitoso. Esperando transición de ventana desde el backend...");
          
        } else {
          // Si hubo un error (ej. contraseña incorrecta), lo mostramos.
          if (errorMessage) errorMessage.textContent = result.message || "Error desconocido.";
          // Volvemos a habilitar el botón si el login falla
          submitButton.disabled = false;
          submitButton.textContent = "Ingresar";
        }
      } catch (error) {
        console.error("Error en el proceso de login:", error);
        if (errorMessage) errorMessage.textContent = "Error de comunicación con el sistema.";
        // Volvemos a habilitar el botón en caso de error
        submitButton.disabled = false;
        submitButton.textContent = "Ingresar";
      }
    });
  }
});