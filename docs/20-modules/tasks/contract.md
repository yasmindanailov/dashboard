# tasks — Contract

> 🚧 **CONTRATO EN MIGRACIÓN — Sprint 16 Fases 16.A + 16.B mergeadas (2026-05-02)**
>
> **Backend ya migrado al contrato canónico ADR-079.** El frontend (Fase 16.C) y el cierre documental completo (Fase 16.E) están pendientes — la sección §1-§17 de abajo refleja el estado PRE-Sprint 16 y queda como referencia histórica hasta que la Fase 16.E lo reescriba.
>
> **Estado real del backend tras commit `eefa046` (PR #22):**
> - Tasks = bridge unidireccional read-only desde 5 triggers automáticos cerrados (`support_ticket`, `support_inside_slot`, `provisioning_manual`, `client_lifecycle`, `project`). **NO** existe POST `/tasks` ni PATCH libre.
> - Enum `TaskType` **eliminado**, reemplazado por `TaskSourceSystem` (5 valores).
> - Modelo de datos `tasks`: **11 campos canónicos** (id, source_system, source_id, client_id, assigned_to, priority, status, due_date, completed_at, completed_by, created_at, updated_at). Drop completo: `task_tags` + `task_tag_assignments`, `Task.client_note`, `is_recurring`/`recurrence_day`/`billing_month`, `reason`, `metadata`, `title`, `description`, `created_by`, `service_id`, `conversation_id`.
> - `client_notes` con `source_system` + `source_id` + `triggered_by_action` (sin FK física sobre source_id — polimórfico).
> - 4 helpers canónicos en `backend/src/core/tasks/`: `priority-helper.ts`, `sla-helper.ts`, `auto-assign.ts`, `list-ordering.ts`.
> - 3 listeners nuevos: `client-lifecycle-task-creator` (consume `service.activated` + `clientsService.isFirstService`), `tasks-on-slot-released`, `tasks-on-service-cancelled`.
> - `ClientNotesService` consolidado en `modules/clients/` con 5 entrypoints canónicos (`createFromTicketCompletion`, `createFromMaintenanceCompletion`, `createFromTaskCompletion`, `createExceptional`, `findByClient`/`findByTask`).
> - CASL: `Subject.TaskTag` eliminado.
> - Endpoints REST canónicos vivos: `/tasks/:id/assign`, `/complete`, `/complete-ticket-bridge`, `/cancel`, `/checklist`, `/maintenance/log`, `/notes` (GET).
> - Cobertura: **183/183 unit + 118/118 E2E verde**.
>
> **Lo que falta para cerrar Sprint 16:**
> - Fase 16.C — frontend al nuevo contrato (TaskCard, CompleteTaskModal, TasksWidget, ExceptionalNoteModal, drop NewTaskModal).
> - Fase 16.D residual — 2 specs E2E nuevos (`client-lifecycle-welcome-task`, `notes`) + smoke testing manual.
> - Fase 16.E — reescribir este `contract.md` + `30-data/tasks.md` + `30-data/clients.md` + `features/tasks/admin.md`+`agent.md` + retrospectiva `completed/sprint-16-tasks-notes-refactor.md`.

## 1. Propósito

Sistema interno de gestión de tareas para el equipo de Aelium. Permite que admins y agentes asignen, reasignen, completen y prioricen trabajo: tareas técnicas, gestiones administrativas, mantenimientos programados, comunicaciones con clientes. Cada tarea tiene tipo, prioridad, asignado, cliente vinculado opcional, servicio vinculado opcional, fecha límite y notas (cliente / internas).

NO es visible al cliente — es herramienta interna del equipo.

> **Tras Sprint 16:** el propósito se ajusta a "capa transversal de organización del trabajo del agente humano que viene como reflejo de eventos de los demás sistemas (tickets, slots Support Inside, provisioning manual, ciclo de vida del cliente, proyectos)". El "qué hay que hacer" sigue viviendo en cada sistema; tasks es la cara organizada que unifica el flujo.

---

## 2. Estado de implementación

🟢 **Sprint 8 Fase A + B + C 100% cerradas** (2026-04-26 → 2026-05-01). Cola activa: Fase D (Support Inside) → Fase E (docs canónicas). Ver §17 deuda y `docs/60-roadmap/current.md` §10.

**Resumen del estado funcional tras Fase B:**

- ✅ Module + service + controller + DTOs completos. Validaciones defensivas EC-T8-12..17 activas.
- ✅ Tipos canónicos (ADR-073): enum `TaskType` (`contact_client`, `maintenance`, `maintenance_management`, `project_task`, `custom_work`, `support_setup`, `support_ticket`) + `reason` libre + `tags` extensibles.
- ✅ Bridge ticket↔task (ADR-074): asignar ticket crea task automática (`type=support_ticket`); cierre canónico unificado en la tarea con dual path (resolver/cerrar ticket); 12 edge cases doctrinales documentados.
- ✅ Notificaciones canónicas: `task.assigned` (email + campana al agente), `task.completed` (email + campana al cliente sólo si hay `clientNotes` y tipo no-maintenance), `maintenance.completed` (email + campana al cliente con resumen mensual). Listener bridge desactiva notificación duplicada via flag `__skipClientNotification`.
- ✅ UI admin completa: tablero segmentado (mine/unassigned/all), detalle con header `ConversationHeader`-style, `TaskCompletionModal` dual mode, card "Notas internas" inline persistente, `TaskInternalNotesCard` + chips de tags, sidebar "Ticket origen" cuando hay `conversation_id`.
- ✅ CASL granularidad ADR-067: `Subject.Task` (todo staff manage), `Subject.TaskTag` (manage admin pleno, read demás staff).
- ✅ Schema: 5 migraciones limpias (`task_checklist_completions`, `maintenance_logs`, `task_tags` + m2m, FK `client_notes.author`, enum `support_ticket`).

**Cerrado Fase C (2026-05-01):** 3 colas BullMQ scheduled con leader election natural via Redis (ADR-063 + ADR-064): `tasks-overdue` (`0 2 * * *` UTC) marca tareas vencidas como `not_completed_in_time` + emite `task.overdue` al agente; `tasks-unassigned-overdue` (`0 9 * * *` UTC, ADR-072) emite resumen agregado al superadmin con tareas en cola pública fuera de SLA por tipo; `maintenance-critical` (`0 8 * * *` UTC) emite resumen de servicios sin `maintenance_log` >`support.maintenance_critical_threshold_days` (default 60). 6 plantillas Handlebars seedeadas (3 eventos × email/internal) con guard EC-T8-17 OK. 8 settings nuevos (`tasks.overdue_to_failure_days` + 6 `tasks.unassigned_sla_hours.*` + `support.maintenance_critical_threshold_days`). Endpoint admin `POST /api/v1/admin/tasks/cron/:name` (`overdue|unassigned-overdue|maintenance-critical`) restringido a `Manage.Job` (superadmin) para smoke + E2E + recovery. Cobertura: **21 unit tests** (7+6+8) + **5 E2E** (`tasks-crons.spec.ts`) — suite full 112/112 verde sin regresión.

**Pendiente:**

- ⬜ Fase D: Support Inside ([ADR-061](../../10-decisions/adr-061-support-inside-tier-cuenta-ux.md)) — schema + service + 8 endpoints + páginas dedicadas + cron mensual.
- ⬜ Fase E: docs canónicas `features/tasks/admin.md` + `agent.md` + retrospectiva `completed/sprint-8-tasks-support-inside.md`.
- ⬜ Sprint 11 (post-Fase C): `ContactClientTaskListener` (`@OnEvent('service.provisioned')`) — renombrado del histórico `WowCallCreatorListener` por ADR-073.
- ⬜ Sprint 8.B.11 documentado como deuda futura: auto-asignación obligatoria de tickets sin agente al crearse/escalarse (algoritmo round-robin balanceado por carga, plan canónico en ADR-074 §"Reglas canónicas").

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `tasks` | Tareas internas del equipo | `assigned_to` puede ser null (sin asignar). `due_date` opcional. `status`: `pending`, `in_progress`, `completed`, `cancelled`. `reason` texto libre <=100 (Sprint 8 Fase B.7 — ADR-073). |
| `task_tags` | Catálogo de etiquetas extensibles asignables a tareas (Sprint 8 Fase B.7 — ADR-073) | `slug` único kebab-case. `label` mostrable. `color` hex opcional. Crear/borrar requiere `Manage.TaskTag`. |
| `task_tag_assignments` | M2M Task ↔ TaskTag (Sprint 8 Fase B.7 — ADR-073) | PK compuesta `(task_id, tag_id)`. Cascada FK borra assignments al eliminar task o tag. |

> **Sprint 8 Fase B.10 — ADR-074 ticket↔task bridge** (2026-04-30): el enum `TaskType` añade el valor `support_ticket`. Tareas creadas automáticamente al asignar un ticket de soporte — siempre tienen `conversation_id` poblado. El cierre canónico de ese tipo de tarea pasa por `TaskCompletionModal` modo bridge (selector resolve/close + nota interna obligatoria) y delega en `SupportService.updateConversation` para notificar al cliente — sin duplicar emails. Ver detalles + 12 edge cases doctrinales en [ADR-074 §"Edge cases"](../../10-decisions/adr-074-ticket-task-bridge.md#edge-cases).

> El enum `TaskType` se mantiene cerrado y representa **qué bloque/automatización activa la tarea**, no la intención humana. El POR QUÉ humano vive en `reason` (libre) + `tags` (extensibles). Para añadir un contexto operativo nuevo (ej. "renovación hosting") se crea un tag desde `/admin/task-tags`, NO un valor de enum nuevo. Ver [ADR-073](../../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md).

---

## 4. Modelos foráneos accedidos

| Tabla | Módulo dueño | Tipo | Razón | Estado |
|-------|--------------|------|-------|--------|
| `users` | auth | lectura (3 referencias: assignee, creator, client) + validación rol/estado al asignar | Resolver nombres y emails al devolver tareas con `INCLUDE_RELATIONS`. Validar que `assigned_to` existe + status=`active` + rol asignable (helper `assertAssignableUser` en `tasks.service.ts`). | ✅ Deuda A4 cerrada en P0.1 (2026-04-26). |
| `notifications` | notifications | escritura (insert) | Crear notificación interna al agente cuando se le asigna tarea (vía `tasks-email.listener`). | ✅ Lectura/escritura legítima (cross-módulo notifications es intencional, listener vive en tasks). |
| `services` | billing | lectura | `service_id` opcional para vincular tarea a un servicio del cliente | ✅ Lectura legítima (contexto opcional) |

---

## 5. API REST expuesta

Prefix: `/api/v1/tasks`. JWT auth en todos.

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `POST` | `/tasks` | Crear tarea | `Create.Task` |
| `GET` | `/admin/task-tags` | Listar tags disponibles (catálogo) — Sprint 8 Fase B.7 / ADR-073 | `Read.TaskTag` |
| `POST` | `/admin/task-tags` | Crear tag (slug auto-generado del label si se omite) | `Manage.TaskTag` |
| `DELETE` | `/admin/task-tags/:id` | Eliminar tag (cascada borra assignments) | `Manage.TaskTag` |
| `GET` | `/tasks` | Listar (paginated, filtros por status, priority, assigned_to, client_id, service_id) | `Read.Task` + role filter |
| `GET` | `/tasks/stats` | Contadores por estado (pendientes, hoy, semana) | `Read.Task` |
| `GET` | `/tasks/:id` | Detalle | `Read.Task` |
| `PATCH` | `/tasks/:id` | Actualizar (campos editables, ownership según rol) | `Update.Task` |
| `PATCH` | `/tasks/:id/complete` | Marcar como completada con notas (custom_work / wow_call) | `Update.Task` |
| `GET` | `/tasks/:id/checklist` | Sprint 8 Fase B.5 — items + completions de la task (cruzados con `service_checklist_items` snapshot o fallback `product_checklist_items`) | `Read.Task` |
| `POST` | `/tasks/:id/checklist/complete` | Sprint 8 Fase B.5 — marcar item como completado (idempotente upsert) | `Update.Task` |
| `POST` | `/tasks/:id/maintenance/log` | Sprint 8 Fase B.5 — flujo "Completar y notificar" maintenance: valida required (EC-T8-01) + crea `maintenance_log` + emite `maintenance.completed` (transacción atómica) | `Update.Task` |
| `GET` | `/tasks/:id/notes` | Sprint 8 Fase B.9 — listar notas internas (`ClientNote category=technical` filtradas por `task_id`) con autor enriquecido | `Read.Task` |
| `POST` | `/tasks/:id/notes` | Sprint 8 Fase B.9 — crear nota interna inline durante la ejecución de la tarea (persiste inmediatamente, no se acumula en estado del cliente) | `Update.Task` |
| `DELETE` | `/tasks/:id` | Eliminar tarea | `Delete.Task` |
| `POST` | `/admin/tasks/cron/:name` | Sprint 8 Fase C — disparar manualmente uno de los 3 crons (`overdue` / `unassigned-overdue` / `maintenance-critical`) para smoke testing, E2E, o recovery operativo cuando el cron real (BullMQ scheduled) tuvo un incidente | `Manage.Job` (sólo superadmin — disparar re-ejecuta side effects) |

> **Data isolation por rol:** los agentes (`agent_*`) solo ven tareas asignadas a sí mismos o sin asignar. `superadmin` y `agent_full` ven todas. Aplicado en service (no solo CASL).

---

## 6. WebSocket gateway

N/A — tasks no tiene gateway. Las actualizaciones se ven al refrescar la página.

> **Mejora futura:** WebSocket podría notificar a agentes en tiempo real cuando se les asigna una tarea. Hoy se hace con polling implícito al navegar.

---

## 7. Eventos emitidos

| Evento | Cuándo | Outbox | Estado |
|--------|--------|--------|--------|
| `task.created` | Tras `create()` exitoso | ❌ | 🟡 Huérfano (audit futuro) |
| `task.assigned` | Tras `create()` o `update()` con cambio de `assigned_to` | ❌ | ✅ Consumido por `tasks-email.listener` (email + notificación interna al agente). |
| `task.completed` | Tras `update({status: completed})`, `complete()` o `MaintenanceLogService.recordCompletion()` | ❌ | ✅ Consumido por `task-completed.listener` (Sprint 8 Fase B.9) — notifica al cliente vía email + campana SI `clientNotes` poblado y tipo NO es maintenance (esos los cubre `MaintenanceCompletedListener` con plantilla específica). |
| `task.overdue` | Sprint 8 Fase C (2026-05-01) — `TasksOverdueService.run()` (cron BullMQ `tasks-overdue` `0 2 * * *` UTC) cuando una tarea con asignado supera `tasks.overdue_to_failure_days` desde `due_date`. La tarea queda en `not_completed_in_time` (terminal). | ❌ — operativo (no de negocio) | ✅ Consumido por `TasksOverdueListener` → `NotificationsService.dispatchToUser` al agente (email + campana). |
| `task.unassigned_overdue` | Sprint 8 Fase C (2026-05-01) + [ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) — `TasksUnassignedOverdueService.run()` (cron BullMQ `tasks-unassigned-overdue` `0 9 * * *` UTC) cuando ≥1 tarea en cola pública supera SLA por tipo. Resumen agregado, no 1 emit por tarea. | ❌ — operativo | ✅ Consumido por `TasksUnassignedOverdueListener` → `NotificationsService.dispatchToSuperadmins`. |
| `maintenance.critical` | Sprint 8 Fase C (2026-05-01) — `MaintenanceCriticalService.run()` (cron BullMQ `maintenance-critical` `0 8 * * *` UTC) cuando ≥1 servicio activo con `service_checklist_items` lleva más de `support.maintenance_critical_threshold_days` sin `maintenance_log`. | ❌ — operativo | ✅ Consumido por `MaintenanceCriticalListener` → `NotificationsService.dispatchToSuperadmins`. Degradación elegante: total=0 mientras Fase D no introduzca service_checklist_items. |
| `maintenance.completed` | Tras `MaintenanceLogService.recordCompletion()` post-commit (Sprint 8 Fase B.5) | ❌ — pendiente Outbox Sprint P-DEPLOY.4 | ✅ Consumido por `MaintenanceCompletedListener` → `NotificationsService` (email + campana cliente). |

> **Estado P0.1 (2026-04-26):** `task.assigned` ya tiene listener (`tasks-email.listener.ts`). Los otros dos siguen huérfanos a la espera del módulo `audit` (Sprint 9 P1.1).

---

## 8. Eventos consumidos

| Evento | Listener | Acción | Sprint |
|---|---|---|---|
| `conversation.assigned` | `SupportTicketTaskCreatorListener.handle` | Crea o reasigna `Task(type=support_ticket)` vinculada al ticket. Idempotente: si la task activa ya existe con mismo agente, no hace nada. | Sprint 8 Fase B.10 (ADR-074) |
| `conversation.unassigned` | `SupportTicketTaskCreatorListener.handleUnassigned` | Cancela la task bridge activa con flag `skipTicketRelease` para evitar ciclo. | Sprint 8 Fase B.10.fix2 (ADR-074 EC#8) |

> **Propuesta futura:** consumir `service.suspended` para crear automáticamente una tarea técnica al equipo cuando se suspende un servicio. Hoy se hace manualmente.

---

## 9. Servicios consumidos cross-módulo

| Service | Método | Razón | Sprint |
|---|---|---|---|
| `SupportService` | `updateConversation(id, {status, resolution_note} \| {assigned_agent_id: null}, actorId)` | Bridge ticket↔task: cuando una task con `conversation_id` se completa, delega en support para cerrar/resolver el ticket vinculado y emitir notificación canónica al cliente. Cuando se cancela, libera el ticket. Excepción documentada de R1 (módulos no se llaman) — formalizada en [ADR-074 §Decisión](../../10-decisions/adr-074-ticket-task-bridge.md). | Sprint 8 Fase B.10 |

---

## 10. CASL — Permisos

### Subjects gestionados

| Subject | Descripción |
|---------|-------------|
| `Subject.Task` | Tareas internas |
| `Subject.TaskTag` | Etiquetas extensibles del catálogo (Sprint 8 Fase B.7 — ADR-073) |
| `Subject.Maintenance` | (futuro) tareas de mantenimiento programado |

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Task` | manage | manage | manage | manage | — | — |
| `TaskTag` | manage | manage | read+list | read+list | — | — |
| `Maintenance` | manage | manage | manage | manage | — | — |

> **TaskTag** (ADR-073): crear/borrar es exclusivo de `superadmin` + `agent_full` para evitar proliferación descontrolada. Los demás agentes pueden leer la lista (necesaria para asignar tags al crear tareas) pero no editar el catálogo.

> **Importante:** clientes y partners NO ven tareas. Es 100% herramienta interna.

> **Filtros adicionales en service** (no solo CASL):
> - Agentes ven solo sus tareas asignadas + sin asignar
> - Admin (`superadmin`, `agent_full`) ven todas

---

## 11. Settings consumidos

| Setting | Default | Consumidor |
|---------|---------|------------|
| `tasks.overdue_to_failure_days` | 7 | `TasksOverdueService.run()` (Sprint 8 Fase C) |
| `tasks.unassigned_sla_hours.contact_client` | 24 | `TasksUnassignedOverdueService.run()` (ADR-072 §4) |
| `tasks.unassigned_sla_hours.maintenance` | 12 | Igual |
| `tasks.unassigned_sla_hours.maintenance_management` | 12 | Igual |
| `tasks.unassigned_sla_hours.custom_work` | 48 | Igual |
| `tasks.unassigned_sla_hours.support_setup` | 4 | Igual (alta prioridad) |
| `tasks.unassigned_sla_hours.default` | 24 | Fallback global |
| `support.maintenance_critical_threshold_days` | 60 | `MaintenanceCriticalService.run()` (Sprint 8 Fase C) |

> **Candidatos futuros:**
> - `tasks.default_priority` — prioridad default al crear
> - `tasks.notification_lead_hours` — anticipación de notificación de tareas con `due_date`

---

## 12. Emails enviados

| Trigger | Destinatario | Plantilla | Notas |
|---------|--------------|-----------|-------|
| `task.assigned` | Agente asignado (`users.email`) | inline en `tasks-email.listener.ts` | Subject: `Nueva tarea asignada: <título>`. Incluye CTA al detalle de la tarea. |

> **Estado:** vivo desde P0.1 (2026-04-26). Emisión vía `tasks-email.listener` consumiendo evento `task.assigned`.

---

## 13. Jobs / cron

Sprint 8 Fase C (2026-05-01) introdujo 3 colas BullMQ scheduled con leader election natural via Redis (ADR-063 + ADR-064). Detalle completo en [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md).

| Cola | Schedule | Service | Qué hace | Eventos emitidos |
|------|----------|---------|----------|------------------|
| `tasks-overdue` | `0 2 * * *` UTC | `TasksOverdueService` | Marca tareas con asignado vencidas como `not_completed_in_time` (terminal) | `task.overdue` (1 por tarea) |
| `tasks-unassigned-overdue` | `0 9 * * *` UTC | `TasksUnassignedOverdueService` | Cola pública fuera de SLA por tipo (ADR-072) | `task.unassigned_overdue` (resumen agregado) |
| `maintenance-critical` | `0 8 * * *` UTC | `MaintenanceCriticalService` | Servicios sin maintenance_log >threshold | `maintenance.critical` (resumen agregado) |

Endpoint `POST /api/v1/admin/tasks/cron/:name` permite disparar manualmente cada cron (para smoke + E2E + recovery operativo). Restringido a `Manage.Job` (superadmin).

> **Candidatos futuros:** cron diario que envíe digest a cada agente con sus tareas del día / próximas a vencer.

---

## 14. Invariantes

- **TASK-INV-1:** El `created_by` es inmutable tras creación. Trazabilidad de origen.
- **TASK-INV-2:** El `status` solo transiciona en orden válido: `pending → in_progress → completed`, o cualquier estado no-terminal → `cancelled`. **No hay vuelta atrás desde `completed`, `cancelled` o `not_completed_in_time`** (estados terminales). Refuerzo runtime cerrado en Sprint 8 Fase B.1.bis (2026-04-29) — ver §Edge cases EC-T8-19.
- **TASK-INV-3:** Una tarea puede no tener `client_id` ni `service_id` (tareas de admin internas, ej: revisar logs). Estas son visibles solo a roles internos.
- **TASK-INV-4:** Notas: `client_note` es texto inline rápido del agente; las notas estructuradas (timeline cliente) van a `client_notes` con `task_id` FK ([decisión Sprint 8 §3.4](../../60-roadmap/current.md), [ADR-038](../../10-decisions/adr-038-notas-estructuradas-cliente.md)). Mantener separación clara en UI.
- **TASK-INV-5:** Una tarea puede nacer sin `assigned_to` ([ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md), refina ADR-041 §"🚪 Cierra"). La cola "Sin asignar" funciona como buffer temporal; cualquier staff con `Manage.Task` puede auto-asignársela. SLA por tipo configurable + cron `tasks-unassigned-overdue` aplica presión operativa (Fase C extendida — pendiente).

---

## 14b. Edge cases — referencia canónica

Lista canónica de edge cases del módulo vive en [`docs/60-roadmap/current.md` §6 Sprint 8](../../60-roadmap/current.md) — actualmente cubre **EC-T8-01..46 + EC-IMPL-01..03**. Aquí solo el resumen para navegación rápida:

| Bloque | Rango | Estado dominante |
|--------|-------|------------------|
| Originales del plan canónico (Fase A/B/C/D pendientes) | EC-T8-01..11 | ⬜ planificados |
| Validaciones de campo (Sprint 8 Fase B) | EC-T8-12..17 | ✅ cerrados (2026-04-29) |
| Transiciones de estado y autorización | EC-T8-18..24 | ✅ EC-T8-19/20/21/22 cerrados (B.1.bis); resto planificado |
| Eventos / listeners externos | EC-T8-25..30 | ⬜ Sprint 11 + Fase C |
| CASL fino | EC-T8-31..33 | 🟡 UI restringe, backend permitivo (Opción A ADR-067) |
| Concurrencia / archivado | EC-T8-34..35 | ⬜ Sprint 13 |
| Módulos futuros | EC-T8-36..46 | ⬜ Sprints 11/12.5/13/19/22/25 |
| Implementados sin ID previo | EC-IMPL-01..03 | ✅ vivos en código |

**Cobertura tests E2E**:
- [`tests/e2e/tasks.spec.ts`](../../../tests/e2e/tasks.spec.ts) — flujo P0.1 (crear/asignar/email/completar/validación FK).
- [`tests/e2e/tasks-edge-cases.spec.ts`](../../../tests/e2e/tasks-edge-cases.spec.ts) — Sprint 8 Fase B.1.bis: 6 specs cubriendo EC-T8-19/20/21/22 (a/b/c).
- [`tests/e2e/admin-users-list.spec.ts`](../../../tests/e2e/admin-users-list.spec.ts) — endpoint listar agentes para selector NewTaskModal (Sprint 8 Fase A).

**Cobertura tests unit (Sprint 8 Fase B EC-T8-12..17)**:
- [`backend/src/modules/tasks/dto/task.dto.spec.ts`](../../../backend/src/modules/tasks/dto/task.dto.spec.ts) — 19 specs declarativos: EC-T8-14 (`@ValidateIf` recurrence), EC-T8-15 (`BILLING_MONTH_REGEX`), EC-T8-16 (`@MaxLength(50000)`); + B.7 ADR-073 (`reason` MaxLength 100, `tag_ids` ArrayMaxSize 10 + IsUUID each).
- [`backend/src/modules/tasks/tasks.service.spec.ts`](../../../backend/src/modules/tasks/tasks.service.spec.ts) — 9 specs: EC-T8-12 (`due_date` pasada + bypass `allowOverdue`), EC-T8-13 (`service.user_id === client_id`).
- [`backend/src/modules/tasks/task-tags.service.spec.ts`](../../../backend/src/modules/tasks/task-tags.service.spec.ts) — 6 specs (Sprint 8 Fase B.7): list orderBy, slug auto-generado kebab-case, slug explícito, BadRequest si label sólo símbolos, P2002 → 409, NotFound en remove.
- [`backend/src/modules/notifications/notification-templates.security.spec.ts`](../../../backend/src/modules/notifications/notification-templates.security.spec.ts) — 3 specs guard EC-T8-17: ningún `{{{var}}}` ni `{{& var}}` en plantillas seedeadas.

**Cobertura tests E2E nuevos (Sprint 8 Fase B.7)**:
- [`tests/e2e/tasks-reason-and-tags.spec.ts`](../../../tests/e2e/tasks-reason-and-tags.spec.ts) — 7 specs: catálogo seedeado, crear tag con slug auto, crear task con `reason+tag_ids`, update reason='' → null, update tag_ids=[] desetiqueta, tag_id inexistente → 400, agent_billing puede LEER tags pero NO crear/borrar.

---

## 15. Decisiones relacionadas

> Migrar a ADRs en F2.

- `DECISIONS.md` §10 — Sistema de tareas internas
- `DECISIONS.md` §44 — Sistema de Proyectos (relacionado, futuro Sprint 22)

---

## 16. Excepciones documentadas

- **R1 (módulos no se llaman):** ✅ cumplido. Lecturas a `users` y `services` legítimas (contexto).
- **R8 (Outbox):** ⚠️ los 3 eventos no usan outbox. Riesgo bajo (tareas no son críticas vs facturas).
- **R15:** ⚠️ `tasks.service.ts` ~280 líneas, cerca del límite 300. Candidato a refactor (sub-services) si crece más.
- **Lint deuda:** 2 errores `no-unsafe-enum-comparison` en líneas 161 y 170. Saltados en F0.6 por estar en Sprint 8 WIP. Resolver al cerrar Sprint 8.

---

## 17. Pendiente / deuda técnica

- [x] ~~**CRÍTICO Sprint 8 close:** listener para `task.assigned` → email al agente asignado~~ ✅ P0.1 (2026-04-26)
- [x] ~~Validar que `assigned_to` existe en `users` antes de aceptar (deuda A4)~~ ✅ P0.1 (2026-04-26)
- [x] ~~Tests E2E del flujo: crear tarea → asignar → completar~~ ✅ P0.1 (`tests/e2e/tasks.spec.ts`)
- [x] ~~Resolver los 2 `no-unsafe-enum-comparison` (Sprint 8 WIP excepción de F0.6)~~ ✅ P0.1
- [x] ~~Schema Fase A: `task_checklist_completions`, `maintenance_logs`, `service_checklist_items`, `client_notes.task_id` FK~~ ✅ Sprint 8 Fase A (2026-04-29)
- [x] ~~Endpoint `GET /admin/users` para selector de agentes en NewTaskModal~~ ✅ Sprint 8 Fase A.3
- [x] ~~Bug portal: `action_url` apuntaba a `/dashboard/tasks/...` cuando ADR-066 + Sprint 9.6 DC.7 movieron tasks a `/admin/tasks/*`~~ ✅ Sprint 8 Fase B.1.bis (2026-04-29)
- [x] ~~Plantilla notification mostraba enums crudos (`custom_work` en vez de "Personalizada")~~ ✅ Sprint 8 Fase B.1.bis — listener inyecta `task_type_label` / `task_priority_label`
- [x] ~~`tasks.complete()` no vinculaba `ClientNote.task_id` ni usaba category=`solution`~~ ✅ Sprint 8 Fase B.1.bis
- [x] ~~DetailPage: emoticonos `📋👤✅` violan tono de marca D1 + CTA "Ver perfil →" duplicaba el enlace del nombre del cliente~~ ✅ Sprint 8 Fase B.1.bis
- [x] ~~Tablero `/admin/tasks` sin segmentación scope (Mis/Sin asignar/Todas)~~ ✅ Sprint 8 Fase B.1.bis
- [x] ~~Default tab "Pendientes" mostraba todas las tareas (statusFilter no inicializado)~~ ✅ Sprint 8 Fase B.1.bis
- [x] ~~`getStats` no respetaba scope → contadores mentían en vista segmentada~~ ✅ Sprint 8 Fase B.1.bis
- [x] ~~Validación explícita de transiciones de `status` (TASK-INV-2 — EC-T8-19/20/21)~~ ✅ Sprint 8 Fase B.1.bis
- [x] ~~Auto-asignación desde cola pública (EC-T8-22 — alineado con [ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md))~~ ✅ Sprint 8 Fase B.1.bis
- [x] ~~**Sprint 8 Fase B.2:** bloques adaptativos por TaskType (wow_call con datos del cliente + plan, maintenance con placeholder checklist, project_task con placeholder Sprint 22) + sidebar Servicio + helpers formatAmount/translateCycle/translateServiceStatus~~ ✅ Sprint 8 Fase B.2 (2026-04-29)
- [x] ~~**Sprint 8 Fase B.4:** ClientNotesTab con link "Tarea origen" + título + badge tipo. Backend `listStructuredNotes` enriquecido con `task_title`/`task_type` (query batch sin N+1)~~ ✅ Sprint 8 Fase B.4 (2026-04-29)
- [x] ~~**Sprint 8 Fase B.5:** ChecklistCompletionService (upsert idempotente) + MaintenanceLogService (transacción atómica) + 3 endpoints (GET checklist, POST checklist/complete, POST maintenance/log). Listener `MaintenanceCompletedListener` + plantillas seed `maintenance.completed`. UI checklist completable con progreso N/M. Cierra EC-T8-01 (required missing → 400 con `missing_required`). Fix oportunista: `GlobalExceptionFilter` preserva metadata adicional del body cuando HttpException se construye con objeto~~ ✅ Sprint 8 Fase B.5 (2026-04-29)
- [x] ~~**Sprint 8 Fase B.3:** DS compliance — fix masivo tokens fantasma `--color-*` → canónicos (`--text-*`, `--brand`, `--border`, `--danger`, `--warning`, `--success`, `--surface-*`) en `types.ts` + `tasks.module.css` + `taskDetail.module.css` (38 ocurrencias). Eliminación 4 inline styles ad-hoc → clases CSS module. font-weight numéricos → tokens. Suite 88/88 sin regresión~~ ✅ Sprint 8 Fase B.3 (2026-04-29)
- [x] ~~**Sprint 8 Fase B EC-T8-12..17:** validaciones defensivas — `assertDueDateNotInPast` (con bypass `allowOverdue` para cron Fase D) + `assertServiceBelongsToClient` en `TasksService` · `is_recurring↔recurrence_day` con `@ValidateIf` · regex `BILLING_MONTH_REGEX` aplicada a `billing_month` · `@MaxLength(50000)` en `description` · auditoría plantillas Handlebars (0 patrones unsafe) + test guard `notification-templates.security.spec.ts` · fix oportunista password seed E2E (`AeliumDev2026!`)~~ ✅ Sprint 8 Fase B (2026-04-29) — 60/60 unit, 88/88 E2E.
- [x] ~~**Sprint 8 Fase B.7 — ADR-073: tipos flexibles (reason + tags):** rename enum `wow_call` → `contact_client` (preserva contexto histórico via `reason='Bienvenida primer servicio'` en migration data) · columna `tasks.reason` (texto libre <=100) · catálogo `task_tags` + tabla pivote `task_tag_assignments` m2m explícita · 3 endpoints `/admin/task-tags` (list / create / delete) con CASL `Subject.TaskTag` · seed canónico `sample-task-tags.ts` (5 tags: bienvenida, renovación, incidencia, migración, cortesía) · bloque adaptativo "Datos del cliente + plan" generalizado a cualquier tarea con `service_id` (no exclusivo del tipo) · `NewTaskModal` con input "Motivo" + multi-toggle de tags + crear inline · chips en tablero y detail · `frontend/app/lib/types.ts` SINCRONIZADO con backend (antes divergía en `TaskPriority='urgent'`/`'critical'`, falta `not_completed_in_time`, sobraban `follow_up`/`other`).~~ ✅ Sprint 8 Fase B.7 (2026-04-29) — 73/73 unit (60 previos + 13 nuevos), 95/95 E2E (88 previos + 7 nuevos).
- [x] ~~**Sprint 8 Fase B.8 — header detail alineado con ConversationHeader:** sin duplicación badge/selector (status/priority muestran UN SOLO control según contexto) · botón "Iniciar" contextual · tipografía + tokens DS idénticos a `_shared/support/conversation/conversationDetail.module.css` · fix oportunista cleanup task_tags en spec B.7 (DELETE residuos NOT IN canónicos)~~ ✅ Sprint 8 Fase B.8 (2026-04-30, `a2e5cc1`) — 95/95 E2E sin regresión.
- [x] ~~**Sprint 8 Fase B.9 — refactor notas + modal completar + listener task.completed:** notas internas card persistente con botón "+ Añadir nota" (POST `/tasks/:id/notes` inmediato, `ClientNote category=technical`) · `TaskCompletionModal` canónico replica `DetailResolutionModal` patrón · listener `TaskCompletedListener` notifica al cliente vía email + campana cuando hay `clientNotes` y tipo no-maintenance · plantillas seed `task.completed` (email + internal) · `Completar`/`Cancelar` trasladados al header · schema FK física `client_notes.author` ON DELETE RESTRICT~~ ✅ Sprint 8 Fase B.9 (2026-04-30, `b6d6d20`) — 80/80 unit (73 + 7 nuevos), 98/98 E2E (95 + 3 nuevos).
- [x] ~~**Sprint 8 Fase B.10 — ADR-074 ticket↔task bridge:** nuevo enum `TaskType.support_ticket` · `SupportTicketTaskCreatorListener` consume `conversation.assigned` → crea/reasigna task bridge · `TasksService.complete` dual path (simple B.9 / bridge B.10) delega en `SupportService` cuando hay `conversation_id` · `TaskCompletionModal` modo bridge con selector resolve/close + nota interna obligatoria · `ConversationHeader` oculta botones legacy + muestra pill "Trabajando en tarea →" cuando hay task vinculada · sidebar "Ticket origen" en task detail · filtro `tasksApi.list({conversation_id})` · CompleteTaskDto extendido con `ticket_action` + `resolution_note`~~ ✅ Sprint 8 Fase B.10 (2026-04-30, `c204f08`) — 86/86 unit (80 + 6 nuevos `SupportTicketTaskCreatorListener`), 103/103 E2E (98 + 5 nuevos `tasks-ticket-bridge.spec.ts`).
- [x] ~~**Sprint 8 Fase B.10.fix — UI selector asignación + cancel libera ticket:** Select de agentes en `ConversationSidebar` admin con lazy fetch via `usersApi.listAgents` + handler `useConversationDetail.handleAssignAgent` (8bffaf4) · cancelar task bridge libera ticket (`assigned_agent_id=null`) + flag `__ticket_released` para toast contextual + confirm modal con copy explícito sobre las 4 consecuencias (2f5e2b8) · `UpdateConversationDto.assigned_agent_id` admite `null` para desasignación~~ ✅ Sprint 8 Fase B.10.fix (2026-04-30) — 104/104 E2E (103 + 1 nuevo B.10.6).
- [x] ~~**Sprint 8 Fase B.10.fix2 — 3 EC críticos del bridge:** EC#3 reabrir ticket re-emite `conversation.assigned` → listener crea nueva task · EC#7 `createTicketForClient` y `escalateToTicket` emiten `conversation.assigned` post-creación si nace asignado · EC#8 `support-message.service` emite `conversation.unassigned` + handler nuevo en listener cancela task con flag `skipTicketRelease` para evitar ciclo · ADR-074 §"Edge cases" con 12 casos doctrinales (4 cerrados con SHA + 8 documentados sin fix)~~ ✅ Sprint 8 Fase B.10.fix2 (2026-04-30, `7107de1`) — 107/107 E2E (104 + 3 nuevos B.10.7/8/9).
- [x] ~~**Sprint 8 Fase C:** listeners `task.overdue`, `maintenance.critical` + cron `not_completed_in_time` + cron `tasks-unassigned-overdue` (ADR-072) + plantillas seed faltantes + settings nuevos. Migrar a BullMQ con leader election (ADR-056).~~ ✅ **Cerrado 2026-05-01** — 3 colas BullMQ scheduled con cron pattern UTC, 3 services (testables sin Redis), 3 listeners delegando en `NotificationsService`, 6 plantillas seed (EC-T8-30 cerrado, guard EC-T8-17 OK), 8 settings nuevos, endpoint admin trigger manual, **21 unit tests + 5 E2E (suite full 112/112 verde sin regresión)**. `ContactClientTaskListener` (ex-`WowCallCreatorListener` por ADR-073) sigue diferido a Sprint 11 Provisioning.
- [ ] **Sprint 8 Fase D (pendiente):** Support Inside ([ADR-061](../../10-decisions/adr-061-support-inside-tier-cuenta-ux.md))
- [ ] **Sprint 8 Fase E (pendiente):** docs `features/tasks/admin.md` + `agent.md`
- [ ] **Sprint 9 Fase E pendiente:** listener `audit-tasks` que invoque `AuditService.logChange(actor, 'task', before, after)` para reasignaciones/transiciones (EC-T8-44)
- [ ] **P-DEPLOY.4** ([ADR-069](../../10-decisions/adr-069-estrategia-deploy-diferido.md)): extender Outbox a `task.*` events (EC-T8-28)
- [ ] **Sprint 11 (pendiente):** listeners `tasks-on-service-cancelled` / `service-suspended` / `provisioning-on-task-completed` (EC-T8-25/26/27)
- [ ] **Sprint 13 Hardening:** archivado `not_completed_in_time` >1 año + N+1 audit (EC-T8-34/35)
- [ ] Refactor preventivo R15 si `tasks.service.ts` supera 300 líneas (actual ~330 tras B.1.bis)

---

## 18. Cómo testear este módulo

### Tests E2E
Cobertura mínima cerrada en P0.1: [`tests/e2e/tasks.spec.ts`](../../../tests/e2e/tasks.spec.ts) — 3 specs:

- Admin crea tarea asignada → agente recibe email + notification → admin completa OK.
- Crear con `assigned_to` UUID inexistente devuelve 400 (validación FK).
- Crear con `assigned_to` de un usuario rol `client` devuelve 400 (validación rol).

**Pendiente Fase B/E:** flujo via UI (modal crear, drag-drop estados, completar con nota), cuando los selectores del Design System estén estables.

### Tests unitarios
Pendiente. Críticos:
- Validación de transiciones de `status`
- Filtro por rol (agentes solo ven las suyas + sin asignar)
- Emisión correcta de eventos al crear/asignar/completar

### Smoke test manual
1. Crear tarea con cliente y servicio vinculados → verificar visible en listado
2. Asignar a otro agente → reload → comprobar que aparece en su panel
3. Cambiar prioridad → verificar reordenamiento (priority > due_date > created_at)
4. Marcar como completada con nota → status update + nota persistida
5. Como agente: verificar que no ves tareas asignadas a otros agentes
