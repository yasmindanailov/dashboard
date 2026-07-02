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

## 5. Follow-up (sweep) — ✅ HECHO 2026-07-02

**Smoke visual del piloto (Yasmin) ✅** + ronda de fidelidad (ver §6).

## 6. Sweep COMPLETO + refinamientos sistémicos · 2026-07-02

**Las 35 plantillas de email restantes migradas al layout** (fragmento + `semantic` +
voz de marca, mismos datos/variables). Total: **36/36 email** con `semantic` (35 + piloto
`invoice.paid`). Las ~35 de canal `internal` (campana) NO se tocan (el layout no las envuelve).

**Por tandas (verde en cada una: guard `notification-templates.security` 4/4 + render 1:1 en MailPit):**
- **Billing** (3): invoice.created `info` · failed `warning` · overdue `danger`.
- **Support** (5): conversation.created/assigned `info` · message.created `info` (quote-box) · resolved `success` · auto_closed `info`.
- **Tasks/Mant.** (6): task.assigned `info` · completed `success` · overdue `danger` · unassigned_overdue `warning` · maintenance.completed `success` · critical `danger`.
- **Service** (6): password_reset `info` (caja mono contraseña) · cancelled `info` · cancellation_scheduled `danger` · suspended `warning` (**3 ramas `{{#if}}` verificadas**) · unsuspended `success` · quota `warning`.
- **Domain** (10): renewed/restored/transfer_completed `success` · expiring_soon/transfer_failed/nameservers_changed/lock_changed `warning` · expired/entered_redemption `danger` · transfer_initiated `info`.
- **Ops superadmin** (5): outbox.event_failed `danger` · dlq.job_failed `warning` · system.error `danger` · auth.refresh_replay_detected `danger` · plugin.circuit_opened `warning` — volcado técnico en **caja mono** (`{{e}}` en campos libres: `last_error`/`message`/`summary`/email/ip).

**Refinamientos SISTÉMICOS del builder (los heredan las 36 + auth):**
1. **Logo = rombo 2-tonos (#3B82F6) + iconos de estado (check/info/aviso/crítico)** como **PNG hospedados** (`frontend/public/brand/email/*.png`, generados por `frontend/scripts/gen-email-assets.mjs` con `sharp` @supersampling; referenciados vía `{{app_url}}`/`appUrl()`). SVG no va en email (Gmail lo elimina) → PNG con **degradación elegante** (imágenes off → banda+etiqueta+texto siguen comunicando todo). Logo en **cabecera y footer**. Decisión Yasmin: rombo del mockup, no el logo oficial `#4b77bb`.
2. **Cajas bordeadas redondeadas** — el `<style>` global usa `border-collapse:collapse`, que anula `border-radius`; las tablas/celdas **con borde** fuerzan `border-collapse:separate` inline (data box, callout, code box, botón secundario, caja de estado). `overflow:hidden` NO sirve (recorta el borde).
3. **Footer legal desde `branding.*`** (fuente única con `invoice-pdf`) — `NotificationTemplateService` inyecta `legal` en `buildEmailLayout` (`© año · nombre · NIF · dirección`, editable en `/admin/settings → Marca`). Quitado "¿Tienes una duda?" (queda "Responde a este correo…").
4. **Cabeceras SMTP profesionales** (`EmailService` + `EmailChannel`): `Auto-Submitted: auto-generated` + `X-Auto-Response-Suppress: OOF, AutoReply` (silencian autorrespuestas de máquina, no al humano) + `X-Aelium-Event: <evento>` (tag server-side de categoría). **`Reply-To`** → buzón monitorizado (`branding.company_email`, p.ej. `hola@aelium.net`; fallback env `MAIL_REPLY_TO`) para que "responde a este correo" llegue a una persona.

**Herramienta de revisión:** `backend/scripts/send-email-preview.ts <evento…|all>` (render por el pipeline real + envío a MailPit con muestras ricas por evento). `send-pilot-email.ts` = smoke del piloto.

**DoD ✅ (2026-07-02):** typecheck + lint:check + **1550** unit (122 suites) + guard seguridad 4/4 + boot 4/4. **Auditoría integral MailPit: 36/36** — 0 legacy/gradiente/`{{}}` sin resolver, 0 sin icono, todas con logo + footer legal.

**Notas / pendientes menores:**
- El seed sigue create-only; para ver los nuevos cuerpos en un dev-DB ya sembrado hay que reseed/borrar filas (los scripts de preview lo hacen por la fila objetivo). Instalaciones nuevas los reciben.
- **Correos de auth** (código): ✅ **footer legal hilado** (2026-07-02) — helper compartido `core/email/email-branding.ts` (`resolveEmailFooterLegal`, reutilizado por notificaciones y auth); las 4 plantillas (`auth.templates.ts`) aceptan `legal?` y los 3 servicios (register/login/recovery) lo inyectan desde `branding.*`. Así TODOS los correos (36 notif + 4 auth) muestran el mismo footer legal.
- **Reply-To:** notificaciones → `branding.company_email` (env-independiente, vía `EmailChannel`); **auth** → fallback `MAIL_REPLY_TO` del entorno (mail transport config, junto a `MAIL_FROM`; requiere reiniciar el backend). Follow-up opcional: hilar también el reply-to de auth desde `branding.company_email` para eliminar la dependencia de env.
- Datos legales reales de Aelium: hoy `branding.*` tiene placeholders (Calle Ejemplo 1…); rellenar en `/admin/settings → Marca` (se reflejan en correos **y** facturas).
