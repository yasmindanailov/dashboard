# Jobs & Crons Reference — Aelium Dashboard

> **Catálogo canónico de TODOS los crons y jobs BullMQ.**
> Si vas a programar trabajo asíncrono → consulta este archivo para no duplicar. Si vas a añadir uno nuevo → añádelo aquí en el mismo PR.

> **Última auditoría:** 2026-05-03 — cierre Sprint 16 Fase 16.E (cola nueva BullMQ scheduled: `support-resolved-auto-close` 02:30 UTC consume tickets en `resolved` >`support.auto_close_resolved_days` y los cierra silencioso emitiendo `conversation.auto_closed` — ADR-079 Amendment A1, DC.33 cerrada).
> **Crons in-process activos:** 9 (`@nestjs/schedule`). El Outbox dispatcher abandonó `@Interval` en Sprint 9 Fase C — ahora es BullMQ scheduled. Sprint 9 Fase E añade `cleanupOldAuditLogs`. Sprint 9.5 añade `cleanupReadNotifications` (única DELETE permitida sobre `notifications` canal `internal`).
> **Jobs BullMQ implementados:** **9 — `pdf-generation` (Sprint 9 Fase B), `outbox-dispatch` (Sprint 9 Fase C), `notifications-dispatch` (Sprint 9 Fase D), `tasks-overdue` (Sprint 8 Fase C), `tasks-unassigned-overdue` (Sprint 8 Fase C / ADR-072), `maintenance-critical` (Sprint 8 Fase C), `maintenance-monthly` (Sprint 8 Fase D / ADR-034 + ADR-061), `provisioning-dispatch` (Sprint 11 Fase 11.B / ADR-077), `support-resolved-auto-close` (Sprint 16 Amendment A1 / ADR-079)** ([ADR-063](../10-decisions/adr-063-bullmq-canonico-dlq-retries.md) + [ADR-064](../10-decisions/adr-064-outbox-dispatcher-bullmq.md) + [ADR-065](../10-decisions/adr-065-notification-channel-plugin-pattern.md) + [ADR-072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) + [ADR-034](../10-decisions/adr-034-support-inside-modelo.md) + [ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) + [ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)).
> **Crons aspiracionales:** 1 documentado en ADRs sin implementación todavía (numeración year+1).

---

## Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Crons `@Cron` activos | 9 (8 billing/support/audit + 1 notifications retention Sprint 9.5) |
| Jobs BullMQ activos | **9** (`pdf-generation` · `outbox-dispatch` · `notifications-dispatch` · `tasks-overdue` · `tasks-unassigned-overdue` · `maintenance-critical` · `maintenance-monthly` · `provisioning-dispatch` · **`support-resolved-auto-close`** Sprint 16 Amendment A1 / ADR-079) |
| DLQ implementada | ✅ ([ADR-063](../10-decisions/adr-063-bullmq-canonico-dlq-retries.md) — `DlqService` + tabla `failed_jobs` + emit `dlq.job_failed`) |
| Outbox dispatcher BullMQ scheduled | ✅ ([ADR-064](../10-decisions/adr-064-outbox-dispatcher-bullmq.md) — backoff exponencial 30s→480s + emit `outbox.event_failed` + leader election natural) |
| Notifications full multicanal | ✅ ([ADR-065](../10-decisions/adr-065-notification-channel-plugin-pattern.md) — plantillas editables + Email + InApp + alertas operativas a superadmins) |
| Panel `/admin/jobs/failed` | ✅ Sprint 9 Fase F (lista DLQ + acción "Reintentar" via `RetryService`) |
| Listener `system.error` → superadmin | ✅ Sprint 9.5 (`NotificationsSystemErrorListener` con guard anti-loop hard) |
| Crons que emiten eventos críticos sin Outbox | 4 (`detectOverdueInvoices`, `generatePendingInvoices`, `autoSuspendServices`, `autoCancelServices`) — **deuda R8** |

**⚠️ Bloqueo arquitectónico para escalar horizontalmente:** todos los crons corren in-process. Si se añade una segunda instancia del backend, **cada cron se ejecuta dos veces** = facturas duplicadas, suspensiones duplicadas, etc. Antes de escalar, **migrar a BullMQ scheduled jobs** (con leader election natural — un solo worker procesa cada job repeat). Ver ADR-056 §13.30+.

**Indicadores:**
- ✅ Cron/job activo y consumido
- 🟡 Implementado pero sin uso real todavía
- ❌ Documentado pero NO implementado
- ⚠️ Sin Outbox para evento crítico que emite

---

## Crons in-process activos (`@nestjs/schedule`)

### 💳 Billing lifecycle (6 crons)

| Cron | Schedule | Módulo | Qué hace | Eventos que emite | Estado |
|------|----------|--------|----------|-------------------|--------|
| `detectOverdueInvoices` | `EVERY_DAY_AT_1AM` (01:00) | billing | Marca facturas `pending` con `due_date < now` como `overdue` | `invoice.overdue` | ✅ ⚠️ sin Outbox |
| `generatePendingInvoices` | `EVERY_DAY_AT_2AM` (02:00) | billing | Genera facturas para servicios activos próximos a vencer (según `billing.invoice_advance_days`) | `invoice.created` | ✅ ⚠️ sin Outbox |
| `retryOverduePayments` | `EVERY_6_HOURS` | billing | Reintenta cobros en facturas `overdue` con `next_retry_at` vencido (hasta `billing.max_payment_retries`) | `payment.retry_attempt`, `invoice.failed` (al agotar) | ✅ ⚠️ |
| `autoSuspendServices` | `EVERY_DAY_AT_3AM` (03:00) | billing | Suspende servicios cuyas facturas agotaron reintentos y superan `billing.grace_period_days` | `service.suspended` | ✅ ⚠️ sin Outbox + huérfano (provisioning ausente) |
| `autoCancelServices` | `EVERY_DAY_AT_4AM` (04:00) | billing | Cancela servicios suspendidos tras `billing.cancellation_after_suspension_days` | `service.cancelled` | ✅ ⚠️ sin Outbox + huérfano |
| `checkPauseExpiration` | `EVERY_DAY_AT_5AM` (05:00) | billing | Reanuda servicios pausados cuya `pause_max_date` ya pasó | `service.resumed` | ✅ huérfano (provisioning ausente) |

**Cadena lógica del ciclo de vida (visión global):**

```
Día N:  generatePendingInvoices (02:00)  →  factura nueva 'pending'
        detectOverdueInvoices    (01:00)  →  pending → overdue (si vencidas ayer)
        retryOverduePayments     (cada 6h)→  intenta cobrar overdue
                                              └→ si éxito: invoice.paid (manual hoy via plugin manual)
                                              └→ si agota retries: invoice.failed
        autoSuspendServices      (03:00)  →  suspende servicios con invoice.failed antiguo
        autoCancelServices       (04:00)  →  cancela tras grace period
        checkPauseExpiration     (05:00)  →  reanuda los pausados que vencieron
```

### 💬 Support cleanup (1 cron)

| Cron | Schedule | Módulo | Qué hace | Eventos | Estado |
|------|----------|--------|----------|---------|--------|
| `cleanupExpiredGuestSessions` | `EVERY_DAY_AT_6AM` (06:00) | support | Cierra sesiones guest expiradas (>30 días sin actividad — configurable `support.guest_session_ttl_days`) | `guest_session.expired` (si está catalogado — verificar) | ✅ |

### 🔐 Audit retention (1 cron — Sprint 9 Fase E)

| Cron | Schedule | Módulo | Qué hace | Eventos | Estado |
|------|----------|--------|----------|---------|--------|
| `cleanupOldAuditLogs` | `EVERY_DAY_AT_3AM` (03:00 UTC) | audit | `DELETE FROM audit_access_log WHERE created_at < now() - audit.access_retention_days` (default 730). **Única operación DELETE permitida sobre tablas audit** ([R3 §Excepción única](../00-foundations/rules.md#r3--el-audit-log-es-inmutable) + [ADR-017 §Retención](../10-decisions/adr-017-audit-log-inmutable.md)) | — | ✅ |

### 📨 Notifications retention (1 cron — Sprint 9.5)

| Cron | Schedule | Módulo | Qué hace | Eventos | Estado |
|------|----------|--------|----------|---------|--------|
| `cleanupReadNotifications` | `EVERY_DAY_AT_2AM` (02:00 UTC) | notifications | `DELETE FROM notifications WHERE channel='internal' AND read_at IS NOT NULL AND read_at < now() - notifications.retention_days` (default 90). **Sólo canal `internal`** — los externos (`email`/`whatsapp`/`push`) se conservan como prueba de envío hasta sprint que defina su política (Sprint 12.5 Portal RGPD). Las no leídas se conservan indefinidamente — es responsabilidad del usuario marcarlas | — | ✅ ([ADR-042](../10-decisions/adr-042-sistema-notificaciones.md) + [ADR-060](../10-decisions/adr-060-decisiones-pre-schema.md)) |

---

## Jobs BullMQ activos

### Cola `pdf-generation` (Sprint 9 Fase B + [ADR-063](../10-decisions/adr-063-bullmq-canonico-dlq-retries.md))

| Item | Valor |
|------|-------|
| Nombre | `pdf-generation` |
| Job principal | `invoice-pdf` (payload `{ invoice_id }`) |
| Productor | `BillingInvoiceService.markAsPaid()` y `sendToPending()` via `pdfQueue.add(INVOICE_PDF_JOB, payload, { jobId: 'invoice-pdf-{invoice_id}' })` |
| Procesador | `PdfGenerationProcessor` (`@Processor('pdf-generation')` + `WorkerHost`) — invoca `InvoicePdfStorageService.generateAndUpload()` |
| Idempotencia | `jobId` estable por factura — duplicados descartados automáticamente por BullMQ (ADR-063 §G) |
| Defaults heredados | `attempts=5`, backoff exponencial 30s→480s, `removeOnFail:false`, `removeOnComplete: { age: 3600 }` |
| DLQ | ✅ — `DlqService.register('pdf-generation')` en `OnModuleInit` del processor |
| Tests E2E | `tests/e2e/storage-pdf.spec.ts` (2 specs verdes) |

**Flujo lógico:**

```
markAsPaid / sendToPending  →  pdfQueue.add('invoice-pdf', { invoice_id }, { jobId })
                                   ↓
                       PdfGenerationProcessor.process(job)
                                   ↓
                  InvoicePdfStorageService.generateAndUpload()
                                   ↓
        S3 upload + UPDATE invoices SET pdf_url = '<key>'
```

**Cierra deuda R2:** el fire-and-forget `setImmediate` introducido por Sprint 11.5 ya no existe — todo upload pasa por la cola.

### Cola `outbox-dispatch` (Sprint 9 Fase C + [ADR-064](../10-decisions/adr-064-outbox-dispatcher-bullmq.md))

| Item | Valor |
|------|-------|
| Nombre | `outbox-dispatch` |
| Job principal | `outbox-tick` (sin payload — repeat scheduled) |
| Productor | `OutboxDispatchProcessor.onModuleInit()` registra `queue.upsertJobScheduler('outbox-tick', { every: 5000 })` (idempotente por id) |
| Procesador | `OutboxDispatchProcessor.process()` → invoca `OutboxWorker.dispatch()` |
| Sustituye | `@Interval(5s)` previo del `OutboxWorker` (P0.2) — eliminado en este sprint |
| Backoff retry de eventos | Exponencial 30s→480s en columna `event_outbox.next_retry_at` (NO en BullMQ retries del tick) |
| Emit al agotar retries | `outbox.event_failed` (cierra ADR-033 §7) |
| DLQ | ✅ — `DlqService.register('outbox-dispatch')` |
| Tests | unit `outbox.worker.spec.ts` (6/6 verde — backoff + emit + recovery), E2E `outbox-invoice.spec.ts` (4/4 verde — flujo end-to-end) |

**Por qué leader election natural:** BullMQ usa Redis como source-of-truth del scheduler; con N instancias del backend, sólo una procesa cada job repeat (la que adquiere el lock atómico). En `@Interval`, las N instancias dispararían el cron paralelamente — el `FOR UPDATE SKIP LOCKED` previene corrupción pero compite por el lote. Con BullMQ se elimina la competencia.

### Cola `notifications-dispatch` (Sprint 9 Fase D + [ADR-065](../10-decisions/adr-065-notification-channel-plugin-pattern.md))

| Item | Valor |
|------|-------|
| Nombre | `notifications-dispatch` |
| Job principal | `dispatch-notification` (payload `{ eventType, payload, recipient_user_ids }`) |
| Productor | `NotificationsService.dispatchToUser()` y `dispatchToSuperadmins()` (regla canónica D12) |
| Procesador | `NotificationsDispatchProcessor` — resuelve recipients, hace lookup de plantillas en `notification_templates`, itera canales (`EmailChannel` + `InAppChannel`) |
| Plantillas | Tabla Postgres `notification_templates` (Handlebars), seedeada en `prisma/seeds/notification-templates.ts` (11 plantillas iniciales: invoice.* + task.assigned + alertas operativas outbox/dlq) |
| Canales activos | Email (envuelve `core/email/EmailService`), Internal (campana — insert en `notifications`) |
| Idempotencia | No idempotente por jobId — dos eventos del mismo tipo al mismo recipient son 2 envíos legítimos |
| DLQ | ✅ — `DlqService.register('notifications-dispatch')`. Si email rebota 5×, queda en `failed_jobs` con alerta superadmin (loop natural cortado por guard del listener) |
| Tests | unit `notification-template.service.spec.ts` (6/6 verde — render Handlebars + helpers `lt`/`gt`/`eq` + escape HTML por canal + fallback locale) + E2E suite full (20/20) |
| Cierra deuda | HTML inline en `BillingEmailListener` y `TasksEmailListener` (movido a tabla); huérfanos `outbox.event_failed` y `dlq.job_failed` (consumidos por `notifications-outbox.listener` y `notifications-dlq.listener`) |

### Cola `tasks-overdue` (Sprint 8 Fase C + [ADR-063](../10-decisions/adr-063-bullmq-canonico-dlq-retries.md))

| Item | Valor |
|------|-------|
| Nombre | `tasks-overdue` |
| Job principal | `tasks-overdue-tick` (sin payload — repeat scheduled cron `0 2 * * *` UTC) |
| Productor | `TasksOverdueProcessor.onModuleInit()` registra `queue.upsertJobScheduler('tasks-overdue-tick', { pattern: '0 2 * * *' })` (idempotente por id) |
| Procesador | `TasksOverdueProcessor.process()` → invoca `TasksOverdueService.run()` |
| Lógica | Selecciona tareas con `assigned_to NOT NULL`, `status ∈ {pending, in_progress}`, `due_date < now() - tasks.overdue_to_failure_days`. Compare-and-swap a `not_completed_in_time` + emit `task.overdue` (consumido por `TasksOverdueListener` → email + campana al agente). ADR-072 §6: las tareas de la cola pública NO entran en este cron. |
| Manual trigger | `POST /api/v1/admin/tasks/cron/overdue` (JwtAuthGuard + AdminOnlyGuard + `Manage.Job` — sólo superadmin). |
| DLQ | ✅ — `DlqService.register('tasks-overdue')` |
| Tests | unit `tasks-overdue.service.spec.ts` (7/7 verde — cutoff/filtros/CAS/labels), E2E `tasks-crons.spec.ts:163` (1/1 verde — flujo end-to-end con email + notification) |

### Cola `tasks-unassigned-overdue` (Sprint 8 Fase C + [ADR-072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md))

| Item | Valor |
|------|-------|
| Nombre | `tasks-unassigned-overdue` |
| Job principal | `tasks-unassigned-overdue-tick` (sin payload — repeat scheduled cron `0 9 * * *` UTC, inicio jornada laboral) |
| Productor | `TasksUnassignedOverdueProcessor.onModuleInit()` |
| Procesador | `TasksUnassignedOverdueProcessor.process()` → invoca `TasksUnassignedOverdueService.run()` |
| Lógica | Para cada tipo en `SLA_TYPES` lee `tasks.unassigned_sla_hours.<type>` (fallback `tasks.unassigned_sla_hours.default = 24`). Selecciona tareas con `assigned_to=null` + `status ∈ {pending, in_progress}` + `created_at + sla < now()`. Si total ≥ 1, emite **resumen agregado** `task.unassigned_overdue` con `summary` pre-renderizado (consumido por `TasksUnassignedOverdueListener` → email + campana al superadmin). |
| Manual trigger | `POST /api/v1/admin/tasks/cron/unassigned-overdue` |
| DLQ | ✅ |
| Tests | unit `tasks-unassigned-overdue.service.spec.ts` (6/6 verde — SLA por tipo, filtros, summary truncado a 20 entradas), E2E `tasks-crons.spec.ts:250` |

### Cola `maintenance-critical` (Sprint 8 Fase C)

| Item | Valor |
|------|-------|
| Nombre | `maintenance-critical` |
| Job principal | `maintenance-critical-tick` (sin payload — repeat scheduled cron `0 8 * * *` UTC, antes que `tasks-unassigned-overdue` para dar contexto operativo completo al superadmin) |
| Productor | `MaintenanceCriticalProcessor.onModuleInit()` |
| Procesador | `MaintenanceCriticalProcessor.process()` → invoca `MaintenanceCriticalService.run()` |
| Lógica | Selecciona services activos con `checklist_items: { some: {} }` (proxy de "mantenimiento contratado"). Marca crítico al servicio sin `maintenance_log` reciente o cuyo último log es anterior a `support.maintenance_critical_threshold_days` (default 60). Emite resumen agregado `maintenance.critical` con `summary` pre-renderizado (consumido por `MaintenanceCriticalListener` → email + campana al superadmin). **Mientras Fase D (Support Inside) no esté cerrada y ningún servicio tenga `service_checklist_items`, el cron NO alerta nada — degradación elegante por construcción.** |
| Manual trigger | `POST /api/v1/admin/tasks/cron/maintenance-critical` |
| DLQ | ✅ |
| Tests | unit `maintenance-critical.service.spec.ts` (8/8 verde — threshold, filtros, NUNCA + cutoff, summary truncado), E2E `tasks-crons.spec.ts:322` (verifica degradación elegante: total=0 sin checklist) |

### Cola `maintenance-monthly` (Sprint 8 Fase D + [ADR-034](../10-decisions/adr-034-support-inside-modelo.md) + [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md))

| Item | Valor |
|------|-------|
| Nombre | `maintenance-monthly` |
| Job principal | `maintenance-monthly-tick` (sin payload — repeat scheduled cron `0 6 1 * *` UTC, día 1 de cada mes a las 06:00 antes de la jornada laboral europea) |
| Productor | `MaintenanceMonthlyProcessor.onModuleInit()` registra el job scheduler vía `upsertJobScheduler` (idempotente por id) |
| Procesador | `MaintenanceMonthlyProcessor.process()` → invoca `MaintenanceMonthlyService.run()` |
| Lógica | Por cada `support_inside_slot` activo (`released_at IS NULL`) en una `support_inside_subscription` con status `active`, crea una `Task(type=maintenance_management)` para el servicio asociado. **Idempotencia obligatoria** por UNIQUE compuesto `(service_id, billing_month, type)` en `tasks` (Sprint 8 Fase A): captura P2002 y suma a `skipped_idempotent`. **Cola pública (ADR-072)**: `assigned_to=null` — el agente que tome la tarea desde `/admin/tasks?scope=unassigned` se la auto-asigna (no se asigna arbitrariamente). |
| Manual trigger | `POST /api/v1/admin/support-inside/cron/maintenance-monthly` (JwtAuthGuard + AdminOnlyGuard + `Manage.Job` — sólo superadmin). |
| DLQ | ✅ — `DlqService.register('maintenance-monthly')` |
| Tests | unit `maintenance-monthly.service.spec.ts` (7/7 verde — billing_month canónico, filtros, idempotencia P2002, retry on otros errores), E2E `support-inside.spec.ts:195` (1/1 verde — flujo end-to-end subscribe + slot + cron + idempotencia) |

### Cola `provisioning-dispatch` (Sprint 11 Fase 11.B + [ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md))

| Item | Valor |
|------|-------|
| Nombre | `provisioning-dispatch` |
| Job principal | `provision-service` (payload: `{ service_id, correlation_id }`) |
| Productor | `ProvisioningOrchestratorService.handleInvoicePaid()` (`@OnEvent('invoice.paid')`) — encola un job por cada `service_id` distinto en `invoice.items`. También productor manual `enqueueProvisioning(serviceId, correlationId)` para endpoint admin `/admin/services/:id/reprovision` (Fase 11.D pendiente) + tests. |
| Procesador | `ProvisioningDispatchProcessor.process()` → invoca `ProvisioningOrchestratorService.provisionService(serviceId, correlationId)` |
| Lógica | Resuelve `service.product.provisioner` desde `PluginRegistryService`. Si plugin no registrado → emite `service.provisioning_failed` con `reason='plugin_not_registered'` y skip. Si está registrado: marca `services.status='provisioning'` + `provisioner_slug` denormalizado, llama `plugin.provision(ctx)`, persiste `provider_reference` + `metadata`, procesa `followUp` (`mark_active` → status=active + emit `service.activated`; `wait_for_task_completion` → log + listener Fase 11.C activará; `create_setup_task` → `TasksService.create(type=support_setup)` cola pública). |
| Idempotencia | Triple guard: (a) jobId estable `provision-${serviceId}-${correlationId}`; (b) check `services.status` al inicio (skip si `active`/`cancelled`/`terminated`); (c) plugin `provision()` debe ser idempotente por `provider_reference` (ADR-077 §1). |
| Errores | `ProvisionerPluginError(retriable=true)` → re-throw para BullMQ retry con backoff exponencial [30s, 90s, 270s, 810s, ...]. `ProvisionerPluginError(retriable=false)` → marca `services.status='cancelled'` + `cancellation_reason='provisioning_failed:<code>'` + emite `service.provisioning_failed`. |
| DLQ | ✅ — `DlqService.register('provisioning-dispatch')`. Tras 5 fallos retriables, job entra en `failed_jobs` + alerta superadmin (Fase 11.E listener notifications). |
| Tests | unit `provisioning-orchestrator.service.spec.ts` (10/10 verde — service no encontrado, idempotente, terminal, plugin no registrado, OK mark_active, OK create_setup_task, retriable re-throw, no-retriable cancela, invoice.paid encola N services, sin services no encola). E2E pendientes Fase 11.C. |

### Cola `support-resolved-auto-close` (Sprint 16 Amendment A1 + [ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md))

| Item | Valor |
|------|-------|
| Nombre | `support-resolved-auto-close` |
| Job principal | `support-resolved-auto-close-tick` (sin payload — repeat scheduled cron `30 2 * * *` UTC, evita colisión con `tasks-overdue` 02:00) |
| Productor | `SupportResolvedAutoCloseProcessor.onModuleInit()` registra `queue.upsertJobScheduler('support-resolved-auto-close-tick', { pattern: '30 2 * * *' })` (idempotente por id) |
| Procesador | `SupportResolvedAutoCloseProcessor.process()` → invoca `SupportResolvedAutoCloseService.run()` |
| Lógica | `SELECT FROM conversations WHERE type='ticket' AND status='resolved' AND resolved_at < now() - support.auto_close_resolved_days days`. Por cada uno: `UPDATE status='closed', closed_at=now()` + emit `conversation.auto_closed` (consumido por `notifications-conversation-auto-closed.listener` → email + campana al agente que resolvió). Idempotente: ejecutar dos veces el mismo día no doble-cierra. |
| Por qué este cron | Amendment A1 introduce `resolved` como estado **transitorio** (refina ADR-037). Tres caminos: cliente responde → reactiva, cliente confirma → cierra explícito, este cron cierra silencioso pasados N días. Sin él, los tickets `resolved` se acumularían sin cerrar. |
| Setting consumido | `support.auto_close_resolved_days` (default `7`). Editable vía `/admin/settings`. |
| Manual trigger | `POST /api/v1/admin/tasks/cron/support-resolved-auto-close` (JwtAuthGuard + AdminOnlyGuard + `Manage.Job` — sólo superadmin). |
| DLQ | ✅ — `DlqService.register('support-resolved-auto-close')` |
| Tests | unit `support-resolved-auto-close.service.spec.ts` (4 specs verde — cutoff, filtros por estado, emit `conversation.auto_closed`, idempotencia). E2E `support-conversation-lifecycle.spec.ts` (1 spec end-to-end del path auto-close). |

### Defaults globales (`JobsModule` — [ADR-063](../10-decisions/adr-063-bullmq-canonico-dlq-retries.md))

| Parámetro | Valor | Override por cola |
|-----------|-------|-------------------|
| `attempts` | 5 | sí (en `BullModule.registerQueue` o en `queue.add`) |
| `backoff.type` | `'exponential'` | sí |
| `backoff.delay` | `30_000` ms (30s → 480s en 5 intentos) | sí |
| `removeOnComplete` | `{ age: 3600 }` (1h) | sí |
| `removeOnFail` | `false` (jobs failed quedan en Redis hasta intervención) | sí |
| Jitter | ±10% (cuando se aplique a una cola con `backoff.type: 'custom'`) | sí |
| DLQ | Persistida en `failed_jobs` (Postgres) + emit `dlq.job_failed` (R7+R13) | — |
| Idempotencia | Obligatoria — `jobId` estable o `idempotency_key` en payload | — |

### Configuración Redis

| Variable env | Default | Notas |
|--------------|---------|-------|
| `REDIS_URL` | `redis://localhost:6379` | Lectura única vía `ConfigService.getOrThrow('REDIS_URL')`. **Requerida** para arrancar el backend (cumple ADR-063). |
| `BULLMQ_PREFIX` | `aelium-jobs` | Prefijo de keys en Redis. Permite múltiples entornos sobre el mismo Redis. |
| Redis DB | `1` | Reservada para BullMQ. DB 0 cache `SettingsService`. **DB 2 reservada Sprint 11 Fase 11.B** para `ProvisioningCacheService` (cache `service_info:<id>` con prefijo `aelium-provisioning:`). |

---

## Crons aspiracionales (documentados, no implementados)

| Cron | Origen | Objetivo | Sprint estimado |
|------|--------|----------|-----------------|
| **Retención RGPD** | [ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md) | Diario: anonimizar conversaciones cerradas >2 años, borrar `audit_*_log` >2 años | Sprint dedicado RGPD (sin asignar) — **deuda crítica legal** |
| **Preparación numeración año siguiente** | [ADR-025](../10-decisions/adr-025-numeracion-secuencial-facturas.md) | Fin de noviembre: `CREATE SEQUENCE invoice_number_seq_<YEAR+1>` | Sprint billing futuro — necesario para RD 1619/2012 |
| **Expurgo housekeeping** | [ADR-030](../10-decisions/adr-030-periodo-gracia-reintentos.md) | Limpiar datos de servicios completamente cancelados tras `billing.data_retention_after_suspension_days` | Sprint dedicado |
<!-- Borrado de notificaciones leídas — implementado Sprint 9.5 (cron `cleanupReadNotifications`). Ver §"Notifications retention" arriba. -->
| **Cron mensual de comisiones partner** | [ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md) | 1 del mes a las 03:00 UTC: agrupar `partner_commissions` accrued del mes pasado, generar `partner_payouts`, transferir SEPA / Stripe Connect | Fase 2 partner — **debe usar BullMQ + Outbox** |
| **Cron mensual de créditos referidos** | [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md) | 1 del mes a las 04:00 UTC: por cada referral activo con servicios, generar `referral_credit` accrued | Sprint dedicado tras Fase 2 |
| **Cron expiración de créditos referidos** | [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md) | Diario: marcar como `expired` los `referral_credits` con `accrued_at + credit_expiry_months < now()` | Sprint dedicado |
<!-- Cron alertas de mantenimiento crítico — implementado Sprint 8 Fase C como cola BullMQ `maintenance-critical`. Ver §"Jobs BullMQ activos" arriba. -->
<!-- Cron creación tareas mensuales de mantenimiento — implementado Sprint 8 Fase D como cola BullMQ `maintenance-monthly`. Ver §"Jobs BullMQ activos" arriba. -->

<!-- Cola `pdf-generation` ya implementada (Sprint 9 Fase B 2026-04-27) — ver §"Jobs BullMQ activos" arriba -->

---

## Eventos emitidos por crons (resumen)

| Evento | Emisor (cron) | Consumidor actual | Outbox |
|--------|---------------|--------------------|--------|
| `invoice.created` | `generatePendingInvoices` | `billing-email.listener` | ❌ |
| `invoice.overdue` | `detectOverdueInvoices` | `billing-email.listener` | ❌ |
| `invoice.failed` | `retryOverduePayments` (al agotar) | `billing-email.listener` | ❌ |
| `service.suspended` | `autoSuspendServices` | _(huérfano — espera provisioning)_ | ❌ |
| `service.cancelled` | `autoCancelServices` | _(huérfano — espera provisioning)_ | ❌ |
| `service.resumed` | `checkPauseExpiration` | _(huérfano — espera provisioning)_ | ❌ |
| `task.overdue` | `tasks-overdue` (BullMQ) | `tasks-overdue.listener` → email + campana al agente | ❌ — bajo P-DEPLOY.4 (ADR-069) |
| `task.unassigned_overdue` | `tasks-unassigned-overdue` (BullMQ) | `tasks-unassigned-overdue.listener` → email + campana superadmin | ❌ — operativo, no de negocio |
| `maintenance.critical` | `maintenance-critical` (BullMQ) | `maintenance-critical.listener` → email + campana superadmin | ❌ — operativo, no de negocio |
| **`conversation.auto_closed`** | **`support-resolved-auto-close` (BullMQ)** | **`notifications-conversation-auto-closed.listener` → email + campana al agente que resolvió** | ❌ — operativo (Sprint 16 Amendment A1) |

**Riesgo R8:** los 4 eventos `invoice.*` salen de un cron — si el proceso muere entre commit DB y `emit`, el cliente no se entera de su factura. Por eso `invoice.*` es el primer candidato para Outbox.

---

## Monitoring de jobs

[ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) §Monitoring cerrado tras Sprint 9 + 9.5:

- ✅ **Panel `/admin/jobs/failed`** (Sprint 9 Fase F) — lista DLQ paginada + filtros + acción "Reintentar" (vía `RetryService` que reencola con `attempts=5` reseteado y guarda `retried_at`/`retried_by`).
- ✅ **Panel `/admin/error-log`** (Sprint 9 Fase F) — lista paginada + filtros (level, module, resolved) + acción "Marcar resuelto".
- ✅ **Alerta `dlq.job_failed`** al superadmin (Sprint 9 Fase D — `notifications-dlq.listener`).
- ✅ **Alerta `system.error`** al superadmin (Sprint 9.5 — `notifications-system-error.listener` con guard anti-loop hard).
- ❌ **Métricas Prometheus** sobre colas: pendiente Sprint 14 Deploy real (Grafana/Prometheus/Loki stack).

---

## Cómo añadir un cron / job nuevo

1. **¿Es trabajo periódico?** → cron.
   - **Hoy (in-process):** `@Cron('expression')` en un service NestJS.
   - **Cuando se migre a BullMQ:** `Queue.add(jobName, payload, { repeat: { pattern: 'cron-expr' } })`.
2. **¿Es trabajo puntual disparado por evento o request?** → job BullMQ (cuando se implemente).
3. **¿Emite eventos críticos (transición de estado, cambio de dinero, gestión de servicio)?** → **Outbox obligatorio** ([ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md)).
4. **¿Es idempotente?** Si no, añadir `idempotency_key` al payload y guard al inicio.
5. **Documentar aquí**: nombre, schedule, módulo, qué hace, eventos que emite, estado.
6. **Documentar el evento** en `docs/20-modules/_events.md` si emite uno nuevo.

### Plantilla mínima de cron

```typescript
@Cron('0 3 * * *', { name: 'autoSuspendServices', timeZone: 'UTC' })
async autoSuspendServices() {
  const correlationId = randomUUID();  // R9
  this.logger.log({ correlationId, msg: 'autoSuspendServices start' });

  // ... lógica idempotente — si vuelve a correr no rompe ...

  this.logger.log({ correlationId, msg: 'autoSuspendServices done', count });
}
```

### Plantilla mínima de job BullMQ (cuando se implemente)

```typescript
@Processor('billing-payments')
export class PaymentRetryProcessor extends WorkerHost {
  async process(job: Job<{ invoice_id: string; idempotency_key: string }>) {
    // 1. Idempotency guard
    if (await this.alreadyProcessed(job.data.idempotency_key)) return;

    // 2. Trabajo
    await this.retry(job.data.invoice_id);

    // 3. Marcar idempotency
    await this.markProcessed(job.data.idempotency_key);
  }
}
```

---

## Documentos relacionados

- [ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) — Resiliencia: circuit breaker + retries + DLQ + graceful shutdown.
- [ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md) — Estrategia escalabilidad: cuándo migrar crons in-process a BullMQ.
- [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md) — Outbox Pattern (deuda crítica — afecta a 4 eventos `invoice.*`).
- [ADR-041](../10-decisions/adr-041-sistema-tareas.md) — Tareas: cron mensual mantenimientos pendiente.
- [ADR-051](../10-decisions/adr-051-partner-comisiones-liquidaciones.md) — Cron mensual partner payouts (Fase 2).
- [ADR-054](../10-decisions/adr-054-sistema-referidos-clientes.md) — Cron mensual referral credits.
- [`docs/20-modules/_events.md`](../20-modules/_events.md) — Catálogo de eventos.
- [`settings-reference.md`](./settings-reference.md) — Settings que consumen los crons (`billing.*`, `support.*`).
