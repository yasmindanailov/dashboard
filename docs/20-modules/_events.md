# Catálogo de eventos del sistema

> **Fuente única de verdad** sobre qué eventos existen en Aelium Dashboard, quién los emite, quién los consume y qué payload llevan.
>
> Cada vez que un módulo emite un `eventEmitter.emit(...)` debe corresponderse con una entrada aquí. Cada `@OnEvent(...)` también.
>
> Detectar drift entre código y este catálogo es responsabilidad de cualquier agente IA que toque el módulo afectado.

> **Última auditoría:** abril 2026 (commits ~`8c4d893`). **Actualizado 2026-04-26 (P0.2):** los 4 `invoice.*` ya usan Outbox. **Actualizado 2026-04-27 (Sprint 9 Fases A–F):** dispatcher migrado a BullMQ + backoff exponencial; eventos operativos `outbox.event_failed` (Fase C), `dlq.job_failed` (Fase A), `system.error` (Fase F emisor), `notification.dispatched` (aspiracional). **Actualizado 2026-04-28 (Sprint 9.5):** `system.error` ya tiene consumidor activo (`NotificationsSystemErrorListener` con guard anti-loop hard). **Actualizado 2026-05-01 (Sprint 8 Fase C):** 3 eventos task/maintenance nuevos cerrados (`task.overdue`, `task.unassigned_overdue`, `maintenance.critical`) — emisores son crons BullMQ scheduled, listeners despachan vía `NotificationsService` con plantillas seedeadas. **Actualizado 2026-05-01 (Sprint 8 Fase D backend):** 4 eventos support_inside nuevos (`support_inside.subscribed`, `support_inside.cancelled`, `support_inside.slot_assigned`, `support_inside.slot_released`) — emisores en `SupportInsideService`, sin consumidor todavía (hooks aspiracionales para audit/notifications futuras).
> **Total eventos identificados:** 35 (32 de negocio + 3 operativos activos `outbox.event_failed` / `dlq.job_failed` / `system.error` + 1 aspiracional `notification.dispatched`).
> **Convenio de naming:** `<dominio>.<acción>` en pasado. Verificado 100% conforme.
> **Bus:** `EventEmitter2` global (NestJS `@nestjs/event-emitter`) — los emisores críticos producen vía `OutboxService.enqueue(tx, ...)` y el `OutboxWorker.dispatch()` (invocado por `OutboxDispatchProcessor`, cola BullMQ `outbox-dispatch` con `repeat: { every: 5000 }` + `FOR UPDATE SKIP LOCKED`) los despacha al bus. ADR-064 cierra el §7 de ADR-033.
> **Outbox Pattern:** ✅ 4/25 eventos de negocio (`invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue`). Pendientes los 9 críticos restantes (`service.*`, `checkout.completed`, `partner.*` futuro) — ADR-033.

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Eventos totales | 28 (de negocio) |
| Dominios | 7 (auth, checkout, conversation, invoice, message, service, task/maintenance) |
| Eventos con consumidor activo | 14 |
| **Eventos huérfanos (sin listener)** | **14** |
| Eventos con múltiples consumidores | 3 (`conversation.created`, `conversation.assigned`, `message.created`) |
| Listeners únicos | 8 (`billing-email`, `support-email`, `support-websocket`, `support-guest-link`, `tasks-email`, `MaintenanceCompletedListener`, `TasksOverdueListener`, `TasksUnassignedOverdueListener`, `MaintenanceCriticalListener`) |
| **Eventos críticos sin Outbox** | **9 / 13** — pendientes `service.*` (4), `checkout.completed`, `partner.*` (4 futuros). Cerrados `invoice.*` (4) en P0.2. Los `task.*` operativos (overdue/unassigned_overdue/maintenance.critical) NO requieren Outbox (alertas, no transacciones). |

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
| `system.error` | `ErrorLogService.log()` desde jobs/listeners no-HTTP. Para errores HTTP 5xx el `GlobalExceptionFilter` escribe directo a `error_log` sin emit (no necesita alerta — el admin ve en `/admin/error-log`) | `notifications-system-error.listener` → `NotificationsService.dispatchToSuperadmins` (campana + email vía plantilla `system.error` seedeada). Guard anti-loop hard: si `module` proviene del dominio notifications, el listener log + drop (EC-S9-07) | `{ error_log_id, level, module, message, correlation_id }` | no | ✅ emisor + consumidor activos (Sprint 9 Fase F + Sprint 9.5 — ADR-055 + ADR-065) |
| `notification.dispatched` | _(no implementado)_ — declarado en ADR-065 §3.2 como hook futuro para que `audit-notification.listener` registre integraciones en `audit_change_log`. Difere al sprint que aborde audit de integraciones (Stripe/ResellerClub/Docker) | — | `{ notification_id, event_type, channel, recipient_id }` | no | ⬜ aspiracional — declarado, no emitido |

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
| `service.provisioned` | `BillingCheckoutService.checkout()` (legacy histórico — Sprint 8 D.12.9 lo emite al CREAR el service, antes del provisioning real) | `SupportInsideOnServiceProvisionedListener` | `{ service_id, user_id, product_id, product_type }` | no | ✅ consumido (ADR-076 — coexiste con `service.activated` Sprint 11) |
| `service.activated` | `ProvisioningOrchestratorService.markActive()` (Sprint 11 Fase 11.B — emitido CUANDO `services.status` pasa a `'active'` tras `plugin.provision()` exitoso) | (Fase 11.C: plugins futuros consumen este, NO `service.provisioned`) | `{ service_id, user_id, correlation_id }` | no | 🟢 nuevo Sprint 11 Fase 11.B (`67fd733`) — consumidores reales en Fase 11.C/15A-G |
| `service.provisioning_failed` | `ProvisioningOrchestratorService.provisionService()` cuando plugin lanza error no-retriable o no está registrado (Sprint 11 Fase 11.B) | (pendiente listener `notifications` — alerta superadmin) | `{ service_id, user_id, provisioner_slug, reason, correlation_id }` | no | 🟡 emitido sin consumidor todavía (Fase 11.E lo cierra cuando se cree el listener notifications) |
| `service.metrics_fetched` | Wrapper `getServiceInfoWithCache` en cache miss (Sprint 11 Fase 11.B) | (pendiente listener `audit` — RGPD: cliente sabe cuándo se consultó al proveedor) | `{ service_id, user_id, provisioner_slug, fetched_at, source_latency_ms }` | no | 🟡 emitido sin consumidor todavía (Fase 11.D/E) |
| `service.action_executed` | Wrapper `executeActionWithCacheInvalidation` (Sprint 11 Fase 11.B) | (pendiente listener `audit` + opcional `notifications` para acciones destructivas) | `{ service_id, user_id, actor_user_id, provisioner_slug, action_slug, success, side_effects, destructive, ip }` | no | 🟡 emitido sin consumidor todavía (Fase 11.D/E) |
| `service.sso_opened` | Wrapper `getSsoUrlWithAudit` tras SSO exitoso (Sprint 11 Fase 11.B) | (pendiente listener `audit` — RGPD) | `{ service_id, user_id, actor_user_id, provisioner_slug, panel_label, ip }` | no | 🟡 emitido sin consumidor todavía (Fase 11.D/E) |
| `service.cancelled` | `service-lifecycle.worker.ts:autoCancelServices()` | — | `{ service_id, user_id, reason }` | no | 🟠 huérfano (Sprint 11 lo escuchará para invocar `plugin.deprovision`) |
| `service.paused` | `subscription.service.ts:pauseService()` | — | `{ service_id, user_id, pause_max_date }` | no | 🟠 huérfano (provisioning → pausar instancia) |
| `service.resumed` | `subscription.service.ts:resumeService()`, `service-lifecycle.worker.ts:checkPauseExpiration()` | — | `{ service_id, user_id, reason }` | no | 🟠 huérfano (provisioning → reactivar) |
| `service.suspended` | `service-lifecycle.worker.ts:autoSuspendServices()` | — | `{ service_id, invoice_id, reason }` | no | 🟠 huérfano (provisioning → suspender) |

**Análisis del dominio service (actualizado 2026-05-02 — Sprint 11 Fase 11.B):**
- **Coexistencia `service.provisioned` ↔ `service.activated`**: el evento histórico `service.provisioned` lo emite `BillingCheckoutService` al CREAR el service (antes del provisioning real); lo consume `SupportInsideOnServiceProvisionedListener` (ADR-076). El evento NUEVO `service.activated` lo emite el orquestador Sprint 11 cuando confirma `services.status='active'` tras `plugin.provision()` exitoso. Plugins reales Sprint 15 consumen `service.activated`, NO `service.provisioned`. Decisión local documentada en docstring de `ProvisioningOrchestratorService` y en `current.md` §Sprint 11 §9.
- **5 eventos `service.*` nuevos Fase 11.B sin consumidor todavía**: provisioning_failed, metrics_fetched, action_executed, sso_opened. Fase 11.E (cierre) los enchufa al listener `audit` correspondiente — los wrappers ya los emiten correctamente.
- **`service.cancelled/paused/resumed/suspended` siguen huérfanos** — Sprint 11 Fase 11.C-D los enchufa al orquestador (consumir → invocar `plugin.deprovision()` o equivalente).

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

### 📋 task.* / maintenance.*

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `task.created` | `tasks.service.ts:create()` | — | `{ task }` | no | 🟡 huérfano (audit futuro Sprint 9 Fase E EC-T8-44) |
| `task.assigned` | `tasks.service.ts:create()`, `update()` (incluye auto-asignación cola pública [ADR-072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md)) | `tasks-email.listener` | `{ task, assignedBy }` | no — deuda EC-T8-28 / P-DEPLOY.4 | ✅ consumido (email + notification al agente vía `NotificationsService`, plantilla con `task_type_label` / `task_priority_label`) |
| `task.completed` | `tasks.service.ts:update({status: completed})`, `tasks.service.complete()`, `MaintenanceLogService.recordCompletion()` | — | `{ task, completedBy }` | no | 🟡 huérfano (audit futuro EC-T8-44) |
| `maintenance.completed` | `MaintenanceLogService.recordCompletion()` post-commit (Sprint 8 Fase B.5) | `MaintenanceCompletedListener` | `{ taskId, maintenanceLogId, serviceId, clientId, monthYear, completedBy, completedAt, notes }` | no — deuda P-DEPLOY.4 | ✅ consumido (email + campana al cliente vía `NotificationsService`, plantilla seedeada) |
| `task.overdue` | `TasksOverdueService.run()` (cron BullMQ `tasks-overdue` `0 2 * * *` UTC, Sprint 8 Fase C 2026-05-01) | `TasksOverdueListener` → `NotificationsService.dispatchToUser` | `{ task_id, task_title, task_type, task_type_label, task_priority, task_priority_label, task_url, action_url, due_date_label, days_overdue, assigned_to }` | no — operativo (no de negocio) | ✅ consumido (email + campana al agente con plantilla seedeada) |
| `task.unassigned_overdue` | `TasksUnassignedOverdueService.run()` (cron BullMQ `tasks-unassigned-overdue` `0 9 * * *` UTC, [ADR-072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md), Sprint 8 Fase C 2026-05-01) | `TasksUnassignedOverdueListener` → `NotificationsService.dispatchToSuperadmins` | `{ total, oldest_age_hours, by_type, task_ids, summary }` | no — operativo | ✅ consumido (email + campana al superadmin con resumen agregado pre-renderizado) |
| `maintenance.critical` | `MaintenanceCriticalService.run()` (cron BullMQ `maintenance-critical` `0 8 * * *` UTC, Sprint 8 Fase C 2026-05-01) | `MaintenanceCriticalListener` → `NotificationsService.dispatchToSuperadmins` | `{ total, threshold_days, service_ids, summary }` | no — operativo | ✅ consumido (email + campana al superadmin; degradación elegante: total=0 mientras Fase D no introduzca service_checklist_items) |

**Análisis del dominio task / maintenance** (estado tras Sprint 8 Fase B cerrado 2026-04-29):

- ✅ **`task.assigned`**: cerrado P0.1 (2026-04-26) + plantilla sin enums crudos en B.1.bis (`task_type_label`/`task_priority_label`). Cobertura E2E en `tests/e2e/tasks.spec.ts` + `tests/e2e/notifications.spec.ts`.
- ✅ **`task.completed`**: el evento se emite en 3 sitios (update directo, `complete()` legacy, `MaintenanceLogService` Fase B.5). **Sin consumidor todavía** — el listener `audit-tasks` que lo persistirá en `audit_change_log` queda en deuda EC-T8-44 (Sprint 9 Fase E ya provee `AuditService.logChange`, falta sólo wirearlo).
- ✅ **`maintenance.completed`** (Sprint 8 Fase B.5, NUEVO): emisión atómica post-commit desde `MaintenanceLogService`. Listener canónico en `MaintenanceCompletedListener` despacha vía `NotificationsService` con plantilla seedeada (email HTML + campana en `notification-templates.ts`). Cobertura E2E en `tests/e2e/tasks-checklist-and-maintenance-log.spec.ts`.
- ✅ **`task.overdue`** + **`maintenance.critical`** + **`task.unassigned_overdue`** (Sprint 8 Fase C, 2026-05-01): cerrados al 100%. 3 colas BullMQ scheduled (`tasks-overdue` `0 2 * * *`, `tasks-unassigned-overdue` `0 9 * * *`, `maintenance-critical` `0 8 * * *`) con leader election natural via Redis (ADR-063 + ADR-064). Listeners canónicos delegan en `NotificationsService` con plantillas seedeadas (EC-T8-30 cerrado: 6 plantillas nuevas en `notification-templates.ts`, todas pasan el guard EC-T8-17 sin triple-stash). Endpoint admin `POST /api/v1/admin/tasks/cron/:name` permite disparar manualmente para smoke + E2E. Cobertura: 21 tests unit + 5 E2E (`tasks-crons.spec.ts` 5/5 verde, suite full 112/112 sin regresión).
- 📋 **Outbox para `task.*` y `maintenance.*`**: deuda EC-T8-28 / P-DEPLOY.4. Hoy si el bus revienta entre commit y emit, el evento se pierde silenciosamente. Aceptable mientras el deploy productivo esté diferido (ADR-069); blocker para Sprint 14.

---

### 🛡️ support_inside.* (Sprint 8 Fase D backend — ADR-034 + ADR-061 + ADR-075)

| Evento | Emisor | Consumidores | Payload | Outbox | Estado |
|--------|--------|--------------|---------|--------|--------|
| `support_inside.subscribed` | `SupportInsideService.subscribe()` tras checkout + create/update subscription | `SupportInsideAuditListener` (D.12.3) | `{ subscription_id, client_id, product_id, service_id }` | no | ✅ consumido |
| `support_inside.cancelled` | `SupportInsideService.cancel()` tras transacción que libera slots + cancela Service estándar | `SupportInsideAuditListener` (D.12.3) | `{ subscription_id, client_id, reason, released_slots }` | no | ✅ consumido |
| `support_inside.slot_assigned` | `SupportInsideService.addSlot()` tras crear `SupportInsideSlot` | `SupportInsideAuditListener` (D.12.3) | `{ slot_id, subscription_id, client_id, service_id, slot_type, is_extra }` | no | ✅ consumido |
| `support_inside.slot_released` | `SupportInsideService.releaseSlot()` (manual) y `SupportInsideService.cancel()` (cascada) | `SupportInsideAuditListener` (D.12.3) | `{ slot_id, subscription_id, client_id, reason: 'manual'\|'subscription_cancelled' }` | no | ✅ consumido |

**Nota canónica**: los 4 eventos están declarados como hooks aspiracionales y **cerrados con consumidor en Sprint 8 Fase D.12** (`SupportInsideAuditListener`). Cumple R1 (módulos por eventos) — `audit-support-inside` se enganchó vía `@OnEvent('support_inside.*')` sin tocar `SupportInsideService`. Listeners adicionales (`SupportInsidePriorityListener` consume `conversation.created`, `SupportInsideOnServiceProvisionedListener` consume `service.provisioned`) materializan la doctrina ADR-061 §"tier de cuenta visible" y ADR-076 (checkout único vía evento).

---

## Listeners activos (consolidado)

| Listener | Eventos consumidos | Acciones |
|----------|--------------------|----------|
| `billing-email.listener` | `invoice.created`, `invoice.paid`, `invoice.failed`, `invoice.overdue` | Delega a `NotificationsService.dispatchToUser` — render plantilla + email + campana (Sprint 9 Fase D) |
| `support-email.listener` | `conversation.created`, `conversation.assigned`, `message.created` | Email a cliente o agente según tipo |
| `support-websocket.listener` | `conversation.created`, `conversation.assigned`, `message.created` | Push por WebSocket a clients conectados |
| `support-guest-link.listener` | `auth.registered` | Vincula chats guest previos al user nuevo (si email coincide) |
| `tasks-email.listener` | `task.assigned` | Delega a `NotificationsService.dispatchToUser` — email + campana al agente, con `task_type_label`/`task_priority_label` (Sprint 8 Fase B.1.bis sin enums crudos) |
| `MaintenanceCompletedListener` | `maintenance.completed` | Delega a `NotificationsService.dispatchToUser` — email + campana al cliente con resumen del trabajo + mes formateado es-ES (Sprint 8 Fase B.5) |
| `TasksOverdueListener` | `task.overdue` | Delega a `NotificationsService.dispatchToUser` — email + campana al agente cuya tarea pasó a `not_completed_in_time` (Sprint 8 Fase C, 2026-05-01) |
| `TasksUnassignedOverdueListener` | `task.unassigned_overdue` | Delega a `NotificationsService.dispatchToSuperadmins` — resumen agregado de la cola pública fuera de SLA por tipo (Sprint 8 Fase C / ADR-072) |
| `MaintenanceCriticalListener` | `maintenance.critical` | Delega a `NotificationsService.dispatchToSuperadmins` — resumen agregado de servicios sin maintenance_log >threshold (Sprint 8 Fase C) |
| `SupportInsidePriorityListener` | `conversation.created` | Si el cliente tiene SI activa, mapea `priority_tier` → `ConversationPriority` con compare-and-swap (sólo escala si `priority='normal'` — preserva elección manual del agente, EC-T8-47) (Sprint 8 Fase D.12.2) |
| `SupportInsideAuditListener` | `support_inside.subscribed/cancelled/slot_assigned/slot_released` | Delega en `AuditService.logChange()` con `entity_type` distinguiendo subscription vs slot (R3 audit inmutable, alimenta portal transparencia cliente) (Sprint 8 Fase D.12.3) |
| `SupportInsideOnServiceProvisionedListener` | `service.provisioned` | Si `product.type='support_inside'`: crea/reactiva `SupportInsideSubscription`. Materializa ADR-076 (checkout único vía evento). Filtra defensivamente para coexistir con futuros listeners hosting/docker (Sprint 8 Fase D.12.9) |
| `ProvisioningOrchestratorService.handleInvoicePaid` | `invoice.paid` | Resuelve `service.product.provisioner` desde `PluginRegistryService` → encola job en cola BullMQ `provisioning-dispatch` por cada `service_id` en `invoice.items`. Idempotente por `services.status` check. Distingue retriable vs non-retriable errors. Emite `service.activated` (followUp `mark_active`), `service.provisioning_failed` (no-retriable), `service.metrics_fetched`/`action_executed`/`sso_opened` (vía wrappers). (Sprint 11 Fase 11.B, `67fd733`) |
| `notifications-outbox.listener` | `outbox.event_failed` | Alerta superadmin (campana + email) cuando un row Outbox agota retries (Sprint 9 Fase D) |
| `notifications-dlq.listener` | `dlq.job_failed` | Alerta superadmin cuando un job BullMQ entra en DLQ (Sprint 9 Fase D) |
| `notifications-system-error.listener` | `system.error` | Alerta superadmin con guard anti-loop hard si `module` proviene del dominio notifications (Sprint 9.5) |

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
