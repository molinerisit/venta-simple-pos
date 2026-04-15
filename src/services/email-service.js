// src/services/email-service.js
// Sends emails via Gmail using an App Password (nodemailer).
const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4 for all DNS lookups in this process.
// On Windows, Node.js often resolves smtp.gmail.com to an IPv6 address
// (e.g. 2800:3f0:4003:…) that is blocked or unreachable on local networks,
// causing ECONNREFUSED. Preferring IPv4 avoids the issue entirely.
dns.setDefaultResultOrder('ipv4first');

/**
 * Creates a Gmail transporter with the given credentials.
 * Throws if credentials are missing.
 */
function createTransporter(gmailUser, gmailPass) {
  if (!gmailUser || !gmailPass) {
    throw new Error('Configurá el correo Gmail y la contraseña de aplicación en Configuración → Avanzado antes de usar esta función.');
  }

  // Remove spaces from app password (Google shows it with spaces for readability)
  const pass = String(gmailPass).replace(/\s+/g, '');

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,   // SSL/TLS on port 465
    auth: {
      user: gmailUser,
      pass,
    },
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    },
  });
}

/**
 * Verifies that the Gmail credentials work.
 * Returns { success: true } or { success: false, message }.
 */
async function testConnection(gmailUser, gmailPass) {
  try {
    const transporter = createTransporter(gmailUser, gmailPass);
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

/**
 * Sends a password-recovery token email.
 * @param {string} gmailUser   - sender Gmail address
 * @param {string} gmailPass   - app password (with or without spaces)
 * @param {string} toEmail     - recipient email
 * @param {string} token       - 6-digit code
 * @param {string} negocioName - business name shown in the email
 */
async function sendRecoveryToken(gmailUser, gmailPass, toEmail, token, negocioName = 'Venta Simple') {
  const transporter = createTransporter(gmailUser, gmailPass);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 420px; margin: 0 auto; padding: 32px 24px; background: #f8fafc;">
      <div style="background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
        <h2 style="margin: 0 0 8px; font-size: 1.2rem; color: #0f172a;">${negocioName}</h2>
        <p style="margin: 0 0 24px; color: #64748b; font-size: 0.875rem;">Recuperación de contraseña</p>
        <p style="margin: 0 0 12px; color: #374151; font-size: 0.9rem;">Usá el siguiente código para restablecer tu contraseña. Válido por <strong>15 minutos</strong>.</p>
        <div style="background: #eff6ff; border: 2px solid #2563eb; border-radius: 10px; padding: 18px; text-align: center; margin: 20px 0;">
          <span style="font-size: 2.2rem; font-weight: 800; letter-spacing: 0.18em; color: #1d4ed8;">${token}</span>
        </div>
        <p style="margin: 16px 0 0; color: #9ca3af; font-size: 0.8rem;">Si no solicitaste este código, ignorá este mensaje. Tu contraseña no cambiará.</p>
      </div>
    </div>
  `;

  const info = await transporter.sendMail({
    from: `"${negocioName}" <${gmailUser}>`,
    to: toEmail,
    subject: `${token} — Código de recuperación · ${negocioName}`,
    html,
    text: `Tu código de recuperación es: ${token}\nVálido por 15 minutos.`,
  });

  return { success: true, messageId: info.messageId };
}

module.exports = { testConnection, sendRecoveryToken };
