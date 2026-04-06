document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("login-form");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const errorMessage = document.getElementById("error-message");
  const submitButton = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

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