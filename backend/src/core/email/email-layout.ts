/* ═══════════════════════════════════════════════════════════
   email-layout — Layout MAESTRO oficial de los correos (F4·W3).

   Fuente de verdad: `mockup-uiux/Layout de Correo.dc.html` +
   `Correo Ejemplo Pago.dc.html`. Esqueleto común a todos los emails
   transaccionales: banda de acento semántica · cabecera · cuerpo (huecos) ·
   footer fijo (persona real · RGPD · preferencias). Documento de marca + DS.

   ── HTML de EMAIL, no de web ──
   Robusto en Gmail/Outlook/Apple Mail: **tablas + estilos inline** (no
   flexbox/grid — Outlook usa el motor de Word). Sin SVG (Gmail lo elimina,
   Outlook no lo pinta) → el estado se comunica con la **banda de acento** +
   **StatusDot** (D1: `●` con CSS) + **etiqueta de color**. Logo = wordmark de
   texto (el rombo con `transform:rotate` no funciona en email).
   Botones "bulletproof" (celda con bgcolor). Preheader oculto.

   Los correos en CÓDIGO (auth) llaman a `buildEmailLayout` con bloques; los de
   BD (notification_templates con `semantic`) los envuelve el render pipeline.
   ═══════════════════════════════════════════════════════════ */

export type EmailSemantic = 'info' | 'success' | 'warning' | 'danger';

interface SemanticStyle {
  accent: string; // banda superior + total destacado
  tint: string; // fondo del cuadro de estado
  fg: string; // color del texto/etiqueta de estado
}

const SEMANTIC: Record<EmailSemantic, SemanticStyle> = {
  info: { accent: '#3B82F6', tint: '#EFF4FF', fg: '#2563EB' },
  success: { accent: '#10B981', tint: '#ECFDF5', fg: '#059669' },
  warning: { accent: '#F59E0B', tint: '#FFFBEB', fg: '#B45309' },
  danger: { accent: '#EF4444', tint: '#FEF2F2', fg: '#DC2626' },
};

/** `true` si el string es un tono semántico válido. */
export function isEmailSemantic(value: unknown): value is EmailSemantic {
  return (
    value === 'info' ||
    value === 'success' ||
    value === 'warning' ||
    value === 'danger'
  );
}

/**
 * Colores del tono para inyectar en el payload de las plantillas de BD
 * (`{{email.accent}}`/`{{email.tint}}`/`{{email.fg}}`) — así el fragmento del
 * cuerpo (fila de estado, total) sigue el `semantic` de la plantilla.
 */
export function emailSemanticVars(semantic: EmailSemantic): SemanticStyle {
  return SEMANTIC[semantic];
}

const FONT_STACK =
  "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO_STACK = "'DM Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

const TEXT = '#0F172A';
const TEXT_2 = '#334155';
const MUTED = '#64748B';
const FAINT = '#94A3B8';
const BRAND = '#3B82F6';

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002';
}

/** Escape de contenido de texto (previene inyección HTML). */
export function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Bloques del cuerpo (huecos) ─────────────────────────────── */

/** Titular del mensaje (h1). `text` se escapa. */
export function emailHeading(text: string): string {
  return `<h1 style="margin:0 0 14px;font-family:${FONT_STACK};font-size:23px;font-weight:600;letter-spacing:-0.02em;line-height:1.25;color:${TEXT}">${esc(text)}</h1>`;
}

/**
 * Párrafo del cuerpo. `html` se inserta CRUDO (permite `<strong>` etc.) — el
 * caller debe escapar el contenido de usuario con `esc()`.
 */
export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 14px;font-family:${FONT_STACK};font-size:16px;line-height:1.62;color:${TEXT_2}">${html}</p>`;
}

/** Nota secundaria centrada (gris). `html` crudo. */
export function emailNote(html: string): string {
  return `<p style="margin:0 0 4px;font-family:${FONT_STACK};font-size:13.5px;line-height:1.6;color:${FAINT};text-align:center">${html}</p>`;
}

/** Botón primario "bulletproof" (celda con bgcolor — robusto en Outlook). */
export function emailButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px"><tr><td align="center" bgcolor="${BRAND}" style="border-radius:11px;background:${BRAND}"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:13px 30px;font-family:${FONT_STACK};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:11px">${esc(label)}</a></td></tr></table>`;
}

/** Botón secundario (contorno azul). */
export function emailButtonSecondary(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 6px;border-collapse:separate;border-spacing:0"><tr><td align="center" style="border:1px solid #C9DDFB;border-radius:11px"><a href="${esc(url)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:${FONT_STACK};font-size:14px;font-weight:600;color:#1D4ED8;text-decoration:none">${esc(label)}</a></td></tr></table>`;
}

/** Código de un solo uso (2FA) — dígitos espaciados sobre caja tintada. */
export function emailCodeBox(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px;border-collapse:separate;border-spacing:0"><tr><td align="center" bgcolor="#EFF4FF" style="border-radius:12px;background:#EFF4FF;border:1px solid #DBEAFE;padding:16px 34px"><span style="font-family:${MONO_STACK};font-size:30px;font-weight:600;letter-spacing:9px;color:${TEXT}">${esc(code)}</span></td></tr></table>`;
}

/** Aviso / callout con el color semántico del evento. `html` crudo. */
export function emailCallout(semantic: EmailSemantic, html: string): string {
  const s = SEMANTIC[semantic];
  // border-collapse:separate → el radio del borde del <td> se respeta (con el
  // `collapse` global el borde saldría cuadrado). 1:1 mockup (radius 12 + borde).
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:separate;border-spacing:0"><tr><td bgcolor="${s.tint}" style="background:${s.tint};border:1px solid ${s.accent}33;border-radius:12px;padding:15px 17px;font-family:${FONT_STACK};font-size:14px;line-height:1.55;color:${s.fg}">${html}</td></tr></table>`;
}

export interface DataRow {
  label: string;
  value: string;
}

/**
 * Caja de datos (resumen etiqueta-valor + total destacado opcional).
 * `label`/`value` se escapan. El total usa el color de acento del semantic.
 */
export function emailDataBox(
  rows: DataRow[],
  total?: { label: string; value: string; semantic?: EmailSemantic },
): string {
  const rowsHtml = rows
    .map(
      (r) =>
        `<tr><td style="padding:7px 0;font-family:${FONT_STACK};font-size:14px;color:${MUTED}">${esc(r.label)}</td><td align="right" style="padding:7px 0;font-family:${FONT_STACK};font-size:14px;font-weight:600;color:${TEXT}">${esc(r.value)}</td></tr>`,
    )
    .join('');
  const totalHtml = total
    ? `<tr><td colspan="2" style="padding:12px 0 0"><div style="height:1px;background:#E6ECF3;margin-bottom:12px;font-size:0;line-height:0">&nbsp;</div></td></tr>` +
      `<tr><td style="font-family:${FONT_STACK};font-size:14px;font-weight:600;color:${TEXT}">${esc(total.label)}</td><td align="right" style="font-family:${FONT_STACK};font-size:18px;font-weight:700;letter-spacing:-0.01em;color:${SEMANTIC[total.semantic ?? 'info'].fg}">${esc(total.value)}</td></tr>`
    : '';
  // Caja redondeada CON borde: el `<style>` global pone `border-collapse:collapse`
  // y con collapse el navegador ignora el `border-radius` de una <table>. Para una
  // tabla *bordeada* la forma correcta es forzar `border-collapse:separate` inline
  // (el radio se aplica al borde). `overflow:hidden` NO sirve aquí: recortaría el
  // borde de 1px. 1:1 con la caja del mockup (border #E6ECF3 + radius 12).
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border:1px solid #E6ECF3;border-radius:12px;border-collapse:separate;border-spacing:0;background:#F8FAFF"><tr><td style="padding:18px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}${totalHtml}</table></td></tr></table>`;
}

/* ── Fila de estado + layout maestro ─────────────────────────── */

/**
 * Fila de estado (cuadro tintado + StatusDot + etiqueta + subetiqueta mono).
 * D1: sin emoji ni SVG — color semántico + dot + texto. `label`/`sublabel` se
 * escapan. La incluye `buildEmailLayout` si se pasa `status`.
 */
function statusRow(
  semantic: EmailSemantic,
  label: string,
  sublabel?: string,
): string {
  const s = SEMANTIC[semantic];
  const sub = sublabel
    ? `<div style="font-family:${MONO_STACK};font-size:12.5px;color:${FAINT};margin-top:2px">${esc(sublabel)}</div>`
    : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 26px"><tr>
    <td valign="middle" style="padding-right:13px"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td align="center" valign="middle" width="44" height="44" bgcolor="${s.tint}" style="width:44px;height:44px;background:${s.tint};border-radius:12px"><img src="${appUrl()}/brand/email/status-${semantic}.png" width="21" height="21" alt="" style="display:block;border:0"></td></tr></table></td>
    <td valign="middle"><div style="font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1.3;color:${s.fg}">${esc(label)}</div>${sub}</td>
  </tr></table>`;
}

function footer(legalLine?: string): string {
  const url = appUrl();
  const year = new Date().getFullYear();
  const link = (text: string, href: string): string =>
    `<a href="${esc(href)}" target="_blank" style="color:${BRAND};text-decoration:none">${esc(text)}</a>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F8FAFF" style="background:#F8FAFF;border-top:1px solid #EFF1F5"><tr><td align="center" style="padding:28px 44px 30px;text-align:center">
    <p style="margin:0 auto 20px;max-width:380px;font-family:${FONT_STACK};font-size:13.5px;line-height:1.6;color:#475569">Responde a este correo — te contesta una persona real, no un bot.</p>
    <div style="margin-bottom:6px"><img src="${url}/brand/email/logo.png" width="31" height="20" alt="" style="display:inline-block;vertical-align:middle;margin-right:8px;border:0"><span style="font-family:${FONT_STACK};font-size:15px;font-weight:600;letter-spacing:-0.02em;color:#475569;vertical-align:middle">aelium</span></div>
    <div style="font-family:${FONT_STACK};font-size:12px;color:${FAINT};margin-bottom:18px">Tu socio digital, a tu lado.</div>
    <div style="font-family:${FONT_STACK};font-size:12px;color:${BRAND};font-weight:500;margin-bottom:16px;line-height:1.9">${link('Ir a tu panel', `${url}/dashboard`)}<span style="color:#CBD5E1;margin:0 8px">·</span>${link('Centro de transparencia', `${url}/dashboard/transparency`)}<span style="color:#CBD5E1;margin:0 8px">·</span>${link('Preferencias de notificación', `${url}/dashboard/settings`)}</div>
    <div style="font-family:${FONT_STACK};font-size:11.5px;color:#A6B2C2;line-height:1.75;border-top:1px solid #EAEFF5;padding-top:15px;max-width:440px;margin:0 auto">${legalLine ?? `© ${year} Aelium`}<br>Recibes este correo porque tienes una cuenta en Aelium. · Tus datos, en Europa.</div>
  </td></tr></table>`;
}

export interface EmailLayoutOptions {
  semantic: EmailSemantic;
  /** Texto de preview oculto (bandeja de entrada). */
  preheader?: string;
  /** Fila de estado (cuadro + etiqueta). Si se omite, no se renderiza. */
  status?: { label: string; sublabel?: string };
  /** Cuerpo (los "huecos"): heading + párrafos + caja de datos + CTA + nota. */
  bodyHtml: string;
  /**
   * Línea legal del footer (razón social + dirección fiscal), ya formateada.
   * La inyecta el render pipeline desde los settings `branding.*`. Si se omite
   * (p. ej. correos de auth en código), el footer usa `© {año} Aelium`.
   */
  legal?: string;
}

/**
 * Envuelve el cuerpo en el layout maestro (banda de acento · cabecera · cuerpo
 * · footer). HTML de email robusto (tablas + inline). Devuelve el documento
 * HTML completo listo para enviar.
 */
export function buildEmailLayout(opts: EmailLayoutOptions): string {
  const s = SEMANTIC[opts.semantic];
  const pre = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F4F6F9">${esc(opts.preheader)}</div>`
    : '';
  const status = opts.status
    ? statusRow(opts.semantic, opts.status.label, opts.status.sublabel)
    : '';

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<title>Aelium</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; width:100% !important; background:#E9EEF4; }
  table { border-collapse:collapse; }
  a { text-decoration:none; }
  @media only screen and (max-width:620px) {
    .email-card { width:100% !important; border-radius:0 !important; }
    .email-pad { padding-left:24px !important; padding-right:24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#E9EEF4">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#E9EEF4" style="background:#E9EEF4">
<tr><td align="center" style="padding:42px 16px 60px">
  <table role="presentation" class="email-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 14px 44px rgba(15,23,42,0.10),0 2px 8px rgba(15,23,42,0.04)">
    <tr><td height="4" style="height:4px;line-height:4px;font-size:0;background:${s.accent}">&nbsp;</td></tr>
    <tr><td class="email-pad" align="center" style="padding:30px 44px 24px;border-bottom:1px solid #EFF1F5">
      <img src="${appUrl()}/brand/email/logo.png" width="48" height="31" alt="" style="display:inline-block;vertical-align:middle;margin-right:10px;border:0"><span style="font-family:${FONT_STACK};font-size:21px;font-weight:600;letter-spacing:-0.02em;color:${TEXT};vertical-align:middle">aelium</span>
    </td></tr>
    <tr><td class="email-pad" style="padding:32px 44px 8px">
      ${status}
      ${opts.bodyHtml}
    </td></tr>
    <tr><td class="email-pad">${footer(opts.legal)}</td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
