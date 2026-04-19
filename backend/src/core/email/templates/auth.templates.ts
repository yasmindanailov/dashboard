/* ═══════════════════════════════════════════════
   Plantillas de email base para Auth
   Estas son plantillas hardcodeadas para Sprint 2.
   En el futuro, el admin podrá editarlas desde el dashboard.
   ═══════════════════════════════════════════════ */

const BRAND_COLOR = '#3B82F6';
const BRAND_NAME = 'Aelium';

/** Escape user-supplied strings to prevent HTML injection in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f7f7f8;font-family:'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
    <!-- Header -->
    <div style="padding:32px 40px 24px;border-bottom:1px solid #f0f0f0;">
      <span style="font-size:22px;font-weight:600;color:#0a0a0b;letter-spacing:-0.5px;">${BRAND_NAME}</span>
    </div>
    <!-- Content -->
    <div style="padding:32px 40px;">
      ${content}
    </div>
    <!-- Footer -->
    <div style="padding:24px 40px;background:#f7f7f8;border-top:1px solid #f0f0f0;">
      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
        ${BRAND_NAME} · Tu socio digital, a tu lado
      </p>
    </div>
  </div>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `
    <div style="text-align:center;margin:28px 0;">
      <a href="${url}" style="display:inline-block;padding:14px 32px;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:500;font-size:15px;">
        ${text}
      </a>
    </div>`;
}

// ── Email verification ──

export function verifyEmailTemplate(name: string, url: string): { subject: string; html: string } {
  return {
    subject: 'Verifica tu email — Aelium',
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#0a0a0b;">Hola, ${escapeHtml(name)} 👋</h2>
      <p style="margin:0 0 4px;font-size:15px;color:#6b7280;line-height:1.6;">
        Bienvenido a Aelium. Para activar tu cuenta, confirma tu dirección de email:
      </p>
      ${button('Verificar email', url)}
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Este enlace expira en 24 horas. Si no solicitaste esta cuenta, ignora este email.
      </p>
    `),
  };
}

// ── 2FA code ──

export function twoFactorCodeTemplate(name: string, code: string): { subject: string; html: string } {
  return {
    subject: `${code} — Código de verificación Aelium`,
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#0a0a0b;">Código de verificación</h2>
      <p style="margin:0 0 20px;font-size:15px;color:#6b7280;line-height:1.6;">
        Hola ${escapeHtml(name)}, usa este código para completar tu inicio de sesión:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <span style="display:inline-block;padding:16px 40px;background:#f0f4ff;border:2px solid ${BRAND_COLOR};border-radius:12px;font-size:32px;font-weight:700;letter-spacing:8px;color:#0a0a0b;">
          ${escapeHtml(code)}
        </span>
      </div>
      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
        El código expira en 5 minutos. Si no fuiste tú, cambia tu contraseña inmediatamente.
      </p>
    `),
  };
}

// ── Password reset ──

export function passwordResetTemplate(name: string, url: string): { subject: string; html: string } {
  return {
    subject: 'Resetear contraseña — Aelium',
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#0a0a0b;">Resetear contraseña</h2>
      <p style="margin:0 0 4px;font-size:15px;color:#6b7280;line-height:1.6;">
        Hola ${escapeHtml(name)}, hemos recibido una solicitud para resetear tu contraseña:
      </p>
      ${button('Crear nueva contraseña', url)}
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Este enlace expira en 1 hora. Si no solicitaste esto, puedes ignorar este email.
      </p>
    `),
  };
}

// ── Welcome (after verification) ──

export function welcomeTemplate(name: string, dashboardUrl: string): { subject: string; html: string } {
  return {
    subject: 'Bienvenido a Aelium 🎉',
    html: layout(`
      <h2 style="margin:0 0 8px;font-size:20px;color:#0a0a0b;">¡Bienvenido, ${escapeHtml(name)}! 🎉</h2>
      <p style="margin:0 0 4px;font-size:15px;color:#6b7280;line-height:1.6;">
        Tu cuenta está verificada y lista. Ya puedes acceder a tu panel de gestión.
      </p>
      ${button('Ir al dashboard', dashboardUrl)}
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Si tienes dudas, estamos a tu lado. Escríbenos a hola@aelium.net.
      </p>
    `),
  };
}
