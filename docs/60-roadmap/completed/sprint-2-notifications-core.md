# Sprint 2 — Notifications Core ✅

> **Estado:** ✅ Cerrado
> **Commit cierre:** `ba688c6`

---

## Objetivo

Infraestructura básica de envío de email para que las notificaciones de auth funcionen end-to-end. **No** sistema completo de notificaciones (eso es Sprint 9).

---

## Lo que entregó

- **MailPit en Docker Compose** (SMTP dev en `localhost:1025`, Web UI en `:8025`).
- **`EmailService`** con `nodemailer`, SMTP configurable vía env vars (`MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASSWORD`, `MAIL_FROM`).
- **`EmailModule` global** (inyectable en cualquier módulo).
- **4 plantillas HTML auth:** `verifyEmail`, `2fa`, `passwordReset`, `welcome`.
- **`AuthService` actualizado:** sustituye TODOs de "enviar email" por llamadas reales.

---

## Decisiones clave consolidadas

- **MailPit en dev** — captura todos los emails sin enviarlos, UI web para revisar. Pero el código emite SMTP real.
- **Plantillas inline en código** (deuda — Sprint 9 las migra a tabla `notification_templates` editables desde admin, [ADR-042](../../10-decisions/adr-042-sistema-notificaciones.md)).
- **No queue todavía** — emails se envían sync. Migrar a BullMQ en Sprint 9 (R2: trabajo > 200ms a cola).

---

## Verificación de cierre (auditoría 2026-04-26)

- ✅ MailPit en `docker-compose.yml`.
- ✅ `EmailService` operativo, llamado por `AuthService`.
- ✅ 4 plantillas activas (verify, 2fa, reset, welcome).

**Deuda heredada (planificada para Sprint 9):**
- Plantillas hardcoded — no editables desde admin.
- Envío sync — migrar a BullMQ.
- Sin DLQ ni retry para fallos.
