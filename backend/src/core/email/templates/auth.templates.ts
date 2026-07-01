/* ═══════════════════════════════════════════════
   Plantillas de email de Auth (verificación · 2FA · reset · bienvenida).

   F4·W3: migradas al **layout maestro oficial** (`core/email/email-layout`) —
   DM Sans, azul Aelium, footer con persona real/RGPD, y **sin emojis** (D1).
   Siguen en código (no editables por el admin todavía). Contenido de usuario
   escapado con `esc()`.
   ═══════════════════════════════════════════════ */

import {
  buildEmailLayout,
  emailButton,
  emailCodeBox,
  emailHeading,
  emailNote,
  emailParagraph,
  esc,
} from '../email-layout';

// ── Email verification ──

export function verifyEmailTemplate(
  name: string,
  url: string,
): { subject: string; html: string } {
  return {
    subject: 'Verifica tu email — Aelium',
    html: buildEmailLayout({
      semantic: 'info',
      preheader: 'Confirma tu dirección de email para activar tu cuenta.',
      status: { label: 'Verifica tu email' },
      bodyHtml:
        emailHeading(`Hola, ${name}`) +
        emailParagraph(
          'Bienvenido a Aelium. Para activar tu cuenta, confirma tu dirección de email:',
        ) +
        emailButton('Verificar email', url) +
        emailNote(
          'Este enlace expira en 24 horas. Si no solicitaste esta cuenta, ignora este correo.',
        ),
    }),
  };
}

// ── 2FA code ──

export function twoFactorCodeTemplate(
  name: string,
  code: string,
): { subject: string; html: string } {
  return {
    subject: `${code} — Código de verificación Aelium`,
    html: buildEmailLayout({
      semantic: 'info',
      preheader: 'Tu código de verificación en dos pasos.',
      status: { label: 'Verificación en dos pasos' },
      bodyHtml:
        emailHeading('Código de verificación') +
        emailParagraph(
          `Hola ${esc(name)}, usa este código para completar tu inicio de sesión:`,
        ) +
        emailCodeBox(code) +
        emailNote(
          'El código expira en 5 minutos. Si no fuiste tú, cambia tu contraseña cuanto antes.',
        ),
    }),
  };
}

// ── Password reset ──

export function passwordResetTemplate(
  name: string,
  url: string,
): { subject: string; html: string } {
  return {
    subject: 'Restablecer contraseña — Aelium',
    html: buildEmailLayout({
      semantic: 'info',
      preheader: 'Crea una nueva contraseña para tu cuenta.',
      status: { label: 'Restablecer contraseña' },
      bodyHtml:
        emailHeading('Restablecer contraseña') +
        emailParagraph(
          `Hola ${esc(name)}, hemos recibido una solicitud para restablecer tu contraseña:`,
        ) +
        emailButton('Crear nueva contraseña', url) +
        emailNote(
          'Este enlace expira en 1 hora. Si no lo solicitaste, puedes ignorar este correo.',
        ),
    }),
  };
}

// ── Welcome (after verification) ──

export function welcomeTemplate(
  name: string,
  dashboardUrl: string,
): { subject: string; html: string } {
  return {
    subject: 'Bienvenido a Aelium',
    html: buildEmailLayout({
      semantic: 'success',
      preheader: 'Tu cuenta está lista. Entra a tu panel.',
      status: { label: 'Cuenta lista' },
      bodyHtml:
        emailHeading(`¡Bienvenido, ${name}!`) +
        emailParagraph(
          'Tu cuenta está verificada y lista. Ya puedes acceder a tu panel de gestión.',
        ) +
        emailButton('Ir a tu panel', dashboardUrl) +
        emailNote(
          'Si tienes dudas, estamos a tu lado. Escríbenos a hola@aelium.net.',
        ),
    }),
  };
}
