# tasks — Contract

> **Doctrina canónica vigente: [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)** (Sprint 16, mergeado 2026-05-02 + Amendments A1/A2/A3 2026-05-02).
> Tasks es un **bridge unidireccional read-only** del trabajo del agente humano. Refleja eventos de los demás sistemas (tickets, slots Support Inside, provisioning manual, ciclo de vida del cliente, proyectos). **No hay creación manual.** La fuente de verdad vive siempre en el sistema vinculado.

> Última auditoría: 2026-05-03 — Sprint 16 cerrado al 100% (Fases 16.A → 16.E mergeadas en master).

---

## 1. Propósito

Capa transversal de organización del trabajo del agente humano. Cada `Task` es el **reflejo organizado** de algo que ya ocurrió en otro sistema (ticket asignado, mantenimiento mensual, setup manual de servicio, alta primer servicio del cliente, item de proyecto promovido). La task **NUNCA es la fuente de verdad** — el "qué hay que hacer" vive en el sistema vinculado; la task sólo persiste lo que aporta como capa transversal: `assigned_to`, `priority`, `due_date`, `status`.

NO es visible al cliente — es herramienta interna del staff.

**Tres invariantes duros (ADR-079 §1):**

1. **Toda task viene de un trigger automático canónico.** No existe `POST /tasks` ni botón "crear task". Catálogo de 5 triggers cerrado (§2).
2. **La fuente de verdad es el sistema vinculado.** Si éste cambia (ticket cerrado, slot liberado, servicio cancelado), la task refleja ese cambio vía listener cross-sistema. Si el agente cierra la task, el cierre se delega al sistema vinculado.
3. **La task NO duplica datos del sistema vinculado.** No copia `subject`, `description`, `checklist`. Renderiza dinámicamente en la card consultando el sistema on-demand.

---

## 2. Estado de implementación

🟢 **Sprint 16 cerrado al 100%** (2026-05-02). Cobertura final: **183/183 unit + 118/118 E2E verde**, 1 migración aplicada (`sprint16_tasks_notes_refactor`). 4 PRs encadenados: #21 (ADR-079) → #22 (Fase 16.B backend) → #23 (sync ADR docs) → #24 (Fase 16.C frontend + amendments A1+A2+A3 + Fase 16.D residual + Fase 16.E doc).

**Lo que vive en código tras Sprint 16:**

- ✅ Enum `TaskSourceSystem` (5 valores cerrados — §2). Enum `TaskType` eliminado.
- ✅ Tabla `tasks` con 12 columnas canónicas + UNIQUE parcial activo `(source_system, source_id) WHERE status IN ('pending','in_progress')`. Drop completo `task_tags`/`task_tag_assignments`/`Task.client_note`/`is_recurring`/`recurrence_day`/`billing_month`/`reason`/`metadata`/`title`/`description`/`created_by`/`service_id` directo/`conversation_id` directo (§3.1).
- ✅ 4 helpers canónicos en `backend/src/core/tasks/`: `priority-helper.ts`, `sla-helper.ts`, `auto-assign.ts`, `list-ordering.ts` (§3.3 + §3.4 + §3.5 ADR-079).
- ✅ 3 listeners nuevos: `client-lifecycle-task-creator` (consume `service.activated` + `clientsService.isFirstService`), `tasks-on-slot-released` (cancela tasks `support_inside_slot` huérfanas), `tasks-on-service-cancelled` (cancela tasks `provisioning_manual` huérfanas). Listeners adaptados: `support-ticket-task-creator` (consume `conversation.assigned` + `conversation.reactivated`), `maintenance-monthly`, `provisioning-on-task-completed` (filtra por `capabilities.completes_via_task`).
- ✅ `ClientNotesService` consolidado en `modules/clients/` con 5 entrypoints canónicos: `createFromTicketCompletion`, `createFromMaintenanceCompletion`, `createFromTaskCompletion`, `createExceptional`, `findByClient/findByTask`. Tabla `client_notes` con `source_system` + `source_id` + `triggered_by_action` (§3.8).
- ✅ Frontend canónico (Fase 16.C): `_shared/tasks/source-labels.ts` + `TaskCard.tsx` + `CompleteTaskModal.tsx` + `MaintenanceLogModal.tsx` + `ReassignTaskModal.tsx` + `_shared/widgets/TasksWidget.tsx` + sidebar badge numérico + `_shared/notes/ExceptionalNoteModal.tsx`. Eliminados: `NewTaskModal.tsx`, `TaskTable.tsx`, `/admin/tasks/[id]/page.tsx`, fetch `/admin/task-tags`.
- ✅ Lifecycle ticket `resolved` transitorio + auto-close (Amendment A1): cron `support-resolved-auto-close` 02:30 UTC + setting `support.auto_close_resolved_days` (default 7) + evento `conversation.reactivated` + endpoint cliente `PATCH /support/conversations/:id/confirm-resolution` + plantillas `conversation.resolved` (cliente) y `conversation.auto_closed` (agente) — DC.33 cerrado.
- ✅ Cancelación humana eliminada + reasignación canónica del superadmin (Amendment A2): `PATCH /tasks/:id/cancel` marcado `@deprecated` superadmin-only (DC.34 pendiente eliminación física); reasignar = `PATCH /tasks/:id/assign` exclusivo superadmin; `ReassignTaskModal` con dropdown filtrado por `ROLES_BY_SOURCE`.
- ✅ Lifecycle chat: estado terminal único `resolved` + ClientNote canónica + link al ticket escalado (Amendment A3): `addMessage` rechaza chats `resolved`, `updateConversation` bloquea `closed`/reabrir en chats, `ConversationHeader` muestra solo `Resolver` + `Escalar` en chats vivos, banner azul `escalated_to` en `/admin/support/[id]` + `/dashboard/support/[id]`.

**Lo que NO existe (decisión consciente):**

- ❌ `POST /tasks` (creación manual rechazada explícitamente — Yasmin: *"las tareas no quiero que se puedan crear manualmente por ahora. Es sobre trabajo de ese sistema, no quiero un sistema de tareas tipo Jira"*).
- ❌ `PATCH /tasks/:id` libre. Solo endpoints semánticos: `/assign`, `/complete`, `/complete-ticket-bridge`, `/cancel` (deprecated), `/checklist*`, `/maintenance/log`, `/notes`.
- ❌ Reabrir tasks terminales (`completed`/`cancelled`/`not_completed_in_time`). Si el sistema vinculado vuelve a estar vivo (ticket `resolved → waiting_agent`), se crea task NUEVA vía `conversation.reactivated`.
- ❌ Sub-tasks de tasks. Anidación = proyectos+checklists (Sprint 22).
- ❌ Tags / etiquetas en tasks. El `source_system` ya da la "categoría".

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `tasks` | Capa transversal de trabajo del agente | UNIQUE parcial `(source_system, source_id) WHERE status IN ('pending','in_progress')` — 1 task activa por origen. Tasks terminadas no entran al índice (permite re-creación tras cierre — patrón `conversation.reactivated`). 5 valores cerrados en enum `TaskSourceSystem`. |
| `task_checklist_completions` | 1 fila por item de checklist completado dentro de una task `support_inside_slot` (Sprint 8 Fase A) | Idempotente por `(task_id, item_id, item_kind)` — repetir el complete no duplica. |
| `maintenance_logs` | Registro inmutable 1:1 con tasks `support_inside_slot` (Sprint 8 Fase A) | Visible al cliente vía portal RGPD. Campo `notes` renombrado a `client_facing_notes` en Sprint 16 (DC.32 cerrada). Sin `internal_notes` — las notas internas viven en `client_notes` con `source_system='maintenance_log'`. |
| `service_checklist_items` | Snapshot de `product_checklist_items` al provisionar servicio (Sprint 8 Fase A) | Cambios futuros del producto no afectan servicios activos. |

> **Tablas eliminadas en Sprint 16:** `task_tags` + `task_tag_assignments` (DROP CASCADE en migración `sprint16_tasks_notes_refactor`).

Detalle completo del schema en [`docs/30-data/tasks.md`](../../30-data/tasks.md).

---

## 4. Catálogo canónico cerrado de triggers (5)

Lista exhaustiva. Cualquier trigger nuevo requiere ADR específico (ADR-079 §5).

| `source_system` | Trigger | Emisor | Cuándo se crea | Cuándo se completa | Cuándo se cancela |
|-----------------|---------|--------|----------------|---------------------|-------------------|
| `support_ticket` | `conversation.assigned` (sólo `type='ticket'`) + `conversation.reactivated` (Amendment A1) | `SupportTicketTaskCreatorListener` | Asignación de ticket a un agente o reactivación post-`resolved` | Agente cierra task → `support.updateConversation(status=resolved)` (1 solo accionador `Completar` post Amendment A1) | Reasignación / unassign del ticket → listener cancela task con `skipTicketRelease` |
| `support_inside_slot` | Cron `maintenance-monthly` (diario 06:00 UTC, filtro `anniversary_day = today`) | `MaintenanceMonthlyService` (ADR-034) | Día aniversario del slot, una task por mes (idempotencia DB UNIQUE parcial activo) | Agente registra `MaintenanceLog` vía `MaintenanceLogService.recordCompletion()` | Slot se libera antes → `tasks-on-slot-released.listener` cancela |
| `provisioning_manual` | Plugin con `capabilities.completes_via_task=true` devuelve `followUp: ['create_setup_task']` | `ProvisioningOrchestratorService` (ADR-077) | Activación de servicio con setup manual del agente | Agente completa task → `ProvisioningOnTaskCompletedListener` activa el servicio | Servicio cancelado → `tasks-on-service-cancelled.listener` cancela |
| `client_lifecycle` | `service.activated` del **PRIMER** servicio del cliente (helper `clientsService.isFirstService(clientId)`) | `ClientLifecycleTaskCreatorListener` | Alta del primer servicio del cliente | Agente cierra task con nota obligatoria de la llamada de bienvenida | Cliente se da de baja antes → task se cancela |
| `project` | Promoción manual del superadmin de un item de checklist → task | Endpoint `POST /api/v1/admin/projects/:id/checklist/:itemId/promote-to-task` (Sprint 22 — placeholder) | Superadmin externaliza item del checklist a un agente real | Agente completa task → item del checklist se marca `completed` automáticamente | Item del checklist se elimina → task se cancela |

**Lo que NO crea task** (ADR-079 §2):

- `invoice.*` — son notificaciones al cliente; no requiere acción del agente.
- Renovaciones / retries / suspensiones / dunning automáticas.
- `auth.*` — alertas operativas, no trabajo planificable.
- Errores 5xx (`system.error`, `dlq.job_failed`) — alertas a superadmin vía notification, no task.
- Conversaciones tipo `chat` — flujo es respuesta directa por mensajes (Amendment A3 lo refuerza).

---

## 5. API REST expuesta

Prefix: `/api/v1`. JWT auth en todos. CASL §10.

| Método | Ruta | Descripción | CASL |
|--------|------|-------------|------|
| `GET` | `/tasks` | Listado paginado con orden canónico aplicado (§6). Filtros: `?scope=mine\|unassigned\|all&source_system=...&priority=...&page=...` | `Read.Task` + role filter |
| `GET` | `/tasks/stats` | Counters `StatusTabs` honestos por scope | `Read.Task` |
| `GET` | `/tasks/:id` | Detalle. Shape: `source_system`, `source_id`, `client_id`, `assigned_to`, `priority`, `status`, `due_date`, `completed_at`, `completed_by` + relations enriquecidas (assignee/client/completer + sistema vinculado on-demand) | `Read.Task` |
| `PATCH` | `/tasks/:id/assign` | Asignar / reasignar / liberar a cola pública (`assigned_to: null`) | superadmin-only post Amendment A2 |
| `PATCH` | `/tasks/:id/complete` | Solo `provisioning_manual` / `client_lifecycle` / `project`. Body `{ note: string }` — nota obligatoria (§7). | `Update.Task` (own + cola pública) |
| `PATCH` | `/tasks/:id/complete-ticket-bridge` | Solo `support_ticket`. Body `{ ticket_action: 'resolve', resolution_note: string }`. Frontend siempre envía `'resolve'` post Amendment A1 (1 accionador inline `Completar`); shape preservado para preservación de DTO sellado. | `Update.Task` (own) |
| `PATCH` | `/tasks/:id/cancel` | **`@deprecated`** post Amendment A2 — superadmin-only. La cancelación humana no se expone; cancelación es consecuencia automática de listeners cross-sistema. Eliminación física diferida (DC.34). | `Manage.Task` (superadmin) |
| `GET` | `/tasks/:id/checklist` | Solo `support_inside_slot`. Items + completions cruzados con snapshot service vs fallback product. | `Read.Task` |
| `POST` | `/tasks/:id/checklist/complete` | Solo `support_inside_slot`. Idempotente por `(task_id, item_id, item_kind)`. | `Update.Task` |
| `POST` | `/tasks/:id/maintenance/log` | Solo `support_inside_slot`. Body `{ client_facing_notes, internal_notes?, month_year?, checklist_completions? }`. Atómico: persiste log + cierra task + delega en `ClientNotesService.createFromMaintenanceCompletion()` + emite `maintenance.completed`. | `Update.Task` |
| `GET` | `/tasks/:id/notes` | Notas vinculadas (`source_system='task_completion'` con `source_id=task.id`). | `Read.Task` |
| `GET` | `/admin/clients/:id/structured-notes` | Listado canónico de notas con filtros: `?source_system=...&category=...&pinned_only=...&page=...`. | `Read.ClientNote` |
| `POST` | `/admin/clients/:id/structured-notes` | Crear nota excepcional (única vía pública de `ClientNotesService.createExceptional`). | `Create.ClientNote` (Manage para excepcional) |
| `PATCH` | `/admin/clients/notes/:noteId/pin` | Toggle pin de nota. | `Update.ClientNote` |
| `POST` | `/api/v1/admin/tasks/cron/:name` | Disparar manualmente cron (`overdue` / `unassigned-overdue` / `maintenance-critical`) para smoke + E2E + recovery. | `Manage.Job` (superadmin) |
| `PATCH` | `/support/conversations/:id/confirm-resolution` | Cliente confirma resolución de ticket en `resolved` → `→closed` explícito (Amendment A1). Solo accesible por cliente propietario, solo aplica si `status='resolved'`. | `Update.Conversation` (own) |

> **Data isolation por rol (defense in depth nivel 4):** los agentes sólo ven tasks asignadas a sí mismos o sin asignar. `superadmin` y `agent_full` ven todas. Aplicado en service (no sólo CASL).

---

## 6. Regla canónica de orden — `/admin/tasks` (ADR-079 §3.3)

```
1. Tasks vencidas (status=not_completed_in_time) en banner rojo arriba del todo.
2. Tickets primero, en bloque, ordenados por:
   - tier SI del cliente (Pro > Medium > Basic > sin SI)
   - dentro de cada tier, por antigüedad (FIFO).
3. Resto agrupado por source_system con orden interno:
   - support_inside_slot: por anniversary_day del slot (asc)
   - provisioning_manual: FIFO por created_at
   - client_lifecycle: FIFO por created_at (con due_date = +48h)
   - project: FIFO por created_at
```

Helper canónico: `core/tasks/list-ordering.ts`. **Por qué esta regla y no `priority DESC, due_date ASC` puro:** la priorización por enum funciona dentro de cada bloque pero no cross-bloque; agrupar por sistema preserva la coherencia operativa del agente.

---

## 7. Priorización + auto-asignación + SLA — helpers canónicos

| Helper | Ubicación | Función |
|--------|-----------|---------|
| `calculateTaskPriority(sourceSystem, clientSITier)` | `core/tasks/priority-helper.ts` | Devuelve `TaskPriority`. Sólo `support_ticket` mapea por tier SI (Pro=critical, Medium=high, Basic=high, sin SI=medium). Resto = `medium` por defecto (orden lo marca due_date / FIFO). |
| `autoAssignTask(prisma, task)` | `core/tasks/auto-assign.ts` | Mapping `ROLES_BY_SOURCE` → query "menor carga" (count de tasks pendientes/in_progress por agente) + desempate aleatorio. `support_ticket` hereda `assigned_to` del ticket (no recalcula). `project` siempre cola pública. |
| `calculateTaskDueDate(sourceSystem, clientSITier, createdAt)` | `core/tasks/sla-helper.ts` | `support_ticket`: SLA tier SI (Pro=4h, Medium=12h, Basic=24h, sin SI=24h — ADR-061). `support_inside_slot`: fin del día. `provisioning_manual`: 24h. `client_lifecycle`: 48h. `project`: null (sin SLA). |
| `getCanonicalOrdering(tasks)` | `core/tasks/list-ordering.ts` | §6 regla de 2 niveles. |

> **Migración V2 (Sprint 12 — Settings + KB):** los 4 helpers tienen mismo input/output; sustituir el cuerpo por lectura del setting `tasks.priority_rules` / `tasks.auto_assign_rules` (jsonb) → cero refactor del resto del sistema.

---

## 8. Card canónica + accionadores inline (ADR-079 §3.6)

Una sola línea visible + 1 línea de contexto + accionadores inline (máx. 3 + CTA "Abrir [sistema] completo →"). Sin tabs ni secciones expandibles dentro de la card.

| `source_system` | Accionadores inline | Delegación canónica | CTA "abrir completo" |
|-----------------|---------------------|---------------------|---------------------|
| `support_ticket` | `Completar` (resuelve el ticket — 1 accionador post Amendment A1) | `support.updateConversation(id, status='resolved', internal_note)` | `/admin/support/[id]` |
| `support_inside_slot` | `Completar mantenimiento` (abre `MaintenanceLogModal` con checklist) | `MaintenanceLogService.recordCompletion()` | `/admin/clients/[clientId]/services/[serviceId]` |
| `provisioning_manual` | `Marcar setup completado` (modal con nota) | `ProvisioningOnTaskCompletedListener` activa servicio | `/admin/services/[serviceId]` |
| `client_lifecycle` | `Marcar como contactado` (modal con nota obligatoria) | `ClientNotesService.createFromTaskCompletion()` + cierra task | `/admin/clients/[clientId]` |
| `project` | `Marcar item completado` (cierra task + marca item) | `tasks-on-project-task-completed.listener` (Sprint 22) → `ProjectsService.markChecklistItemCompleted()` | `/admin/projects/[projectId]` |

**Reasignación (post Amendment A2):** modal `ReassignTaskModal` solo para superadmin. Dropdown de agentes filtrados por `ELIGIBLE_ROLES` del `source_system` (espejo de `ROLES_BY_SOURCE`). Botón secundario "Liberar a cola pública" (`assigned_to=null`). Reemplaza al botón "Cancelar tarea" anterior.

**Regla canónica:** *si necesitas más de 3 accionadores inline para un sistema, eso es señal de que la card no es la herramienta — el agente debe ir al sistema completo.*

---

## 9. Nota obligatoria al completar (ADR-079 §3.9)

| `source_system` | Nota obligatoria al completar | Categoría / source_system asignados a `client_notes` |
|-----------------|-------------------------------|-------------------------------------------------------|
| `support_ticket` | NO (el modal "Resolver ticket" del módulo support ya pide `internal_note`) | `category='support'`, `source_system='ticket'` |
| `support_inside_slot` | NO (modal "Completar mantenimiento" pide nota) | `category='maintenance'`, `source_system='maintenance_log'` |
| `provisioning_manual` | SÍ | `category='support'`, `source_system='task_completion'` |
| `client_lifecycle` | SÍ | `category='onboarding'`, `source_system='task_completion'`, `triggered_by_action='task.completed'` |
| `project` | SÍ | `category='project'`, `source_system='task_completion'` |

**Excepciones documentadas:**

- **Cancelación de task:** NO exige nota. La cancelación viene de listener cross-sistema; la nota correspondiente la captura el evento de cancelación si aplica.
- **`status='not_completed_in_time'`** (cron): NO crea nota. La task vencida es un fallo operativo, no una acción del agente.

---

## 10. CASL — Permisos (ADR-079 §3.10)

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|:---------:|:----------:|:-------------:|:-------------:|:------:|:-------:|
| `Task` | Manage (todas) | Read+Update (own + cola pública) | Read+Update (own) | Read+Update (own) | — | — |
| `ClientNote` | Manage | Manage | Read+Create+List | Read+Create+List | — | — |
| `ProjectChecklistItem` (Sprint 22) | Manage + promote | Read | — | — | — | — |
| `Job` (cron trigger) | Manage | — | — | — | — | — |

> **`Subject.TaskTag` eliminado** en Sprint 16 (la tabla y los endpoints ya no existen).

**Reglas derivadas:**

- **`Task.Update` (own)**: el agente puede completar (vía endpoints semánticos `/complete` o `/complete-ticket-bridge`) y, antes de Amendment A2, podía cancelar. Tras Amendment A2 NO puede cancelar ni reasignar.
- **`Task.Manage` (superadmin)**: reasignar (`/assign` exclusivo post A2), forzar completar/cancelar (deprecated), ver todas las tasks.
- **`ClientNote.Create`** lo tienen todos los staff porque cualquier acción del agente puede generar nota. La creación va siempre vía listener / modal de completar; no hay endpoint `POST /client-notes` libre salvo el de "nota excepcional" (`source_system='exceptional'`) restringido a `Manage.ClientNote`.

---

## 11. Settings consumidos

| Setting | Default | Consumidor |
|---------|---------|------------|
| `tasks.overdue_to_failure_days` | 7 | `TasksOverdueService.run()` |
| `tasks.unassigned_sla_hours.<source_system>` | varia (4..48h) | `TasksUnassignedOverdueService.run()` (ADR-072) |
| `tasks.unassigned_sla_hours.default` | 24 | Fallback global |
| `support.maintenance_critical_threshold_days` | 60 | `MaintenanceCriticalService.run()` |
| **`support.auto_close_resolved_days`** | **7** | **Cron `support-resolved-auto-close` (Amendment A1) — días que un ticket en `resolved` espera confirmación o respuesta del cliente antes del cierre silencioso** |

> **Migración V2 (Sprint 12):** `tasks.priority_rules` + `tasks.auto_assign_rules` jsonb sustituirán los helpers hardcoded.

---

## 12. Eventos emitidos / consumidos

Detalle canónico en [`docs/20-modules/_events.md`](../_events.md). Resumen del módulo:

**Tasks emite:**

| Evento | Cuándo | Outbox | Estado |
|--------|--------|--------|--------|
| `task.created` | Listener crea task | ❌ | 🟡 huérfano (audit Sprint 9 Fase E) |
| `task.assigned` | `autoAssignTask` o `/assign` | ❌ deuda P-DEPLOY.4 | ✅ → `tasks-email.listener` |
| `task.completed` | `/complete*` exitoso | ❌ deuda P-DEPLOY.4 | ✅ → `task-completed.listener` |
| `task.overdue` | `TasksOverdueService` | ❌ operativo | ✅ → `TasksOverdueListener` |
| `task.unassigned_overdue` | `TasksUnassignedOverdueService` (ADR-072) | ❌ operativo | ✅ → `TasksUnassignedOverdueListener` |
| `maintenance.completed` | `MaintenanceLogService.recordCompletion()` | ❌ deuda P-DEPLOY.4 | ✅ → `MaintenanceCompletedListener` |
| `maintenance.critical` | `MaintenanceCriticalService` | ❌ operativo | ✅ → `MaintenanceCriticalListener` |

**Tasks consume:**

| Evento | Listener | Acción |
|--------|----------|--------|
| `conversation.assigned` | `SupportTicketTaskCreatorListener.handleAssigned` | Crea / reasigna task `support_ticket` (idempotente). |
| `conversation.reactivated` (Amendment A1) | `SupportTicketTaskCreatorListener.handleAssigned` (reuse) | Crea task NUEVA al reabrir / responder cliente sobre `resolved`. Reemplaza patrón legacy ADR-074 EC#3. |
| `conversation.unassigned` | `SupportTicketTaskCreatorListener.handleUnassigned` | Cancela task bridge activa con flag `skipTicketRelease`. |
| `service.activated` (primer servicio) | `ClientLifecycleTaskCreatorListener` | Si `clientsService.isFirstService(clientId)`: crea task `client_lifecycle` con SLA 48h. |
| `support_inside.slot_released` | `tasks-on-slot-released.listener` | Cancela task `support_inside_slot` huérfana. |
| `service.cancelled` | `tasks-on-service-cancelled.listener` | Cancela task `provisioning_manual` huérfana. |

---

## 13. Servicios consumidos cross-módulo

| Service | Método | Razón | Excepción documentada |
|---------|--------|-------|----------------------|
| `SupportService` | `updateConversation(id, {status, resolution_note} \| {assigned_agent_id: null}, actorId)` | Bridge `support_ticket`: cierre dual (resolve/close legacy). Tras Amendment A1, frontend siempre envía `'resolve'`. | R1 — formalizado en [ADR-074 §Decisión](../../10-decisions/adr-074-ticket-task-bridge.md). |
| `ClientNotesService` | `createFromTaskCompletion / createFromMaintenanceCompletion / createFromTicketCompletion / createExceptional / findByClient / findByTask` | Persistir notas con `source_system` + `source_id` + `triggered_by_action` (consolidación post-ADR-079). | Mismo módulo `clients` — no es excepción R1. |
| `ProvisioningOnTaskCompletedListener` | Reuse listener existente Sprint 11 Fase 11.C | Activación de servicio `provisioning_manual` cuando agente completa task. | R1 — formalizado en [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md). |

---

## 14. Jobs / cron

Detalle completo en [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md).

| Cola | Schedule | Service | Qué hace | Consumidor evento |
|------|----------|---------|----------|-------------------|
| `tasks-overdue` | `0 2 * * *` UTC | `TasksOverdueService` | Marca tareas con asignado vencidas como `not_completed_in_time` (terminal) | `task.overdue` → email + campana al agente |
| `tasks-unassigned-overdue` | `0 9 * * *` UTC | `TasksUnassignedOverdueService` | Cola pública fuera de SLA por `source_system` (ADR-072) | `task.unassigned_overdue` → resumen agregado superadmin |
| `maintenance-critical` | `0 8 * * *` UTC | `MaintenanceCriticalService` | Servicios sin `maintenance_log` >threshold | `maintenance.critical` → resumen agregado superadmin |
| `maintenance-monthly` | `0 6 * * *` UTC (filtra `anniversary_day = today`) | `MaintenanceMonthlyService` | Crea task `support_inside_slot` para cada slot activo cuyo aniversario es hoy | — (crea tasks) |
| **`support-resolved-auto-close`** (Amendment A1) | **`30 2 * * *` UTC** | **`SupportResolvedAutoCloseService`** | **Tickets en `resolved` desde >`support.auto_close_resolved_days` (default 7) → `→closed` silencioso. Emite `conversation.auto_closed` (notif al agente que resolvió).** | **`conversation.auto_closed` → email + campana agente** |

> Endpoint `POST /api/v1/admin/tasks/cron/:name` permite disparar manualmente cada cron (smoke + E2E + recovery).

---

## 15. Invariantes

- **TASK-INV-1:** El `source_system` + `source_id` son inmutables tras la creación. El listener creador es la única autoridad sobre estos campos. Trazabilidad de origen.
- **TASK-INV-2:** El `status` solo transiciona en orden válido: `pending → in_progress → completed`, o cualquier estado no-terminal → `cancelled` / `not_completed_in_time`. **No hay vuelta atrás desde estados terminales** (`completed`/`cancelled`/`not_completed_in_time`). Si el sistema vinculado vuelve a estar vivo (ticket reactivado), se crea task NUEVA — NO se reabre la vieja.
- **TASK-INV-3:** `client_id` es siempre obligatorio post Sprint 16. No existen tasks "internas sin cliente" — toda task tiene contraparte en sistema vinculado con cliente.
- **TASK-INV-4:** Las notas de `task_completion` viven en `client_notes` con `source_system='task_completion'` + `source_id=task.id`. La task NO persiste copia local del texto.
- **TASK-INV-5:** `task.cancelled` es **consecuencia mecánica** de eventos del sistema vinculado (ADR-079 Amendment A2). No hay "cancelar manualmente" desde la UI; la única vía superviviente es el endpoint `@deprecated PATCH /tasks/:id/cancel` superadmin-only (DC.34 pendiente eliminación física).
- **TASK-INV-6 (Amendment A1):** Cuando una task `support_ticket` está `completed` y el ticket vinculado vuelve a estar vivo (`waiting_agent`), NO se reabre la task — se emite `conversation.reactivated` y el listener crea task NUEVA.

---

## 16. Edge cases — referencia canónica

Edge cases canónicos del módulo (tras Sprint 16):

| ID legacy | Caso | Estado tras Sprint 16 |
|-----------|------|------------------------|
| EC-T8-01 | Maintenance se cierra sin marcar checklist requerido | ✅ Bloqueado con 400 + `missing_required` |
| EC-T8-12 | `due_date` en el pasado | ✅ Validación + bypass interno crons |
| EC-T8-19/20/21 | Reabrir/reasignar/editar prioridad de tarea cerrada | ✅ Bloqueado (TERMINAL_STATES guard) |
| EC-T8-22 | Auto-asignación cola pública | ✅ ADR-072 + auto-asignación V1 hardcoded ADR-079 §3.4 |
| EC-T8-24 | Race condition: dos agentes toman la misma task sin asignar | 🟡 Sprint 13 Hardening |
| EC-T8-28 | Listener `task.assigned` falla → evento perdido | ⬜ P-DEPLOY.4 (Outbox) |
| EC-T8-34 | Tabla `tasks` crece indefinidamente | ⬜ Sprint 13 Hardening (archivado >1 año) |
| EC-T8-44 | Listener `audit-tasks` para reasignaciones/transiciones | ⬜ Sprint 9 Fase E pendiente |
| **DC.35** | **Regenerar task automáticamente al vencer (`task.overdue` → nueva task con bump prioridad)** | ⬜ Sprint 16 Fase 16.D residual / sub-sprint |
| **DC.36** | **Linkear `task_completion` notes al sistema vinculado** | ⬜ Sprint 22 (módulo project) |

**Cobertura tests E2E** post Sprint 16 (118/118 verde):

- [`tests/e2e/tasks.spec.ts`](../../../tests/e2e/tasks.spec.ts) — flujo bridge + complete + filtros.
- [`tests/e2e/tasks-edge-cases.spec.ts`](../../../tests/e2e/tasks-edge-cases.spec.ts) — 6 specs cubriendo EC-T8-19/20/21/22.
- [`tests/e2e/tasks-ticket-bridge.spec.ts`](../../../tests/e2e/tasks-ticket-bridge.spec.ts) — bridge ticket↔task adaptado al contrato canónico.
- [`tests/e2e/tasks-checklist-and-maintenance-log.spec.ts`](../../../tests/e2e/tasks-checklist-and-maintenance-log.spec.ts) — flujo `support_inside_slot` con `client_facing_notes`.
- [`tests/e2e/tasks-crons.spec.ts`](../../../tests/e2e/tasks-crons.spec.ts) — 3 crons + nuevo `support-resolved-auto-close`.
- [`tests/e2e/client-lifecycle-welcome-task.spec.ts`](../../../tests/e2e/client-lifecycle-welcome-task.spec.ts) — flujo nuevo Sprint 16 Fase 16.D.
- [`tests/e2e/notes.spec.ts`](../../../tests/e2e/notes.spec.ts) — 5 source_systems + nota excepcional + filtros (Sprint 16 Fase 16.D).
- [`tests/e2e/support-conversation-lifecycle.spec.ts`](../../../tests/e2e/support-conversation-lifecycle.spec.ts) — Amendments A1+A3 (resolved transitorio ticket, terminal único chat, `conversation.reactivated`, banner escalación).

---

## 17. Decisiones relacionadas

- **[ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)** — Tasks como bridge unidireccional read-only + consolidación notas con source tracking. **Doctrina canónica vigente** + Amendments A1 (lifecycle ticket `resolved` transitorio + auto-close + `conversation.reactivated`), A2 (cancelación humana eliminada + reasignación canónica superadmin), A3 (lifecycle chat terminal único `resolved` + ClientNote canónica + banner escalación).
- [ADR-041](../../10-decisions/adr-041-sistema-tareas.md) — Sistema de tareas v1. **Parcialmente superseded** por ADR-079 §"Tipos canónicos" + §"Creación manual"; el resto (lifecycle base, asignación, eventos básicos) permanece `Active`.
- [ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) — Cola pública con SLA. **Refinado** por ADR-079 §3.4 (auto-asignación V1 hardcoded; `autoAssignTask` devuelve null cuando no hay candidato).
- [ADR-073](../../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md) — Tipos flexibles + reason + tags. **Parcialmente superseded** por ADR-079 §"Tags M2M" + §"reason libre" (eliminados); el resto pierde relevancia.
- [ADR-074](../../10-decisions/adr-074-ticket-task-bridge.md) — Bridge ticket↔task. **Refinado** por ADR-079 §3.6.1 (1 accionador inline post A1) + Amendment A1 (EC#3 superseded por `conversation.reactivated`).
- [ADR-038](../../10-decisions/adr-038-notas-estructuradas-cliente.md) — Notas estructuradas cliente. **Parcialmente superseded** por ADR-079 §3.8 (categorías + source tracking).
- [ADR-061](../../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) — Tiers SI. Consumido por `calculateTaskPriority` + `calculateTaskDueDate`.
- [ADR-067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md) — Granularidad CASL. Refina §10.
- [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — Contrato `ProvisionerPlugin` v2. Plugin manual sigue creando tasks `provisioning_manual` igual.
- [ADR-078](../../10-decisions/adr-078-auth-server-side-cookies-httponly.md) — Auth server-side cookies httpOnly. Sprint 16 frontend respeta marker `TODO(ADR-078, Sprint 13)` en cada Client Component nuevo (Sprint 13 §13.AUTH cierra migración bulk).

---

## 18. Excepciones documentadas

- **R1 (módulos no se llaman):** ✅ excepciones formalizadas — invocación a `SupportService.updateConversation` (bridge ADR-074), invocación de `ClientNotesService` desde tasks (mismo módulo `clients` — no es excepción), invocación a `ProvisioningOnTaskCompletedListener` (ADR-077).
- **R8 (Outbox):** ⚠️ los 5 eventos `task.*` + 2 `maintenance.*` no usan outbox. Riesgo bajo (no son críticos vs `invoice.*`). Migración formalizada como **P-DEPLOY.4** (ADR-069).
- **R3 (audit log inmutable):** ✅ análoga aplicada a tasks: terminales no se reabren; reabrir = nueva task.
- **R15 (tamaño archivos):** ✅ `tasks.service.ts` reducido 740→432 LOC en Sprint 16 Fase 16.B.

---

## 19. Pendiente / deuda técnica

- [x] ~~Sprint 8 P0.1 / Fase A→D / Fase C crons~~ ✅
- [x] ~~Sprint 11 listener `provisioning-on-task-completed`~~ ✅
- [x] ~~**Sprint 16 (cerrado 2026-05-02)**~~ ✅ Fases 16.A → 16.E completas — bridge unidireccional canónico vivo, notas consolidadas, lifecycle ticket/chat refinado.
- [ ] **DC.33** — plantillas notification `conversation.resolved` (cliente) y `conversation.auto_closed` (agente) cerradas en Sprint 16 Fase 16.E. ✅ marcadas como completadas en backlog.
- [ ] **DC.34** — eliminar físicamente endpoint `PATCH /tasks/:id/cancel` + tests E2E EC-T8-21 + `tasks-ticket-bridge.spec.ts:cancelar task bridge`. Sub-sprint de limpieza.
- [ ] **DC.35** — regenerar task automáticamente al vencer (`task.overdue` → nueva task con bump prioridad). Requiere amendment A4 a ADR-079 §3.2 + listener cross-sistema.
- [ ] **DC.36** — linkear `task_completion` notes al sistema vinculado de la task original (extender shape `ClientNote` desde backend con `task.source_system`/`task.source_id`). Sprint 22 / Sprint 13.
- [ ] **EC-T8-44** — Sprint 9 Fase E listener `audit-tasks` para reasignaciones/transiciones.
- [ ] **EC-T8-28 / P-DEPLOY.4** ([ADR-069](../../10-decisions/adr-069-estrategia-deploy-diferido.md)): extender Outbox a `task.*` + `maintenance.*` events.
- [ ] **EC-T8-34** — Sprint 13 Hardening: archivado `not_completed_in_time` >1 año + N+1 audit.

---

## 20. Cómo testear este módulo

### Tests E2E

Suite full **118/118 verde** (post Sprint 16). Specs canónicos en §16.

### Tests unitarios (suite full **183/183 verde**)

- `priority-helper.spec.ts` (8 specs) · `auto-assign.spec.ts` (6 specs) · `sla-helper.spec.ts` (6 specs) · `list-ordering.spec.ts` (6 specs) — Sprint 16 Fase 16.B.
- `tasks.service.spec.ts` reescrito al contrato canónico (sin manual creation, sin tags, sin recurrencia).
- `client-lifecycle-task-creator.listener.spec.ts` (3 specs) · `tasks-on-slot-released.listener.spec.ts` (2 specs) · `tasks-on-service-cancelled.listener.spec.ts` (2 specs).
- `support-resolved-auto-close.service.spec.ts` (4 specs — cutoff, filtros, emit, idempotencia).

### Smoke testing manual canónico (Yasmin con cliente Carla)

1. **Cliente Carla compra primer servicio** → task `client_lifecycle` aparece en widget agente → completar con nota obligatoria → verificar `client_notes` row con `source_system='task_completion'` + `triggered_by_action='task.completed'` + `category='onboarding'`.
2. **Asignar ticket support a Carla** → task `support_ticket` aparece con badge `[SI <tier>]` → resolver inline → ticket cerrado + nota en `client_notes` con `source_system='ticket'`.
3. **Cron `maintenance-monthly` (disparo manual)** → crea task `support_inside_slot` → completar con maintenance log → email cliente con `client_facing_notes` + nota interna en `client_notes` con `source_system='maintenance_log'`.
4. **Cliente compra producto manual (plugin `manual`)** → task `provisioning_manual` aparece → marcar setup completado con nota → service activado.
5. **Widget sidebar muestra badge numérico correcto** (count tasks pendientes del agente).
6. **Widget dashboard muestra top 5 tasks** ordenadas por regla canónica §6.
7. **Superadmin toggle "Ver todas las tareas"** muestra tasks de todos los agentes; reasignación funciona vía `ReassignTaskModal`.
8. **Agente perfil cliente → "Añadir nota excepcional"** → modal → nota creada con `source_system='exceptional'`.
9. **Cron `support-resolved-auto-close` (Amendment A1)** → ticket en `resolved` >7d pasa a `closed` silencioso + agente recibe email `conversation.auto_closed`.
10. **Cliente responde sobre ticket `resolved`** → emite `conversation.reactivated` → nueva task bridge nace en cola pública.

---

## 21. Referencias

- [`docs/30-data/tasks.md`](../../30-data/tasks.md) — Schema canónico
- [`docs/30-data/clients.md`](../../30-data/clients.md) — `client_notes` schema canónico
- [`docs/features/tasks/admin.md`](../../features/tasks/admin.md) — Operativa diaria staff
- [`docs/features/tasks/agent.md`](../../features/tasks/agent.md) — Guía agente
- [`docs/features/notes/admin.md`](../../features/notes/admin.md) — Operativa notas consolidadas
- [`docs/features/support/lifecycle.md`](../../features/support/lifecycle.md) — Lifecycle canónico ticket vs chat (Amendments A1+A3)
- [`docs/20-modules/_events.md`](../_events.md) — Catálogo eventos
- [`docs/20-modules/_matrix.md`](../_matrix.md) — Matriz de dependencias
- [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md) — Crons + colas
- [`docs/50-operations/settings-reference.md`](../../50-operations/settings-reference.md) — Settings
- [`docs/60-roadmap/completed/sprint-16-tasks-notes-refactor.md`](../../60-roadmap/completed/sprint-16-tasks-notes-refactor.md) — Retrospectiva Sprint 16
