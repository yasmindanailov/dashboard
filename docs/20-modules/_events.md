# Catálogo de eventos del sistema

> **Fuente única de verdad** sobre qué eventos existen en Aelium Dashboard, quién los emite, quién los consume y qué payload llevan.
>
> Cada vez que un módulo emite un `eventEmitter.emit(...)` debe corresponderse con una entrada aquí. Cada `@OnEvent(...)` también.
>
> Detectar drift entre código y este catálogo es responsabilidad de cualquier agente IA que toque el módulo afectado.

> **Última auditoría:** abril 2026 (commits ~`8c4d893`). **Actualizado 2026-04-26 (P0.2):** los 4 `invoice.*` ya usan Outbox. **Actualizado 2026-04-27 (Sprint 9 Fases A–F):** dispatcher migrado a BullMQ + backoff exponencial; eventos operativos `outbox.event_failed` (Fase C), `dlq.job_failed` (Fase A), `system.error` (Fase F emisor), `notification.dispatched` (aspiracional).
> **Total eventos identificados:** 28 (25 de negocio + 3 operativos activos `outbox.event_failed` / `dlq.job_failed` / `system.error` + 1 aspiracional `notification.dispatched`).
> **Convenio de naming:** `<dominio>.<acción>` en pasado. Verificado 100% conforme.
> **Bus:** `EventEmitter2` global (NestJS `@nestjs/event-emitter`) — los emisores críticos producen vía `OutboxService.enqueue(tx, ...)` y el `OutboxWorker.dispatch()` (invocado por `OutboxDispatchProcessor`, cola BullMQ `outbox-dispatch` con `repeat: { every: 5000 }` + `FOR UPDATE SKIP LOCKED`) los despacha al bus. ADR-064 cierra el §7 de ADR-033.
> **Outbox Pattern:** ✅ 4/25 eventos de negocio (`invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue`). Pendientes los 9 críticos restantes (`service.*`, `checkout.completed`, `partner.*` futuro) — ADR-033.

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Eventos totales | 25 |
| Dominios | 6 (auth, checkout, conversation, invoice, message, service, task) |
| Eventos con consumidor activo | 11 |
| **Eventos huérfanos (sin listener)** | **14** |
| Eventos con múltiples consumidores | 3 (`conversation.created`, `conversation.assigned`, `message.created`) |
| Listeners únicos | 5 (`billing-email`, `support-email`, `support-websocket`, `support-guest-link`, `tasks-email`) |
| **Eventos críticos sin Outbox** | **9 / 13** — pendientes `service.*` (4), `checkout.completed`, `partner.*` (4 futuros). Cerrados `invoice.*` (4) en P0.2. |

### Diagnóstico de los 15 eventos huérfanos

No es necesariamente bug. Pueden ser:

1. **Hooks aspiracionales** — emitidos para que listeners futuros se enganchen sin tocar el código que emite (común en `auth.*`).
2. **Features incompletas** — el listener está planificado pero aún no implementado (caso de `service.*` esperando provisioning module).
3. **Código realmente muerto** — emisión que nadie nunca tendrá interés en escuchar (revisar y borrar).

Se ha clasificado cada evento huérfano abajo en la columna "Estado".

---

## Eventos operativos (cross-cutting)

Eventos sin dominio de negocio — emitidos por la infraestructura para alertas / monitoring.

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `outbox.event_failed` | `OutboxWorker.processEvent()` cuando `retry_count >= max_retries` | `notifications-outbox.listener` → `NotificationsService.dispatchToSuperadmins` (campana + email — ADR-065) | `{ event_outbox_id, event_type, last_error, retry_count }` | no (es alerta operativa, no transacción) | ✅ emisor + consumidor activos (Sprint 9 Fases C+D — ADR-064 + ADR-065) |
| `dlq.job_failed` | `DlqService.handleFailed()` cuando un job BullMQ agota `attempts` | `notifications-dlq.listener` → `NotificationsService.dispatchToSuperadmins` (campana + email — ADR-065) | `{ failed_job_id, queue, name, last_error, attempts_made }` | no | ✅ emisor + consumidor activos (Sprint 9 Fases A+D — ADR-063 + ADR-065) |
| `system.error` | `ErrorLogService.log()` desde jobs/listeners no-HTTP. Para errores HTTP 5xx el `GlobalExceptionFilter` escribe directo a `error_log` sin emit (no necesita alerta — el admin ve en `/admin/error-log`) | _(huérfano hasta Sprint 9.5)_ — listener `notifications-system-error.listener` + plantilla `system.error` quedaron diferidos. La row queda en `error_log` accesible vía `/admin/error-log` | `{ error_log_id, level, module, message, correlation_id }` | no | 🟡 emisor activo (Sprint 9 Fase F — ADR-055), consumidor diferido a Sprint 9.5 |
| `notification.dispatched` | _(no implementado)_ — declarado en ADR-065 §3.2 como hook futuro para que `audit-notification.listener` registre integraciones en `audit_change_log`. Difere a Sprint 9.5 cuando audit de integraciones se aborde | — | `{ notification_id, event_type, channel, recipient_id }` | no | ⬜ aspiracional — declarado, no emitido |

---

## Catálogo completo (alfabético)

### 🔐 auth.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `auth.2fa_required` | `auth-login.service.ts:initiate2fa()` | — | `{ userId }` | no | 🟡 huérfano (hook aspiracional para audit/notifications futuro) |
| `auth.account_blocked` | `auth-login.service.ts:handleFailedLogin()` | — | `{ userId, attempts }` | no | 🟡 huérfano (debería notificar al superadmin → R7) |
| `auth.email_verified` | `auth-register.service.ts:verifyEmail()` | — | `{ userId }` | no | 🟡 huérfano |
| `auth.login_failed` | `auth-login.service.ts:handleFailedLogin()` | — | `{ userId, attempt }` | no | 🟡 huérfano (audit log) |
| `auth.login_success` | `auth-token.service.ts:issueTokens()` | — | `{ userId }` | no | 🟡 huérfano (audit log) |
| `auth.password_reset` | `auth-recovery.service.ts:resetPassword()` | — | `{ userId }` | no | 🟡 huérfano (audit log) |
| `auth.registered` | `auth-register.service.ts:register()` | `support-guest-link.listener` | `{ userId, email }` | no | ✅ con consumidor (vincula chats guest previos) |
| `auth.session_closed` | `auth-token.service.ts:logout()`, `revokeSession()` | — | `{ userId, sessionId? }` | no | 🟡 huérfano (audit log) |

**Análisis del dominio auth:**
La mayoría de eventos `auth.*` se emiten "por si acaso" pero ningún listener los consume. Esto es **deuda controlada**: cuando se implemente el módulo `audit` (stub hoy), estos serán sus consumidores naturales. NO eliminar.

---

### 💳 invoice.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `invoice.created` | `billing-invoice.service.ts:createInvoice()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, currency }` | **sí** | ✅ con consumidor — Outbox vía `OutboxService.enqueue(tx, ...)` |
| `invoice.paid` | `billing-invoice.service.ts:markAsPaid()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, currency, payment_provider }` | **sí** | ✅ con consumidor — Outbox |
| `invoice.failed` | `billing-lifecycle.worker.ts:retryOverduePayments()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, retry_count, max_retries }` | **sí** | ✅ con consumidor — Outbox |
| `invoice.overdue` | `billing-invoice.service.ts:markAsOverdue()` | `billing-email.listener` | `{ invoice_id, invoice_number, user_id, total, retry_count, max_retries }` | **sí** | ✅ con consumidor — Outbox |

**Análisis del dominio invoice:**
**Cerrado P0.2 (2026-04-26):** los 4 eventos `invoice.*` se persisten en `event_outbox` dentro de la misma transacción que el cambio de estado de la factura. El `OutboxWorker` (`@Interval(5s)`, `FOR UPDATE SKIP LOCKED`) los despacha al bus con semántica at-least-once: si el proceso muere entre commit y emit, el evento queda en `pending` y se reintenta al arrancar (R8 + ADR-033).

---

### 💼 checkout.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `checkout.completed` | `billing-checkout.service.ts:checkout()` | — | `{ user_id, service_id, invoice_id, product_name, total }` | no | 🟠 huérfano (cuando exista provisioning, lo escuchará para activar el servicio) |

**Análisis:** crítico cuando se implemente el módulo `provisioning`. Por ahora, la activación es manual (admin marca factura como pagada → invoice.paid → cliente notificado). Provisioning automático = consumir `checkout.completed` o `invoice.paid`.

---

### 🔧 service.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `service.cancelled` | `service-lifecycle.worker.ts:autoCancelServices()` | — | `{ service_id, user_id, reason }` | no | 🟠 huérfano (cuando exista provisioning, lo escuchará para desactivar) |
| `service.paused` | `subscription.service.ts:pauseService()` | — | `{ service_id, user_id, pause_max_date }` | no | 🟠 huérfano (provisioning → pausar instancia) |
| `service.resumed` | `subscription.service.ts:resumeService()`, `service-lifecycle.worker.ts:checkPauseExpiration()` | — | `{ service_id, user_id, reason }` | no | 🟠 huérfano (provisioning → reactivar) |
| `service.suspended` | `service-lifecycle.worker.ts:autoSuspendServices()` | — | `{ service_id, invoice_id, reason }` | no | 🟠 huérfano (provisioning → suspender) |

**Análisis del dominio service:**
Todos huérfanos esperando al módulo `provisioning`. Cuando provisioning se implemente, será su listener principal. Los eventos están bien diseñados: el dominio billing controla el ciclo de vida funcional; provisioning ejecutará la acción técnica externa.

---

### 💬 conversation.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `conversation.assigned` | `support-message.service.ts:updateConversation()` | `support-email.listener`, `support-websocket.listener` | `{ conversation_id, agent_id, agent_name, assigned_by }` | no | ✅ con 2 consumidores |
| `conversation.created` | `support-chat.service.ts:createUserChat()`, `createGuestChat()`, `support-ticket.service.ts:emitCreated()` | `support-email.listener`, `support-websocket.listener` | `{ conversation_id, type, user_id, user_name, user_email, subject, channel, is_guest? }` | no | ✅ con 2 consumidores |

---

### 📨 message.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `message.created` | `support-message.service.ts:addMessage()` | `support-email.listener`, `support-websocket.listener` | `{ conversation_id, message_id, sender_type, sender_id, is_internal, user_id, type }` | no | ✅ con 2 consumidores |

---

### 📋 task.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `task.assigned` | `tasks.service.ts:create()`, `update()` | `tasks-email.listener` | `{ task, assignedBy }` | no | ✅ con consumidor (email + notification al agente asignado) |
| `task.completed` | `tasks.service.ts:update()`, `complete()` | — | `{ task, completedBy, clientNotes?, internalNotes? }` | no | 🟡 huérfano (audit) |
| `task.created` | `tasks.service.ts:create()` | — | `{ task }` | no | 🟡 huérfano |

**Análisis del dominio task:**
- `task.assigned`: ✅ cerrado P0.1 (2026-04-26) — listener `tasks-email.listener.ts` envía email al agente + crea notificación interna en tabla `notifications`. Tests E2E en `tests/e2e/tasks.spec.ts`.
- `task.completed` y `task.created`: 🟡 huérfanos. Quedan como hooks aspiracionales para el futuro módulo `audit`. Sprint 8 sigue WIP en otras fases (schemas A, frontend B, automatización C — `task.overdue` + `maintenance.*`, Support Inside D, docs E) — ver [`current.md` §Sprint 8](../60-roadmap/current.md).

---

## Listeners activos (consolidado)

| Listener | Eventos consumidos | Acciones |
|----------|--------------------|----------|
| `billing-email.listener` | `invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue` | Envía email al cliente con detalles + link al PDF (eventos despachados vía Outbox desde P0.2). |
| `support-email.listener` | `conversation.created`, `conversation.assigned`, `message.created` | Email a cliente o agente según tipo |
| `support-websocket.listener` | `conversation.created`, `conversation.assigned`, `message.created` | Push por WebSocket a clients conectados |
| `support-guest-link.listener` | `auth.registered` | Vincula chats guest previos al user nuevo (si email coincide) |
| `tasks-email.listener` | `task.assigned` | Email al agente asignado + notificación interna en `notifications` (P0.1) |

---

## Convenciones para añadir un evento nuevo

1. **Naming:** `<dominio>.<acción>` con la acción en pasado (ya emitida): `invoice.created`, no `invoice.create`.
2. **Payload:** objeto simple. Incluir los IDs necesarios (no el objeto completo). El listener vuelve a leer si necesita más datos.
3. **Documentar AQUÍ y en el `contract.md` del emisor**: nombre, trigger, payload, outbox-yes-no.
4. **Si es crítico (transición de estado, cambio de dinero, gestión de servicio):** **debe usar Outbox Pattern (R8)** desde el primer commit. Los eventos `invoice.*` son deuda histórica — el resto se debe hacer bien.
5. **Si es informativo (audit, log, notification opcional):** outbox no obligatorio; documentarlo igual.

---

## Cómo se valida que código y catálogo coinciden

**Hoy:** manualmente. Si descubres una emisión sin entrada aquí, o una entrada sin emisor real → hay drift, créame un issue.

**Futuro deseable:** script de CI que parsea código y verifica:
- Cada `eventEmitter.emit('xxx', ...)` tiene fila en este archivo
- Cada `@OnEvent('xxx')` tiene fila aquí y un emisor real

Pendiente para sprint dedicado.

---

## Hallazgos de la auditoría que generaron este documento

| Hallazgo | Severidad | Acción |
|----------|-----------|--------|
| 15 eventos huérfanos | 🟡 Media | Documentar caso por caso (hecho arriba). No eliminar — son hooks para módulos pendientes |
| ~~25/25 eventos sin Outbox~~ → 4/13 críticos cubiertos | 🟠 Media | ✅ `invoice.*` cerrado P0.2 (2026-04-26). Pendiente `service.*` (4) + `checkout.completed` cuando se implemente provisioning. |
| `auth.*` sin audit module que escuche | 🟡 Media | Esperado: módulo audit es stub. Cuando se implemente, listener natural. |
| `service.*` sin provisioning que escuche | 🟡 Media | Esperado: provisioning es stub. Plan: Sprint dedicado. |
| Naming 100% consistente | ✅ — | Mantener |

---

## Documentos relacionados

- [`README.md`](./README.md) — Cómo usar `20-modules/`
- [`_matrix.md`](./_matrix.md) — Matriz de dependencias entre módulos
- [`docs/00-foundations/rules.md`](../00-foundations/rules.md#r8--eventos-cr%C3%ADticos-usan-outbox-pattern) — Regla R8 (Outbox)
- [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — Términos: evento, outbox, listener, worker
