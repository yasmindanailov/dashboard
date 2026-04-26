# Email Templates Reference — Aelium Dashboard

> **Catálogo canónico de TODAS las plantillas de email/notificación.**
> Si vas a disparar una notificación → consulta este archivo para usar la plantilla canónica. Si vas a crear plantilla nueva → añádela aquí en el mismo PR.

> **Última auditoría:** 2026-04-26 — F5.
> **Plantillas implementadas:** 11 (4 auth + 4 billing + 3 support).
> **Eventos con listener activo:** 10 / 25 catalogados.
> **Eventos huérfanos (sin plantilla):** 15 — clasificados abajo.
> **Canal activo:** email (vía MailPit en dev, SMTP real en prod). Campana interna: pendiente ([ADR-042](../10-decisions/adr-042-sistema-notificaciones.md)).

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Plantillas implementadas | 11 |
| Eventos con listener activo | 10 (40%) |
| Eventos huérfanos | 15 (60%) — clasificados |
| Listeners distintos | 4 (`billing-email`, `support-email`, `support-websocket`, `support-guest-link`) |
| Eventos críticos sin Outbox | 4 / 4 (`invoice.*`) — **deuda R8** |
| Plantillas editables desde UI | 0 — **pendiente Sprint 11** ([ADR-042](../10-decisions/adr-042-sistema-notificaciones.md)) |

**Indicadores:**
- ✅ Plantilla implementada y disparada por su evento
- 🟡 Evento sin plantilla (hook aspiracional para módulo futuro)
- ❌ Plantilla documentada pero no implementada
- ⚠️ Plantilla con deuda conocida (sin Outbox, sin variables completas, etc.)

---

## Configuración SMTP

| Variable env | Default | Notas |
|--------------|---------|-------|
| `MAIL_HOST` | `localhost` | MailPit en dev (host: `mailpit` en Docker Compose) |
| `MAIL_PORT` | `1025` | MailPit SMTP |
| `MAIL_USER` | (vacío) | No requiere auth en MailPit |
| `MAIL_PASSWORD` | (vacío) | No requiere auth en MailPit |
| `MAIL_FROM` | `Aelium <noreply@aelium.net>` | Override en producción con dominio real |
| `MAIL_TRANSPORT` | `smtp` | Alternativa: `console` para tests puros (no envía nada, loguea) |

**Producción:** `SENTRY_DSN`, `MAIL_HOST` real (Mailgun/SES) — ver [development-playbook §2 "despliegue"](../90-meta/development-playbook.md).

---

## Catálogo completo

### 🔐 auth.* (autenticación)

| Plantilla | Evento disparador | Variables | Canal | Estado | Implementación |
|-----------|-------------------|-----------|-------|--------|----------------|
| `auth.verify-email` | `auth.registered` (POST `/register`) | `{{name}}`, `{{url}}` (TTL 24h) | Email | ✅ | `auth-register.service.ts:sendVerificationEmail()` |
| `auth.two-factor-code` | `auth.2fa_required` (POST `/login`) | `{{name}}`, `{{code}}` (6 dígitos, TTL 5min) | Email | ✅ | `auth-login.service.ts:initiate2fa()` |
| `auth.password-reset` | `auth.password_reset` (POST `/forgot-password`) | `{{name}}`, `{{url}}` (TTL 1h) | Email | ✅ | `auth-recovery.service.ts:requestReset()` |
| `auth.welcome` | `auth.email_verified` (POST `/verify-email`) | `{{name}}`, `{{dashboardUrl}}` | Email | ✅ | `auth-register.service.ts:verifyEmail()` |

**Anti-enumeration ([ADR-059](../10-decisions/adr-059-auth-layout-split-screen.md)):** `password-reset` siempre devuelve éxito al frontend; el envío real solo ocurre si el email existe. Este matiz no se ve en la plantilla — vive en el service.

### 💳 billing.* (facturación)

| Plantilla | Evento disparador | Variables | Canal | Estado | Implementación |
|-----------|-------------------|-----------|-------|--------|----------------|
| `billing.invoice-created` | `invoice.created` | `{{user.name}}`, `{{invoice.number}}`, `{{total}}`, `{{currency}}`, `{{pdf_url}}` | Email | ✅ ⚠️ sin Outbox | `billing-email.listener.ts` |
| `billing.invoice-paid` | `invoice.paid` | `{{user.name}}`, `{{invoice.number}}`, `{{total}}`, `{{currency}}`, `{{payment_provider}}` | Email | ✅ ⚠️ sin Outbox | `billing-email.listener.ts` |
| `billing.invoice-failed` | `invoice.failed` | `{{user.name}}`, `{{invoice.number}}`, `{{retry_count}}`, `{{max_retries}}` | Email | ✅ ⚠️ sin Outbox | `billing-email.listener.ts` |
| `billing.invoice-overdue` | `invoice.overdue` | `{{user.name}}`, `{{invoice.number}}`, `{{total}}`, `{{currency}}` | Email | ✅ ⚠️ sin Outbox | `billing-email.listener.ts` |

**⚠️ Deuda crítica:** los 4 eventos `invoice.*` deberían usar **Outbox Pattern** ([ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md), R8). Hoy si `EventEmitter2` falla post-commit, el cliente no se entera de su factura. **Riesgo legal/financiero.** Primer candidato a sanear antes de despliegue.

### 💬 support.* (chat + tickets)

| Plantilla | Evento disparador | Variables | Canal | Estado | Implementación |
|-----------|-------------------|-----------|-------|--------|----------------|
| `support.conversation-created` | `conversation.created` | `{{user.name}}`, `{{subject}}`, `{{channel}}` (chat/ticket) | Email | ✅ | `support-email.listener.ts` |
| `support.message-reply` | `message.created` (filtro: agente → cliente) | `{{client.name}}`, `{{subject}}`, `{{message.preview}}` (200 chars) | Email | ✅ | `support-email.listener.ts` |
| `support.conversation-assigned` | `conversation.assigned` | `{{agent.name}}`, `{{subject}}` | Email | ✅ | `support-email.listener.ts` |

**Listener WebSocket paralelo:** `support-websocket.listener` consume los mismos 3 eventos pero hace **push tiempo real** a clientes/agentes conectados. No es plantilla de email, es el **canal in_app** (chat widget + bandeja).

### 📋 task.* (tareas internas)

| Plantilla | Evento | Estado | Notas |
|-----------|--------|--------|-------|
| _(ninguna implementada)_ | `task.created`, `task.assigned`, `task.completed` | 🟡 Sprint 8 WIP | Listeners de notificación al agente asignado en backlog (ver [development-playbook §1](../90-meta/development-playbook.md)). |

**Pendiente cierre Sprint 8** ([ADR-041](../10-decisions/adr-041-sistema-tareas.md)):
- `task.assigned` → email + campana al agente.
- `task.overdue` → email + campana al agente + admin.
- `maintenance.completed` → email al cliente con notas y checklist (catalogado pero ningún cron lo emite todavía).

### 🤝 partner.* (Fase 2)

| Plantilla | Evento | Estado | Notas |
|-----------|--------|--------|-------|
| _(ninguna implementada — Fase 2)_ | `partner.commission.accrued`, `partner.payout.created`, `partner.payout.completed`, `partner.payout.failed` | ❌ pendiente Fase 2 | [ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md) — **debe usar Outbox** desde el día 1 (financiero). |
| _(ninguna)_ | `partner.unlink_request.*` | ❌ | [ADR-052](../10-decisions/adr-052-partner-desvinculacion-cliente.md) |
| _(ninguna)_ | Onboarding partner aprobado / rechazado | ❌ | [ADR-049](../10-decisions/adr-049-partner-roles-onboarding.md) |

### 🔧 service.* (provisioning — pendiente módulo)

| Evento | Estado | Notas |
|--------|--------|-------|
| `service.provisioned`, `service.suspended`, `service.cancelled`, `service.failed`, `service.paused`, `service.resumed`, `checkout.completed` | 🟡 huérfanos | Esperan módulo `provisioning` (stub hoy). Cuando se implemente: emails al cliente + webhooks internos al agente owner. |

### 📊 system.* (errores y observabilidad)

| Plantilla | Evento | Variables | Canal | Estado | Notas |
|-----------|--------|-----------|-------|--------|-------|
| _(implementada vía Sentry y notificación campana — sin email dedicado)_ | `system.error` | `{{error_type}}`, `{{module}}`, `{{correlation_id}}` | in_app + Sentry | ❌ email | Pendiente — al superadmin cuando se abre circuit breaker o jobs en DLQ ([ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md)). |

### 📨 referrals.* (Sprint dedicado tras Fase 2)

| Evento | Estado | Notas |
|--------|--------|-------|
| `referral.registered` (alguien se registró con tu link) | ❌ | [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md) — email al referidor. |
| `referral.activated` (tu referido hizo primera compra) | ❌ | Email al referidor: crédito mensual activado. |
| `referral.credit.applied` | ❌ | Email al referidor: crédito aplicado en factura X. |

---

## Eventos huérfanos clasificados (15)

Los **15 eventos sin listener** del catálogo (`docs/20-modules/_events.md`) se clasifican así:

| Familia | Eventos | Razón huérfana | Cuándo se resuelve |
|---------|---------|----------------|--------------------|
| `auth.*` (7) | `auth.email_verified`, `auth.login_success`, `auth.login_failed`, `auth.account_blocked`, `auth.2fa_required`, `auth.password_reset`, `auth.session_closed` | Hooks aspiracionales para módulo `audit` | Cuando se implemente módulo audit (stub hoy) |
| `service.*` (4) | `service.cancelled`, `service.paused`, `service.resumed`, `service.suspended` | Esperan módulo `provisioning` (stub) | Cuando se implemente provisioning |
| `checkout.*` (1) | `checkout.completed` | Espera provisioning para activar servicio | Idem |
| `task.*` (3) | `task.created`, `task.assigned`, `task.completed` | Sprint 8 WIP — listeners en backlog | Cierre Sprint 8 |

**No eliminar** estos eventos huérfanos — son hooks intencionales para módulos futuros, documentados en `_events.md`.

---

## Plantillas editables desde UI ([ADR-042](../10-decisions/adr-042-sistema-notificaciones.md))

**Hoy:** plantillas hardcoded en código (`billing-email.listener.ts`, `support-email.listener.ts`, services de auth). Cambiar texto = cambio de código + redeploy.

**Plan (Sprint 11):**

- Tabla `notification_templates` con `event_type`, `channel`, `subject_template`, `body_template`, `variables_schema`.
- Editor visual con preview en `/dashboard/admin/notifications/templates`.
- Validación: las variables usadas en el cuerpo deben existir en `variables_schema` del evento.
- Activación/desactivación por evento × canal en settings (`notifications.enabled.<event>.<channel>`).

Hasta que esto exista, **cualquier cambio de copy implica PR + deploy**.

---

## Variables disponibles por evento (contrato)

Las variables que el listener inyecta en cada plantilla deben estar **explícitamente catalogadas en `_events.md`** (payload del evento) + las que el listener añada vía lookup adicional.

Ejemplo `invoice.paid`:
- **Payload del evento:** `invoice_id`, `invoice_number`, `user_id`, `total`, `currency`, `payment_provider`.
- **Lookup adicional en listener:** `user.name`, `user.email` (vía `user_id` → `users` table).
- **Variables disponibles en plantilla:** todas las anteriores + `pdf_url` (calculado en listener).

**Regla:** si el listener necesita un dato que no está en el payload, lo busca puntualmente — **NO** se infla el payload del evento (mantiene `_events.md` simple y los eventos chicos).

---

## Cómo añadir una plantilla nueva

1. **¿Existe el evento en `docs/20-modules/_events.md`?** Si no, añadirlo allí primero.
2. **¿Hay listener?** Si no, crearlo en el módulo emisor (o en `notifications` cuando exista — [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md)).
3. **Crear plantilla** (HTML + texto plano) en `backend/src/modules/notifications/templates/<dominio>/<plantilla>.template.ts` (cuando se centralice — hoy están inline).
4. **Documentar** en este archivo en la sección correspondiente: nombre, evento disparador, variables, canal, estado, ruta de implementación.
5. **Si es crítico** (transición de estado, cambio de dinero) → **debe usar Outbox** desde el primer commit ([ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md)).

---

## Documentos relacionados

- [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md) — Decisión: notifications cross-módulo, plantillas editables, multicanal.
- [ADR-013](../10-decisions/adr-013-2fa-email.md) — 2FA por email (plantilla `auth.two-factor-code`).
- [ADR-014](../10-decisions/adr-014-bloqueo-intentos-fallidos.md) — Bloqueo de intentos (futuro: aviso por email al admin).
- [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md) — Outbox Pattern (deuda crítica para `invoice.*` y futuros `partner.*`).
- [ADR-049](../10-decisions/adr-049-partner-roles-onboarding.md), [ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md), [ADR-052](../10-decisions/adr-052-partner-desvinculacion-cliente.md) — Plantillas partner pendientes.
- [`docs/20-modules/_events.md`](../20-modules/_events.md) — Catálogo de eventos (fuente de verdad de qué evento → qué payload).
- [`settings-reference.md`](./settings-reference.md) — `notifications.enabled.*`, `notifications.templates.*`, `notifications.retention_days`.
