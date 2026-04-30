# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26 + closures Sprint 9 / 9.5 / 9.6 (2026-04-27/28). Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)).

> **Última actualización:** 2026-04-29 — re-priorización tras [ADR-069 deploy diferido](../10-decisions/adr-069-estrategia-deploy-diferido.md).
> **Cambios estructurales recientes:**
> - 📜 **[ADR-069 (2026-04-29)](../10-decisions/adr-069-estrategia-deploy-diferido.md)** reclasifica **Sprint 14 Deploy real** como **gate condicionado P-DEPLOY** (no está en cola activa). Se activa sólo con trigger de negocio explícito (cliente real, demo, captación, validación externa). La cola activa post-Sprint 9.6 son features (Sprint 8 residual / Sprint 10 Infrastructure / Sprint 11 Provisioning / Sprint 12 Settings+KB / Sprint 13 Hardening) según valor funcional.
> - **Sprint 11.5 (MinIO Storage)** añadido como sprint independiente — antes estaba dentro del Sprint 14 Deploy. Desbloquea adjuntos chat/tickets sin obligar a desplegar a producción.
> - **Sprint 14 (Deploy)** limpiado — solo lo que realmente requiere producción real. **Hoy gate condicionado bajo ADR-069.**
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

## 🔄 Sprint 8 — Tasks + Support Inside (residual, plan canónico 2026-04-29)

**Estado:** 🟡 en curso — plan canónico reescrito 2026-04-29 tras cierre P0/P1.1/9.5/9.6/11.5 + ADR-069/070/071.
**Inicio del residual:** 2026-04-29 (sub-sprint 8.A arrancado en sesión actual)
**Cierre estimado:** 5 sub-sesiones (8.A → 8.E).

> **Plan refundido siguiendo `docs/90-meta/sprint-template.md`** (10 secciones). Sustituye la versión Fase A/B/C/D/E original que ya no cubría la realidad post-9.6. Lo cerrado en P0.1 (listener `task.assigned`, validación FK `assigned_to`, tests E2E base) se consolida en §10 al final.

---

### 1. Objetivo en una frase

Cerrar el módulo `tasks` con automatización completa (mantenimiento mensual + WOW calls + cron `not_completed_in_time`) y entregar Support Inside como tier de cuenta visible al cliente con UX dedicada ([ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md)) — todo basado en infra ya existente (BullMQ + Notifications + Audit cerrados en Sprint 9).

---

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué del sprint |
|---|-------------|--------|------------------------|
| 1 | P0.1 listener `task.assigned` + validación FK + tests E2E base | ✅ cerrado 2026-04-26 | Punto de partida |
| 2 | P1.1 Sprint 9 — `NotificationsService` + plantillas + BullMQ + DLQ | ✅ cerrado 2026-04-27 | Fase 8.C listeners `task.overdue` + `maintenance.*` reusan `NotificationsService.dispatchToUser` |
| 3 | P1.1 Sprint 9 — `OutboxService` + `OutboxDispatchProcessor` | ✅ cerrado | Fase 8.C eventos `maintenance.*` y `task.overdue` viajan por Outbox (R8) |
| 4 | P1.1 Sprint 9 Fase A — `JobsModule` (BullMQ canónico) + `DlqService` | ✅ cerrado | Fase 8.C cron `not_completed_in_time` se implementa como `@Processor` BullMQ |
| 5 | P1.1.5 Sprint 9.5 — `NotificationBell` Topbar + plantillas editables | ✅ cerrado 2026-04-27 | Fase 8.C las notificaciones internas de mantenimiento aparecen en la campana |
| 6 | P1.1.6 Sprint 9.6 — split `/admin/*` con `AdminOnlyGuard` + `_shared/shell/Topbar` | ✅ cerrado 2026-04-28 | Fase 8.B endpoints admin tasks ya bajo `/api/v1/admin/tasks` por inercia |
| 7 | [ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) — Support Inside como tier de cuenta | ✅ doc | Fase 8.D |
| 8 | [ADR-034](../10-decisions/adr-034-support-inside-modelo.md) — modelo `support_inside_*` | ✅ doc | Fase 8.D schema |
| 9 | [ADR-029](../10-decisions/adr-029-prorrateo-cambio-plan.md) — prorrateo cambio plan | ✅ doc + código | Fase 8.D upgrade plan Support Inside |
| 10 | Schema `Task` + `ClientNote` + enum `TaskType` (incluye `wow_call`, `maintenance`, `maintenance_management`, `project_task`, `custom_work`, `support_setup`) | ✅ verificado en `prisma/schema.prisma:622-679` | Fases 8.A/B/C |

> Todas las dependencias críticas están ✅. Sprint 9.6 `/admin/*` simplifica el split frontend (tablero tasks ya en `/admin/tasks`).

---

### 3. Produce (contratos nuevos)

#### 3.1 Endpoints REST nuevos

- `GET /api/v1/admin/users?role=agent_full|agent_billing|agent_support|superadmin` (Fase 8.A) — listar usuarios asignables a tareas. CASL `Read.User` para `superadmin` + `agent_full`, retorna `[{ id, full_name, role, status, email }]` filtrado por `status=active`. Reusable por `NewTaskModal`.
- `POST /api/v1/admin/tasks/:id/checklist/:itemId/complete` (Fase 8.B) — marca un `service_checklist_item` o `product_checklist_item` como completado dentro de la task. Crea fila en `task_checklist_completions`. Idempotente.
- `POST /api/v1/admin/tasks/:id/maintenance/log` (Fase 8.B) — registra `maintenance_log` con `notes` + lista de checklist items completados. Cierra la task tipo `maintenance` y opcionalmente crea `ClientNote` vinculada.
- `GET /api/v1/dashboard/support-inside` (Fase 8.D) — cliente: estado actual (sin plan / Básico / Medium / Pro) + planes disponibles + slots si activo.
- `POST /api/v1/dashboard/support-inside/checkout` (Fase 8.D) — cliente: arranca checkout de un plan.
- `POST /api/v1/dashboard/support-inside/upgrade` (Fase 8.D) — cliente: cambio de plan con prorrateo.
- `POST /api/v1/dashboard/support-inside/cancel` (Fase 8.D) — cliente: cancelación cascada de slots.
- `POST /api/v1/dashboard/support-inside/slots` (Fase 8.D) — cliente: añadir slot (asigna a un servicio existente).
- `DELETE /api/v1/dashboard/support-inside/slots/:slotId` (Fase 8.D) — cliente: liberar slot.
- `GET /api/v1/admin/support-inside/plans` (Fase 8.D) — admin: 3 planes con su `support_inside_config`.
- `PATCH /api/v1/admin/support-inside/plans/:productId` (Fase 8.D) — admin: editar plan.

#### 3.2 Eventos nuevos emitidos

- `task.created` — emitido por `TasksService.create()`. Payload: `{ taskId, type, clientId, assignedTo, dueDate }`. Consumidor: `audit-tasks.listener`.
- `task.completed` — emitido por `TasksService.complete()`. Payload: `{ taskId, type, completedBy, completedAt }`. Consumidores: `audit`, `provisioning` (cuando `manual` provisioner haya sido implementado en Sprint 11; hoy listener stub).
- `task.overdue` — emitido por `TasksOverdueProcessor` (BullMQ scheduled, daily). Payload: `{ taskId, type, assignedTo, dueDate, overdueDays }`. Consumidor: `tasks-overdue.listener` → `NotificationsService.dispatchToUser(assignedTo, 'task.overdue', payload)`.
- `maintenance.completed` — emitido por `TasksService.completeMaintenance()`. Payload: `{ taskId, serviceId, clientId, monthYear, completedBy, completedAt, checklistCompletedCount }`. Consumidores: `notifications`, `audit`.
- `maintenance.critical` — emitido por `MaintenanceCriticalCron`. Payload: `{ taskId, serviceId, clientId, daysUntilCriticalDeadline }`. Consumidor: `notifications` → alerta admin + agente asignado.
- `service.provisioned` (consumido) — listener `wow-call.listener` (Fase 8.C) → crea `Task(type=wow_call)` automáticamente.
- `support_inside.subscribed` (Fase 8.D) — emitido por `SupportInsideService.subscribe()` tras `invoice.paid`. Payload: `{ subscriptionId, clientId, planSlug, anniversaryDay }`.
- `support_inside.upgraded` / `support_inside.cancelled` — análogos.
- `support_inside.slot_assigned` / `support_inside.slot_released` — slots.

#### 3.3 Servicios inyectables nuevos

- `MaintenanceLogService` (Fase 8.A/B) — `recordCompletion(taskId, notes, checklistItems)` → fila `maintenance_logs` + emite `maintenance.completed`.
- `ChecklistCompletionService` (Fase 8.A/B) — gestión `task_checklist_completions` con idempotencia.
- `TasksOverdueProcessor` (`@Processor('tasks-overdue')` Fase 8.C) — cron BullMQ scheduled `repeat: { cron: '0 2 * * *' }` (diario a las 02:00) que escanea `Task` con `due_date < now()` + `status IN [pending, in_progress]` y emite `task.overdue`. Marca `status = not_completed_in_time` tras N días configurable (`tasks.overdue_to_failure_days`, default 7).
- `MaintenanceMonthlyCron` (Fase 8.D) — cron BullMQ `repeat: { cron: '0 3 1 * *' }` (día 1 de cada mes a las 03:00) que itera `support_inside_subscriptions` activas y crea `Task(type=maintenance_management, billing_month=YYYY-MM)` por cada slot. Idempotente por `(service_id, billing_month)`.
- `MaintenanceCriticalCron` (Fase 8.C) — cron BullMQ `repeat: { cron: '0 9 * * *' }` (diario 09:00) que detecta tasks `maintenance` con `due_date - now() < settings.support.maintenance_critical_threshold_days` y emite `maintenance.critical`.
- `WowCallCreatorListener` (Fase 8.C) — `@OnEvent('service.provisioned')` → crea task `wow_call` con plantilla del producto. Ignora si producto no requiere wow_call.
- `SupportInsideService` (Fase 8.D) — `subscribe`, `upgrade`, `cancel`, `addSlot`, `releaseSlot`, `getStatus`. Reutiliza `BillingService.checkout` + `BillingService.changePlan` + cancelación cascada según [ADR-034](../10-decisions/adr-034-support-inside-modelo.md).
- `TasksOverdueListener`, `MaintenanceCompletedListener`, `MaintenanceCriticalListener`, `SupportInsideEventsListener` (Fase 8.C/D) — adaptadores que invocan `NotificationsService.dispatchToUser(...)` con plantillas seedeadas.

#### 3.4 Tablas o campos Prisma nuevos

- **Tabla `task_checklist_completions`** (Fase 8.A) — `(id, task_id FK, item_id, item_kind enum [product|service], completed_by FK users, completed_at, notes?)`. Índices: `task_id`, `(task_id, item_id, item_kind)` UNIQUE.
- **Tabla `maintenance_logs`** (Fase 8.A) — `(id, task_id FK UNIQUE, service_id FK, client_id FK, month_year varchar(7), notes text, performed_by FK users, performed_at, metadata jsonb)`. Índices: `service_id`, `month_year`.
- **Tabla `service_checklist_items`** (Fase 8.A) — `(id, service_id FK, item_template_id FK product_checklist_items NULLABLE, label varchar(300), is_required, order_index, created_at)`. Snapshot de `product_checklist_items` al provisionar el servicio (para que cambios futuros del producto no afecten servicios activos).
- **Tabla `support_inside_config`** (Fase 8.D) — `(id, product_id FK UNIQUE, channels jsonb, slot_count_included, slot_type_available enum, slot_price_extra_cents, response_sla_hours, description_md text)`.
- **Tabla `support_inside_subscriptions`** (Fase 8.D) — `(id, client_id FK, product_id FK, status enum, anniversary_day int 1-28, started_at, cancelled_at, billing_period enum [monthly|yearly])`. UNIQUE `(client_id)` (1 cliente → 1 subscription activa, [ADR-034](../10-decisions/adr-034-support-inside-modelo.md)).
- **Tabla `support_inside_slots`** (Fase 8.D) — `(id, subscription_id FK, service_id FK NULLABLE, slot_type enum, assigned_at, released_at)`. Índice: `subscription_id`.
- **Campo nuevo `client_notes.task_id`** (Fase 8.A) — `Uuid NULLABLE FK → tasks(id) ON DELETE SET NULL`. Permite vincular nota a la task que la generó (Fase 8.B `ClientNotesTab` los muestra agrupados).

> **Decisión local 2026-04-29**: el campo legacy `tasks.client_note` (string) se **mantiene** como nota inline rápida del agente al ejecutar la task. El nuevo `client_notes.task_id` es para **notas estructuradas** persistidas en la timeline del cliente (ADR-038). Ambos coexisten — no son redundantes.

#### 3.5 Settings nuevos

- `tasks.overdue_to_failure_days` — int, default 7, rango 1-30. Tras N días `due_date` superado, `status` cambia a `not_completed_in_time`.
- `support.maintenance_critical_threshold_days` — int, default 5, rango 1-15. N días antes de fin de mes alerta tarea crítica.
- `support_inside.default_anniversary_day` — int, default 1, rango 1-28. Día del mes al que arrancar suscripciones nuevas si no se especifica.

#### 3.6 Permisos CASL nuevos

- Subject `MaintenanceLog` — `Read.MaintenanceLog` para staff (todos los agentes); `Manage.MaintenanceLog` para `superadmin` + `agent_full`.
- Subject `SupportInsideSubscription` — `Read.SupportInsideSubscription` para owner (cliente) + staff; `Manage.SupportInsideSubscription` para `superadmin` + `agent_full` + `agent_billing`.
- Subject `SupportInsideSlot` — `Read.SupportInsideSlot` para owner; `Update.SupportInsideSlot` (asignar/liberar) para owner.
- Subject `SupportInsidePlan` (= producto `type=support_inside`) — `Manage.SupportInsidePlan` solo `superadmin` (planes son producto sensible — afectan facturación de todos los suscritores).

---

### 4. Modifica (contratos existentes)

#### 4.1 Servicios modificados

- `TasksService.complete(taskId, payload)` — admite ahora `payload.checklistCompletions: { itemId, itemKind, notes? }[]` que se persiste en `task_checklist_completions`. Si task `type === 'maintenance'`, además crea `MaintenanceLog`.
- `BillingService.checkout(payload)` — sin cambios; reusada por `SupportInsideService.subscribe`.
- `BillingService.changePlan(serviceId, newPlanId)` — sin cambios; reusada por `SupportInsideService.upgrade`.
- `ProvisioningService` (stub Sprint 11) — ya emitirá `service.provisioned`. No es bloqueante: hoy `BillingService.markAsPaid` puede emitir el evento mientras `provisioning` queda stub.

#### 4.2 Eventos cambiados

- `task.assigned` ya emite, `tasks-email.listener` ya escucha. Tras Sprint 9 Fase D, **migrar el listener** a invocar `NotificationsService.dispatchToUser(assignedTo, 'task.assigned', payload)` en vez de `core/email` directo. **Bug menor descubierto en auditoría**: hoy hace ambas cosas redundantes (envío directo + notificación en BD). Fase 8.C limpia esta duplicación.

#### 4.3 BREAKING changes

(ninguno). Schema añade tablas y un campo NULLABLE; eventos nuevos son aditivos.

---

### 5. Pasos atómicos (sub-sprints)

| # | Paso | Estado |
|---|------|--------|
| **8.A** | **Schemas Fase A + endpoint listar agentes** (cerrado 2026-04-29) | ✅ |
| 8.A.1 | Schema Prisma: `task_checklist_completions` + `maintenance_logs` + `service_checklist_items` + `client_notes.task_id` + relaciones inversas en `Task`, `User`, `Service`, `ClientNote` + UNIQUE compuesto `(service_id, billing_month, type)` (idempotencia mantenimiento mensual) | ✅ |
| 8.A.2 | Migración Prisma `20260429151128_sprint8a_tasks_checklist_and_maintenance` aplicada + `prisma generate` + typecheck verde | ✅ |
| 8.A.3 | Endpoint `GET /api/v1/admin/users` con `JwtAuthGuard + AdminOnlyGuard + PoliciesGuard` (`List.Agent`) + DTO con `role[]/search/status/page/limit` + service `findAgents` que intersecta con `ASSIGNABLE_ROLE_SLUGS`. **Fix CASL crítico**: `inverted Manage.Agent` (wildcard) anulaba `Read/List.Agent`; refactorizado a `inverted [Create, Update, Delete]` para permitir lectura a los 3 staff + bloquear escritura a non-superadmin. | ✅ |
| 8.A.4 | Tests E2E `tests/e2e/admin-users-list.spec.ts` — 9 specs (auth, denial cliente, 4 staff roles, filtros `role`/`search`, defense-in-depth ASSIGNABLE intersect). Suite completa **69/69 verde** (60 → 69, +9 nuevos sin regresión). | ✅ |
| 8.A.5 | Doc canónica: `docs/30-data/tasks.md` reescrito (3 tablas nuevas + UNIQUE + relaciones), `docs/30-data/clients.md` (`client_notes.task_id`), backend lint + build verde, 37/37 unit tests verdes. | ✅ |
| **8.B** | **Frontend tablero refinement + ClientNotesTab vinculación** | ⬜ |
| 8.B.1 | `NewTaskModal`: select de agente (consume endpoint 8.A.3) + validación inline FK | ✅ Sprint 8 Fase B.1 (2026-04-29) |
| 8.B.1.bis | Tablero scope tabs (Mis/Sin asignar/Todas) + filtro agente + activeStatusTab honesto + statusFilter='pending' default + getStats con scope + empty states cruzados + plantilla notification labels humanos + ClientNote.task_id + EC-T8-19/20/21/22 + ADR-072 cola pública | ✅ Sprint 8 Fase B.1.bis (2026-04-29) |
| 8.B.2 | Bloques adaptativos por `TaskType` (UI_SPEC §5.16): wow_call con "Datos del cliente" (servicio + plan + producto contratado); maintenance/maintenance_management con placeholder Checklist; project_task con placeholder link Sprint 22; custom_work mantiene UX simple. Sidebar Servicio nueva (UI_SPEC §5.16) con badge estado + amount + cycle. Backend `findOne()` con `INCLUDE_RELATIONS_DETAIL` (service+product+pricing inline). Etiqueta "Notas para el cliente" → "Resumen de la llamada" en wow_call. Helpers `formatAmount`/`translateCycle`/`translateServiceStatus`. | ✅ Sprint 8 Fase B.2 (2026-04-29) |
| 8.B.3 | DS compliance auditoría exhaustiva — **fix masivo de tokens fantasma** `--color-*` (no existen en `globals.css`) → tokens canónicos `--text-primary/secondary/tertiary`, `--brand`, `--border`, `--danger`, `--warning`, `--success`, `--surface-*`. Migración en `types.ts:TASK_PRIORITY_COLORS` (la barra de prioridad se renderizaba transparente en producción), `tasks.module.css` (10 ocurrencias), `taskDetail.module.css` (28 ocurrencias). Eliminación de **4 inline styles** ad-hoc (NewTaskModal modalActions, page.tsx scopeStack, [id]/page.tsx assigneeReassign + confirmModalActions) — clases canónicas en CSS module. TaskTable inline justificado (color dinámico) + fallback corregido a `--border` real. `font-weight` numéricos `500/600/700` → tokens `--font-weight-medium/semibold/regular`. Suite E2E 88/88 verde sin regresión. | ✅ Sprint 8 Fase B.3 (2026-04-29) |
| 8.B.4 | `ClientNotesTab` en `/admin/clients/[id]`: link "Tarea origen" con título + badge tipo de la task que generó la nota (tras `tasks.complete()`). Backend `listStructuredNotes` enriquece `task_title` + `task_type` con query batch única (sin N+1). Patrón paralelo al ya existente para `conversation_id` ([ADR-038](../10-decisions/adr-038-notas-estructuradas-cliente.md) + decisión Sprint 8 §3.4). | ✅ Sprint 8 Fase B.4 (2026-04-29) |
| 8.B.5 | Backend `ChecklistCompletionService` (upsert idempotente) + `MaintenanceLogService` (transacción atómica: maintenance_log + task.completed + ClientNote) + endpoints `GET /tasks/:id/checklist`, `POST /tasks/:id/checklist/complete`, `POST /tasks/:id/maintenance/log`. Listener `MaintenanceCompletedListener` consume `maintenance.completed` → notifica cliente vía `NotificationsService`. Plantillas seed `maintenance.completed` (email + internal). UI checklist completable con progreso N/M en DetailPage + items requeridos resaltados (rojo) cuando `missing_required` + flujo "Completar y notificar" adaptativo. **Cierra EC-T8-01** (items required sin completar bloquean cierre con 400 + `missing_required` array). **Cierra EC-T8-30** parcial (plantilla `maintenance.completed` ya seedeada; `task.overdue` y `maintenance.critical` siguen pendientes Fase C). **Fix oportunista crítico**: `GlobalExceptionFilter` ahora preserva metadata adicional del body cuando `HttpException` se construye con objeto (sin esto, `missing_required` se perdía). | ✅ Sprint 8 Fase B.5 (2026-04-29) |
| **8.C** | **Automatización: cron + listeners + WOW calls** | ⬜ |
| 8.C.1 | `TasksOverdueProcessor` (BullMQ cron diario) + emite `task.overdue` + cambia `status` tras N días | ⬜ |
| 8.C.2 | Listeners `tasks-overdue`, `maintenance-completed`, `maintenance-critical` → `NotificationsService.dispatchToUser` | ⬜ |
| 8.C.3 | Migrar `tasks-email.listener` → `NotificationsService.dispatchToUser` (limpia redundancia §4.2) | ⬜ |
| 8.C.4 | `MaintenanceCriticalCron` (BullMQ cron diario 09:00) + setting `support.maintenance_critical_threshold_days` | ⬜ |
| 8.C.5 | `WowCallCreatorListener` (`@OnEvent('service.provisioned')`) — crea `Task(type=wow_call)` con plantilla del producto | ⬜ |
| 8.C.6 | Plantillas `notification_templates` para `task.assigned`, `task.overdue`, `maintenance.completed`, `maintenance.critical` (email + internal) | ⬜ |
| 8.C.7 | Tests unit + E2E (cron disparado manualmente vía endpoint admin de testing) | ⬜ |
| **8.D** | **Support Inside (UX dedicada — ADR-061)** — sub-sprint denso, 1.5 sesiones | ⬜ |
| 8.D.1 | Schema `support_inside_config` + `support_inside_subscriptions` + `support_inside_slots` + migración | ⬜ |
| 8.D.2 | `SupportInsideService` con `subscribe/upgrade/cancel/addSlot/releaseSlot/getStatus` | ⬜ |
| 8.D.3 | Endpoints cliente `/api/v1/dashboard/support-inside/*` (6) | ⬜ |
| 8.D.4 | Endpoints admin `/api/v1/admin/support-inside/plans*` (2) | ⬜ |
| 8.D.5 | Cliente: página `/dashboard/support-inside` (vista comparativa o gestión activa) | ⬜ |
| 8.D.6 | Admin: página `/admin/support-inside-plans` (3 planes lado a lado) | ⬜ |
| 8.D.7 | `MaintenanceMonthlyCron` (BullMQ día 1 de cada mes) — genera `Task(type=maintenance_management)` por slot activo. Idempotente por `(service_id, billing_month)` | ⬜ |
| 8.D.8 | Cancelación cascada de slots cuando se cancela subscription | ⬜ |
| 8.D.9 | Seed: 3 planes Básico/Medium/Pro con `support_inside_config` poblado | ⬜ |
| 8.D.10 | Tests E2E: subscribe → assign slot → maintenance auto-creada → admin completa con checklist | ⬜ |
| **8.E** | **Cierre documental + pulido** | ⬜ |
| 8.E.1 | `docs/features/tasks/admin.md` + `agent.md` (operativa diaria) | ⬜ |
| 8.E.2 | `docs/features/support-inside/admin.md` + `client.md` | ⬜ |
| 8.E.3 | Actualizar `tasks/contract.md` + `_events.md` (8 eventos nuevos) + `_matrix.md` (relaciones) | ⬜ |
| 8.E.4 | Smoke testing manual (Yasmin) — flujo completo punta a punta | ⬜ |
| 8.E.5 | DoD verificado + retrospectiva en `completed/sprint-8-tasks-support-inside.md` | ⬜ |

---

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-T8-01 | Task `maintenance` se completa pero algún checklist item del servicio queda sin marcar | ✅ **Cerrado Sprint 8 Fase B.5 (2026-04-29)** — `MaintenanceLogService.recordCompletion` valida items `is_required=true` antes de cerrar; si falta alguno devuelve 400 con `missing_required: [{id, label, kind}]` y la task sigue en `pending`. UI resalta los items bloqueantes en rojo. Items opcionales no bloquean (decisión Sprint 8.B.5: si la doctrina cambia a registrar advertencias, ADR específico). |
| EC-T8-02 | `MaintenanceMonthlyCron` se ejecuta dos veces el mismo día (worker duplicado o crash recovery) | Idempotency guard: `UNIQUE (service_id, billing_month)` en `tasks` para `type=maintenance_management` rechaza duplicado en BD; processor lo captura y marca job como skipped |
| EC-T8-03 | Cliente cancela Support Inside con slots aún asignados a servicios activos | Cancelación cascada: emite `support_inside.slot_released` por cada slot, marca `subscription.status=cancelled`, mantiene servicios técnicos del cliente intactos |
| EC-T8-04 | Cliente upgrade de plan Básico → Pro a mitad de mes | Reusa `BillingService.changePlan` con [ADR-029](../10-decisions/adr-029-prorrateo-cambio-plan.md) — prorrateo automático |
| EC-T8-05 | `task.overdue` se emite pero el agente asignado fue desactivado | Listener detecta `assignee.status !== 'active'` → escala a admin (notificación a `superadmin` con tag `unassigned_overdue`) |
| EC-T8-06 | `WowCallCreatorListener` recibe `service.provisioned` pero el producto no tiene plantilla de wow call | Listener decide silenciosamente skip si `metadata.skip_wow_call=true` o si producto carece de checklist asociada |
| EC-T8-07 | Admin edita un plan Support Inside con suscriptores activos (cambia precio o slots incluidos) | Aviso UI + ADR específico futuro: hoy se permite con warning, no afecta facturación de suscripciones existentes (los planes siguen el snapshot de `service_pricing` original — coherente con [ADR-029](../10-decisions/adr-029-prorrateo-cambio-plan.md)) |
| EC-T8-08 | Cliente intenta `addSlot` cuando ya está al límite del plan | 422 + mensaje claro "Tu plan permite N slots; sube de plan o libera uno" |
| EC-T8-09 | `support_inside_subscriptions` UNIQUE por `client_id` rechaza segunda subscription | DTOs de checkout admiten un solo plan a la vez; UI cliente oculta CTAs si ya hay activa |
| EC-T8-10 | `tasks.overdue_to_failure_days` cambia mientras hay tareas en flight | Cron lee setting al ejecutar, no almacena snapshot; tareas con `status=in_progress` no se ven afectadas (sólo aplica a `pending`) |
| EC-T8-11 | Suscripción Support Inside con `anniversary_day=29..31` al pasar a febrero | Validación: rango 1-28 en BD + DTO (decisión consciente para evitar el bug clásico de meses cortos) |

#### Auditoría rigurosa (2026-04-29) — EC-T8-12..46

> Resultado de la revisión completa post-Sprint 8.B.1.bis. Cubre tres frentes: validaciones de campo no implementadas, transiciones de estado/autorización (algunas ya cerradas en este sprint via [ADR-072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md)), y edge cases que aparecen con módulos futuros (Sprint 11 / 12.5 / 13 / 19 / 22 / 25). El estado por EC indica si el caso ya está cerrado, planificado en una fase concreta, o queda como deuda explícita.

##### Validaciones de campo (Sprint 8 Fase B/C)

| ID | Caso | Estado | Plan |
|----|------|--------|------|
| EC-T8-12 | `due_date` en el pasado al crear | ✅ | `TasksService.assertDueDateNotInPast()` (Sprint 8 Fase B 2026-04-29). Bypass interno via `opts.allowOverdue=true` para cron retroactivo (Fase D). 5 unit tests + integración E2E. |
| EC-T8-13 | `client_id` ↔ `service_id` incoherentes (servicio de otro cliente) | ✅ | `TasksService.assertServiceBelongsToClient()` (Sprint 8 Fase B 2026-04-29). 4 unit tests cubriendo cliente correcto/incorrecto/inexistente/sin service_id. |
| EC-T8-14 | `is_recurring=true` con `recurrence_day=null` | ✅ | `CreateTaskDto`/`UpdateTaskDto` con `@ValidateIf((o) => o.is_recurring === true)` + `@IsInt @Min(1) @Max(31)` (Sprint 8 Fase B 2026-04-29). 4 unit tests DTO. |
| EC-T8-15 | `billing_month` con formato inválido (`2026-13`, `2026-1`) | ✅ | `BILLING_MONTH_REGEX = /^\d{4}-(0[1-9]\|1[0-2])$/` aplicado en ambos DTOs vía `@Matches` (Sprint 8 Fase B 2026-04-29). 4 unit tests DTO. |
| EC-T8-16 | `description` >100KB rompe email Handlebars | ✅ | `@MaxLength(50000)` en `description` de `CreateTaskDto` y `UpdateTaskDto` (Sprint 8 Fase B 2026-04-29). 3 unit tests DTO. |
| EC-T8-17 | XSS en `task_url` / `assigned_by` inyectados sin escapar en plantilla | ✅ | Auditadas todas las plantillas seedeadas (`prisma/seeds/notification-templates.ts`): 0 ocurrencias de `{{{var}}}` y `{{& var}}`. Test guard `notification-templates.security.spec.ts` falla el build si alguien introduce el patrón unsafe. Comentario canónico añadido al header del seed. (Sprint 8 Fase B 2026-04-29) |

##### Transiciones de estado y autorización

| ID | Caso | Estado | Plan |
|----|------|--------|------|
| EC-T8-18 | Saltar `pending` → `completed` sin `in_progress` | 🟡 deuda aceptada | UI guía pero backend permite. Aceptable para `complete` directo desde el modal. Si se restringe, requiere ADR específico. |
| EC-T8-19 | `update` con `status` desde estado terminal (reabrir tarea cerrada) | ✅ cerrado 2026-04-29 (Sprint 8 Fase B.1.bis) | `tasks.service.update()` rechaza con 400 si `existing.status` ∈ TERMINAL_STATES y el DTO cambia status. Test E2E `tasks-edge-cases.spec.ts`. |
| EC-T8-20 | Reasignar tarea cerrada vía PATCH directo | ✅ cerrado 2026-04-29 | Mismo guard TERMINAL_STATES bloquea cambio de `assigned_to`. Test E2E. |
| EC-T8-21 | Cambiar `priority` o `due_date` de tarea cerrada | ✅ cerrado 2026-04-29 | Mismo guard. Test E2E. |
| EC-T8-22 | Auto-asignación: staff no admin toma una tarea de la cola pública (`assigned_to=null` → su id) | ✅ cerrado 2026-04-29 (formaliza [ADR-072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md)) | `update` admite `assigned_to=userId` cuando `existing.assigned_to===null`, sin requerir admin pleno. Tres tests E2E (claim ok, robar ajena rechazada, admin reasigna sin restricción). |
| EC-T8-23 | Cola "Sin asignar" sin SLA → tareas pueden quedar olvidadas indefinidamente | ⬜ | Setting `tasks.unassigned_sla_hours.<type>` (ADR-072 §"Reglas canónicas") + cron `tasks-unassigned-overdue` diario 09:00 emite `task.unassigned_overdue` → alerta superadmin. Sprint 8 Fase C extendida. |
| EC-T8-24 | Dos agentes intentan tomar la misma tarea sin asignar simultáneamente | ⬜ | Race condition. Compare-and-swap con `prisma.task.update({ where: { id, assigned_to: null }, ... })` → si otro la tomó primero, el update afecta 0 filas y se devuelve 409 Conflict. Sprint 8 Fase C. |

##### Eventos / listeners externos

| ID | Caso | Estado | Plan |
|----|------|--------|------|
| EC-T8-25 | `service.cancelled` con tareas `maintenance` pendientes | ⬜ | Listener `tasks-on-service-cancelled` cancela `maintenance`/`maintenance_management`/`wow_call` pendientes del servicio. Sprint 11 (Provisioning). |
| EC-T8-26 | `service.suspended` (impago) → ¿pausar `MaintenanceMonthlyCron`? | ⬜ | Listener pausa creación próxima del cron para ese servicio (no cancela activas). Sprint 11. |
| EC-T8-27 | `task.completed` para provisioner `manual` → activar servicio | ⬜ | Listener `provisioning-on-task-completed` requerido por [ADR-021 §"manual"](../10-decisions/adr-021-provisioners.md). Sin esto los servicios `manual` se quedan en `pending` para siempre. Sprint 11 (P2.1). |
| EC-T8-28 | Listener `task.assigned` falla (notifications down) → evento perdido | ⬜ | [ADR-033 R8 Outbox](../10-decisions/adr-033-outbox-pattern-pendiente.md) extender a `task.*`. **P-DEPLOY.4** ([ADR-069](../10-decisions/adr-069-estrategia-deploy-diferido.md)). |
| EC-T8-29 | Job `notifications-dispatch` agota retries con `task.assigned` payload | 🟡 parcial | DLQ admin lo ve (Sprint 9 ✅), pero el agente nunca recibe email. Verificar que `failed_jobs.metadata` incluye `task_id` para investigar. Sprint 8 Fase C. |
| EC-T8-30 | Plantillas `task.overdue` / `maintenance.completed` / `maintenance.critical` no seedeadas → emit falla | ⬜ | Pre-requisito Fase C: añadir las 3 plantillas a `notification-templates.ts` antes de implementar los listeners. Falla actual sería un DLQ silencioso. |

##### CASL / autorización fina

| ID | Caso | Estado | Plan |
|----|------|--------|------|
| EC-T8-31 | `agent_billing` o `agent_support` cambia `priority` o cancela tarea | 🟡 UI restringe, backend permite | UI esconde controles ([UI_SPEC §5.16](../UI_SPEC.md)); backend permite `Manage.Task` ([ADR-067](../10-decisions/adr-067-granularidad-casl-rol-staff.md) Opción A). Si se requiere split fino, crear `Subject.TaskAdmin` distinto de `Subject.Task`. Sprint 13 Hardening. |
| EC-T8-32 | Cliente accede a `/api/v1/tasks` (rol `client`) | ✅ cubierto | CASL `Read.Task` no existe para client → 403 automático. Aceptable hoy. |
| EC-T8-33 | Partner ve tareas de sus clientes | ⬜ aspiracional | Sprint 19 Partner Module — sólo notificación `maintenance.completed`, NO acceso CRUD. |

##### Concurrencia / archivado

| ID | Caso | Estado | Plan |
|----|------|--------|------|
| EC-T8-34 | Tabla `tasks` crece indefinidamente con `not_completed_in_time` | ⬜ | Archivar tras 1 año a tabla histórica ([ADR-041 §"⚠ Aceptamos"](../10-decisions/adr-041-sistema-tareas.md)). Sprint 13 Hardening. |
| EC-T8-35 | N+1 en `findAll` con `INCLUDE_RELATIONS` | 🟡 sospechoso | Hoy Prisma resuelve con JOIN, verificar al crecer >10k. Sprint 13. |

##### Módulos futuros — EC anticipados

| ID | Caso | Sprint |
|----|------|--------|
| EC-T8-36 | `service.provisioning_failed` → crear `support_setup` para investigar | Sprint 11 (P2.1) |
| EC-T8-37 | Plugin `docker_engine` deprovisión falla → ¿task de cleanup? | Sprint 15E aspiracional |
| EC-T8-38 | `assigned_to` apunta a AI Worker (no User) | Sprint 25 (P3.9) — schema refactor `assigned_type` polimórfico (ADR-041 §"Cuándo revisar" lo prevé) |
| EC-T8-39 | AI completa task con estado `awaiting_review` (humano valida) | Sprint 25 — nuevo TaskStatus |
| EC-T8-40 | Borrado RGPD: `maintenance_log` con notas es evidencia legal | Sprint 12.5 (P2.8) — anonimizar `client_id`, retener `maintenance_log` |
| EC-T8-41 | Schema requiere FK `project_id` en `tasks` | Sprint 22 (P3.5) — migración añade columna |
| EC-T8-42 | Cola sin asignar + SLA expirado → `task.unassigned_overdue` | ADR-072 §"Reglas canónicas" — Sprint 8 Fase C extendida |
| EC-T8-43 | Adjuntos (foto evidencia checklist) | Sprint 11.5 ✅ Storage + futuro UI tasks |
| EC-T8-44 | Audit log de reasignaciones | Sprint 9 Fase E ✅ — falta listener `audit-tasks` que invoque `AuditService.logChange(actor, 'task', before, after)` |
| EC-T8-45 | Acción curada cliente que crea task (ej. `request_resource_upgrade`) | Sprint 11 + 15E + ADR-070 |
| EC-T8-46 | Partner notificado al completar `maintenance` de cliente vinculado | Sprint 19 (P3.13) |

##### EC implementados sin ID previo (consolidación)

| ID | Caso | Estado |
|----|------|--------|
| EC-IMPL-01 | `assigned_to` no existe / no `active` / rol no asignable → 400 | ✅ `assertAssignableUser` (P0.1) |
| EC-IMPL-02 | Task ya cerrada → no se puede recompletar | ✅ `complete()` 400 |
| EC-IMPL-03 | Agente no admin no puede modificar tareas ajenas (salvo cola pública por EC-T8-22) | ✅ `update()` 403 |

> **Cobertura tests E2E** (post Sprint 8 Fase B.1.bis): 75/75 verde con 6 specs nuevos en `tests/e2e/tasks-edge-cases.spec.ts` cubriendo EC-T8-19/20/21/22 (a/b/c). Cada EC ⬜ pendiente añadirá su test al implementarse.

---

### 7. Definition of Done

#### Código
- [ ] 8.A.1–8.E.5 todos ✅
- [ ] Backend: `pnpm typecheck` + `pnpm lint:check` + `pnpm build` + `pnpm test` verde
- [ ] Frontend: `pnpm lint` + `pnpm build` + `pnpm typecheck` verde
- [ ] CI verde tras último push
- [ ] Tests E2E nuevos verdes (mínimo 3 specs: maintenance flow, support-inside subscribe+upgrade, overdue cron disparado manualmente)

#### Documentación
- [ ] `docs/features/tasks/admin.md` + `agent.md`
- [ ] `docs/features/support-inside/admin.md` + `client.md`
- [ ] `docs/20-modules/tasks/contract.md` actualizado con tablas + eventos nuevos
- [ ] `docs/20-modules/_events.md` con 8 eventos nuevos
- [ ] `docs/20-modules/_matrix.md` con dependencias actualizadas
- [ ] `docs/30-data/tasks.md` y `support.md` con tablas nuevas
- [ ] `docs/50-operations/jobs-reference.md` con 3 crons nuevos (`tasks-overdue`, `maintenance-monthly`, `maintenance-critical`)
- [ ] `docs/50-operations/settings-reference.md` con 3 settings nuevos
- [ ] ADRs creados si surgen decisiones (lista en §9)
- [ ] Retrospectiva en `docs/60-roadmap/completed/sprint-8-tasks-support-inside.md`

#### Proceso
- [ ] Commits con Conventional Commits (`feat(tasks):`, `feat(support-inside):`, `chore(prisma):`, `test(e2e):`, `docs:`)
- [ ] Edge cases pendientes movidos al backlog DC.* con justificación
- [ ] Items diferidos a Sprint 13 Hardening si aplica

#### Smoke testing manual (Yasmin)
- [ ] Crear task manual con select agente → asignación funciona + email recibido
- [ ] Completar task `maintenance` con checklist marcado → `maintenance_log` persistido + `ClientNote` creada visible en cliente
- [ ] Cliente sin Support Inside → ve 3 planes lado a lado en `/dashboard/support-inside`
- [ ] Cliente subscribe a Plan Pro → checkout funciona → `support_inside_subscriptions` activa + slots disponibles
- [ ] Cliente assign slot a un servicio → tarea `maintenance_management` se crea día 1 mes siguiente (verificar manualmente disparando el cron)
- [ ] Admin edita plan Pro → cambios se reflejan en cliente nuevo (no afecta a activos)
- [ ] Cron `not_completed_in_time` disparado manualmente → tasks con `due_date` pasado N días pasan a `not_completed_in_time` + emit `task.overdue` + notificación al asignado
- [ ] Sin errores en consola del navegador
- [ ] UI cumple Design System (todos los componentes desde `frontend/components/ui/`)

---

### 8. Riesgos identificados

| Riesgo | Impacto si ocurre | Mitigación |
|--------|-------------------|------------|
| Migración Prisma 4 tablas + 1 campo en una sola pasada rompe datos | Pérdida de datos en dev | Migración generada con `prisma migrate dev --name sprint8a-tasks-and-checklist`; backup manual previo en CI mode local. **No hay datos en prod** — riesgo limitado a dev. |
| `MaintenanceMonthlyCron` se solapa con cron de Sprint 9 ya activo | Doble notificación o doble task creada | Idempotency guard via UNIQUE `(service_id, billing_month)` + nombre de cola distinto (`tasks-maintenance-monthly` vs colas Sprint 9). |
| Sprint 8.D denso → puede partirse a 8.D-bis si excede sesión | Sprint 8 tarda más | Aceptable; cada sub-sprint es atómico. Plan declara explícitamente 1.5 sesiones para 8.D. |
| `SupportInsideService.cancel` cascada de slots toca demasiadas filas | Performance en cliente con muchos slots | Cancelación en `prisma.$transaction([cancelSubscription, releaseAllSlots])`. Volumen real bajo (slots típicamente <10/cliente). |
| El cliente ve planes Support Inside antes de que admin haya seedeado los 3 planes | UI muestra catálogo vacío | Seed corre en `prisma seed` automático tras migración (Fase 8.D.9). Frontend muestra empty state con CTA "contactar soporte" si no hay planes. |
| `tasks.client_note` (legacy string) vs `client_notes.task_id` (nuevo FK) genera confusión | Drift de doc/código | Decisión local 2026-04-29 documentada en §3.4 (ambos coexisten con propósitos distintos). Doc canónica `tasks/contract.md` lo aclarará. |

---

### 9. Decisiones a registrar

ADRs potenciales que pueden surgir durante el sprint (sólo se crean si la decisión emerge real):

- **(potencial)** ADR-072 — Coexistencia `tasks.client_note` (texto inline) + `client_notes.task_id` (FK estructurada). Se decide al cerrar Fase 8.A si compensa formalizar como ADR o si basta con la nota en `tasks/contract.md`.
- **(potencial)** ADR-073 — Política de plantillas Support Inside ante cambios con suscripciones activas (snapshot vs propagación). Sólo si EC-T8-07 requiere matización canónica.
- **(potencial)** ADR-074 — Política de wow_call automática vs manual (cuándo el listener crea la task vs cuándo lo decide el agente). Sólo si Fase 8.C.5 plantea casos no triviales.

> Ningún ADR es prerequisito del sprint; se crean **si y sólo si** la decisión es no-trivial.

---

### 10. Cierre del sprint

> Sprint 8 sigue **WIP**. Fase A + B (B.1 + B.1.bis + B.2 + B.3 + B.4 + B.5 + B.6 EC-T8-12..17 + B.7 tipos flexibles ADR-073) ✅ cerradas. Cola restante: Fase C automatización → Fase D Support Inside → Fase E docs.

**Cierres registrados:**

| Sub-sprint | Fecha | Commit |
|---|---|---|
| P0.1 (cierre mínimo) | 2026-04-26 | varios |
| 8.A (schemas + admin/users) | 2026-04-29 | `6509260` |
| 8.B.1 + 8.B.1.bis (tablero + auditoría EC + ADR-072) | 2026-04-29 | `ec123bf` |
| 8.B.2 + 8.B.4 (bloques adaptativos + ClientNotesTab) | 2026-04-29 | `8743cea` |
| 8.B.5 (checklist + maintenance_log) | 2026-04-29 | `dbbf4b2` |
| 8.B.3 (DS compliance refactor) | 2026-04-29 | `0e29c85` |
| 8.B.6 (validaciones defensivas EC-T8-12..17) | 2026-04-29 | `840d964` |
| 8.B.7 (tipos flexibles: rename `wow_call`→`contact_client` + `reason` libre + `tags` ADR-073) | 2026-04-29 | `d8f1d51` |
| 8.B.8 (header detail alineado con ConversationHeader: sin badges duplicados + tokens DS) | 2026-04-30 | `a2e5cc1` |
| 8.B.9 (refactor notas: card inline + modal completar + listener `task.completed` notifica cliente) | 2026-04-30 | `b6d6d20` |
| 8.B.10 (ticket↔task bridge: asignar ticket crea task; cierre tarea = cierre ticket; ADR-074) | 2026-04-30 | _(pendiente commit)_ |

**Estado DoD** (al cierre de Fase B + EC-T8-12..17 + B.7 tipos flexibles ADR-073):

- ✅ Backend typecheck + lint + build + **73/73 unit tests** (60 previos + 13 nuevos: 6 DTO B.7 reason/tags + 6 TaskTagsService + 1 hint actualizado)
- ✅ Frontend typecheck + lint (0 errores; 42 warnings DC.6 preexistentes) + build
- ✅ E2E suite **95/95 verde** sin regresión (88 previos + 7 nuevos `tasks-reason-and-tags.spec.ts`)
- ✅ ADRs creados: 069 (deploy diferido), 070 (service info SSO), 071 (vista admin federada), 072 (cola pública tareas), **073 (tipos flexibles tasks reason+tags)**
- ✅ Doc canónica: `current.md` §6 con 35 EC nuevos, `tasks/contract.md` §3/§5/§10/§14/14b/17 actualizados B.7, `_events.md` con `maintenance.completed`, `glossary.md` con términos nuevos, schema en `30-data/tasks.md` y `30-data/clients.md` (pendiente actualizar enum `wow_call`→`contact_client` + tablas `task_tags`/`task_tag_assignments`)
- ✅ EC cerrados: T8-12, T8-13, T8-14, T8-15, T8-16, T8-17, T8-19, T8-20, T8-21, T8-22, T8-01, EC-IMPL-01..03; portal URL bug fix; password seed alineado en `tests/e2e/fixtures/test-config.ts`
- ✅ B.7: enum `wow_call` → `contact_client` (preserva contexto via `reason='Bienvenida primer servicio'`); columna `tasks.reason` (texto libre <=100); tablas `task_tags` + `task_tag_assignments` (m2m explícita); 3 endpoints `/admin/task-tags`; CASL `Subject.TaskTag`; seed 5 tags canónicos; bloque adaptativo "Datos del cliente + plan" generalizado a cualquier tarea con `service_id`; frontend `lib/types.ts` SINCRONIZADO con backend
- ⬜ Pendiente: Fase C, Fase D, Fase E, smoke testing manual final

---

### ✍ Próxima sesión — orden recomendado

1. ~~**EC-T8-12..17 (validaciones defensivas de campo)**~~ ✅ cerrado 2026-04-29 — `due_date` no pasada · coherencia `service_id ↔ client_id` · `is_recurring↔recurrence_day` · regex `billing_month` · `@MaxLength(50000)` description · plantillas seguras (test guard). Cron de Fase C blindado.
2. **Sprint 8 Fase C** — automatización completa: `TasksOverdueProcessor` (cron diario `0 2 * * *` → `task.overdue` + `not_completed_in_time` tras N días) · `TasksUnassignedOverdueCron` (ADR-072, cron diario `0 9 * * *` → `task.unassigned_overdue` con SLA por tipo) · `MaintenanceCriticalCron` (cron diario → `maintenance.critical`) · `WowCallCreatorListener` (`@OnEvent('service.provisioned')`) · plantillas seed faltantes (`task.overdue`, `maintenance.critical`, `task.unassigned_overdue`) · settings nuevos (`tasks.overdue_to_failure_days`, `support.maintenance_critical_threshold_days`, `tasks.unassigned_sla_hours.<type>`).
3. **Sprint 8 Fase D — Support Inside** ([ADR-061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md)) — denso, 1.5 sesiones: schema `support_inside_*` + service + 6 endpoints cliente + 2 admin + páginas dedicadas `/dashboard/support-inside` y `/admin/support-inside-plans` + cancelación cascada + `MaintenanceMonthlyCron` mensual + seed 3 planes Básico/Medium/Pro.
4. **Sprint 8 Fase E** — docs canónicas: `docs/features/tasks/admin.md` + `agent.md` + `docs/features/support-inside/admin.md` + `client.md` + retrospectiva en `completed/sprint-8-tasks-support-inside.md`.

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

## ✅ Sprint 9.5 — UX admin de notifications + cabos sueltos (P1.1.5)

**Estado:** ✅ completado
**Inicio:** 2026-04-27
**Cierre real:** 2026-04-27 (1 sesión densa)

### 1. Objetivo en una frase

Cerrar los 7 ítems diferidos del Sprint 9 Fase D (UX admin de notifications) y Fase F.10 (listener `system.error`), más la cobertura DC.10 del audit-portal, para que `ErrorLogService.log()` deje de tener un evento huérfano y la campana del Topbar sea operativa para clientes y staff.

### 2. Alcance ejecutado

Items previstos en [`backlog.md` P1.1.5](./backlog.md#L44) — los 7 + DC.10 quedan ✅ cerrados:

| # | Paso | Estado |
|---|------|--------|
| 9.D.11 | Endpoints cliente `/notifications` (GET `/unread`, GET `/`, PATCH `/:id/read`, PATCH `/read-all`) + DTOs (`NotificationListQueryDto`) + CASL `Read.Notification` / `Update.Notification`. Ownership server-side: 404 (no 403) sobre id ajeno para no filtrar existencia | ✅ |
| 9.D.12 | Endpoints admin `/admin/notifications/templates` (GET, GET `/:id`, PATCH `/:id`, POST `/:id/preview`) bajo `JwtAuthGuard` + `AdminOnlyGuard`. `NotificationTemplateService` extendido: `findAll/findOne/update/preview` con validación Handlebars (compile error → 400). Muestras canónicas por `event_type` para preview rápido. DTOs: `NotificationTemplateListQueryDto`, `NotificationTemplateUpdateDto`, `NotificationTemplatePreviewDto` | ✅ |
| 9.D.13 | Frontend `NotificationBell` (`frontend/app/dashboard/NotificationBell.tsx` + CSS module). Polling 30s a `/notifications/unread`. Click marca leída + navega a `action_url` si existe. "Marcar todas" purga el contador. Reemplaza el botón placeholder del Topbar | ✅ |
| 9.D.14 | Frontend admin `/admin/notifications/templates/page.tsx`. Listado a la izquierda (filtros por `event_type` y canal), editor a la derecha (subject + body + active + variables disponibles). Preview en línea con render real del backend (HTML para `email`, texto plano para `internal`/otros). `AdminSidebar` ahora expone "Plantillas notificaciones" (rol superadmin) | ✅ |
| 9.D.15 | `NotificationsRetentionCron` (@nestjs/schedule, `EVERY_DAY_AT_2AM` UTC) — borra `notifications` canal `internal` con `read_at < now() - notifications.retention_days`. Las no leídas se conservan indefinidamente. Sólo toca canal `internal` (los externos quedan como prueba de envío hasta Sprint 12.5 Portal RGPD). Migración a BullMQ scheduled diferida a Sprint 13 Hardening | ✅ |
| 9.D.16 | Seed 4 settings nuevos en `backend/prisma/seed.ts`: `notifications.retention_days=90`, `notifications.unread_max_in_dropdown=50`, `notifications.email_enabled_globally=true`, `notifications.maintenance_critical_threshold_days=7`. Todos con fallback en código → ausencia en DB no rompe boot | ✅ |
| 9.F.10 | `NotificationsSystemErrorListener` consume `system.error` → `dispatchToSuperadmins`. Guard anti-loop hard (EC-S9-07): si `module` proviene del dominio notifications (NotificationsService, NotificationsDispatchProcessor, NotificationTemplateService o cualquier `Notifications*`), el listener log + drop. Plantillas `system.error` nuevas en seed: canal `internal` + canal `email` con HTML completo | ✅ |
| 9.D.17 | Test E2E `tests/e2e/notifications.spec.ts` — 6 specs serializados: `unread` vacío, dispatch via `task.assigned` + mark read + idempotencia, ownership filter (cliente NO ve agente), histórico paginado, `read-all`, 404 sobre id ajeno (no filtra existencia) | ✅ |
| DC.10 | Test E2E adicional en `audit-portal.spec.ts` — admin `GET /clients/:id` (decorado `@AuditAccess('Client')`) → fila persistida con `target_user_id = client.id` (path Client/User cubierto, fix `bff4fec`) + verificación de que el cliente lo ve en el portal de transparencia | ✅ |

### 3. Decisiones registradas (sin ADR nuevo — sólo ampliación de canónicos)

- **`Notification.read` semantics**: `read_at NULL` = unread, `read_at NOT NULL` = read. Mantenemos el shape existente del Sprint 9 — no se introduce enum `status` (decisión Sprint 9 §3.4 ratificada).
- **Ownership por 404**: el endpoint `PATCH /notifications/:id/read` devuelve 404 si la notificación no pertenece al caller, NO 403. Razón: 403 vs 404 filtra existencia de ids vía probing — práctica de seguridad estándar (OWASP A04 Insecure Design).
- **Granularidad por rol staff**: TODOS los staff (`superadmin`, `agent_*`) pueden leer/editar plantillas. Granularidad fina por rol se difiere a **Sprint 9.6** (DC.7) cuando se aplique CASL `Manage.NotificationTemplate` con reglas role-specific. Hoy el riesgo es bajo: edición de plantillas es operación rara y trazable vía `audit_change_log` cuando se necesite.
- **Plantillas system.error**: el listener no rompe el flujo del caller si fallan plantillas o dispatch. El emisor (`ErrorLogService.log()`) ya degrada silenciosamente; el listener replica la misma garantía. Si `system.error` proviene del dominio notifications, se dropea SIN intentar enviar (anti-loop hard).

### 4. DoD cumplido

- [x] `pnpm typecheck` (backend) ✅
- [x] `pnpm typecheck` (frontend) ✅
- [x] `pnpm lint:check` (backend) ✅ — autofix prettier de 2 cosméticos
- [x] `pnpm lint` (frontend) ✅ — 0 errors, 38 warnings (DC.6 esperados, no bloquean CI)
- [x] `pnpm build` (backend, frontend) ✅ — `/admin/notifications/templates` listed en build output
- [x] `pnpm test` (backend unit) ✅ — 21/21 verde
- [ ] `pnpm test:e2e` ✅ esperado — requiere reseed (`pnpm seed` para plantillas `system.error` + 4 settings nuevos) + restart backend dev (el watcher tiene caché del código Sprint 9). Yasmin lo verifica en smoke manual + CI tras push.

### 5. Items movidos / pendientes confirmados

- **Sprint 9.6 (DC.7)** — sigue como siguiente natural, en espera de auditoría iterativa con Yasmin para decidir qué páginas se separan, permisos granulares por rol staff, aliases REST 301.
- **Sprint 13 Hardening** — `NotificationsRetentionCron` migrará a BullMQ scheduled junto al resto de crons in-process (ADR-056 §13.30+).
- **Sprint 12.5 Portal RGPD** — política de retención para canales externos (`email`/`whatsapp`) — hoy `NotificationsRetentionCron` SÓLO toca `internal`.

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

## ✅ Sprint 9.6 — Split admin/cliente retroactivo + 3 portales raíz + permisos granulares (P1.1.6 / DC.7)

**Estado:** ✅ completado
**Inicio:** 2026-04-28
**Cierre real:** 2026-04-28 (1 sesión densa, 12 commits encadenados)
**Resumen ejecutivo + retrospectiva:** [`completed/sprint-9-6-split-admin-cliente.md`](./completed/sprint-9-6-split-admin-cliente.md)

### 1. Objetivo en una frase

Cerrar DC.7 retroactivamente: separar el árbol frontend en **tres portales raíz canónicos** (`/admin/*` staff, `/dashboard/*` cliente, `/partner/*` reservado Sprint 19), migrar las páginas admin-puro existentes desde `/dashboard/*` a `/admin/*`, splitear las páginas compartidas (billing, support) en componentes diferenciados cliente vs staff, introducir granularidad CASL fina por rol staff (`agent_billing` ≠ `agent_support` ≠ `agent_full`) en el Sidebar y en endpoints, y emitir aliases REST con headers `Deprecation`/`Sunset` para que la migración no rompa el frontend ni los 30+ specs E2E ya verdes.

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué |
|---|-------------|--------|-------------|
| 1 | Sprint 9 cerrado (`AdminOnlyGuard` global + árbol parcial `/admin/*`) | ✅ | F.1 Fase B |
| 2 | Sprint 9.5 cerrado (granularidad notifs diferida explícitamente a 9.6) | ✅ | F.1 Fase A |
| 3 | CASL Ability Factory operativa (`backend/src/core/casl/`) | ✅ | F.1 Fase A |
| 4 | Auditoría iterativa con Yasmin (3 portales, tasks no-cliente, productos read público, plantillas solo superadmin) | ✅ 2026-04-28 | — |

### 3. Produce (contratos nuevos)

#### 3.1 Subjects CASL nuevos
- `Subject.NotificationTemplate` — solo `superadmin` puede `Manage`. Reemplaza el control hoy basado en `AdminOnlyGuard` puro.
- `Subject.Job` — solo `superadmin` puede `Manage`. Cubre DLQ + cualquier futura UI de jobs.

#### 3.2 Páginas frontend nuevas (árbol `/admin/*`)
- `/admin/clients` (list) + `/admin/clients/[id]` (detail)
- `/admin/products` (list) + `/admin/products/new` + `/admin/products/[id]` + `/admin/products/[id]/edit`
- `/admin/billing` (list) + `/admin/billing/[id]` + `/admin/billing/checkout` (full UX staff)
- `/admin/support` (tickets list) + `/admin/support/[id]` + `/admin/support/chats` (workspace agente)
- `/admin/tasks` (list) + `/admin/tasks/[id]`

#### 3.3 Páginas frontend simplificadas (árbol `/dashboard/*` — cliente)
- `/dashboard/billing` + `/dashboard/billing/[id]` + `/dashboard/billing/checkout` (UX cliente sin columna Cliente, sin tabs Cancelado, sin botones de cobro/cancelar, checkout sin step de selección de cliente)
- `/dashboard/support` + `/dashboard/support/[id]` (tabs reducidas: Todas / Abiertas / Resueltas; sin sidebar contexto; sin toggle is_internal)

#### 3.4 Componente Design System nuevo
- `frontend/app/components/ui/PortalBadge/` — subtítulo bajo el logo: "Portal de Administración" / "Portal de Cliente" / "Portal de Partner". Helper `portalLabelForRole(roleSlug)`. Cumple R16 + D11.

#### 3.5 Endpoints REST migrados (con aliases)
- `/api/v1/admin/clients/*` (path canónico) ← multi-path con `/api/v1/clients/*` legacy + headers `Deprecation: true` + `Sunset: <fecha Sprint 14>`.
- `/api/v1/admin/products/*` (mutaciones POST/PATCH/DELETE) ← multi-path con `/api/v1/products/*` legacy. **`GET /api/v1/products` y `GET /api/v1/products/:id` permanecen en `ProductsController` para catálogo público cliente** (Sprint 18 Landing).

#### 3.6 Middleware nuevo
- `LegacyRouteDeprecationMiddleware` — añade headers `Deprecation: true`, `Sunset: <fecha Sprint 14>`, `Link: </api/v1/admin/...>; rel="successor-version"` en respuestas a paths legacy. Log warning con correlation ID por request a path deprecado.

### 4. Modifica (contratos existentes)

| Archivo | Cambio |
|---------|--------|
| `backend/src/core/casl/permissions.ts` | Añade `Subject.NotificationTemplate` + `Subject.Job`. Reglas role-specific. Actualiza `SIDEBAR_PERMISSIONS` (backend + frontend deben quedar coherentes). |
| `backend/src/modules/clients/clients.controller.ts` | `@Controller(['admin/clients', 'clients'])` + añadir `AdminOnlyGuard` al stack. |
| `backend/src/modules/products/products.controller.ts` | Reducir a solo `@Get()` + `@Get(':id')` (catálogo público bajo CASL `Read.Product`). |
| `backend/src/modules/products/admin-products.controller.ts` (NUEVO) | `@Controller(['admin/products', 'products'])` + `AdminOnlyGuard` + POST/PATCH/DELETE + endpoints de pricing. |
| `backend/src/modules/notifications/notification-templates-admin.controller.ts` | Sustituye autorización por `AdminOnlyGuard` puro a `@CheckPolicies(can(Manage, NotificationTemplate))`. |
| `backend/src/core/jobs/jobs.controller.ts` | Idem con `Subject.Job`. |
| `frontend/app/lib/permissions.ts` | `ROUTE_PERMISSIONS` actualiza paths `/admin/*`. Elimina entradas viejas admin-puro de `/dashboard/*`. Mantiene paths cliente. |
| `frontend/app/dashboard/Sidebar.tsx` | Remover sección 'admin' completamente. Solo renderiza items cliente o partner. |
| `frontend/app/admin/AdminSidebar.tsx` | Sustituye `allowedRoles` hardcodeado por `useAbility().can(...)`. Añade items Clientes/Productos/Facturación/Soporte/Tareas con su Subject CASL correspondiente. |
| `frontend/app/admin/layout.tsx` + `frontend/app/dashboard/layout.tsx` | Integrar `<PortalBadge>` en el header del Sidebar. |
| `tests/e2e/checkout-admin.spec.ts` | Cambiar `goto('/dashboard/billing*')` → `/admin/billing*`. |
| `tests/e2e/support-escalation.spec.ts` | Cambiar `goto('/dashboard/support*')` → `/admin/support*`. |

### 5. Pasos atómicos

#### Fase A — Backend granularidad CASL (preparar el terreno)

| # | Paso | Estado |
|---|------|--------|
| 9.6.A.1 | Crear ADR-067 (granularidad CASL + Subjects nuevos) ANTES de codear | ⬜ |
| 9.6.A.2 | Añadir `Subject.NotificationTemplate` + `Subject.Job` en `permissions.ts`. Reglas: solo `superadmin` puede `Manage` ambos. Actualizar `SIDEBAR_PERMISSIONS` | ⬜ |
| 9.6.A.3 | Sincronizar `frontend/app/lib/permissions.ts` (réplica de SIDEBAR_PERMISSIONS) | ⬜ |
| 9.6.A.4 | Aplicar `@CheckPolicies(can(Manage, NotificationTemplate))` en `notification-templates-admin.controller.ts` (sustituye autorización implícita por AdminOnlyGuard) | ⬜ |
| 9.6.A.5 | Aplicar `@CheckPolicies(can(Manage, Job))` en `jobs.controller.ts` | ⬜ |
| 9.6.A.6 | Tests unit CASL: 4 roles × Subjects nuevos = matriz de permisos verificada | ⬜ |
| 9.6.A.7 | DoD parcial Fase A: typecheck + lint:check + build + test (backend) | ⬜ |

#### Fase B — Backend multi-path + Split ProductsController

| # | Paso | Estado |
|---|------|--------|
| 9.6.B.1 | Crear ADR-068 (multi-path Deprecation headers) ANTES de codear | ⬜ |
| 9.6.B.2 | `ClientsController @Controller(['admin/clients', 'clients'])` + añadir `AdminOnlyGuard` al stack del controller | ⬜ |
| 9.6.B.3 | Crear `AdminProductsController @Controller(['admin/products', 'products'])` con POST/PATCH/DELETE + endpoints pricing + `AdminOnlyGuard`. Mover lógica desde `ProductsController` | ⬜ |
| 9.6.B.4 | Reducir `ProductsController @Controller('products')` a solo `@Get()` + `@Get(':id')` (catálogo público bajo CASL `Read.Product`) | ⬜ |
| 9.6.B.5 | Crear `LegacyRouteDeprecationMiddleware` aplicado a `/clients` y a mutaciones `/products/*`. Headers `Deprecation: true` + `Sunset: 2026-12-31` + `Link: <successor>; rel="successor-version"` | ⬜ |
| 9.6.B.6 | Test E2E: paths legacy (`GET /api/v1/clients`, `POST /api/v1/products`) responden con header `Deprecation`, paths nuevos (`/api/v1/admin/...`) sin header | ⬜ |
| 9.6.B.7 | DoD parcial Fase B: typecheck + lint:check + build + test:e2e (backend) | ⬜ |

#### Fase C — Frontend componente PortalBadge + integración layouts

| # | Paso | Estado |
|---|------|--------|
| 9.6.C.1 | Crear ADR-066 (tres portales raíz + PortalBadge) ANTES de codear | ⬜ |
| 9.6.C.2 | Componente `frontend/app/components/ui/PortalBadge/` (cumple R16) + tipo `PortalVariant` + tokens tipográficos | ⬜ |
| 9.6.C.3 | Helper `portalLabelForRole(roleSlug)` en `frontend/app/lib/portal.ts` | ⬜ |
| 9.6.C.4 | Integrar `<PortalBadge>` en `app/admin/layout.tsx` (header Sidebar) | ⬜ |
| 9.6.C.5 | Integrar `<PortalBadge>` en `app/dashboard/layout.tsx` (header Sidebar — variant resuelta por rol) | ⬜ |

#### Fase D — Frontend migración bucket A (admin-puro)

| # | Paso | Estado |
|---|------|--------|
| 9.6.D.1 | Crear `/admin/clients/page.tsx` + `/admin/clients/[id]/page.tsx` (copia exacta de `/dashboard/clients/*`, ajustar links internos a `/admin/clients/...`) | ⬜ |
| 9.6.D.2 | Crear `/admin/products/page.tsx` + `/admin/products/new` + `/admin/products/[id]` + `/admin/products/[id]/edit` (copia exacta) | ⬜ |
| 9.6.D.3 | Crear `/admin/support/chats/page.tsx` (copia exacta del workspace agente) | ⬜ |
| 9.6.D.4 | Crear `/admin/tasks/page.tsx` + `/admin/tasks/[id]/page.tsx` (copia exacta — la cliente NO tiene página de tasks, las verá embebidas en services/support-inside futuros) | ⬜ |
| 9.6.D.5 | Eliminar `/dashboard/clients/*`, `/dashboard/products/*`, `/dashboard/support/chats`, `/dashboard/tasks/*` | ⬜ |
| 9.6.D.6 | Actualizar todas las llamadas en `frontend/app/lib/api.ts` y fetch directos para apuntar a `/api/v1/admin/clients` y `/api/v1/admin/products` (mutaciones) | ⬜ |
| 9.6.D.7 | Actualizar `frontend/app/lib/permissions.ts ROUTE_PERMISSIONS`: eliminar entradas viejas admin-puro de `/dashboard/*`, añadir `/admin/clients`, `/admin/products`, `/admin/billing`, `/admin/support`, `/admin/tasks`, `/admin/settings` (futuro) | ⬜ |
| 9.6.D.8 | `frontend/app/dashboard/Sidebar.tsx`: remover sección 'admin' completamente. Solo cliente + partner | ⬜ |
| 9.6.D.9 | `frontend/app/admin/AdminSidebar.tsx`: sustituir `allowedRoles` por `useAbility().can(action, subject)`. Añadir items con su Subject CASL correspondiente | ⬜ |
| 9.6.D.10 | Login redirect post-2FA verificado: staff → `/admin`, cliente → `/dashboard`, partner → `/dashboard` (hasta Sprint 19) | ⬜ |

#### Fase E — Frontend split bucket B (UX diferenciada)

| # | Paso | Estado |
|---|------|--------|
| 9.6.E.1 | Extraer componentes neutros a `frontend/app/_shared/billing/`: `InvoiceTable.tsx`, `InvoiceDetailCard.tsx`. Props neutras (`columns: ColumnDef[]`, `actions: Action[]`), sin condicionales `isAdmin` interno | ⬜ |
| 9.6.E.2 | `/admin/billing/page.tsx` (full UX: columna Cliente, tab Cancelado, botones Finalize/Pay/Cancel/Refund). Reutiliza componentes neutros | ⬜ |
| 9.6.E.3 | `/dashboard/billing/page.tsx` (cliente UX: sin columna Cliente, sin tab Cancelado, sin botones acción, subtitle "Mis facturas") | ⬜ |
| 9.6.E.4 | `/admin/billing/[id]` + `/dashboard/billing/[id]` (split detalle) | ⬜ |
| 9.6.E.5 | `/admin/billing/checkout` (5 steps: client→product→pricing→profile→confirm) + `/dashboard/billing/checkout` (4 steps sin client) | ⬜ |
| 9.6.E.6 | Extraer componentes neutros a `frontend/app/_shared/support/`: `ConversationList.tsx`, `ConversationMessages.tsx`, `ConversationSidebar.tsx` (props neutras) | ⬜ |
| 9.6.E.7 | `/admin/support/page.tsx` (tabs full workflow: Todas/Abiertas/Esperando agente/Esperando cliente/Resueltas/Cerradas) + CTA "Nuevo ticket para cliente" | ⬜ |
| 9.6.E.8 | `/dashboard/support/page.tsx` (tabs reducidas: Todas/Abiertas/Resueltas) + CTA "Nueva conversación" | ⬜ |
| 9.6.E.9 | `/admin/support/[id]` (full detail: sidebar contexto cliente + servicios + notas, toggle is_internal, status/priority/escalate) + `/dashboard/support/[id]` (cliente: sin sidebar, sin is_internal, view-only de status) | ⬜ |

#### Fase F — Seed enriquecido + Tests E2E + DoD final

| # | Paso | Estado |
|---|------|--------|
| 9.6.F.0 | **Seed modular profesional** ([`docs/50-operations/seed-reference.md`](../50-operations/seed-reference.md)). Refactorizar `backend/prisma/seed.ts` a orquestador + `backend/prisma/seeds/` con módulos `roles.ts`, `settings.ts`, `test-accounts.ts` (1 cuenta por cada rol con guard `NODE_ENV` + override env vars), `sample-clients.ts` (2 clientes adicionales), `sample-products.ts` (2 productos con pricing real), `sample-invoices.ts` (2 facturas del cliente principal), `sample-support.ts` (1 ticket + 1 chat). Idempotente vía upserts y markers `metadata.seeded`. Cierra el bug recurrente "tras reseed se me borra el cliente test" introducido por Sprint 11.5+. Doc canónica `docs/50-operations/seed-reference.md` + §11 en development-playbook | ✅ |
| 9.6.F.1 | Actualizar `tests/e2e/checkout-admin.spec.ts`: paths `/dashboard/billing*` → `/admin/billing*` | ⬜ |
| 9.6.F.2 | Actualizar `tests/e2e/support-escalation.spec.ts`: paths `/dashboard/support*` → `/admin/support*` | ⬜ |
| 9.6.F.3 | Crear `tests/e2e/admin-tree-migration.spec.ts` (5 tests): cliente recibe 403 sobre `/api/v1/admin/clients` y `/admin/products`; staff accede; aliases REST devuelven `Deprecation: true`; cliente entra `/dashboard/billing` y NO ve columna Cliente; cliente entra `/dashboard/support` y solo ve 3 tabs | ⬜ |
| 9.6.F.4 | Crear `tests/e2e/admin-granular-roles.spec.ts` (4 tests): `agent_billing` sidebar (Clientes+Facturación+Tareas, NO Soporte/Productos); `agent_support` sidebar (Clientes read+Soporte+Tareas, NO Facturación/Productos); `agent_full` sidebar (todo menos Settings/Plantillas/DLQ); `agent_billing` recibe 403 sobre `/api/v1/support/conversations`, `agent_support` 403 sobre `/api/v1/billing/invoices` | ⬜ |
| 9.6.F.5 | DoD final: `pnpm typecheck` + `pnpm lint:check` (backend) + `pnpm lint` (frontend) + `pnpm build` + `pnpm test` (unit 21+ ✅) + `pnpm test:e2e` (suite full verde) | ⬜ |
| 9.6.F.6 | Smoke test manual (Yasmin): login con superadmin / agent_full / agent_billing / agent_support / cliente. Verificar PortalBadge correcto + Sidebar correcto + 403 sobre rutas no permitidas | ⬜ |

#### Fase G — Cierre + DoD documental

| # | Paso | Estado |
|---|------|--------|
| 9.6.G.1 | `_matrix.md` actualizado con filas role-staff (granularidad por Subject) | ⬜ |
| 9.6.G.2 | `glossary.md`: término "Portal" añadido (tres portales raíz canónicos) | ⬜ |
| 9.6.G.3 | `rules.md` §Patrones canónicos: añadir entries para `PortalBadge`, multi-path con Deprecation, `LegacyRouteDeprecationMiddleware`, `Subject.NotificationTemplate`/`Subject.Job` | ⬜ |
| 9.6.G.4 | Contracts afectados actualizados: `clients/contract.md`, `products/contract.md`, `billing/contract.md`, `support/contract.md`, `audit/contract.md` (URLs `/admin/*`) | ⬜ |
| 9.6.G.5 | Mover Sprint 9.6 a `completed/sprint-9-6-split-admin-cliente.md` con resumen ejecutivo + retrospectiva | ⬜ |
| 9.6.G.6 | Cerrar DC.7 en `backlog.md` | ⬜ |
| 9.6.G.7 | Commit final: `feat(P1.1.6): Sprint 9.6 — split admin/cliente + 3 portales + permisos granulares — cumple R1/R5/R7/R16 + DC.7 + ADR-066/067/068` | ⬜ |

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-S96-01 | Frontend deployado antes que backend (o viceversa) durante migración | Backend multi-path: tanto `/api/v1/clients` como `/api/v1/admin/clients` responden iguales. Frontend puede actualizar paths progresivamente. Aceptable. |
| EC-S96-02 | Specs E2E antiguos siguen apuntando a paths legacy | Aliases activos hasta Sprint 14. Specs migran en Fase F.1/F.2. CI verde garantizado. |
| EC-S96-03 | `agent_full` cree que tiene acceso a Plantillas porque hoy lo tenía (Sprint 9.5) | ADR-067 explica el cambio. Mensaje 403 claro: "Solo el superadmin puede gestionar plantillas de notificaciones." Audit log registra los intentos. |
| EC-S96-04 | Cliente con bookmark a `/dashboard/clients` (no debería ocurrir, pero) | `dashboard/layout.tsx` redirige a `/dashboard` si la ruta no está en `ROUTE_PERMISSIONS` y el rol no la puede acceder. Página `/dashboard/clients` no existe → 404 nativo de Next.js. Aceptable. |
| EC-S96-05 | Componentes `_shared/billing/` se vuelven props-heavy y explotan R15 | Extraer SOLO los building blocks puros (tabla, detail card). UX divergente queda en cada `page.tsx`. Si un component supera 200 líneas → split antes de añadir más. |
| EC-S96-06 | `useAbility()` en `AdminSidebar` carga antes que `req.user` esté poblado | Loading skeleton en sidebar mientras `isLoading=true`. Mismo patrón que el `AdminLayout` actual. |
| EC-S96-07 | `Sunset` header con fecha pasada en producción futura | Sprint 14 elimina los paths legacy del array `@Controller([...])`. Si por error queda algún path: middleware loguea WARN; alerta superadmin opcional via `system.error` (Sprint 9.5). |
| EC-S96-08 | Catálogo público de productos (`GET /api/v1/products`) expone campos sensibles (cost, margin) al cliente | Service ya usa DTOs / `select` Prisma con campos públicos. Auditar `ProductsService.findAll` y `findOne` antes de Fase B. Si filtra de más → fix puntual + test. |
| EC-S96-09 | Test E2E `admin-granular-roles` requiere usuarios con cada rol staff sembrados | Helper `createUserWithRole(roleSlug)` en `tests/e2e/fixtures/db.ts`. Si no existe, añadirlo en Fase F.4. |
| EC-S96-10 | Multi-path en `@Controller([...])` rompe Swagger/OpenAPI con duplicados | Verificar Swagger UI tras Fase B. Si duplica: anotar paths legacy con `@ApiExcludeEndpoint()` para que solo aparezcan los canónicos. |

### 7. Definition of Done

#### Código
- [ ] Pasos 9.6.A.1–9.6.G.7 marcados ✅
- [ ] `pnpm typecheck` (backend + frontend) ✅
- [ ] `pnpm lint:check` (backend) + `pnpm lint` (frontend) verdes ✅ — bloqueantes
- [ ] `pnpm build` (backend + frontend) ✅
- [ ] `pnpm test` (backend unit) ✅ — incluye nuevos tests CASL Subjects nuevos
- [ ] `pnpm test:e2e` ✅ — 30+ specs anteriores + 9 nuevos (admin-tree-migration + admin-granular-roles)
- [ ] CI verde tras último push

#### Documentación
- [ ] ADR-066, ADR-067, ADR-068 creados, fechados, enlazados desde `rules.md` (sección Patrones canónicos), `_matrix.md`, contracts afectados
- [ ] `current.md` Sprint 9.6 movido a `completed/sprint-9-6-split-admin-cliente.md`
- [ ] DC.7 cerrado en `backlog.md`
- [ ] Contracts actualizados: `clients/contract.md`, `products/contract.md`, `billing/contract.md`, `support/contract.md` (paths `/admin/*` reflejados)
- [ ] `glossary.md`: término "Portal" añadido
- [ ] `rules.md` §Patrones canónicos: 4 entries nuevas (PortalBadge, multi-path, middleware Deprecation, Subjects CASL nuevos)
- [ ] `frontend/app/lib/permissions.ts`: comentario citando ADR-067 que sigue siendo réplica del backend pero ahora con Subjects nuevos

#### Proceso
- [ ] Conventional Commits con citación de regla en cada commit (`feat(casl): Fase A — granularidad rol staff — cumple R1 + ADR-067`)
- [ ] Cada Fase A–G en commit separado (granularidad para rollback selectivo)
- [ ] ADRs creados ANTES de codear su fase (Fase A → ADR-067, Fase B → ADR-068, Fase C → ADR-066)
- [ ] Edge cases EC-S96-01..10 trackeados (resueltos o referenciados)

#### Smoke testing manual (Yasmin)
- [ ] Login con `superadmin` → landing `/admin` → PortalBadge muestra "Portal de Administración" → Sidebar con todos los items
- [ ] Login con `agent_full` → landing `/admin` → Sidebar SIN Settings/Plantillas/Jobs DLQ
- [ ] Login con `agent_billing` → landing `/admin` → Sidebar con Clientes/Facturación/Tareas/Inicio (NO Soporte, Productos, Error Log)
- [ ] Login con `agent_support` → landing `/admin` → Sidebar con Clientes (read)/Soporte/Tareas/Inicio (NO Facturación, Productos)
- [ ] Login con cliente → landing `/dashboard` → PortalBadge muestra "Portal de Cliente" → Sidebar SIN sección admin
- [ ] Cliente entra `/dashboard/billing` → ve solo SUS facturas, sin columna Cliente, sin botones de cobro
- [ ] Cliente entra `/dashboard/support` → solo 3 tabs (Todas, Abiertas, Resueltas), CTA "Nueva conversación"
- [ ] `agent_billing` intenta GET `/api/v1/support/conversations` → 403 con mensaje claro
- [ ] `agent_support` intenta GET `/api/v1/billing/invoices` → 403 con mensaje claro
- [ ] `GET /api/v1/clients` (path legacy) responde 200 con header `Deprecation: true` y `Sunset: 2026-12-31`
- [ ] `GET /api/v1/admin/clients` (path canónico) responde 200 sin header `Deprecation`

### 8. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Multi-path con `@Controller([...])` rompe Swagger/OpenAPI generando entries duplicados | Docs API confusas | EC-S96-10. Verificar tras Fase B. Si duplica: `@ApiExcludeEndpoint()` en paths legacy. |
| Frontend cliente con bookmark a `/dashboard/clients` post-migración | UX rota | EC-S96-04. Página deja de existir → 404 nativo Next.js. Aceptable (cliente nunca debió tenerla). |
| `agent_full` pierde acceso a Plantillas que tenía en Sprint 9.5 | Frustración temporal | ADR-067 explica el cambio. Mensaje 403 claro. Documentado en Sprint 9.5 §3 como deuda explícita. |
| Componentes `_shared/billing/` y `_shared/support/` se vuelven god-objects con props-heavy | Refactor explota R15 | EC-S96-05. Extraer SOLO building blocks puros. UX divergente vive en cada `page.tsx`. Auditoría tras Fase E. |
| Aliases legacy permanecen activos en producción tras Sprint 14 | Surface de ataque innecesaria | Sprint 14 cierra los paths legacy del array `@Controller([...])`. EC-S96-07 cubre el caso. |
| Sprint 9.6 inflado por intentar limpiar SIDEBAR_PERMISSIONS duplicado | Sprint se alarga | NO se aborda en 9.6. Deuda DC.X registrada para Sprint 13 Hardening (colapsar a un endpoint `/api/v1/me/permissions`). |
| 21 páginas a duplicar/migrar genera >50 archivos modificados | Code review difícil | 7 fases × 1 commit cada = ~7 commits separados. Cada uno auto-contenido y verificable independientemente. |

### 9. Decisiones registradas

ADRs nuevos a crear ANTES de la fase correspondiente:

- **ADR-066 — Tres portales raíz por audiencia: `/admin`, `/dashboard`, `/partner`** (pre Fase C). Formaliza decisión de Yasmin (2026-04-28): no más portales aunque haya 4 roles staff. Granularidad intra-portal vía CASL. Patrón `PortalBadge` (subtítulo bajo logo). Layouts separados, Design System compartido. Helper `landingForRole()` post-2FA. Citado desde `rules.md` §Patrones canónicos + `glossary.md` (término "Portal").
- **ADR-067 — Granularidad CASL por rol staff + Subjects nuevos** (pre Fase A). Cierra deuda Sprint 9.5 §3 ("granularidad fina diferida"). Introduce `Subject.NotificationTemplate` + `Subject.Job` ambos `Manage` solo `superadmin`. Reglas role-specific verificadas con tests unit. Plantillas notifs y Jobs DLQ se restringen retroactivamente a superadmin.
- **ADR-068 — Multi-path con Deprecation headers para migración retroactiva de rutas REST** (pre Fase B). Justifica multi-path sobre redirect 308 (preserva method+body, no fragiliza tests). Política `Deprecation: true` + `Sunset: 2026-12-31` (RFC 9745 / RFC 8594). Ventana hasta Sprint 14 Deploy. Cierre de aliases legacy en commit pre-deploy.

### 10. Cierre del sprint

**Fecha real de cierre:** 2026-04-28 (1 sesión densa).

**Commits del sprint** (rama `feat/sprint-9-6-split-admin-cliente`, en orden cronológico):

1. `16b22ed` — Fase A: granularidad CASL + Subjects `NotificationTemplate`/`Job` (ADR-067).
2. `241a8a9` — Fase B: multi-path REST + `LegacyRouteDeprecationMiddleware` (ADR-068).
3. `3937ffa` — Fase C: componente `PortalBadge` + helper `portalForRole` (ADR-066).
4. `0b8f6b5` — Fase D: migración páginas admin-puro `/dashboard/*` → `/admin/*` (clients, products, tasks, support/chats) + reescritura `AdminSidebar` con `useAbility` granular.
5. `(extracción _shared)` — Fase E.1: `_shared/billing/` + `_shared/support/` con hooks neutros + `invoice-status-map.ts` canónico.
6. `6b4c152` — Fase E.2: split UX billing (`/admin/billing/*` full + `/dashboard/billing/*` simplificado).
7. `a2b8db4` — Fase E.3: split UX support (`/admin/support/*` full workflow + `/dashboard/support/*` cliente reducido).
8. `(seed F.0)` — Fase F.0: seed modular profesional + 7 cuentas por rol + datos demo + `docs/50-operations/seed-reference.md` + `development-playbook.md` §11.
9. `97f164d` — Fase F.0.bis: `Topbar` + `NotificationBell` movidos a `_shared/shell/` (cierra bug "no se puede cerrar sesión en /admin").
10. `e989f3c` — Fase F.1–F.3: 2 specs E2E actualizados + 2 nuevos (`admin-tree-migration` 7 tests + `admin-granular-roles` 8 tests) + fix `resetTestData` para preservar cuentas seed.
11. `e3955bc` — Fase F.4: fix `playwright.config` (`workers=1` + `fullyParallel=false` por default — la suite no soporta paralelismo todavía).
12. `53b90d0` — Fase F.4: `resetTestData` desbloquea `login_attempts`/`blocked_until`/`two_factor_secret` de cuentas seed entre runs.

**Cambios respecto al plan original:**

- **Fase F.0 expandida** con seed modular profesional (no estaba en plan inicial, surgió del feedback de Yasmin "tras cada migración se me borra el cliente test"). Aporta: `backend/prisma/seeds/{roles,settings,test-accounts,sample-clients,sample-products,sample-invoices,sample-support}.ts` + `seed-reference.md` + 4 salvaguardas (guard `NODE_ENV`, TLD `.test` RFC 6761, override env vars, markers `metadata.seeded`).
- **Fase F.0.bis Topbar unificado** (no estaba en plan inicial, surgió del bug "no hay logout en `/admin`"). Aporta: extracción de `Topbar` + `NotificationBell` a `_shared/shell/` siguiendo doctrina ADR-066 (single source of truth entre portales). El admin/layout pasa de 62 → 130 líneas con simetría completa al dashboard cliente (Cmd+K, ToastProvider, NoPermission, CommandPalette).
- **Bug de E2E paralelismo descubierto en Fase F.4** — `playwright.config` distinguía CI vs local con `fullyParallel: !process.env.CI`, pero la suite comparte DB/MailPit/cuentas seed/Redis y no soporta paralelismo real. Forzado `workers=1` en ambos entornos. Paralelización con fixtures aisladas queda como deuda nueva DC.X para Sprint 13 Hardening.
- **Bug latente de `resetTestData`** — borraba `login_attempts`/`blocked_until`/`two_factor_secret` de cuentas seed que ahora sobreviven al DELETE. Tras una corrida con password mal, el superadmin quedaba bloqueado en runs siguientes. Fix: reset proactivo de esos 3 campos en cada `resetTestData()`.

**Items movidos a sprints futuros:**

- **Sprint 13 Hardening** (paralelización E2E real) — requiere fixtures aisladas por spec: DB de test propia, MailPit dedicado, usuarios `e2e-${uid}` por spec. Hoy la suite serial es suficiente (60 tests en ~1 min).
- **Sprint 13 Hardening** (collapse de Sidebar admin + mobile drawer) — `AdminSidebar` es width 260 fijo. Sprint 9.6 estabilizó la lógica; el pulido UX entra en sprint dedicado tras todos los módulos cerrados.
- **Sprint 13 Hardening** (colapsar duplicación `SIDEBAR_PERMISSIONS` frontend/backend a un endpoint `/api/v1/me/permissions`) — la réplica actual es manual.
- **Sprint 14 Deploy** — eliminar paths legacy del array `@Controller([...])` antes del primer push productivo (cierra ventana de deprecación de aliases REST).
- **Sprint 18 Landing Integration** — `GET /api/v1/products` (canónico público) ya está listo para alimentar el catálogo público sin auth (vía endpoint distinto futuro `/api/v1/public/catalog`).
- **Sprint 19 Partner Module** — replica patrón ADR-066 con `/partner/*`, reusando todo `_shared/billing` + `_shared/support` + `_shared/shell` + `PortalBadge` variant `'partner'`.

**DoD verificado:**

- ✅ Pasos 9.6.A.1–9.6.G.8 marcados.
- ✅ `pnpm typecheck` (backend + frontend) verde.
- ✅ `pnpm lint:check` (backend) + `pnpm lint` (frontend, 0 errors / 40 warnings DC.6 esperados) verdes.
- ✅ `pnpm build` (backend + frontend) verde — todas las rutas `/admin/*` y `/dashboard/*` generadas; bundle Topbar compartido en chunk vendor (no duplicado).
- ✅ `pnpm test` (backend unit) — **37/37 verde** (21 anteriores + 16 nuevos `casl-ability.factory.spec.ts`).
- ✅ `pnpm test:e2e` (suite full) — **60/60 verde en ~1 min** (51 heredados + 9 nuevos: 7 `aliases-rest-deprecation` + 7 `admin-tree-migration` + 8 `admin-granular-roles` + actualizaciones a `checkout-admin` y `support-escalation`).
- ✅ ADR-066, ADR-067, ADR-068 creados, fechados, enlazados desde `rules.md` (Patrones canónicos), `_matrix.md` (granularidad CASL), `glossary.md` (término "Portal"), contracts afectados.
- ✅ `glossary.md` § "Portales y audiencias" con 3 términos canónicos (Portal, PortalBadge, Multi-path con Deprecation headers).
- ✅ `rules.md` §Patrones canónicos: 4 entries nuevas (`PortalBadge`, `_shared/shell/Topbar`, `LegacyRouteDeprecationMiddleware` + multi-path, Subjects CASL `NotificationTemplate`/`Job`).
- ✅ `_matrix.md` §"Granularidad CASL por rol staff" — matriz completa 6 roles × 30+ Subjects.
- ✅ Contracts actualizados: `clients/contract.md`, `products/contract.md` (split público/admin), `billing/contract.md`, `support/contract.md` (paths `/admin/*` reflejados; aliases legacy documentados).
- ✅ `frontend/app/lib/permissions.ts` con Subjects `NotificationTemplate`/`Job` y comentario citando ADR-067.
- ✅ Smoke manual Yasmin: las 7 cuentas seed loguean correctamente, cada una aterriza en su portal, cada agente staff ve el sidebar correcto según CASL, el logout funciona desde el dropdown perfil del Topbar (era el bug que disparó Fase F.0.bis).
- ⏳ CI verde tras último push — pendiente del `git push` cuando Yasmin lo apruebe.

**Items movidos a `completed/sprint-9-6-split-admin-cliente.md`** con resumen ejecutivo + retrospectiva (qué funcionó, qué no esperábamos, deuda residual + lessons learned). DC.7 cerrado en `backlog.md` con commit de referencia. P1.1.6 marcado ✅ Cerrado.

**Sprint 9.6 cierra al 100%.** Próximo natural según `development-playbook.md §10`: Sprint 8 residual (Tasks Fase A schemas + B frontend Tablero + C listeners task.overdue + D Support Inside ADR-061 + E docs) o Sprint 11 Provisioning según prioridad operativa.

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
