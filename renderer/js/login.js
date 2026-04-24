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
  const rememberChk   = document.getElementById("remember-me");
  const errorMessage  = document.getElementById("error-message");
  const submitButton  = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

  // ── Recordar usuario y contraseña ───────────────────────────────
  const STORAGE_KEY = 'vs_remember';
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.u) {
      if (usernameInput) usernameInput.value = saved.u;
      if (passwordInput) passwordInput.value = saved.p || '';
      if (rememberChk)   rememberChk.checked = true;
    }
  } catch (_) { /* ignore */ }

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

  // ── Primera vez: mostrar link si no hay admin regular ──────────
  const btnCreateAdmin = document.getElementById("btn-create-admin");
  if (btnCreateAdmin) {
    window.electronAPI.invoke("check-admin-exists").then(({ exists }) => {
      if (!exists) btnCreateAdmin.style.display = "";
    }).catch(() => {});
    btnCreateAdmin.addEventListener("click", () => {
      window.electronAPI.invoke("open-setup-window").catch(() => {});
    });
  }

  // ── Recuperación de contraseña ──────────────────────────────
  const recoveryPanel   = document.getElementById("recovery-panel");
  const btnForgot       = document.getElementById("btn-forgot-password");
  const btnBackToLogin  = document.getElementById("btn-back-to-login");

  const recStep1   = document.getElementById("recovery-step-1");
  const recStep2   = document.getElementById("recovery-step-2");
  const recStep3   = document.getElementById("recovery-step-3");
  const recError1  = document.getElementById("rec-error-1");
  const recError2  = document.getElementById("rec-error-2");
  const recError3  = document.getElementById("rec-error-3");
  const recSentMsg = document.getElementById("rec-sent-msg");

  const btnSendToken    = document.getElementById("btn-send-token");
  const btnVerifyToken  = document.getElementById("btn-verify-token");
  const btnResetPwd     = document.getElementById("btn-reset-password");
  const recTokenInput   = document.getElementById("rec-token-input");
  const recNewPass      = document.getElementById("rec-new-pass");
  const recConfirmPass  = document.getElementById("rec-confirm-pass");

  // Token verified locally so we can pass it on step 3
  let _verifiedToken = null;

  function showRecovery(step) {
    loginForm.style.display    = "none";
    recoveryPanel.style.display = "";
    recStep1.style.display = step === 1 ? "" : "none";
    recStep2.style.display = step === 2 ? "" : "none";
    recStep3.style.display = step === 3 ? "" : "none";
  }

  function showLogin() {
    loginForm.style.display     = "";
    recoveryPanel.style.display = "none";
    _verifiedToken = null;
  }

  if (btnForgot) {
    btnForgot.addEventListener("click", () => {
      if (recError1) recError1.textContent = "";
      showRecovery(1);
    });
  }

  if (btnBackToLogin) {
    btnBackToLogin.addEventListener("click", showLogin);
  }

  // Password visibility toggle in recovery panel
  const recToggleBtn = recNewPass ? recNewPass.closest(".password-wrapper")?.querySelector(".toggle-password") : null;
  if (recToggleBtn && recNewPass) {
    recToggleBtn.addEventListener("click", () => {
      const isHidden = recNewPass.type === "password";
      recNewPass.type = isHidden ? "text" : "password";
      recToggleBtn.querySelector(".eye-show").style.display = isHidden ? "none" : "";
      recToggleBtn.querySelector(".eye-hide").style.display = isHidden ? "" : "none";
    });
  }

  // Step 1: send token
  if (btnSendToken) {
    btnSendToken.addEventListener("click", async () => {
      recError1.textContent = "";
      btnSendToken.disabled = true;
      btnSendToken.textContent = "Enviando...";
      try {
        const res = await window.electronAPI.invoke("send-recovery-token");
        if (res.success) {
          recSentMsg.textContent = `Código enviado a ${res.maskedEmail}. Revisá tu casilla (puede tardar unos segundos).`;
          recError2.textContent = "";
          if (recTokenInput) recTokenInput.value = "";
          showRecovery(2);
          setTimeout(() => recTokenInput && recTokenInput.focus(), 80);
        } else {
          recError1.textContent = res.message || "No se pudo enviar el código.";
        }
      } catch (e) {
        recError1.textContent = "Error de comunicación.";
      } finally {
        btnSendToken.disabled = false;
        btnSendToken.textContent = "Enviar código";
      }
    });
  }

  // Step 2: verify token
  if (btnVerifyToken) {
    btnVerifyToken.addEventListener("click", async () => {
      recError2.textContent = "";
      const token = recTokenInput ? recTokenInput.value.trim() : "";
      if (!/^\d{6}$/.test(token)) {
        recError2.textContent = "Ingresá el código de 6 dígitos.";
        return;
      }
      btnVerifyToken.disabled = true;
      btnVerifyToken.textContent = "Verificando...";
      try {
        const res = await window.electronAPI.invoke("verify-recovery-token", { token });
        if (res.success) {
          _verifiedToken = token;
          recError3.textContent = "";
          if (recNewPass)     recNewPass.value = "";
          if (recConfirmPass) recConfirmPass.value = "";
          showRecovery(3);
          setTimeout(() => recNewPass && recNewPass.focus(), 80);
        } else {
          recError2.textContent = res.message || "Código incorrecto.";
        }
      } catch (e) {
        recError2.textContent = "Error de comunicación.";
      } finally {
        btnVerifyToken.disabled = false;
        btnVerifyToken.textContent = "Verificar código";
      }
    });
  }

  // Step 3: reset password
  if (btnResetPwd) {
    btnResetPwd.addEventListener("click", async () => {
      recError3.textContent = "";
      const np = recNewPass     ? recNewPass.value     : "";
      const cp = recConfirmPass ? recConfirmPass.value : "";
      if (np.length < 6) {
        recError3.textContent = "La contraseña debe tener al menos 6 caracteres.";
        return;
      }
      if (np !== cp) {
        recError3.textContent = "Las contraseñas no coinciden.";
        return;
      }
      if (!_verifiedToken) {
        recError3.textContent = "Sesión expirada. Empezá de nuevo.";
        showRecovery(1);
        return;
      }
      btnResetPwd.disabled = true;
      btnResetPwd.textContent = "Guardando...";
      try {
        const res = await window.electronAPI.invoke("reset-password-with-token", {
          token: _verifiedToken,
          newPassword: np,
        });
        if (res.success) {
          _verifiedToken = null;
          showLogin();
          if (errorMessage) {
            errorMessage.style.color = "#16a34a";
            errorMessage.style.background = "#f0fdf4";
            errorMessage.style.borderColor = "#bbf7d0";
            errorMessage.textContent = "Contraseña cambiada. Podés iniciar sesión.";
          }
        } else {
          recError3.textContent = res.message || "Error al cambiar la contraseña.";
        }
      } catch (e) {
        recError3.textContent = "Error de comunicación.";
      } finally {
        btnResetPwd.disabled = false;
        btnResetPwd.textContent = "Cambiar contraseña";
      }
    });
  }

  // Allow Enter key on token input to trigger verify
  if (recTokenInput) {
    recTokenInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); btnVerifyToken && btnVerifyToken.click(); }
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
          // Guardar o borrar credenciales según el checkbox
          try {
            if (rememberChk && rememberChk.checked) {
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ u: nombreUsuario, p: passUsuario }));
            } else {
              localStorage.removeItem(STORAGE_KEY);
            }
          } catch (_) { /* ignore */ }

          // El backend cierra esta ventana y abre la principal. Solo esperamos.
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

document.getElementById("btn-abrir-soporte")?.addEventListener("click", () => {
  window.electronAPI?.invoke("open-soporte").catch(() => {});
});
