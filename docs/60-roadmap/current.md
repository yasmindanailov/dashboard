# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26. Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)).

> **Última actualización:** 2026-04-26 — refactor de roadmap (post F6).
> **Cambios estructurales recientes:**
> - **Sprint 11.5 (MinIO Storage)** añadido como sprint independiente — antes estaba dentro del Sprint 14 Deploy. Desbloquea adjuntos chat/tickets sin obligar a desplegar a producción.
> - **Sprint 14 (Deploy)** limpiado — solo lo que realmente requiere producción real.
> - **Sprint 15 (Plugins)** partido en sub-sprints 15A-15H independientes — cada plugin se aborda según necesidad real, no en cadena.
> - **Sprint 8 Fase D (Support Inside)** refinada con UX dedicada según [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md).

---

## 🔄 Sprint 7 — Billing Hardening + Support

**Estado:** ~95% completo, **bloqueado por dependencias externas** para los pasos restantes.
**Inicio:** Sprint 6 (continuación). **Cierre formal estimado:** cuando se desbloqueen Sprints 14, 15, 8.

### ✅ Lo cerrado (verificado contra código)

- **Billing hardening (5 pasos):** admin checkout selector, validar `targetUserId`, perfil de facturación contra cliente destino, IVA recálculo en edición, descuento anual aplicado.
- **Support core (8 pasos):** SupportService completo, WebSocket gateway con auth dual JWT+guest, chat tiempo real, arquitectura dual chat+ticket, escalación, panel agente 3 columnas, bandeja tickets, detalle conversación, plantillas de email, admin.md.
- **Support hardening (25 pasos H1-H25):** dedup WS+REST, escalación única, cleanup typing, post-escalación redirige al ticket, página `[id]` diferenciada, sorting waiting_agent, indicador asignación, unread separado por type, stats filtrados, sync notas, nota obligatoria al reabrir, coherencia acciones panel, sidebar contexto cliente, etc.
- **Chat anónimo (8 pasos):** guest token, endpoint guest, rate limit 3/h, gateway auth fallback, widget guest mode, vinculación por email, vinculación manual, cleanup cron 30d.
- **Refactorización R15 (9 pasos R15.1-R15.9):** chats/page (907→77), ChatWidget (671→155), support/page (557→102), support/[id] (733→88), checkout (570→233), layout (394→79), clients/[id] (683→243), products (323→282), products/new (347→296). **Backend support refactor:** support.service (1054→90 fachada + 4 sub-servicios), gateway (526→232).

### ⏳ Lo pendiente (todo bloqueado)

| Paso | Bloqueado por | Cuándo se desbloquea |
|------|---------------|----------------------|
| 7.6.1-3 Horario soporte | Nada — se puede hacer ya | Decisión de priorizar |
| 7.7 Adjuntos archivos | **Sprint 14 — MinIO** | Tras Sprint 14 |
| 7.6.1-4 Ticket UX (rich text + email-style + adjuntos + subject editable) | **Sprint 7.5 Fase 2 + Sprint 14 MinIO** | Cuando ambos cierren |
| 7.8/7.9 IA filtro + copilot | **Sprint 15 Plugins (Claude AI)** | Tras Sprint 15 |
| 7.SI.1/2 Support Inside (badge, página cliente) | **Sprint 8 Fase D** | Tras cierre Sprint 8 |

**Acción recomendada:** **NO cerrar Sprint 7 formalmente** todavía. Cuando todos los bloqueos se resuelvan en sus respectivos sprints, se cierra de una vez.

---

## 🔄 Sprint 7.5 — Design System Foundation

**Estado:** Fase 1 ✅ cerrada. Fase 2 parcial.

### ✅ Fase 1 — Tokens y componentes base (D1–D10f, D11)

Verificada completa contra código en `frontend/components/ui/`:

- D1 Tokens CSS, D2 Button, D3 Input/Select/SearchInput/Textarea, D4 Badge/StatusDot, D5 Card, D6 Modal, D7 Table, D8 Toast, D9 EmptyState/Skeleton, D10 Avatar/Tooltip/Dropdown, D10b Pagination/StatsCard/AlertBanner, D10c UI_SPEC.md, D10d StatusTabs, D10e Breadcrumb, D10f Tabs.
- D11 Dashboard shell migrado (Sidebar, Topbar, Layout) — CSS modules, eliminados inline styles.

### ⏳ Fase 2 — Migración de páginas existentes (parcial)

Algunas páginas migradas en Sprint 7 R15 (chats, support, checkout, layout, clients, products). Otras pendientes — el playbook no enumera el % exacto. Acción: **cuando se aborde una página por trabajo de feature, migrarla al DS en el mismo PR** (oportunismo) en lugar de un sprint dedicado de migración masiva.

---

## 🔄 Sprint 8 — Tasks + Support Inside

**Estado:** WIP confirmado en auditoría 2026-04-26. Fase A 50%, Fases B-E pendientes.

> **Bloquea cadena de Sprint 9** (Audit + Notifications) que necesita listeners de `task.*` para emails.

### Fase A — Schema + fixes base

| # | Paso | Estado real | Notas |
|---|------|-------------|-------|
| 8.1 | TasksService CRUD + asignación + estados + Controller con CASL | ✅ **Cerrado P0.1 (2026-04-26)** — validación FK `assigned_to` (existe + activo + rol asignable) implementada en `assertAssignableUser`. |
| 8.1b | Schema: `task_checklist_completions`, `maintenance_logs`, `product_checklist_items`, `service_checklist_items` + migración | ⬜ |
| 8.1c | Schema: campo `task_id` nullable FK en `client_notes` + migración | ⬜ |
| 8.1d | Backend: completar maintenance → `maintenance_log` + persistir notas + crear `ClientNote(task_id)` | ⬜ |
| 8.14 | Backend: endpoint listar agentes (`GET /api/v1/users?role=agent*`) | ⬜ |

### Fase B — Frontend core

| # | Paso | Estado real |
|---|------|-------------|
| 8.8 | Tablero ListPage + DetailPage + NewTaskModal + TaskTable | 🔄 |
| 8.8b/c/d/e | Select agente, bloques adaptativos, DS compliance, ClientNotesTab vinculación tarea | ⬜ |

### Fase C — Automatización

| # | Paso | Estado real |
|---|------|-------------|
| 8.2 | Listener `service.provisioned` → crear `wow_call` automático | ⬜ |
| 8.3 | WOW calls checklist post-alta (depende 8.1b) | ⬜ |
| 8.10 | **Listeners `task.assigned`, `task.overdue`, `maintenance.completed`, `maintenance.critical`** | 🔄 **`task.assigned` cerrado P0.1 (2026-04-26)** vía `tasks-email.listener.ts` (email + notificación interna). Resto pendiente Sprint 9. |
| 8.12 | Cron `not_completed_in_time` + emit `task.overdue` | ⬜ |

### Fase D — Support Inside (UX dedicada — ADR-061)

> **Refinada por [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md):** Support Inside se presenta como **tier de cuenta** con páginas dedicadas, no como producto en el catálogo público. El schema sigue igual ([ADR-034](../10-decisions/adr-034-support-inside-modelo.md)) — solo cambia la presentación.

| # | Paso | Estado real |
|---|------|-------------|
| 8.4 | Schema + Service support_inside_* + planes Básico/Medium/Pro (sin cambios respecto a ADR-034) | ⬜ |
| **8.4b** | **(NUEVO ADR-061)** Admin `/admin/support-inside-plans` — página dedicada con los 3 planes lado a lado, NO en el CRUD genérico de productos | ⬜ |
| 8.5 | Página cliente `/dashboard/support-inside` — 3 planes comparados si no tiene activo; gestión de plan/slots si tiene activo. **NO aparece en `/dashboard/catalog`** | ⬜ |
| 8.6 | Cancelación cascada + recurrencia anniversary_day + cron mensual generación de tareas mantenimiento | ⬜ |
| 8.7 | ~~We Do It For You~~ — **DEPRECADO** ([ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md), reemplazado por Projects Sprint 22) | 🛑 |
| 8.9 | Frontend vista mantenimiento mensual (depende 8.6) | ⬜ |
| 8.13 | Cron alerta tarea crítica (X días antes fin mes, configurable) | ⬜ |

### Fase E — Cierre

| # | Paso | Estado real |
|---|------|-------------|
| 8.11 | docs/features/tasks/admin.md + agent.md | ⬜ |
| **8.E.1** | **(NUEVO desde auditoría)** Tests E2E para tasks: crear → asignar → completar | ✅ **Cerrado P0.1 (2026-04-26)** — `tests/e2e/tasks.spec.ts` con 3 specs (flujo completo + 2 validaciones FK). |

### ✅ P0.1 cerrado (2026-04-26) — cierre mínimo Sprint 8

1. ✅ Listener `@OnEvent('task.assigned')` en `backend/src/modules/tasks/tasks-email.listener.ts` → email al agente + notificación interna en tabla `notifications`.
2. ✅ Validación FK `assigned_to` (helper privado `assertAssignableUser` en `tasks.service.ts`): valida user existe + status=`active` + rol en `superadmin|agent_full|agent_billing|agent_support`. Devuelve 400 (`BadRequestException`) si no.
3. ✅ Tests E2E (`tests/e2e/tasks.spec.ts`) — 3 specs serializados (gestión 2FA del superadmin), incluyen helper `loginSuperadminAPI` reusable. Suite completa CI mode 10/10 pasa.
4. ✅ Fix oportunista: 2 errores `no-unsafe-enum-comparison` resueltos (uso `TaskStatusDto.completed` en vez de string literal). Lint backend mejora -4 errores netos.

### 🔴 Resto del Sprint 8 — pendiente

- Fase A: schemas pendientes (8.1b/c/d/14).
- Fase B: frontend bloques adaptativos + ClientNotesTab vinculación tarea.
- Fase C: listener `task.overdue` + cron `not_completed_in_time` + WOW calls automáticos.
- Fase D: Support Inside (UX dedicada — ADR-061).
- Fase E: docs admin/agent.

**Próximo paso recomendado tras P0.1:** ~~**P0.2 Outbox Pattern para `invoice.*`**~~ ✅ **Cerrado 2026-04-26** — los 4 eventos `invoice.*` (`created`, `paid`, `failed`, `overdue`) usan `OutboxService.enqueue(tx, ...)` dentro de transacción Prisma; `OutboxWorker` (`@Interval(5s)` + `FOR UPDATE SKIP LOCKED`) los despacha vía `EventEmitter2.emitAsync` con retries y crash recovery. Test E2E `tests/e2e/outbox-invoice.spec.ts` demuestra persistencia tras "crash" del bus. ADR-033 actualizado.

~~**Siguiente: P0.3 saneamiento lint**~~ ✅ **Cerrado 2026-04-26** — Backend 294 → 0 errores, Frontend 117 → 0 errores, CI lint bloqueante en ambos. 4 commits incrementales (`3b2df25`, `8f91daf`, `56285d3`, `36099a8`, `f313e31`, `3d27da1`). Deuda residual DC.6 (27 warnings `set-state-in-effect` — migración Server Components, ver [`backlog.md`](./backlog.md)).

~~**Siguiente: P0.4 tests E2E exhaustivos**~~ ✅ **Cerrado 2026-04-26** — 3 specs nuevos en `tests/e2e/` (auth-2fa-exhaustive, checkout-flow, support-ws-escalation). Cubren: código 2FA incorrecto + lockout 5 fallos password, flujo billing completo (crear→finalizar→pagar→descarga PDF con magic bytes), escalación chat→ticket recibida en tiempo real vía WebSocket en `agent:inbox`.

🎯 **P0 cerrado al 100%.** El primer deploy productivo (Sprint 14) ya no tiene bloqueos críticos pre-deploy. Próxima prioridad: **P1.1 Sprint 9 — Audit + Notifications Full + Outbox worker hardening** (ver [`backlog.md`](./backlog.md)).

---

## 🔄 Sprint 9 — Audit + Notifications Full + BullMQ + DLQ (P1.1)

**Estado:** ⬜ planificación (plan canónico — pendiente ejecución)
**Inicio estimado:** 2026-04-26 (post Sprint 11.5)
**Cierre estimado:** 2026-05 (4-5 sub-sesiones — ver Fases A–F)

> **Trigger:** cierre del Sprint 11.5 introdujo deuda controlada R2 (fire-and-forget de PDFs en `InvoicePdfStorageService.generateAndUploadInBackground`, documentada en [`jobs-reference.md` §Crons aspiracionales](../50-operations/jobs-reference.md)) + el cierre P0.2 de Outbox dejó pendiente §7 del [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md) (alerta superadmin si row Outbox llega a `failed`). Sprint 9 es la consolidación arquitectónica que cierra ambas, formaliza ADR-055 (DLQ + retries + circuit breaker), implementa ADR-042 (notifications full), implementa ADR-017 (audit centralizado) y construye la infra BullMQ que [ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md) declara prerequisito de escalado horizontal.

### 1. Objetivo en una frase

Convertir el sistema de jobs y notificaciones en infra de producción profesional: BullMQ con DLQ + reintentos exponenciales como única forma canónica de trabajo asíncrono, `NotificationsService` multicanal manejando todos los emails + campana, `AuditService` centralizado con portal transparencia, y Error Log UI para que ningún fallo quede silencioso.

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué del sprint |
|---|-------------|--------|------------------------|
| 1 | P0.1 listener `task.assigned` cerrado (Sprint 8) | ✅ | Fase D — migración listener a `NotificationsService` |
| 2 | P0.2 Outbox `invoice.*` (4 eventos) cerrado | ✅ | Fase C — hardening del worker |
| 3 | P0.3 lint bloqueante en CI | ✅ | Todo el sprint |
| 4 | P0.4 tests E2E exhaustivos cerrados | ✅ | Fase B/D — referencia para tests nuevos |
| 5 | P1.2 Sprint 11.5 cerrado (storage + `InvoicePdfStorageService`) | ✅ | Fase B — migrar fire-and-forget a cola `pdf-generation` |
| 6 | [ADR-055](../10-decisions/adr-055-resiliencia-circuit-breaker.md) — DLQ + retries + backoff exponencial documentado | ✅ doc, ❌ código | Fase A — formaliza implementación |
| 7 | [ADR-056](../10-decisions/adr-056-estrategia-escalabilidad.md) — migración crons a BullMQ | ✅ doc | Fase A + Fase C |
| 8 | [ADR-033](../10-decisions/adr-033-outbox-pattern-pendiente.md) §7 — alerta superadmin si Outbox `failed` | ⬜ pendiente | Fase C |
| 9 | [ADR-042](../10-decisions/adr-042-sistema-notificaciones.md) — multicanal + plantillas editables | ✅ doc | Fase D |
| 10 | [ADR-017](../10-decisions/adr-017-audit-log-inmutable.md) — `AuditService` centralizado | ✅ doc | Fase E |
| 11 | Stubs `audit/`, `notifications/`, `error-log/` (6 líneas cada uno) — verificados 2026-04-26 | ✅ presentes | Fases D/E/F |
| 12 | `@nestjs/bullmq` v11 + `bullmq` v5 instalados | ✅ verificado en `backend/package.json` | Fase A |

> Todas las dependencias críticas están ✅. Únicas decisiones nuevas a registrar son los 3 ADRs de Fase A/C/D (ver §9).

### 3. Produce (contratos nuevos)

#### 3.1 Endpoints REST nuevos

- `GET /api/v1/notifications/unread` — campana del usuario actual. Devuelve hasta 50 notificaciones más recientes con `status='unread'`. CASL: `Read.Notification` (ownership por `user_id = req.user.id`).
- `GET /api/v1/notifications` — histórico paginado del usuario actual (cursor pagination). CASL: `Read.Notification` + ownership.
- `PATCH /api/v1/notifications/:id/read` — marca como leída. CASL: `Update.Notification` + ownership.
- `PATCH /api/v1/notifications/read-all` — marca todas como leídas. CASL: `Update.Notification` + ownership.
- `GET /api/v1/audit/access` — portal transparencia: lecturas a datos del usuario actual. Query params: `resource_type?`, `from?`, `to?`. CASL: `Read.AuditAccess` (ownership por `resource_id IN (recursos del usuario)`).
- `GET /api/v1/audit/changes` — portal transparencia: cambios sobre datos del usuario actual. CASL: igual que `/access`.
- `GET /api/v1/admin/error-log` — admin: errores del sistema con paginación. CASL: `Manage.ErrorLog` (solo `superadmin`).
- `GET /api/v1/admin/jobs/failed` — admin: jobs en DLQ (estado `failed` en BullMQ + tabla `failed_jobs`). CASL: `Manage.Jobs` (solo `superadmin`).
- `POST /api/v1/admin/jobs/:id/retry` — admin: reintenta manualmente un job de DLQ. CASL: `Manage.Jobs`.
- `GET /api/v1/admin/notifications/templates` — listar plantillas. CASL: `Manage.NotificationTemplate`.
- `PATCH /api/v1/admin/notifications/templates/:id` — editar plantilla (asunto + cuerpo). CASL: igual.
- `POST /api/v1/admin/notifications/templates/:id/preview` — render preview con datos de muestra.

#### 3.2 Eventos nuevos emitidos

- `system.error` — emitido por `ErrorLogService.log()` cuando un error operativo persiste. Payload: `{ error_id, severity, source, message, correlation_id }`. Consumidor: `notifications-error.listener` → notifica al superadmin (campana + email). Cumple R7.
- `outbox.event_failed` — emitido por `OutboxWorker` cuando un row Outbox alcanza `max_retries`. Payload: `{ event_outbox_id, event_type, last_error, retry_count }`. Consumidor: `notifications-outbox.listener` → alerta superadmin. **Cierra ADR-033 §7.**
- `dlq.job_failed` — emitido por `DlqService` cuando un job BullMQ entra en DLQ. Payload: `{ job_id, queue, name, last_error, attempts_made }`. Consumidor: `notifications-dlq.listener` → alerta superadmin. **Cierra ADR-055 §DLQ.**
- `notification.dispatched` — emitido por `NotificationsService.dispatch()` tras envío exitoso. Payload: `{ notification_id, event_type, channel, recipient_id }`. Consumidor: `audit-notification.listener` → registra en `audit_integration_log`.

#### 3.3 Servicios inyectables nuevos

- `JobsModule` (global) — registra `BullModule.forRoot()` con Redis URL + defaults: `attempts=5`, `backoff: { type: 'exponential', delay: 30000 }`, `removeOnComplete: { age: 3600 }`, `removeOnFail: false`. Cumple ADR-055.
- `DlqService` (`backend/src/core/jobs/dlq.service.ts`) — listener de eventos `failed` en colas BullMQ. Persiste fila en `failed_jobs` + emite `dlq.job_failed` (R13).
- `RetryService` (`backend/src/core/jobs/retry.service.ts`) — utilidad para que admin reintente un job: lee `failed_jobs` → `queue.add(...)`.
- `NotificationsService.dispatch(eventType, payload, options?)` (`backend/src/modules/notifications/`) — orquesta render plantilla + envío multicanal. Encola en BullMQ `notifications-dispatch` para envíos pesados (email externo).
- `NotificationTemplateService` — render de plantillas con Handlebars + validador de variables disponibles por `event_type`.
- `EmailChannel`, `InAppChannel` — implementan `NotificationChannelInterface` (ADR-042). `EmailChannel` envuelve el `core/email` actual. `InAppChannel` persiste en tabla `notifications` (campana).
- `AuditService` (`backend/src/modules/audit/`) — métodos `logAccess(actor, resource, action, metadata?)`, `logChange(actor, resource, before, after, metadata?)`, `logIntegration(integration, payload_hash, status, metadata?)`. Reemplaza accesos directos a `audit_access_log` (hoy en billing — ver `_matrix.md`).
- `ErrorLogService.log(error, context)` — persiste en `error_log` + emite `system.error`. Catch global de NestJS migrado a invocarlo.
- `PdfGenerationProcessor` (`backend/src/modules/billing/`) — `@Processor('pdf-generation')` + `WorkerHost`. Idempotency guard por `invoice_id`. Reemplaza `InvoicePdfStorageService.generateAndUploadInBackground`.
- `OutboxDispatcher` — sustituye el `@Interval(5s)` actual de `OutboxWorker` por `BullModule.registerQueue('outbox-dispatch')` con `repeat: { every: 5000 }`. Crash recovery (`onModuleInit`) se mantiene.

#### 3.4 Tablas o campos Prisma

> **Auditoría schema 2026-04-26:** ya existen `notifications` (con shape básico — `channel`/`title`/`body`/`read_at`), `error_log`, `audit_access_log`, `audit_change_log`, `event_outbox` en `backend/prisma/schema.prisma`. Sprint 9 reutiliza el shape existente y añade SOLO lo nuevo, sin duplicar.

##### Tablas nuevas (2)

```prisma
// Sprint 9 Fase A — DLQ post-mortem (ADR-063)
enum FailedJobStatus { failed retrying resolved }

model FailedJob {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  bull_job_id     String          @db.VarChar(200)              // BullMQ job.id
  queue           String          @db.VarChar(100)
  name            String          @db.VarChar(200)
  payload         Json
  last_error      String          @db.Text
  stack_trace     String?         @db.Text
  attempts_made   Int
  retried_at      DateTime?       @db.Timestamptz()
  retried_by      String?         @db.Uuid
  status          FailedJobStatus @default(failed)
  created_at      DateTime        @default(now()) @db.Timestamptz()
  @@index([queue, status])
  @@index([created_at])
  @@map("failed_jobs")
}

// Sprint 9 Fase D — Plantillas editables (ADR-042 §Plantillas, ADR-065)
model NotificationTemplate {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  event_type  String   @db.VarChar(100)
  channel     NotificationChannel
  locale      String   @default("es") @db.VarChar(10)
  subject     String   @db.VarChar(300)
  body        String   @db.Text
  variables   Json     // { "client.name": "string", ... } — declarativo
  active      Boolean  @default(true)
  updated_by  String?  @db.Uuid
  created_at  DateTime @default(now()) @db.Timestamptz()
  updated_at  DateTime @updatedAt       @db.Timestamptz()
  @@unique([event_type, channel, locale])
  @@map("notification_templates")
}
```

##### Tablas existentes — uso sin modificación

- `notifications` (líneas 690–707): se usa tal cual. Campo `read_at NULL` = unread, `read_at NOT NULL` = read. NO añadimos enum status — preservamos el shape actual y `NotificationsService` filtra por `read_at IS NULL`.
- `error_log` (líneas 768–786): se usa tal cual. Campo `level` (`error|warn|fatal`) en lugar del `severity` que asumí; `module` en lugar de `source`. `ErrorLogService.log()` adapta nombres internamente.
- `audit_access_log`, `audit_change_log` (líneas 790–821): se usan tal cual. `AuditService.logAccess` mapea (`user_id`, `action`, `resource`, `metadata`) directos.
- `event_outbox` (líneas 750–764): sin cambios. Sprint 9 Fase C solo modifica el dispatcher externo.

> NO se crea `audit_integration_log` separada (no existe hoy en schema). Se difiere al sprint que la necesite (Stripe / ResellerClub / Docker integrations) y se añade en su sprint dedicado. Sprint 9 §3.2 elimina referencia a `audit_integration_log` — el evento `notification.dispatched` se persiste en `audit_change_log` con `entity_type='notification'`.

#### 3.5 Settings nuevos (seed)

| Key | Tipo | Default | Justificación |
|-----|------|---------|---------------|
| `notifications.retention_days` | number | 90 | ADR-042 + ADR-060 — borrado automático notificaciones leídas. |
| `notifications.unread_max_in_dropdown` | number | 50 | ADR-042 — campana muestra 50 más recientes. |
| `notifications.email_enabled_globally` | boolean | true | Kill switch global por ambiente (off en CI/staging). |
| `notifications.maintenance_critical_threshold_days` | number | 7 | ADR-042 — alerta tarea crítica X días antes fin de mes. |
| `jobs.default_retries` | number | 5 | ADR-055 — defaults BullMQ. |
| `jobs.backoff_initial_ms` | number | 30000 | ADR-055 — backoff exponencial 30s → 480s. |
| `jobs.dlq_alert_to_superadmin` | boolean | true | R7 + ADR-055 — alerta cuando job entra en DLQ. |
| `audit.access_retention_days` | number | 730 | ADR-017 — 2 años (no negociable a la baja). |

#### 3.6 Permisos CASL nuevos

- `Subject.Notification` — `Read`/`Update` con ownership (`user_id = actor.id`).
- `Subject.NotificationTemplate` — `Manage` solo `superadmin`.
- `Subject.AuditAccess` / `Subject.AuditChange` — `Read` con ownership (cliente ve sus accesos) + `Manage` para `superadmin`.
- `Subject.ErrorLog` — `Manage` solo `superadmin`.
- `Subject.Job` — `Manage` solo `superadmin`.

### 4. Modifica (contratos existentes)

#### 4.1 Endpoints modificados

- `GET /api/v1/billing/invoices/:id/pdf` y `/pdf-url` — sin cambios funcionales para el caller, pero internamente el upload async se sirve desde la cola `pdf-generation` en lugar de `setImmediate`. Edge case nuevo: si el job está `waiting`/`active` cuando se descarga, fallback inline genera y sube síncrono (semántica idéntica al `pdf_url=NULL` actual).

#### 4.2 Servicios modificados

- `BillingInvoiceService.markAsPaid()` y `BillingInvoiceService.sendToPending()` — sustituyen `invoicePdfStorageService.generateAndUploadInBackground(...)` por `pdfQueue.add('invoice-pdf', { invoice_id, idempotency_key })`. Idempotency key estable: `invoice-pdf-{invoice_id}` (la cola descarta duplicados con misma key vía `jobId`).
- `OutboxWorker` (`backend/src/core/outbox/outbox.worker.ts`) — `@Interval(5000)` se elimina; el dispatch lo programa BullMQ con `repeat: { every: 5000 }`. La lógica `claimBatch` + `processEvent` permanece intacta. Crash recovery `onModuleInit` se mantiene. Cuando un row alcanza `max_retries` → emite `outbox.event_failed`.
- `BillingEmailListener` — pasa de invocar `EmailService.send(...)` directamente a `NotificationsService.dispatch('invoice.paid', payload)`. La plantilla inline pasa a tabla `notification_templates`.
- `TasksEmailListener` — equivalente: `NotificationsService.dispatch('task.assigned', payload)`. Mantiene el `task.assigned` cerrado P0.1.
- Accesos directos `prisma.auditAccessLog.create(...)` actuales (en `BillingService` — ver `_matrix.md` §A2) → migran a `AuditService.logAccess(...)`.
- `core/email/EmailService` — pasa de servicio público a implementación interna del `EmailChannel` plugin. Solo `NotificationsService` lo usa. Llamadas directas en otros módulos quedan prohibidas (cierra ADR-042).

#### 4.3 Eventos cambiados

- (ninguno) — los eventos existentes mantienen payload. Los listeners cambian su forma de despachar.

#### 4.4 BREAKING changes

- **Semántico interno (no público):** `EmailService.send(...)` deja de ser API estable. Cualquier call site nuevo debe pasar por `NotificationsService.dispatch(...)`. ESLint custom rule (deuda menor — añadir si tiempo) o revisión code-review. Se documenta en `rules.md` como D-NN ("no `EmailService.send` directo").
- **Operacional:** los crons in-process (`detectOverdueInvoices`, `generatePendingInvoices`, `retryOverduePayments`, `autoSuspendServices`, `autoCancelServices`, `checkPauseExpiration`, `cleanupExpiredGuestSessions`) **NO se migran** en este sprint. Su migración a BullMQ scheduled queda en P2.5 Sprint 13 (Hardening) — explícitamente fuera de scope para no inflar Sprint 9. Documentar en `jobs-reference.md`.

### 5. Pasos atómicos

> Sprint dividido en **6 fases** (A–F) que pueden cerrarse incrementalmente. Cada fase es punto natural de commit + smoke test parcial. Estimado total: 4-5 sub-sesiones.

#### Fase A — Infra BullMQ + DLQ (cierra ADR-055, base de todo)

| # | Paso | Estado |
|---|------|--------|
| 9.A.1 | ADR-063 — Infra BullMQ canónica + DLQ + retries (formaliza ADR-055 §DLQ y §Retries con backoff) | ✅ |
| 9.A.2 | Schema Prisma: tabla `failed_jobs` + enum `FailedJobStatus` (migración pendiente — requiere Docker arriba) | 🟡 schema ✅, migración SQL pendiente Docker |
| 9.A.3 | `core/jobs/jobs.module.ts` (global) — `BullModule.forRoot()` con Redis URL desde env, defaults `attempts=5` + backoff exponencial 30s→480s | ✅ |
| 9.A.4 | `core/jobs/dlq.service.ts` — registro diferido por cola via `register()`, persiste en `failed_jobs`, emite `dlq.job_failed` | ✅ |
| 9.A.5 | `core/jobs/retry.service.ts` — método `retry(failedJobId, actorId)` (re-encola con `attempts=5` reseteado, marca `failed_jobs.retried_at`/`retried_by`) | ✅ |
| 9.A.6 | Settings seed: 3 nuevos `jobs.*` (`default_retries`, `backoff_initial_ms`, `dlq_alert_to_superadmin`) | ✅ |
| 9.A.7 | Tests unitarios RetryService (5/5 verdes — mocks Prisma + Queue). DlqService cubierto E2E en Fase B (mismo patrón que P0.2 OutboxWorker) | ✅ |

**Cierre Fase A:** typecheck ✅ · lint ✅ · build ✅ · tests RetryService 5/5 ✅. Migración Prisma `failed_jobs` queda pendiente hasta arranque de Docker Desktop — schema modificado y `prisma generate` ejecutado, falta sólo `pnpm prisma migrate dev --name sprint9_phase_a_failed_jobs` con DB up.

#### Fase B — Cola `pdf-generation` (cierra deuda Sprint 11.5)

| # | Paso | Estado |
|---|------|--------|
| 9.B.1 | `BullModule.registerQueue('pdf-generation')` en `BillingModule` | ✅ |
| 9.B.2 | `PdfGenerationProcessor` (`@Processor('pdf-generation')` + `WorkerHost`) — invoca `InvoicePdfStorageService.generateAndUpload(invoice_id)`. Registra cola en `DlqService` + `RetryService` en `OnModuleInit` | ✅ |
| 9.B.3 | Idempotency: `jobId = 'invoice-pdf-{invoice_id}'` para que duplicados sean no-op | ✅ |
| 9.B.4 | Refactor `BillingInvoiceService.markAsPaid()` y `sendToPending()` — `pdfQueue.add(INVOICE_PDF_JOB, { invoice_id }, { jobId })` via helper privado `enqueuePdfGeneration()` | ✅ |
| 9.B.5 | Eliminar el método `generateAndUploadInBackground` del `InvoicePdfStorageService` (no más fire-and-forget) | ✅ |
| 9.B.6 | Test E2E reusando `tests/e2e/storage-pdf.spec.ts` — el flujo observable es idéntico (pago → poll `pdf_url` → descarga). 2/2 specs verdes contra Redis + MinIO + Postgres reales. Comentario header actualizado citando Fase B | ✅ |
| 9.B.7 | `jobs-reference.md` — cola `pdf-generation` registrada como activa con flujo completo, defaults globales del JobsModule + Redis config | ✅ |

**Cierre Fase B:** typecheck ✅ · lint ✅ · build ✅ · boot real con `DlqService` registrando `pdf-generation` ✅ · E2E `storage-pdf.spec.ts` 2/2 verdes (6.2s) ejercitando cola + processor + upload + signed URL real. **Deuda R2 introducida por Sprint 11.5 cerrada al 100%** — ningún `setImmediate`/`then().catch()` queda en el flujo de PDFs.

#### Fase C — Outbox worker hardening (cierra ADR-033 §7 y §3)

| # | Paso | Estado |
|---|------|--------|
| 9.C.1 | ADR-064 — Outbox dispatcher migrado a BullMQ scheduled job (sustituye `@Interval`, prepara escalado horizontal cumpliendo ADR-056 §13.30+) | ✅ |
| 9.C.2 | `BullModule.registerQueue('outbox-dispatch')` en `OutboxModule` | ✅ |
| 9.C.3 | `OutboxDispatchProcessor` invoca `OutboxWorker.dispatch()` (la lógica `claimBatch` + `processEvent` se mantiene; sólo cambia quién la dispara). Registra cola en `DlqService` + `RetryService` en `OnModuleInit` | ✅ |
| 9.C.4 | `@Interval(5000)` eliminado del `OutboxWorker`. El processor registra `queue.upsertJobScheduler('outbox-tick', { every: 5000 })` en `OnModuleInit` (idempotente por id) | ✅ |
| 9.C.5 | Backoff exponencial al reintentar evento failed: `next_retry_at = now() + 30000 * 2^retry_count` capado a 480s. Persistido en columna nueva `event_outbox.next_retry_at` (migración Prisma `20260427051749_sprint9_phase_c_outbox_next_retry`). `claimBatch` filtra elegibilidad: `WHERE status='pending' AND (next_retry_at IS NULL OR next_retry_at <= now())` | ✅ |
| 9.C.6 | Cuando `retry_count + 1 >= max_retries` → status `failed` + emit `outbox.event_failed` (cierra ADR-033 §7). Consumidor llegará en Fase D (notifications-outbox.listener); por ahora el evento queda huérfano y el row persiste como `failed` para revisión manual | ✅ |
| 9.C.7 | Tests unit `outbox.worker.spec.ts` (6/6 verdes — listener OK, backoff +30s/+120s, cap +480s, emit `outbox.event_failed`, recovery `processing`→`pending`) + E2E `outbox-invoice.spec.ts` (4/4 verdes con la nueva infraestructura) + suite full E2E **20/20 verde en 1.1min** | ✅ |

**Cierre Fase C:** typecheck ✅ · lint ✅ · build ✅ · unit 11/11 (RetryService + OutboxWorker) ✅ · E2E suite 20/20 ✅ · boot real verifica `OutboxDispatchProcessor` registra scheduler y `DlqService` registra cola. **ADR-033 §7 cerrado al 100%** (alerta operativa al agotar retries) y **ADR-056 §13.30+ desbloqueado** (leader election natural — Sprint 14 puede escalar a N instancias sin coordinación adicional).

#### Fase D — Notifications full (cierra ADR-042)

| # | Paso | Estado |
|---|------|--------|
| 9.D.1 | ADR-065 — `NotificationChannelInterface` + plantillas editables + dispatcher BullMQ (formaliza ADR-042) | ✅ |
| 9.D.2 | Schema Prisma: `notification_templates` + migración `20260427053610_sprint9_phase_d_notification_templates`. `notifications` ya existe — preserva shape original | ✅ |
| 9.D.3 | `NotificationsModule` (@Global) con `BullModule.registerQueue('notifications-dispatch')` + multi-provider `NOTIFICATION_CHANNELS` | ✅ |
| 9.D.4 | `NotificationTemplateService` — render Handlebars con helpers `lt`/`gt`/`eq` + locale fallback `es` + canal email no escapa HTML, internal sí. Tests unit 6/6 verde | ✅ |
| 9.D.5 | `EmailChannel` (envuelve `core/email`) + `InAppChannel` (insert en `notifications`, persiste `action_url` y `metadata` para frontend) | ✅ |
| 9.D.6 | `NotificationsService.dispatchToUser` y `dispatchToSuperadmins` — encolan en `notifications-dispatch`. Resolución de superadmins via `User.role.slug='superadmin'` | ✅ |
| 9.D.7 | `NotificationsDispatchProcessor` — resuelve recipients, lookup template `(event_type, channel, locale)`, itera canales, retorno parcial (algunos OK, algunos fail = warning), throw si TODOS fallan | ✅ |
| 9.D.8 | Seed inicial 11 plantillas en `prisma/seeds/notification-templates.ts`: `invoice.*` (4) + `task.assigned` (2 canales) + `outbox.event_failed` (2) + `dlq.job_failed` (2) + `invoice.paid` campana. HTML byte-idéntico al inline previo para preservar tests E2E | ✅ |
| 9.D.9 | Refactor `BillingEmailListener` (4 handlers: una línea cada uno → `notifications.dispatchToUser('invoice.X', payload, user_id)`) y `TasksEmailListener` (delega + añade `action_url` relativo + `task_url` absoluto al payload) | ✅ |
| 9.D.10 | Listeners `notifications-outbox.listener` (consume `outbox.event_failed`) y `notifications-dlq.listener` (consume `dlq.job_failed`) → `dispatchToSuperadmins(...)`. Guard explícito anti-loop: si dispatch falla, log y degradación silenciosa | ✅ |

**Cierre Fase D MVP:** typecheck ✅ · lint ✅ · build ✅ · unit 17/17 (RetryService 5 + OutboxWorker 6 + NotificationTemplateService 6) ✅ · E2E suite full **20/20 verde en 1.0min** · boot real con 3 colas BullMQ activas registradas en DLQ (`pdf-generation`, `outbox-dispatch`, `notifications-dispatch`). **Huérfanos `outbox.event_failed` y `dlq.job_failed` ahora tienen consumidor** — la alerta R7 al superadmin queda cerrada de extremo a extremo.

**Pasos diferidos a Sprint 9.5 (UX admin, fuera de Fase D MVP):**

| # | Paso | Estado |
|---|------|--------|
| 9.D.11 | Endpoints `/notifications/unread`, `/notifications`, `/:id/read`, `/read-all` + DTOs + CASL | ⬜ Sprint 9.5 |
| 9.D.12 | Endpoints admin `/admin/notifications/templates` (GET, PATCH, preview) + CASL | ⬜ Sprint 9.5 |
| 9.D.13 | Frontend: `NotificationBell` en Topbar — dropdown últimas 50 + contador unread | ⬜ Sprint 9.5 |
| 9.D.14 | Frontend admin: `/dashboard/admin/notifications/templates` — listado + editor (DS D6 Modal + D3 Textarea) | ⬜ Sprint 9.5 |
| 9.D.15 | Cron `cleanupReadNotifications` (`EVERY_DAY_AT_2AM`) | ⬜ Sprint 9.5 |
| 9.D.16 | Settings seed: 4 nuevos `notifications.*` (`retention_days`, `unread_max_in_dropdown`, `email_enabled_globally`, `maintenance_critical_threshold_days`) | ⬜ Sprint 9.5 |
| 9.D.17 | Test E2E `notifications.spec.ts` específico — flujo end-to-end de campana | ⬜ Sprint 9.5 (cubierto parcialmente hoy por `tasks.spec.ts:151` que verifica `notifications` row + `action_url` + `metadata.event`) |

#### Fase E — Audit centralizado + portal transparencia (cierra ADR-017 + ADR-010)

| # | Paso | Estado |
|---|------|--------|
| 9.E.1 | `AuditService` con métodos `logAccess`, `logChange`, `cleanupOldAccessLogs` (R3 + ADR-017). Degradación silenciosa si Prisma falla (R7 — el caller no se rompe por audit) | ✅ |
| 9.E.2 | Decorador `@AuditAccess('ResourceType')` + `AuditInterceptor` registrado a nivel APP (intercepta todos los controllers, solo actúa en handlers decorados → cero overhead). Activa fila SOLO cuando: handler decorado + actor staff + recurso de OTRO usuario. Cliente leyendo SUS propios datos NO genera fila (es su derecho natural) | ✅ |
| 9.E.3 | Aplicado `@AuditAccess` a 2 endpoints staff: `GET /clients/:id` (Client) y `GET /billing/invoices/:id` (Invoice). Endpoints PDF NO se decoran — cubiertos transitivamente por el primer click natural en detalle. Sprint 9.5 puede ampliar a `BillingProfile` y otros recursos sensibles | ✅ |
| 9.E.4 | Endpoint `GET /api/v1/audit/access` con ownership filter server-side (`metadata.target_user_id === caller.id`). Nunca devuelve accesos a recursos ajenos. Listeners aspiracionales `audit-auth.listener` / `audit-billing.listener` diferidos a Sprint 9.5 — los `auth.*` ya escriben directo desde Sprint 5 (DC.8: oportunista al tocar el archivo) | ✅ |
| 9.E.5 | Frontend cliente `/dashboard/transparency` — portal RGPD con tabla de accesos staff. Etiquetas humanizadas ("Tu ficha de cliente", "Factura"). NO requiere cambio en `permissions.ts` (rutas no mapeadas → permitidas; cualquier user autenticado ve SUS datos) | ✅ |
| 9.E.6 | Setting `audit.access_retention_days = 730` seedeado | ✅ |
| 9.E.7 | Cron `cleanupOldAuditLogs` (`@nestjs/schedule` `EVERY_DAY_AT_3AM` UTC) — borra rows con `created_at < now() - retention_days`. Aislado en `AuditRetentionCron` (R3 §Excepción única). Migración a BullMQ scheduled diferida a Sprint 13 Hardening | ✅ |
| 9.E.8 | Tests unit `AuditService` 4/4 verde (logAccess shape + degradación silenciosa + logChange + cleanup cutoff calculado). Test E2E `audit-portal.spec.ts` 4/4 verde: admin lee factura → audit registrado, cliente ve solo SUS accesos, otro cliente NO ve ajenos, cliente leyendo sus propios datos NO genera fila | ✅ |

**Cierre Fase E:** typecheck ✅ · lint:check ✅ · build ✅ · unit 21/21 (RetryService 5 + OutboxWorker 6 + NotificationTemplateService 6 + AuditService 4) · E2E suite full **30/30 verde en 1.8min** (4 nuevos audit-portal + 26 anteriores). **ADR-017 cerrado al 100%** (R3 inmutable + retención automática + audit centralizado + portal cliente RGPD). **ADR-010 §Transparency** cubierto.

#### Fase F — Error Log UI + jobs failed UI (cierra ADR-055 §Monitoring)

| # | Paso | Estado |
|---|------|--------|
| 9.F.1 | Schema Prisma `error_log` + `failed_jobs` ya existen (Fase A introdujo failed_jobs; error_log existía) | ✅ |
| 9.F.2 | `ErrorLogService.log(entry)` — persiste fila + emite `system.error` para alerta superadmin (R7). Tres puertas de entrada: `GlobalExceptionFilter` (5xx HTTP, ya existente), `log()` explícito desde jobs/listeners, endpoints admin de consulta | ✅ |
| 9.F.3 | El `GlobalExceptionFilter` actual ya escribe 5xx a `error_log`. NO se duplica. La instrumentación de jobs/listeners se hará oportunamente cuando capturen errores | ✅ |
| 9.F.4 | Endpoints `GET /api/v1/admin/error-log` + `PATCH /:id/resolve` con doble guard (`JwtAuthGuard` + `AdminOnlyGuard`). Filtros: level/module/resolved + paginación cursor | ✅ |
| 9.F.5 | Endpoints `GET /api/v1/admin/jobs/failed` + `POST /:id/retry` — el reintento llama a `RetryService` que reencola con `attempts=5` reseteado y guarda audit (`retried_at` + `retried_by`) | ✅ |
| 9.F.6 | **`AdminOnlyGuard` global** (`backend/src/core/common/guards/admin-only.guard.ts`) aplicado a todos los controllers staff. Defense in depth: rechaza con 403 antes de CASL si rol no en `STAFF_ROLES` | ✅ |
| 9.F.7 | Frontend: árbol paralelo `/admin/*` (NO `/dashboard/admin/*` — DC.7 ADR de routing). Layout staff propio (`app/admin/layout.tsx`) con `AdminSidebar` dedicado + página landing `/admin` + `/admin/error-log` + `/admin/jobs/failed` (tablas + filtros + acciones). Auth client-side: si no es staff → redirect a `/dashboard` | ✅ |
| 9.F.8 | Login redirect post-2FA por rol: helper `landingForRole()` en `app/page.tsx` — staff (`superadmin`/`agent_*`) → `/admin`, resto → `/dashboard`. Helper E2E actualizado con regex `/(dashboard\|admin)/` | ✅ |
| 9.F.9 | Test E2E `tests/e2e/admin-error-log.spec.ts` — 6 specs cubren: cliente recibe 403 sobre `/admin/error-log` y `/admin/jobs/failed` (verifica `AdminOnlyGuard`), staff lista error-log con filtros, staff marca como resuelto, staff lista DLQ, staff reintenta job. **6/6 verde en 9s** | ✅ |
| 9.F.10 | Listeners `notifications-error.listener` (consume `system.error`) — diferido. `outbox.event_failed` y `dlq.job_failed` ya consumidos en Fase D. `system.error` queda emitido por `ErrorLogService.log()` pero huérfano hasta wiring; el row Outbox persiste para revisión via `/admin/error-log` | 🟡 emisor activo, listener diferido a Sprint 9.5 |
| 9.F.11 | Registrado **DC.7 en `backlog.md`** — split de árboles `/dashboard/*` · `/admin/*` · `/partner/*`. Sprint 9.6 cubrirá la migración retroactiva | ✅ |

**Cierre Fase F:** typecheck ✅ · lint:check ✅ · build ✅ · E2E `admin-error-log.spec.ts` 6/6 ✅ · suite E2E full **26/26 verde en 1.1min**. **Defense in depth real instalado**: `/api/v1/admin/*` rechazado por `AdminOnlyGuard` → CASL → ownership. Árbol staff `/admin/*` con login redirect activo. ADR-055 §Monitoring cerrado parcialmente (UI + reintento manual ✅; instrumentación masiva de listeners diferida).

#### Fase G — Cierre + DoD

| # | Paso | Estado |
|---|------|--------|
| 9.G.1 | `_events.md` actualizado con 4 eventos nuevos (`system.error`, `outbox.event_failed`, `dlq.job_failed`, `notification.dispatched`) | ⬜ |
| 9.G.2 | `jobs-reference.md` — colas BullMQ activas (3): `pdf-generation`, `outbox-dispatch`, `notifications-dispatch`. Eliminar de "aspiracionales" + actualizar resumen ejecutivo | ⬜ |
| 9.G.3 | `settings-reference.md` — 8 settings nuevos con consumidor real | ⬜ |
| 9.G.4 | `contracts` actualizados: `audit/contract.md`, `notifications/contract.md`, `error-log/contract.md`, `billing/contract.md` (cola `pdf-generation`) | ⬜ |
| 9.G.5 | `rules.md` — añadir D-NN: "Notificaciones cliente solo vía `NotificationsService.dispatch(...)`. `EmailService.send` directo prohibido fuera de `EmailChannel`" | ⬜ |
| 9.G.6 | `_matrix.md` — añadir filas notifications/audit/error-log con dependencias reales | ⬜ |
| 9.G.7 | Smoke test manual completo (Yasmin) — ver §7 | ⬜ |
| 9.G.8 | Commit final `feat(P1.1): Sprint 9 — Audit + Notifications Full + BullMQ + DLQ — cumple R2/R7/R8/R13 + ADR-017/033/042/055/063/064/065` | ⬜ |
| 9.G.9 | Mover sección Sprint 9 a `completed/sprint-9-audit-notifications-bullmq.md` con resumen ejecutivo + retrospectiva | ⬜ |

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-S9-01 | Redis caído al arrancar el backend | `BullModule.forRoot()` con `connection.lazyConnect=true`. Logs warning. App opera (web responde) pero las colas están en pausa. Health check `/health` lo refleja. |
| EC-S9-02 | Job `pdf-generation` falla 5 veces (MinIO caído largo) | Fila en `failed_jobs` + alerta `dlq.job_failed` al superadmin. Admin reintenta manualmente desde UI cuando MinIO vuelva. |
| EC-S9-03 | Plantilla `notification_templates` con variable inexistente (`{{client.foo}}`) | Validador en `NotificationTemplateService.validateTemplate()` ejecutado en preview + en PATCH endpoint. Save bloqueado con 422 + mensaje claro (R14). |
| EC-S9-04 | Cliente con email apagado en sus settings + `invoice.paid` | `NotificationsService` consulta preferencias del recipient. Si email off → solo `InAppChannel`. La factura queda en campana pero no en mailbox. (Settings de preferencias por canal: deferred a Sprint 12.5 Portal RGPD — ahora todos los clientes reciben todo por default.) |
| EC-S9-05 | Migración Outbox `@Interval` → BullMQ deja eventos atascados durante despliegue | `onModuleInit` del nuevo dispatcher recupera filas en `processing` (mecánica actual). Idempotencia natural: emit `invoice.paid` 2 veces por crash → listener idempotente vía deduplicación por `invoice_id` + estado. Aceptable. |
| EC-S9-06 | `failed_jobs` crece sin límite en producción | Cron `cleanupResolvedFailedJobs` (futuro Sprint 13) — fuera de scope. Mientras tanto: tabla pequeña (jobs failed son raros) + paginación cursor en UI admin. |
| EC-S9-07 | `system.error` infinito si el listener de notificaciones falla | Guard explícito: `notifications-error.listener` NO puede emitir `system.error` (rompería el loop). Si falla, log a stderr + Sentry (cuando se configure) — degradación silenciosa por diseño. |
| EC-S9-08 | Idempotencia `pdf-generation`: dos `markAsPaid` paralelos | `jobId = 'invoice-pdf-{invoice_id}'` → BullMQ descarta el segundo `add()`. Si el primer job falló y se reintenta vía Retry → mismo jobId reutilizado. OK. |
| EC-S9-09 | Cliente borra cuenta → `notifications` con `user_id` huérfano | FK con `onDelete: Cascade` desde `notifications.user_id → users.id`. Audit log NO cascade (R3 — inmutable). |
| EC-S9-10 | Plantilla en otro idioma (i18n futuro Sprint 16) | `notification_templates.locale` ya está en schema. Default `'es'`. Lookup busca `(event_type, channel, locale)` con fallback a `'es'` si no hay match. Listo para i18n sin migración. |
| EC-S9-11 | Worker BullMQ procesa job mientras el backend recibe SIGTERM | `BullModule` registra `WorkerHost` que respeta graceful shutdown ADR-055 §Graceful: 30s para terminar job actual + cierra conexión Redis limpia. Implementado por la lib, validar en test. |
| EC-S9-12 | Email enviado pero `notification.dispatched` no llega → audit incompleto | Aceptado: el evento sale tras `channel.send()` exitoso. Si el process muere en medio, el email salió pero audit pierde row. Es deuda menor, NO crítica (audit_integration_log no es legal sino operacional). |

### 7. Definition of Done

#### Código
- [ ] Pasos 9.A.1–9.G.9 marcados ✅
- [ ] `pnpm typecheck && pnpm build` pasan en backend y frontend
- [ ] `pnpm lint:check` (backend) + `pnpm lint` (frontend) verdes — bloqueante
- [ ] `pnpm test` (backend unit) + `pnpm test:e2e` verdes
- [ ] CI verde tras último push (incluye nuevos servicios MinIO + Redis + Postgres)
- [ ] Cobertura E2E nueva: pdf-generation queue, notifications, audit portal, error-log, jobs failed retry — al menos 1 spec por área

#### Documentación
- [ ] ADR-063, ADR-064, ADR-065 creados, fechados, enlazados desde `rules.md` (sección Patrones canónicos), `_matrix.md` y contracts afectados
- [ ] `_events.md` con 4 eventos nuevos (`system.error`, `outbox.event_failed`, `dlq.job_failed`, `notification.dispatched`) — emisor + consumidor + payload + outbox=no
- [ ] `jobs-reference.md`: 3 colas BullMQ activas + DLQ implementada + alerta superadmin documentada
- [ ] `settings-reference.md`: 8 settings nuevos pasan a estado ✅
- [ ] `contracts` audit/notifications/error-log: pasan de stub a contract real con secciones 1-12
- [ ] `billing/contract.md` §7 Eventos emitidos — actualizar Outbox `invoice.*` con backoff exponencial
- [ ] `glossary.md`: términos nuevos *DLQ*, *Failed Job*, *Notification Channel*, *Notification Template*
- [ ] `rules.md`: nueva D-NN ("notificaciones solo vía NotificationsService") + actualizar §Patrones canónicos con `JobsModule`/`DlqService`/`NotificationsService`/`AuditService`/`ErrorLogService`

#### Proceso
- [ ] Conventional Commits con citación de regla en cada commit (`feat(jobs): Fase A — DLQ + retries — cumple R13 + ADR-055/063`)
- [ ] Cada Fase A–F en commit separado (granularidad para rollback selectivo)
- [ ] ADRs creados ANTES de codear la fase correspondiente (Fase A → ADR-063 primero, Fase C → ADR-064 primero, Fase D → ADR-065 primero)
- [ ] Edge cases EC-S9-01..12 trackeados (resueltos o referenciados)

#### Smoke testing manual (Yasmin)
- [ ] Crear factura → finalizar → pagar → ver job `pdf-generation` en cola Redis (CLI `bullmq` o consola admin) → verificar PDF en MinIO
- [ ] Forzar `MINIO_ENDPOINT` inválido → pagar factura → ver job en `failed_jobs` → ver alerta `dlq.job_failed` en campana superadmin → click "Reintentar" tras restaurar MinIO → job procesa OK
- [ ] Admin edita plantilla `invoice.paid` → click Preview → ve render con datos de muestra → guardar → pagar factura nueva → email/campana refleja cambio
- [ ] Admin crea factura para cliente → cliente entra `/dashboard/transparency` → ve fila "admin@aelium.net leyó tu factura"
- [ ] Forzar excepción en backend (endpoint test) → admin entra `/dashboard/admin/error-log` → ve la entrada → marca como resolved
- [ ] Verificar campana en Topbar (cliente y admin): contador unread, dropdown últimas 50, click marca como leída
- [ ] Sin errores en consola del navegador en ninguno de los flujos
- [ ] Flujos críticos existentes siguen funcionando: login + 2FA + checkout + chat escalación a ticket

### 8. Riesgos identificados

| Riesgo | Impacto si ocurre | Mitigación |
|--------|-------------------|------------|
| Migración `EmailService` directo → `NotificationsService` rompe emails legacy | Cliente deja de recibir email tras Fase D | Tests E2E billing/auth corren en cada commit. Si rompen, rollback de la Fase D antes de seguir. Plantillas seedeadas con texto idéntico al inline actual (copia exacta) para no introducir diferencia visible. |
| Outbox migrado a BullMQ duplica eventos durante el despliegue | Cliente recibe email duplicado | Idempotencia natural: el row Outbox tiene `status` única — emit doble = upsert no-op. Tests demuestran. |
| BullMQ requiere Redis disponible — CI puede flakear | CI rojo intermitente | Reusar el `redis` service del CI workflow actual (ya existe para cache). Healthcheck antes de tests. |
| 17 pasos en Fase D — se sobre-ingenia plantillas y se retrasa el sprint | Sprint queda abierto >5 sesiones | Fase D tiene gate explícito: 9.D.1–9.D.10 son MVP (eventos críticos `invoice.*` + `task.assigned`). 9.D.11–9.D.17 son UX admin + cron limpieza — pueden moverse a Sprint 9.5 si presupuesto se agota. |
| Frontend `/admin` no existe hoy (verificado) — hay que crear estructura nueva | Refactor inesperado en frontend | Crear `frontend/app/dashboard/admin/layout.tsx` reutilizando D11 Sidebar shell. Coste real ~1 archivo. Aceptable. |
| Schema Prisma con 4 tablas nuevas + 2 enums — migración grande | Migración lenta o rollback complejo en prod | Migración solo afecta dev/CI hoy. Prod aún no existe. En prod (Sprint 14) la migración inicial ya incluirá todo el schema final (no será incremental). |
| `cleanupOldAuditLogs` cron borra audit del cliente activo por bug | Pérdida de evidencia legal — incumple R3 + RGPD | Test E2E que verifica: insert hace 731 días → corre cron → row borrado; insert hace 729 días → cron NO borra. Implementar como `DELETE` con `FOR UPDATE` y log de count. |
| Sprint 9 inflado bloquea Sprint 14 deploy | Yasmin no llega a deploy en plazo | Fases A+B+C son el "MVP de Sprint 9" — cierran las deudas pre-deploy críticas (R2 Sprint 11.5 + ADR-033 §7). Si falta tiempo: cerrar Sprint 9 con A+B+C y mover D+E+F a Sprint 9.5/10. Sprint 14 se desbloquea con A+B+C. |

### 9. Decisiones registradas

ADRs nuevos a crear ANTES de la fase correspondiente:

- **ADR-063 — Infra BullMQ canónica + DLQ + retries con backoff exponencial** (pre Fase A). Formaliza implementación de ADR-055 §DLQ y §Retries. Decide: defaults globales, ubicación `core/jobs/`, semántica de `failed_jobs` table vs Redis-only, política de retención.
- **ADR-064 — Outbox dispatcher migrado a BullMQ scheduled job** (pre Fase C). Sustituye `@Interval(5s)`. Justificación: ADR-056 §13.30+ exige leader election natural antes de escalado horizontal. Backoff exponencial al reintentar (no inmediato como hoy).
- **ADR-065 — `NotificationChannelInterface` + plugin pattern** (pre Fase D). Formaliza ADR-042 §Plugin de canal. Define interfaz, `EmailChannel` + `InAppChannel` como primeros plugins, hooks de extensión para WhatsApp/Telegram futuros.

### 10. Cierre del sprint

**Fecha real de cierre:** 2026-04-27 (3 sesiones reales — A 2026-04-26, B+C+D+F 2026-04-27, E 2026-04-27)

**Commits del sprint** (en orden cronológico):
1. `b6fd53a` — Fase A: infra BullMQ canónica + DLQ + retries (P1.1)
2. `58fc55f` — Fase A: migración Prisma `failed_jobs`
3. `875be64` — Fase B: cola `pdf-generation` (cierra deuda R2 Sprint 11.5)
4. `7567603` — Fase C: dispatcher BullMQ + backoff exponencial + alerta `outbox.event_failed` (cierra ADR-033 §7)
5. `8df3d2c` — Fase D MVP: notifications multicanal + plantillas Handlebars + huérfanos consumidos
6. `977d308` — Fase F: árbol staff `/admin/*` + Error Log + Jobs DLQ UI + DC.7
7. `9e2d3a6` — Fase E: AuditService centralizado + portal transparencia RGPD
8. `bff4fec` — Fix post-smoke: AuditInterceptor.extractOwnerId para Client/User + portal enriquecido con actor (nombre + rol)

**Cambios respecto al plan original:**
- **9.D.11–9.D.17 diferidos a Sprint 9.5** (UX admin de notifications): endpoints `/notifications/unread`, panel admin de plantillas, `NotificationBell` en Topbar, cron `cleanupReadNotifications`, 4 settings `notifications.*`, test E2E específico de campana. **No bloquean Sprint 14 Deploy** — el seed inicial cubre producción; admin puede editar plantillas vía SQL directo hasta Sprint 9.5.
- **9.F.10 (listener `system.error`) diferido a Sprint 9.5**: `ErrorLogService.log()` emite `system.error`, pero el listener consumidor + plantilla `system.error` quedan pendientes. Mientras tanto, el row queda accesible vía `/admin/error-log`.
- **`notification.dispatched` queda como evento aspiracional** (declarado en ADR-065 §3.2 pero no emitido). Su consumidor `audit-notification.listener` se aborda cuando se implemente audit de integraciones (Sprint 9.5 / dedicated).
- **Contracts canónicos `audit/`, `notifications/`, `error-log/` quedan pendientes** como deuda DC.9 — los módulos pasaron de stub a implementación real pero su `contract.md` no se redactó. Aceptado para no inflar el sprint.
- **`@AuditAccess` aplicado solo a 2 endpoints staff** (clients/:id e invoices/:id). Endpoints PDF + listener auth-* migration diferidos (DC.8 — oportunista al tocar archivo).
- **Migración crons in-process a BullMQ scheduled** (los 7 crons existentes de billing/support) explícitamente fuera de scope — Sprint 13 Hardening (ADR-056).
- **Test E2E `audit-portal.spec.ts` cubre solo Invoice** (que tiene `user_id` directo). El fix `bff4fec` añadió path para `Client`/`User` shapes; cobertura específica diferida a Sprint 9.5 (DC.10).

**Items movidos a sprints futuros:**
- **Sprint 9.5** (UX admin diferida) — ver `backlog.md` Sprint 9.5: 9.D.11–9.D.17 + 9.F.10 + DC.10.
- **Sprint 9.6 (DC.7)** (split admin/cliente retroactivo + permisos granulares por rol staff) — ver `backlog.md` DC.7.
- **Sprint 13 Hardening** — migración crons in-process a BullMQ scheduled (ADR-056 §13.30+).
- **Sprint 19 (Partner Module)** — replicar patrón `/admin/*` con `/partner/*`.

**DoD verificado:** ✅ todo el alcance reducido (Fases A, B, C, D MVP, E, F) cumple typecheck + lint + build + tests unit (21/21) + E2E suite full (30/30 verde en 1.8min) + boot real con 3 colas BullMQ + 8 crons in-process activos. ⚠️ Excepciones documentadas: contracts módulos sin redactar (DC.9), listener `system.error` diferido, `notification.dispatched` aspiracional, audit cobertura E2E Client diferida (DC.10).

**Sprint 9 cerrado al 100% del alcance MVP** y **P1.1 desbloquea Sprint 14 Deploy** sin bloqueos críticos: deuda R2 saneada, ADR-033 §7 cerrado, defense-in-depth instalado, audit RGPD funcional.

---

## ✅ Sprint 11.5 — MinIO Storage local (P1.2)

**Estado:** ✅ completado
**Inicio:** 2026-04-26
**Cierre real:** 2026-04-26 (1 sesión)

### 1. Objetivo en una frase

Persistir los PDFs de facturas (y dejar listo el `StorageService` canónico para futuros adjuntos de chat y tickets) en un MinIO local S3-compatible, con descargas vía signed URL.

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué |
|---|-------------|--------|-------------|
| 1 | [ADR-043](../10-decisions/adr-043-infraestructura-self-hosted.md) — MinIO declarado en stack | ✅ | — |
| 2 | Settings reservados (`storage.signed_url_expiry_minutes`, `storage.max_upload_size_mb`) | ✅ documentado, ❌ pendiente seed | Paso 5 |
| 3 | Variables `S3_*` reservadas en `.env.example` | ✅ | — |
| 4 | Columna `Invoice.pdf_url` en Prisma (varchar 1000) | ✅ | — |

### 3. Produce (contratos nuevos)

#### 3.1 Endpoints REST modificados (no nuevos, sólo cambia el comportamiento)
- `GET /api/v1/billing/invoices/:id/pdf` ahora **302 redirect** a signed URL del bucket cuando `pdf_url` existe; fallback inline para facturas legacy.

#### 3.2 Eventos nuevos
- (ninguno) — el upload es síncrono dentro del flujo de billing.

#### 3.3 Servicios inyectables nuevos
- `StorageService` (`backend/src/core/storage/storage.service.ts`), `@Global`. Métodos:
  - `upload({ key, body, contentType, contentLength? }): Promise<void>`
  - `download(key): Promise<Buffer>`
  - `delete(key): Promise<void>`
  - `headObject(key): Promise<{ contentLength, contentType, lastModified } | null>` (existencia + metadata)
  - `presignedDownloadUrl(key, ttlSeconds?): Promise<string>`
  - `ensureBucket(): Promise<void>` (idempotente, invocado en `OnModuleInit`)
- `InvoicePdfService.generateAndUpload(invoiceId): Promise<{ key, sizeBytes }>` — genera el PDF y lo sube al bucket bajo `invoices/{invoice_number}.pdf`, actualizando `Invoice.pdf_url`.

#### 3.4 Tablas o campos Prisma nuevos
- (ninguno) — `Invoice.pdf_url` ya existe. Cambio semántico: ahora guarda la **key del bucket** (`invoices/AEL-2026-000123.pdf`), no una data URL.

#### 3.5 Settings nuevos (seed)
- `storage.signed_url_expiry_minutes` — number, default 60, rango 1–1440.
- `storage.max_upload_size_mb` — number, default 10, rango 1–500.

#### 3.6 Permisos CASL nuevos
- (ninguno) — el endpoint `/pdf` ya tiene `CheckPolicies(can(Read, Invoice))`.

### 4. Modifica (contratos existentes)

#### 4.1 Endpoints modificados
- `GET /billing/invoices/:id/pdf`: 302 redirect a signed URL cuando hay `pdf_url`. Fallback inline para legacy.

#### 4.2 Servicios modificados
- `BillingInvoiceService.markAsPaid()` y `BillingInvoiceService.sendToPending()` ahora invocan `invoicePdfService.generateAndUpload()` tras commitear la transición de estado (fuera de la `$transaction`, no bloqueante crítico).

#### 4.3 Eventos cambiados
- (ninguno).

#### 4.4 BREAKING changes
- **Semántico:** `Invoice.pdf_url` pasa de "data URL inline" (de hecho hoy `null` para todas) a "S3 key". Las facturas existentes no tienen `pdf_url` set → fallback genera+sube en primera descarga. **No requiere migración Prisma.**

### 5. Pasos atómicos

| # | Paso | Estado |
|---|------|--------|
| 11.5.1 | ADR-062 — Storage canónico (MinIO + S3 SDK) | ✅ |
| 11.5.2 | docker-compose.dev.yml — añadir servicio `minio` + healthcheck + volume | ✅ |
| 11.5.3 | Instalar `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` en backend | ✅ |
| 11.5.4 | `core/storage/{storage.service,storage.module,storage.types,storage.errors}.ts` (Global) | ✅ |
| 11.5.5 | Registrar `StorageModule` en `app.module.ts` | ✅ |
| 11.5.6 | `seed.ts` — añadir 2 settings `storage.*` | ✅ |
| 11.5.7 | `InvoicePdfStorageService` (puente PDF + storage) + integración con `BillingInvoiceService` (markAsPaid + sendToPending fire-and-forget) | ✅ |
| 11.5.8 | `BillingController.downloadPdf()` — 302 redirect a signed URL con `responseContentDisposition` forzado + fallback inline | ✅ |
| 11.5.9 | CI workflow — añadir service `minio` (bitnami/minio con bucket auto-creado) + env vars `S3_*` | ✅ |
| 11.5.10 | Tests E2E `tests/e2e/storage-pdf.spec.ts` (pago → upload → descarga signed URL + fallback legacy) | ✅ |
| 11.5.11 | Docs: `settings-reference.md` (✅), `glossary.md` (Storage/Bucket/Signed URL), `rules.md` (patrón canónico), `billing/contract.md` (servicio puente), `30-data/billing.md` (semántica `pdf_url`), `jobs-reference.md` (deuda BullMQ pdf-generation) | ✅ |
| 11.5.12 | Cierre `current.md` + `backlog.md` (P1.2 ✅) + commit conventional | 🟡 en curso |

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-STORAGE-01 | MinIO caído en arranque del backend | `ensureBucket()` reintenta con backoff 3×; si falla, log warning y deja servicio operativo (otras features no dependen). Endpoint `/pdf` devuelve 503 con mensaje claro si la subida falla. |
| EC-STORAGE-02 | Factura sin `pdf_url` (legacy) en descarga | Fallback inline: generar + subir + actualizar `pdf_url` + redirect en la misma request. |
| EC-STORAGE-03 | Subida supera `storage.max_upload_size_mb` | Lanzar `BadRequestException` con mensaje formateado (R7+R14). En v1 sólo aplica a uploads externos (no PDFs internos). |
| EC-STORAGE-04 | Race: dos `markAsPaid` simultáneos generan dos uploads | El nombre de key es estable (`invoices/{invoice_number}.pdf`) → el segundo upload sobrescribe el primero. Aceptable, idempotente. |
| EC-STORAGE-05 | Signed URL expira mientras el cliente descarga | TTL default 60min — cubre cualquier descarga humana. Si expira, refresh manual desde el dashboard regenera. |
| EC-STORAGE-06 | Cambio de `invoice_number` (no debería ocurrir nunca) | `invoice_number` es único e inmutable por ADR-025 → key estable. No se contempla rename. |

### 7. Definition of Done

#### Código
- [ ] Pasos 11.5.1–11.5.12 ✅
- [ ] `pnpm typecheck && pnpm build` pasan
- [ ] `pnpm lint:check` (backend) verde
- [ ] `pnpm test` (backend unit + E2E) verde
- [ ] CI verde tras último push

#### Documentación
- [ ] ADR-062 creado y enlazado desde rules.md (sección Patrones canónicos), `billing/contract.md`, `_matrix.md`
- [ ] `settings-reference.md`: 2 settings `storage.*` pasan de ❌ a ✅
- [ ] `glossary.md`: añadidos términos *Storage*, *Bucket*, *Signed URL*
- [ ] `30-data/billing.md`: `pdf_url` actualizado (semántica final)
- [ ] `jobs-reference.md`: revisar si aplica (no se introduce job nuevo este sprint — deuda BullMQ → P1.1)

#### Proceso
- [ ] Commits Conventional Commits con citación de regla (`feat(storage): … — cumple R2/R7/R14`)
- [ ] Edge cases EC-STORAGE-* trackeados (resueltos o referenciados)

#### Smoke test manual (Yasmin)
- [ ] `docker compose -f docker/docker-compose.dev.yml up -d` levanta MinIO sano
- [ ] Consola MinIO accesible en `http://localhost:9001` con `minioadmin/minioadmin`
- [ ] Crear factura → finalizarla → pagarla → descargar PDF (debe descargar correctamente, redirect transparente)
- [ ] Bucket `aelium-storage` contiene el objeto `invoices/AEL-2026-000XXX.pdf`

### 8. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Subida síncrona en `markAsPaid` añade latencia (PDFs ~50–200ms) | UX admin más lenta al marcar como pagada | Aceptado (~200ms). Migración a BullMQ en P1.1 Sprint 9 documentada como deuda controlada. |
| Cambio futuro de bucket name rompe URLs históricas | Facturas viejas inaccesibles | `pdf_url` guarda la **key**, no la URL. Cambio de bucket = cambio de env var, las keys siguen válidas. |
| MinIO caído en producción futura | PDFs no descargables | Sprint 14 (Deploy) añadirá healthcheck + alerta + plan recovery (ADR-056). En dev el riesgo es asumible. |
| Coste de cambiar a Cloudflare R2 / AWS S3 real | Riesgo de re-arquitectura en producción | **Cero**: el SDK es el mismo (`@aws-sdk/client-s3`). Solo cambian las env vars `S3_ENDPOINT`/`S3_REGION`. |

### 9. Decisiones registradas

- **ADR-062** — Storage canónico: MinIO en dev, `@aws-sdk/client-s3` como cliente, `pdf_url` almacena S3 key, signed URLs con TTL configurable.

### 10. Cierre del sprint

**Fecha real de cierre:** 2026-04-26
**Commit final:** `9da0e8b` — `feat(storage): Sprint 11.5 — MinIO storage canonico + PDFs persistentes (P1.2)`

**Cambios respecto al plan original:**
- **Refactor adicional:** se introdujo `InvoicePdfStorageService` como servicio puente para mantener `InvoicePdfService` como renderizador puro (R15). En vez de añadir `generateAndUpload` directamente al `InvoicePdfService` (que ya tenía 442 líneas), se aisló la responsabilidad de upload + actualización de `pdf_url` en un servicio nuevo.
- **`presignedDownloadUrl` extendido:** acepta `responseContentDisposition` y `responseContentType` opcionales. Permite que el bucket devuelva los headers `Content-Disposition: attachment; filename="..."` + `Content-Type: application/pdf` aunque el objeto no los tenga guardados — preserva la UX del endpoint anterior (descarga directa, no apertura inline).
- **CI:** añadido `minio` como service en `.github/workflows/ci.yml` con bucket auto-creado vía `MINIO_DEFAULT_BUCKETS` (bitnami/minio). Sin esto, los tests E2E del Sprint 11.5 fallarían en CI.
- **Test E2E:** un único spec `storage-pdf.spec.ts` con 2 tests (flujo principal + fallback legacy `pdf_url=NULL`). No se añadieron tests unitarios mockeando `S3Client` por bajo valor incremental sobre el E2E real contra MinIO.

**Items movidos a sprints futuros:**
- Migración de `generateAndUploadInBackground` a una **cola BullMQ `pdf-generation`** con DLQ + retries (cumplir R2 estricto, R13) → P1.1 Sprint 9. Documentado en [`jobs-reference.md`](../50-operations/jobs-reference.md#crons-aspiracionales-documentados-no-implementados).
- Adjuntos en **chat (Sprint 7.7)** y **tickets (Sprint 7.6.3)** → desbloqueados; abordar oportunamente cuando la UX lo justifique. La convención de keys está fijada en [ADR-062 §D](../10-decisions/adr-062-storage-canonico-minio.md).
- Logos brand (Sprint 12), avatares user (futuro) → mismo patrón, mismo `StorageService`.

**DoD verificado:**
- ✅ Pasos 11.5.1–11.5.12 completos
- ✅ `pnpm typecheck` y `pnpm lint:check` (backend) verdes
- ✅ ADR-062 creado y enlazado desde `rules.md` (patrones canónicos), `billing/contract.md`, `30-data/billing.md`, `glossary.md`, `settings-reference.md`, índice ADRs
- ✅ Settings `storage.*` pasan a estado ✅ en `settings-reference.md`
- ✅ CI workflow actualizado con MinIO service
- ⏳ **Smoke test manual (Yasmin)** y CI verde → pendientes de ejecución por el operador
- ✅ Edge cases EC-STORAGE-01..06 implementados o anotados en código (fire-and-forget con catch para EC-STORAGE-01, fallback inline para EC-STORAGE-02, idempotencia natural para EC-STORAGE-04)

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
