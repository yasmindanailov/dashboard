# Tasks — Guía de administración

> 📜 **DOCTRINA POST-ADR-079 (2026-05-02)** — Esta guía describe el sistema VIGENTE tras Sprint 8 (creación manual + 7 tipos + tags + reason). **Sprint 16 (planificado, ADR-079 mergeado)** lo refactoriza profundamente: tasks pasa a ser bridge unidireccional read-only desde 5 triggers automáticos cerrados; sin creación manual; card simple con accionadores inline; widget en sidebar + dashboard. Cuando Sprint 16 cierre, esta guía se reescribe completa. Mientras tanto, lo descrito aquí refleja el código actual.

> Módulo: `tasks`
> Sprints: 8 (P0.1 + Fase A/B/C/D + sub-fase D.12) · refactor canónico Sprint 16 (planificado — ver [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md))
> Última actualización: 2026-05-02 (banner ADR-079)
> Documento canónico de operativa diaria del equipo Aelium sobre el sistema interno de tareas.

---

## 1. Resumen

El módulo Tasks es la **herramienta interna del equipo Aelium**. NO es visible al cliente. Centraliza todo el trabajo del equipo en un único tablero: tareas técnicas, gestiones administrativas, mantenimientos programados, llamadas de seguimiento al cliente, tickets de soporte vinculados.

**Cuatro principios canónicos:**

1. **Tipos cerrados, motivos abiertos** ([ADR-073](../../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md)) — el `TaskType` (enum) declara qué bloque/automatización activa la tarea; el porqué humano va en `reason` (texto libre <=100 caracteres) + `tags` extensibles del catálogo `/admin/task-tags`.
2. **Cola pública para tareas sin asignar** ([ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md)) — cualquier staff con `Manage.Task` puede auto-asignarse una tarea de la cola; SLA por tipo + cron diario presiona la cola.
3. **Bridge ticket↔task** ([ADR-074](../../10-decisions/adr-074-ticket-task-bridge.md)) — al asignar un ticket de soporte se crea automáticamente una `Task(type=support_ticket)` con `conversation_id` poblado. El cierre canónico pasa por la tarea (modo bridge del modal) y delega en `SupportService` para resolver/cerrar el ticket.
4. **Notas estructuradas con FK** ([ADR-038](../../10-decisions/adr-038-notas-estructuradas-cliente.md)) — cada nota cliente persiste con `task_id` para que la timeline cliente trace el origen.

---

## 2. Arquitectura

```
TasksService                    → CRUD + transiciones de estado + auto-asignación
TasksController                 → Endpoints REST staff
TaskTagsService                 → Catálogo extensible (Sprint 8 Fase B.7 — ADR-073)
ChecklistCompletionService      → Items de checklist (idempotente upsert)
MaintenanceLogService           → Cierre maintenance con transacción atómica
TasksOverdueService             → Cron diario 02:00 UTC (BullMQ)
TasksUnassignedOverdueService   → Cron diario 09:00 UTC (BullMQ)
MaintenanceCriticalService      → Cron diario 08:00 UTC (BullMQ)
SupportTicketTaskCreatorListener → Bridge ticket↔task
TaskCompletedListener           → Notifica cliente si hay clientNotes y tipo no-maintenance
MaintenanceCompletedListener    → Notifica cliente con resumen del mantenimiento mensual
```

Los tres crons usan el patrón canónico ADR-063 + ADR-064 (leader election natural via Redis): **service testeable + processor delgado + DLQ + listener que delega en `NotificationsService`**.

---

## 3. Tipos de tarea (`TaskType`)

| Tipo | Cuándo nace | Quién lo crea |
|------|-------------|---------------|
| `contact_client` | Llamada o seguimiento programado al cliente (renombrado desde el histórico `wow_call` en Fase B.7) | Manual (staff) |
| `maintenance` | Tarea genérica de mantenimiento programado | Manual (staff) |
| `maintenance_management` | Mantenimiento mensual gestionado por Support Inside | Cron `maintenance-monthly` (Fase D.7) |
| `project_task` | Tarea de proyecto Wdify (placeholder Sprint 22) | Manual |
| `custom_work` | Trabajo bajo demanda fuera del catálogo | Manual |
| `support_setup` | Alta/configuración inicial de un servicio (provisioner manual) | Sprint 11 Provisioning |
| `support_ticket` | Ticket de soporte asignado a un agente (bridge ADR-074) | Listener `SupportTicketTaskCreatorListener` |

> Para añadir un contexto operativo nuevo (ej. "renovación hosting") **NO se añade un valor de enum**: se crea un tag desde `/admin/task-tags` y se etiqueta la tarea. El enum solo cambia con migración + ADR explícito.

---

## 4. Estados (`TaskStatus`)

```
pending → in_progress → completed
                      → cancelled
                      → not_completed_in_time   (terminal — cron tasks-overdue)
pending → cancelled
pending → not_completed_in_time
```

**TASK-INV-2** (canónica): no hay vuelta atrás desde `completed`, `cancelled` o `not_completed_in_time`. Ediciones de `priority`, `due_date` o `assigned_to` sobre tareas terminales devuelven 400 (Sprint 8 Fase B.1.bis cerró EC-T8-19/20/21).

**Excepción cola pública:** cualquier staff puede tomar una tarea con `assigned_to=null` autoasignándose; no requiere ser admin pleno (ADR-072 + EC-T8-22).

---

## 5. Tablero `/admin/tasks` — segmentación scope

El tablero está partido en tres scopes mutuamente excluyentes:

| Tab | Filtro | Uso típico |
|-----|--------|------------|
| **Mis** | `assigned_to = current_user.id` | El día a día del agente |
| **Sin asignar** | `assigned_to IS NULL` | Cola pública: el agente que tenga capacidad la coge |
| **Todas** | sin filtro | Visión transversal (admin + agent_full) |

Cada scope tiene su propio `getStats` honesto (los contadores no mienten al cambiar de tab — bug clásico cerrado en B.1.bis). El `statusFilter` por defecto es `pending` (el default histórico "todas" sembraba la confusión de "ver más estado del que el tab declaraba").

**Bloques adaptativos** ([Fase B.2](../../60-roadmap/current.md)): el detalle muestra UI específica por `TaskType`:

- `contact_client` + tarea con `service_id` → bloque "Datos del cliente y plan" (servicio + plan + producto + cycle + status badge).
- `maintenance` / `maintenance_management` → bloque Checklist completable con progreso N/M + items requeridos resaltados (rojo cuando faltan).
- `project_task` → placeholder con link a Sprint 22 Projects (futuro).
- `custom_work` / `support_setup` → UX simple (sin bloque adaptativo).
- `support_ticket` → sidebar "Ticket origen" + modal de cierre en modo bridge (resolve/close).

---

## 6. Crear una tarea (modal canónico)

Desde `/admin/tasks` → botón "+ Nueva tarea":

**Campos requeridos:**
- `title` (texto)
- `type` (uno de los 7 tipos)
- `priority` (`low`, `normal`, `high`, `urgent`)

**Campos opcionales:**
- `description` (markdown ligero, máx. 50.000 caracteres — EC-T8-16)
- `assigned_to` (selector de agentes; vacío = cola pública)
- `due_date` (no acepta fechas en el pasado, EC-T8-12; bypass interno `allowOverdue` reservado a crons)
- `client_id` + `service_id` (validados que `service.user_id === client_id`, EC-T8-13)
- `reason` (motivo libre <=100 caracteres — el porqué humano)
- `tag_ids` (multi-select del catálogo + crear inline; máx. 10)
- `is_recurring` + `recurrence_day` (1..31, validación cruzada `@ValidateIf`, EC-T8-14)
- `billing_month` (regex `\d{4}-(0[1-9]|1[0-2])`, EC-T8-15)

**Tras crear:** si `assigned_to` está poblado, se emite `task.assigned` y `tasks-email.listener` envía email + notificación interna al agente. Si nace sin asignar, queda en la cola pública.

---

## 7. Completar una tarea

Hay **tres caminos** según el tipo:

### 7.1 Modo simple (`custom_work`, `contact_client`, `project_task`, `support_setup`)

Botón "Completar" en el header → abre `TaskCompletionModal` modo simple → opcionalmente añade nota interna → emite `task.completed`.

Si `clientNotes` queda poblado y la tarea no es de tipo maintenance, `TaskCompletedListener` notifica al cliente vía email + campana (Sprint 8 Fase B.9).

### 7.2 Modo maintenance (`maintenance`, `maintenance_management`)

Botón "Completar y notificar" → exige que **todos los items `is_required=true` del checklist estén marcados** (EC-T8-01).

Si falta alguno: 400 con `missing_required: [{id, label, kind}]` y la UI los resalta en rojo. Si todo está OK:

1. Se persiste `maintenance_log` con resumen del trabajo.
2. Se cierra la tarea (`status=completed`).
3. Se crea automáticamente una `ClientNote` con `task_id` + `category=maintenance_summary`.
4. Se emite `maintenance.completed` → `MaintenanceCompletedListener` notifica al cliente con el resumen mensual.

Todo en una **transacción atómica** (`MaintenanceLogService.recordCompletion`).

### 7.3 Modo bridge (`support_ticket` — ADR-074)

Botón "Completar" → modal en modo bridge con:
- Selector `ticket_action`: `resolve` (deja el ticket en `resolved`) o `close` (lo cierra).
- Nota interna **obligatoria** (`resolution_note`).

Al confirmar:
1. Se cierra la task.
2. `TasksService.complete` delega en `SupportService.updateConversation` para aplicar la transición al ticket.
3. Se notifica al cliente vía la plantilla canónica de support (NO de tasks — la flag `__skipClientNotification` evita doble email).

**Cancelar una tarea bridge** libera el ticket (`assigned_agent_id=null`) y muestra toast contextual al agente. Reabrir el ticket re-emite `conversation.assigned` y crea una task nueva (EC bridge #3).

---

## 8. Notas internas

Card persistente "Notas internas" en el detalle de la tarea (Sprint 8 Fase B.9):

- Botón "+ Añadir nota" → POST inmediato a `/tasks/:id/notes` (NO se acumula en estado del cliente — persistencia atómica).
- Cada nota se guarda como `ClientNote` con `category=technical` + `task_id` FK física + `author` FK física a `users`.
- La timeline del cliente (`/admin/clients/:id` tab Notas) muestra las notas técnicas con badge "Tarea origen" + título de la task que las generó (ADR-038 + Fase B.4).

---

## 9. Tags y catálogo extensible

`/admin/task-tags` (sólo `superadmin` + `agent_full` con `Manage.TaskTag`):

| Tag seedeado | Slug | Color sugerido |
|--------------|------|----------------|
| Bienvenida | `bienvenida` | brand |
| Renovación | `renovacion` | success |
| Incidencia | `incidencia` | danger |
| Migración | `migracion` | warning |
| Cortesía | `cortesia` | neutral |

**Crear tag inline:** desde el modal de "Nueva tarea" se puede crear un tag nuevo escribiendo el label; el slug se auto-genera kebab-case. Si dos labels colisionan: 409.

`agent_billing` y `agent_support` pueden **leer** el catálogo (necesario para etiquetar al crear tareas) pero **no editarlo** (evita proliferación descontrolada).

---

## 10. Crons + endpoint admin de disparo manual

| Cola BullMQ | Schedule UTC | Servicio | Qué hace | Destinatario |
|-------------|-------------|----------|----------|--------------|
| `tasks-overdue` | `0 2 * * *` | `TasksOverdueService` | Marca tareas con asignado vencidas como `not_completed_in_time` (terminal) y emite `task.overdue` por cada una | Agente asignado |
| `tasks-unassigned-overdue` | `0 9 * * *` | `TasksUnassignedOverdueService` | Detecta tareas en cola pública fuera de SLA por tipo (ADR-072 §4); emite **resumen agregado** | Superadmin |
| `maintenance-critical` | `0 8 * * *` | `MaintenanceCriticalService` | Servicios con `service_checklist_items` lleno sin `maintenance_log` >`support.maintenance_critical_threshold_days` (default 60) | Superadmin |
| `maintenance-monthly` | `0 6 * * *` | `MaintenanceMonthlyService` (Fase D.7 + D.12.1) | Genera `Task(type=maintenance_management)` por slot Support Inside cuyo `anniversary_day = EXTRACT(DAY FROM NOW())` | — (crea tareas) |

**Endpoint admin de disparo manual** (Sprint 8 Fase C.4):

```
POST /api/v1/admin/tasks/cron/:name
:name ∈ {overdue, unassigned-overdue, maintenance-critical, maintenance-monthly}
```

Triple guard: `JwtAuthGuard + AdminOnlyGuard + Manage.Job` (sólo superadmin — disparar re-ejecuta side effects globales).

**Casos de uso:**
- Smoke testing manual antes de un release.
- Recovery operativo cuando el cron real tuvo un incidente (Redis caído, despliegue tardío, etc.).
- E2E tests deterministas en CI.

---

## 11. CASL y permisos

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Task` | manage | manage | manage | manage | — | — |
| `TaskTag` | manage | manage | read+list | read+list | — | — |
| `Job` (cron trigger) | manage | — | — | — | — | — |

> **Nota ADR-067:** la matriz CASL es Opción A (todos los staff pueden gestionar tareas). El refinamiento `agent_billing` ≠ `agent_support` se hace por filtro de UI (algunos botones se ocultan) + filtro en service (los agentes no admin pleno solo ven sus tareas + cola pública). Si en el futuro se requiere split fino real (ej. `agent_billing` no toca tareas técnicas), se crea `Subject.TaskAdmin` aparte. Sprint 13 Hardening.

---

## 12. Settings consumidos

| Setting | Default | Cuándo aplica |
|---------|---------|---------------|
| `tasks.overdue_to_failure_days` | 7 | Días tras `due_date` para que el cron marque `not_completed_in_time` |
| `tasks.unassigned_sla_hours.contact_client` | 24 | SLA cola pública por tipo |
| `tasks.unassigned_sla_hours.maintenance` | 12 | |
| `tasks.unassigned_sla_hours.maintenance_management` | 12 | |
| `tasks.unassigned_sla_hours.custom_work` | 48 | |
| `tasks.unassigned_sla_hours.support_setup` | 4 | Alta prioridad operativa |
| `tasks.unassigned_sla_hours.default` | 24 | Fallback global |
| `support.maintenance_critical_threshold_days` | 60 | Umbral crítico de mantenimiento desatendido |

Editables desde `/admin/settings` cuando Sprint 12 entregue la UI; hoy se editan en BD o vía seed.

---

## 13. Plantillas de notificación

Seedeadas en `prisma/seeds/notification-templates.ts` con guard EC-T8-17 (cero `{{{var}}}` ni `{{& var}}` — auditadas por `notification-templates.security.spec.ts`):

| Evento | Canales | Destinatario | Plantilla |
|--------|---------|--------------|-----------|
| `task.assigned` | email + internal | Agente | "Nueva tarea asignada: {{title}}" |
| `task.completed` | email + internal | Cliente (si hay clientNotes y tipo ≠ maintenance) | "Tarea completada: {{title}}" |
| `task.overdue` | email + internal | Agente | "Tarea vencida: {{title}}" |
| `task.unassigned_overdue` | email + internal | Superadmin | Resumen agregado por tipo (sólo 20 entradas + sufijo "y N más") |
| `maintenance.completed` | email + internal | Cliente | Resumen mensual del mantenimiento |
| `maintenance.critical` | email + internal | Superadmin | Resumen agregado de servicios sin maintenance_log >threshold |

Editables desde `/admin/settings/notifications/templates` (Sprint 9.5 — UX admin de notifications).

---

## 14. Eventos emitidos

| Evento | Outbox | Estado |
|--------|--------|--------|
| `task.created` | ❌ | 🟡 huérfano (audit futuro Sprint 9 Fase E) |
| `task.assigned` | ❌ | ✅ → `tasks-email.listener` |
| `task.completed` | ❌ | ✅ → `task-completed.listener` |
| `task.overdue` | ❌ operativo | ✅ → `TasksOverdueListener` |
| `task.unassigned_overdue` | ❌ operativo | ✅ → `TasksUnassignedOverdueListener` |
| `maintenance.completed` | ❌ pendiente Outbox | ✅ → `MaintenanceCompletedListener` |
| `maintenance.critical` | ❌ operativo | ✅ → `MaintenanceCriticalListener` |

> **R8 (Outbox):** los eventos task.* siguen sin Outbox. Riesgo bajo (no son críticos vs `invoice.*`). Migración formalizada como **P-DEPLOY.4** ([ADR-069](../../10-decisions/adr-069-estrategia-deploy-diferido.md)).

---

## 15. Dependencias cross-módulo

| Módulo | Dirección | Razón |
|--------|-----------|-------|
| `auth (users)` | lectura | Resolver assignee/creator/client + validar `assertAssignableUser` |
| `notifications` | escritura | Crear notificación interna al agente |
| `billing (services)` | lectura | Vincular tarea a servicio (contexto opcional) |
| `support (conversations)` | escritura via `SupportService.updateConversation` | Bridge ticket↔task (ADR-074 — excepción documentada de R1) |
| `clients (client_notes)` | escritura | Persistir notas técnicas + maintenance_log resumen |
| `support_inside` | indirecto | Cron `maintenance-monthly` consume `support_inside_slots.anniversary_day` para distribuir carga (Fase D.12.1) |

Detalle en [`docs/20-modules/_matrix.md`](../../20-modules/_matrix.md).

---

## 16. Edge cases más relevantes

Lista canónica completa (50 EC) en [`docs/60-roadmap/current.md` §6 Sprint 8](../../60-roadmap/current.md). Resumen operativo:

| ID | Caso | Estado |
|----|------|--------|
| EC-T8-01 | Maintenance se cierra sin marcar checklist requerido | ✅ Bloqueado con 400 + `missing_required` |
| EC-T8-12 | `due_date` en el pasado | ✅ Validación + bypass interno crons |
| EC-T8-19/20/21 | Reabrir/reasignar/editar prioridad de tarea cerrada | ✅ Bloqueado (TERMINAL_STATES guard) |
| EC-T8-22 | Auto-asignación cola pública | ✅ ADR-072 |
| EC-T8-24 | Race condition: dos agentes toman la misma tarea sin asignar | 🟡 Sprint 8 Fase C extendida (compare-and-swap) |
| EC-T8-28 | Listener `task.assigned` falla → evento perdido | ⬜ P-DEPLOY.4 (Outbox) |
| EC-T8-34 | Tabla `tasks` crece indefinidamente | ⬜ Sprint 13 Hardening (archivado >1 año) |

---

## 17. Cómo testear este módulo (manual)

1. **Login admin** → `/admin/tasks` → tab "Mis" → debería mostrar tareas asignadas a ti.
2. **Crear tarea** con `type=contact_client` + cliente + `service_id` → comprobar que el detalle muestra el bloque "Datos del cliente y plan".
3. **Tab "Sin asignar"** → tomar una tarea (auto-asignación) → debe aparecer ahora en "Mis".
4. **Login agent_billing** → `/admin/tasks` → no ves tareas asignadas a otros agentes salvo en "Sin asignar".
5. **Crear tarea `maintenance`** con `service_id` → completar sin marcar checklist requerido → debe rechazar con 400 y resaltar items en rojo.
6. **Marcar checklist + completar y notificar** → cliente recibe email con el resumen del mantenimiento.
7. **Asignar un ticket de soporte** → ir a `/admin/tasks` → debe haber una task `support_ticket` nueva con `conversation_id`.
8. **Completar la task bridge** modo `resolve` → ticket queda en `resolved` + cliente recibe la plantilla de support (no de tasks).
9. **Disparar cron `tasks-overdue` manualmente** desde superadmin → tareas vencidas pasan a `not_completed_in_time` + agente recibe email.

---

## 18. Referencias

- [ADR-041](../../10-decisions/adr-041-sistema-tareas.md) — Sistema de tareas internas (canónico)
- [ADR-067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md) — Granularidad CASL por rol staff
- [ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) — Cola pública + SLA
- [ADR-073](../../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md) — Tipos flexibles (reason + tags)
- [ADR-074](../../10-decisions/adr-074-ticket-task-bridge.md) — Bridge ticket↔task + 12 edge cases
- [`docs/20-modules/tasks/contract.md`](../../20-modules/tasks/contract.md) — Contract canónico
- [`docs/30-data/tasks.md`](../../30-data/tasks.md) — Schema canónico
- [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md) — Crons + colas
- [`docs/50-operations/settings-reference.md`](../../50-operations/settings-reference.md) — Settings
- [`docs/features/tasks/agent.md`](./agent.md) — Vista del agente (operativa diaria)
