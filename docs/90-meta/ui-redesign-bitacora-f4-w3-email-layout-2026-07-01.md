# Bitácora F4·W3 — Layout maestro de correos · 2026-07-01

> Layout **oficial** de los emails transaccionales. Fuente de verdad:
> `mockup-uiux/Layout de Correo.dc.html` + `Correo Ejemplo Pago.dc.html`.
> Rama `redesign/f4-email-layout` **desde master** (con auth #152 dentro).
> Scope (decisión Yasmin): **fundación + referencia** (no barrido completo).

## 1. Estado previo (verificado)

- **Notificación** (~37 eventos, `notification_templates` en BD): cada `body` era
  **HTML completo e independiente** (gradientes, `Inter`, emojis ✓/⚠) — sin layout
  compartido.
- **Auth** (4: verificar · 2FA · reset · bienvenida, `core/email/templates/auth.templates.ts`):
  `layout()` viejo (Segoe UI, `#f7f7f8`) **con emojis 👋🎉** (viola D1).

## 2. Arquitectura (robusta, email-safe)

**HTML de EMAIL, no de web:** tablas + estilos inline (Outlook usa el motor de
Word — nada de flexbox/grid). **Sin SVG** (Gmail lo elimina, Outlook no lo pinta)
→ el estado = **banda de acento** + **StatusDot** (D1: `●` CSS) + etiqueta de
color. **Logo = wordmark de texto** (el rombo con `transform:rotate` no funciona
en email). Botones "bulletproof" (celda con `bgcolor`). Preheader oculto. Sin emojis (D1).

- **Builder** `core/email/email-layout.ts`: `buildEmailLayout({ semantic, status?,
  preheader?, bodyHtml })` + bloques (`emailHeading`/`emailParagraph`/`emailDataBox`/
  `emailButton`/`emailButtonSecondary`/`emailCallout`/`emailCodeBox`/`emailNote`) +
  tonos (info/success/warning/danger) + `esc`.
- **Integración BD (el mockup manda: "el equipo solo rellena los huecos"):** columna
  **`semantic`** (nullable). `NULL` = legacy (HTML completo, se envía tal cual —
  los ~36 templates siguen intactos). `NOT NULL` = `body` es el **fragmento** y el
  render (`NotificationTemplateService.compileAndWrap`) lo **envuelve** en el layout;
  inyecta `{{email.accent/tint/fg}}` + `{{app_url}}`. Distinguir por `semantic` (1 columna)
  evita doble-wrap de los legacy y permite migración gradual.

## 3. Hecho

- **Builder + bloques** (`email-layout.ts`) — email-safe, tonos, escape. **11 tests**.
- **Auth** (`auth.templates.ts`): los 4 correos usan el builder + bloques. **Sin emojis**
  (D1), DM Sans, footer oficial.
- **Prisma**: columna `semantic VARCHAR(20)` nullable + migración additiva
  (`20260701213054_add_notification_template_semantic`).
- **Pipeline** (`NotificationTemplateService`): `compileAndWrap` envuelve el fragmento
  si (`email` && `semantic`); inyecta `email.*` + `app_url`. Legacy (NULL) intacto.
  **+3 tests** (wrap · legacy no-wrap · internal no-wrap).
- **Piloto `invoice.paid`** ✅ (seed → fragmento + `semantic='success'`, 1:1 con
  `Correo Ejemplo Pago`; quita el ✓/gradiente/Inter). ⚠️ El seed es create-only
  (no clobbera ediciones del admin) → en un dev-DB ya sembrado, reseed/borra la fila
  para verlo; instalaciones nuevas lo reciben.
- **Admin**: `PATCH /admin/.../templates/:id` acepta `semantic` (migrar templates desde la UI).

## 4. DoD ✅ (2026-07-01)

**backend** (no toca frontend): typecheck + lint + **1550** unit (+14) + **boot smoke 4/4**
(`[internal, manual, enhance_cp, resellerclub]`, arranca con el schema nuevo).

## 5. Follow-up (sweep, otra sesión)

Migrar los **~36 templates de notificación restantes** al layout: por cada uno,
reescribir `body` a fragmento + fijar `semantic`. Opcional: helpers Handlebars de
bloque (`{{email-button}}`…) para que el fragmento sea aún más "hueco"; footer legal
(razón social/dirección) desde settings; logo/iconos como imágenes hospedadas.

**⚠️ Smoke visual (Yasmin):** previsualizar `invoice.paid` (admin → plantillas → preview,
o MailPit) + un correo de auth (2FA/verificación) — layout maestro 1:1 con el mockup.
