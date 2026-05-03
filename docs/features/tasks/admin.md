# Tasks — Guía de administración

> **Doctrina canónica vigente: [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)** + Amendments A1/A2/A3 (Sprint 16 cerrado 2026-05-02).
> Tasks es la **cara organizada del trabajo del agente humano**: bridge unidireccional read-only desde 5 triggers automáticos cerrados. NO es un Jira, NO se crea manualmente, NO duplica datos del sistema vinculado.

> Módulo: `tasks`
> Sprints: 8 (modelo legacy) → 16 (refactor canónico ADR-079 — bridge unidireccional read-only + consolidación notas)
> Última actualización: 2026-05-03 (post Sprint 16 cierre documental Fase 16.E).
> Documento canónico de operativa diaria del staff Aelium sobre el sistema de tareas.

---

## 1. Resumen

El módulo Tasks es la **herramienta interna del staff Aelium**. NO es visible al cliente. Centraliza el trabajo del agente trayendo info de los demás sistemas (tickets, slots Support Inside, provisioning manual, ciclo de vida del cliente, proyectos) sin duplicar lógica.

**Tres invariantes canónicos (ADR-079 §1):**

1. **Toda task viene de un trigger automático canónico.** Catálogo cerrado de 5 (§2). No hay endpoint `POST /tasks` ni botón "crear task". La task es el reflejo organizado de algo que ya pasó en otro sistema.
2. **La fuente de verdad es el sistema vinculado.** Si el sistema vinculado cambia (ticket cerrado, slot liberado, servicio cancelado), la task refleja ese cambio. Si el agente cierra la task, el cierre se delega al sistema vinculado.
3. **La task NO duplica datos.** No copia `subject` del ticket, no copia `description` del proyecto. Renderiza dinámicamente en la card lo necesario consultando el sistema vinculado on-demand.

**Cara operativa real (lo que justificaba el sistema en primer lugar — Yasmin):**

- ✅ **Widget en sidebar** con badge numérico — count tasks pendientes del agente actual.
- ✅ **Widget "Tu trabajo de hoy"** en `/admin` (top de la página) — top 5 tasks del agente ordenadas por regla canónica §3.
- ✅ **Card simple** con accionadores inline contextuales (máx. 3) que delegan en el sistema vinculado.
- ✅ **Asignador automático** por carga + rol coherente (helper `core/tasks/auto-assign.ts`).
- ✅ **Prioridad cross-sistema** declarativa (helper `core/tasks/priority-helper.ts`).

---

## 2. Catálogo cerrado de triggers (5)

| `source_system` | Trigger | Cuándo nace | Quién la crea | Quién la completa |
|-----------------|---------|-------------|---------------|-------------------|
| `support_ticket` | Asignación de ticket (`conversation.assigned`, `type='ticket'`) **+ reactivación** (`conversation.reactivated` — Amendment A1) | Asignar ticket o cliente responde sobre `resolved` | `SupportTicketTaskCreatorListener` | Agente cierra → delega `support.updateConversation(status='resolved')` |
| `support_inside_slot` | Cron `maintenance-monthly` 06:00 UTC, filtro `anniversary_day = today` | Día aniversario del slot Support Inside | `MaintenanceMonthlyService` | Agente registra `MaintenanceLog` |
| `provisioning_manual` | Plugin con `capabilities.completes_via_task=true` devuelve `followUp: ['create_setup_task']` | Activación de servicio con setup manual | `ProvisioningOrchestratorService` | Agente completa task → activa servicio |
| `client_lifecycle` | `service.activated` del **PRIMER** servicio del cliente (helper `clientsService.isFirstService(clientId)`) | Alta del primer servicio del cliente | `ClientLifecycleTaskCreatorListener` | Agente cierra task con nota obligatoria de la llamada de bienvenida |
| `project` | Promoción manual del superadmin de un item de checklist → task (Sprint 22) | Superadmin externaliza item del checklist a un agente | Endpoint `POST /api/v1/admin/projects/:id/checklist/:itemId/promote-to-task` | Agente completa task → marca item del checklist `completed` |

**Triggers NO existentes (decisión consciente — ADR-079 §2):**

- `invoice.*` — son notificaciones al cliente; el sistema actúa, el equipo no.
- Renovaciones / retries / suspensiones / dunning — sistema lo resuelve solo.
- `auth.*` — alertas operativas, no trabajo planificable.
- Errores 5xx — alertas a superadmin vía notification, no task.
- Conversaciones tipo `chat` — flujo es respuesta directa por mensajes (Amendment A3 lo refuerza: chats no crean tasks, su único estado terminal es `resolved`).

> **Excepción `manual_admin` rechazada explícitamente** (Yasmin): *"las tareas no quiero que se puedan crear manualmente por ahora. Es sobre trabajo de ese sistema, no quiero un sistema de tareas tipo Jira."* Si en el futuro un caso real requiere creación recurrente, se redacta ADR específico para añadir trigger automático nuevo (no para reabrir creación manual).

---

## 3. Regla canónica de orden — `/admin/tasks` (ADR-079 §3.3)

```
1. Tasks vencidas (status=not_completed_in_time) en banner rojo arriba del todo.
2. Tickets primero, en bloque, ordenados por:
   - tier SI del cliente (Pro > Medium > Basic > sin SI)
   - dentro de cada tier, por antigüedad (FIFO).
3. Resto agrupado por source_system:
   - support_inside_slot: por anniversary_day del slot (asc)
   - provisioning_manual: FIFO por created_at
   - client_lifecycle: FIFO por created_at (con due_date = +48h)
   - project: FIFO por created_at
```

**Por qué esta regla:** la priorización por enum funciona dentro de cada bloque pero no cross-bloque (un mantenimiento mensual con `due_date` mañana NO es "menos urgente" que un ticket SI Pro de hoy — son trabajos distintos). Agrupar por sistema preserva la coherencia operativa: el agente ve todos los tickets de hoy juntos, todos los mantenimientos del día juntos, etc.

Helper canónico: `frontend/app/_shared/tasks/list-ordering.ts` espejo de `backend/src/core/tasks/list-ordering.ts`.

---

## 4. Card canónica + accionadores inline (ADR-079 §3.6)

**Una sola línea visible + 1 línea de contexto + accionadores inline.** Sin tabs, sin secciones expandibles dentro de la card.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  🎫 Ticket Support  [SI Pro]  · Carla Fernández · hace 2h · vence 2h  │
│  "Email no envía desde el panel"                                       │
│  [Completar]                                  [Abrir ticket completo →]│
└─────────────────────────────────────────────────────────────────────────┘
```

**Reglas de renderizado (espejo del mapping canónico `_shared/tasks/source-labels.ts`):**

| Elemento | Comportamiento |
|----------|----------------|
| Icono + label | `🎫 Ticket Support`, `🔧 Mantenimiento mensual`, `📞 Llamada bienvenida`, `⚙️ Setup servicio`, `📁 Proyecto` |
| Badge SI | Sólo si `source_system='support_ticket'` Y cliente tiene SI activo. Color: Pro=dorado, Medium=plateado, Basic=neutro. |
| Cliente | Nombre + apellido. Click → `/admin/clients/[id]` |
| Edad | Relativo desde `created_at` |
| SLA visual | Color verde (>50% restante), amarillo (20-50%), rojo (<20% o vencido) |
| Línea contexto | Subject del ticket / "Mantenimiento octubre 2026" / Nombre del proyecto / Producto del setup. Truncada a 80 chars. |
| Accionadores | Lista cerrada según `source_system` (§4.1). Máx. 3 botones inline + 1 CTA "Abrir [sistema] completo →". |

### 4.1 Accionadores canónicos por `source_system`

| Sistema | Accionadores inline | Delegación canónica | CTA "abrir completo" |
|---------|---------------------|---------------------|---------------------|
| `support_ticket` | `Completar` (Amendment A1: 1 accionador único — frontend siempre envía `ticket_action='resolve'`) | `support.updateConversation(id, status='resolved', internal_note)` | `/admin/support/[id]` |
| `support_inside_slot` | `Completar mantenimiento` (abre `MaintenanceLogModal` con checklist) | `MaintenanceLogService.recordCompletion()` (atómico) | `/admin/clients/[clientId]/services/[serviceId]` |
| `provisioning_manual` | `Marcar setup completado` (modal con nota obligatoria) | `ProvisioningOnTaskCompletedListener` activa servicio | `/admin/services/[serviceId]` |
| `client_lifecycle` | `Marcar como contactado` (modal con nota obligatoria de la llamada) | `ClientNotesService.createFromTaskCompletion()` + cierra task | `/admin/clients/[clientId]` |
| `project` | `Marcar item completado` (cierra task + marca item del checklist) | `tasks-on-project-task-completed.listener` (Sprint 22) → `ProjectsService.markChecklistItemCompleted()` | `/admin/projects/[projectId]` |

> **Regla canónica:** *si necesitas más de 3 accionadores inline para un sistema, eso es señal de que la card no es la herramienta — el agente debe ir al sistema completo.*

---

## 5. Lifecycle canónico (ADR-079 §3.2)

```
[trigger emite evento]
        │
        ▼
[Listener canónico crea task con priority/due_date calculados + autoAssignTask]
        │
        ▼
   ┌─────────┐  agente toma de cola pública (auto-asignación V1)
   │ pending │ ─────────────────────────────────────────►  pending (assigned_to poblado)
   └────┬────┘
        │ agente abre la task → in_progress
        ▼
  ┌────────────────┐
  │ in_progress    │
  └────────┬───────┘
           │
   ┌───────┴────────────────┬──────────────────────────────┐
   ▼                        ▼                              ▼
[Agente completa]      [Cron tasks-overdue]      [Sistema vinculado se cancela]
   │                        │                              │
   ▼                        ▼                              ▼
completed              not_completed_in_time          cancelled
[delegación al sistema   [emit task.overdue +
 vinculado]              alerta agente]
```

**Inmutabilidad terminal (TASK-INV-2):** `completed` / `cancelled` / `not_completed_in_time` no se reabren. Si el sistema vinculado cambia (ticket reabierto), se crea task NUEVA — patrón `conversation.reactivated` (Amendment A1).

**Cancelación humana eliminada (Amendment A2):** la doctrina canónica establece que las tasks son read-only respecto al sistema vinculado; la cancelación es **consecuencia mecánica** de eventos del sistema vinculado, gestionada por listeners cross-sistema. La UI ya NO muestra botón "Cancelar tarea":

- `tasks-on-slot-released.listener` cancela task `support_inside_slot` cuando el slot se libera.
- `tasks-on-service-cancelled.listener` cancela task `provisioning_manual` cuando el servicio se cancela.
- `SupportTicketTaskCreatorListener.handleUnassigned` cancela task `support_ticket` al desasignar el ticket.
- (Sprint 22) listener canónico `project` cuando un item del checklist se elimina.

---

## 6. Reasignación canónica (Amendment A2)

**Sólo el superadmin** puede reasignar tasks. Vía única: `PATCH /tasks/:id/assign` con body `{ assigned_to: <uuidAgente> | null }`. El frontend lo expone vía `_shared/tasks/ReassignTaskModal.tsx`:

- Dropdown de agentes filtrados por `ELIGIBLE_ROLES` del `source_system` (espejo de `core/tasks/auto-assign.ts → ROLES_BY_SOURCE`).
- Botón secundario "Liberar a cola pública" → `assigned_to=null`.
- El modal solo es visible si `canReassign={isAdmin}` en `TaskCard`.

**Acciones permitidas por rol:**

| Acción | superadmin | agent_full | agent_billing | agent_support |
|--------|:---------:|:----------:|:-------------:|:-------------:|
| Listar tasks (vía scope) | Todas | Mías + cola pública | Mías + cola pública | Mías + cola pública |
| Asignarse desde cola pública | ✅ | ✅ | ✅ | ✅ |
| Completar task asignada propia | ✅ | ✅ | ✅ | ✅ |
| Reasignar a otro agente | ✅ | ❌ | ❌ | ❌ |
| Liberar a cola pública | ✅ | ❌ | ❌ | ❌ |
| Cancelar task (deprecated) | ✅ (DC.34 pendiente eliminación) | ❌ | ❌ | ❌ |

> **Bridge ticket:** cancelar/reasignar ticket pasa a ser **competencia exclusiva del módulo support**. Agente en `/admin/support/[id]` cambia el agente asignado del ticket → emite `conversation.assigned` → listener crea/reasigna la task. Si admin desasigna → emite `conversation.unassigned` → listener cancela la task automáticamente. Cero acción manual sobre la task.

---

## 7. Auto-asignación V1 (ADR-079 §3.4)

Helper canónico `autoAssignTask(prisma, task)` en `core/tasks/auto-assign.ts`. Se ejecuta al CREAR la task desde el listener:

```typescript
const ROLES_BY_SOURCE: Record<TaskSourceSystem, RoleSlug[]> = {
  support_ticket:        ['agent_support', 'agent_full'],
  support_inside_slot:   ['agent_support', 'agent_full'],
  provisioning_manual:   ['agent_support', 'agent_full'],
  client_lifecycle:      ['agent_support', 'agent_full', 'agent_billing'],
  project:               [],  // sin auto-asignación; cola pública para que superadmin promueva
};
```

**Algoritmo:** SELECT agente activo del rol elegible con menor count de tasks `pending|in_progress`. Empate → desempate aleatorio (no orden alfabético — evita sesgo sistemático).

**Casos especiales:**

- **`support_ticket`**: hereda `assigned_to` del ticket directamente (el ticket ya viene asignado por el módulo support). NO invoca `autoAssignTask` (excepción documentada en el listener).
- **`project`**: cola pública pura. Superadmin asigna manualmente al promover.

> **Migración V2 (Sprint 12 — Settings + KB):** el mapping `ROLES_BY_SOURCE` y la fórmula "menor carga" se mueven a settings (`tasks.auto_assign_rules` jsonb). Mismo input/output → cero refactor del resto del sistema.

---

## 8. Priorización canónica (ADR-079 §3.3)

Helper `calculateTaskPriority(sourceSystem, clientSITier)` en `core/tasks/priority-helper.ts`:

```
support_ticket  + cliente SI Pro       → critical
support_ticket  + cliente SI Medium    → high
support_ticket  + cliente SI Basic     → high
support_ticket  + sin SI               → medium
resto                                  → medium  (orden lo marca due_date / FIFO)
```

**Por qué casi todo `medium`:** el enum `TaskPriority` con 4 valores se mantiene PERO sólo `support_ticket` lo usa en práctica. Para el resto, la priorización entre tasks la marca el sistema vinculado (anniversary_day del slot, FIFO de creación, etc.), no un enum.

> **Migración V2 (Sprint 12):** sustituir cuerpo del helper por lectura del setting `tasks.priority_rules` jsonb con mapping `source_system × clientSITier → priority`. Misma firma → cero refactor.

---

## 9. SLA canónico (ADR-079 §3.5)

Helper `calculateTaskDueDate(sourceSystem, clientSITier, createdAt)` en `core/tasks/sla-helper.ts`:

| `source_system` | SLA |
|-----------------|-----|
| `support_ticket` | tier SI Pro=4h, Medium=12h, Basic=24h, sin SI=24h (canónico ADR-061) |
| `support_inside_slot` | fin del día (23:59 UTC del mismo día) — el agente tiene la jornada para completarlo |
| `provisioning_manual` | 24h |
| `client_lifecycle` | 48h (cliente nuevo no se siente abandonado — canónico ADR-079) |
| `project` | null (sin SLA — los proyectos son trabajo de fondo) |

Cron `tasks-overdue` (`0 2 * * *` UTC) consulta `due_date != null AND due_date < now() AND status IN ('pending','in_progress')`. Los proyectos quedan fuera por construcción.

---

## 10. Crons + endpoint admin de disparo manual

| Cola BullMQ | Schedule UTC | Servicio | Qué hace | Destinatario |
|-------------|-------------|----------|----------|--------------|
| `tasks-overdue` | `0 2 * * *` | `TasksOverdueService` | Marca tareas con asignado vencidas como `not_completed_in_time` (terminal) y emite `task.overdue` por cada una | Agente asignado |
| `tasks-unassigned-overdue` | `0 9 * * *` | `TasksUnassignedOverdueService` | Detecta tareas en cola pública fuera de SLA por `source_system` (ADR-072 + ADR-079 §3.4); emite resumen agregado | Superadmin |
| `maintenance-critical` | `0 8 * * *` | `MaintenanceCriticalService` | Servicios con checklist sin `maintenance_log` >`support.maintenance_critical_threshold_days` (default 60) | Superadmin |
| `maintenance-monthly` | `0 6 * * *` (filtro `anniversary_day = today`) | `MaintenanceMonthlyService` | Crea task `support_inside_slot` por cada slot activo cuyo aniversario es hoy | — (crea tasks) |
| **`support-resolved-auto-close`** (Amendment A1) | **`30 2 * * *`** | **`SupportResolvedAutoCloseService`** | **Tickets en `resolved` desde >`support.auto_close_resolved_days` (default 7) → `→closed` silencioso. Emite `conversation.auto_closed` (notif al agente que resolvió).** | **Agente que resolvió + cliente notificado del cierre** |

**Endpoint admin de disparo manual:**

```
POST /api/v1/admin/tasks/cron/:name
:name ∈ {overdue, unassigned-overdue, maintenance-critical, maintenance-monthly, support-resolved-auto-close}
```

Triple guard: `JwtAuthGuard + AdminOnlyGuard + Manage.Job` (sólo superadmin — disparar re-ejecuta side effects globales).

**Casos de uso:** smoke testing manual, recovery operativo cuando el cron real tuvo un incidente, E2E tests deterministas.

Detalle completo en [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md).

---

## 11. CASL y permisos (ADR-079 §3.10)

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Task` | Manage | Read+Update (own + cola pública) | Read+Update (own) | Read+Update (own) | — | — |
| `ClientNote` | Manage | Manage | Read+Create+List | Read+Create+List | — | — |
| `Job` | Manage | — | — | — | — | — |

> **`Subject.TaskTag` eliminado** en Sprint 16 (la tabla y los endpoints ya no existen).

> **Reasignación entre agentes (Amendment A2):** sólo `superadmin`. `agent_full` perdió esta capacidad — la doctrina lo formaliza: la decisión de "quién hace este trabajo" la toma el superadmin, no cualquier agente con full access.

---

## 12. Settings consumidos

| Setting | Default | Cuándo aplica |
|---------|---------|---------------|
| `tasks.overdue_to_failure_days` | 7 | Días tras `due_date` para que el cron marque `not_completed_in_time` |
| `tasks.unassigned_sla_hours.support_ticket` | 4 | SLA cola pública por `source_system` |
| `tasks.unassigned_sla_hours.support_inside_slot` | 12 | |
| `tasks.unassigned_sla_hours.provisioning_manual` | 4 | Alta prioridad operativa |
| `tasks.unassigned_sla_hours.client_lifecycle` | 24 | |
| `tasks.unassigned_sla_hours.project` | 48 | |
| `tasks.unassigned_sla_hours.default` | 24 | Fallback global |
| `support.maintenance_critical_threshold_days` | 60 | Umbral crítico de mantenimiento desatendido |
| **`support.auto_close_resolved_days`** | **7** | **Días que un ticket en `resolved` espera confirmación o respuesta del cliente antes del cierre silencioso (Amendment A1)** |

Editables desde `/admin/settings` cuando Sprint 12 entregue la UI; hoy se editan en BD o vía seed.

---

## 13. Plantillas de notificación

Seedeadas en `prisma/seeds/notification-templates.ts` con guard EC-T8-17 (cero `{{{var}}}` ni `{{& var}}`):

| Evento | Canales | Destinatario | Notas |
|--------|---------|--------------|-------|
| `task.assigned` | email + internal | Agente | Subject: "Nueva tarea asignada" |
| `task.completed` | email + internal | Cliente (si hay clientNotes y `source_system ≠ support_inside_slot`) | "Tarea completada" |
| `task.overdue` | email + internal | Agente | "Tarea vencida" |
| `task.unassigned_overdue` | email + internal | Superadmin | Resumen agregado por `source_system` (truncado a 20 entradas) |
| `maintenance.completed` | email + internal | Cliente | Resumen mensual del mantenimiento (con `client_facing_notes`) |
| `maintenance.critical` | email + internal | Superadmin | Resumen agregado de servicios sin maintenance_log >threshold |
| **`conversation.resolved`** (Amendment A1, DC.33) | **email + internal** | **Cliente** | **Explica que el agente resolvió + 3 caminos: responder / confirmar / esperar 7 días** |
| **`conversation.auto_closed`** (Amendment A1, DC.33) | **email + internal** | **Agente que resolvió** | **Informa el auto-cierre del ticket #X** |

Editables desde `/admin/settings/notifications/templates`.

---

## 14. Eventos emitidos / consumidos

| Evento emitido | Outbox | Consumidor |
|----------------|--------|------------|
| `task.created` | ❌ | 🟡 huérfano (audit Sprint 9 Fase E) |
| `task.assigned` | ❌ deuda P-DEPLOY.4 | ✅ `tasks-email.listener` |
| `task.completed` | ❌ deuda P-DEPLOY.4 | ✅ `task-completed.listener` |
| `task.overdue` | ❌ operativo | ✅ `TasksOverdueListener` |
| `task.unassigned_overdue` | ❌ operativo | ✅ `TasksUnassignedOverdueListener` |
| `maintenance.completed` | ❌ deuda P-DEPLOY.4 | ✅ `MaintenanceCompletedListener` |
| `maintenance.critical` | ❌ operativo | ✅ `MaintenanceCriticalListener` |
| **`conversation.resolved`** (Amendment A1) | ❌ deuda futura | ✅ `notifications-conversation-resolved.listener` (Fase 16.E DC.33) |
| **`conversation.reactivated`** (Amendment A1) | ❌ deuda futura | ✅ `SupportTicketTaskCreatorListener.handleAssigned` (reuse) |
| **`conversation.auto_closed`** (Amendment A1) | ❌ operativo | ✅ `notifications-conversation-auto-closed.listener` (Fase 16.E DC.33) |

| Evento consumido por tasks | Listener |
|---------------------------|----------|
| `conversation.assigned` | `SupportTicketTaskCreatorListener.handleAssigned` — crea / reasigna task `support_ticket` (idempotente) |
| `conversation.reactivated` (Amendment A1) | `SupportTicketTaskCreatorListener.handleAssigned` (reuse) — crea task NUEVA al reabrir / responder cliente sobre `resolved` |
| `conversation.unassigned` | `SupportTicketTaskCreatorListener.handleUnassigned` — cancela task bridge con `skipTicketRelease` |
| `service.activated` | `ClientLifecycleTaskCreatorListener` — si primer servicio del cliente: crea task `client_lifecycle` con SLA 48h |
| `support_inside.slot_released` | `tasks-on-slot-released.listener` — cancela task `support_inside_slot` huérfana |
| `service.cancelled` | `tasks-on-service-cancelled.listener` — cancela task `provisioning_manual` huérfana |

---

## 15. Dependencias cross-módulo (excepciones R1)

| Módulo | Dirección | Razón |
|--------|-----------|-------|
| `auth (users)` | lectura | Resolver assignee/client/completer + `assertAssignableUser` |
| `notifications` | escritura | Crear notificación interna al agente |
| `support (conversations)` | escritura via `SupportService.updateConversation` | Bridge ticket↔task — excepción documentada R1 ([ADR-074](../../10-decisions/adr-074-ticket-task-bridge.md)) |
| `clients (client_notes)` | escritura via `ClientNotesService` | Persistir notas con source tracking (ADR-079 §3.8) — mismo módulo `clients`, no excepción R1 |
| `support_inside` | indirecto | Cron `maintenance-monthly` consume `support_inside_slots.anniversary_day` |
| `provisioning` | listener `provisioning-on-task-completed` | Plugin manual (`provisioning_manual`) — ADR-077 |

Detalle en [`docs/20-modules/_matrix.md`](../../20-modules/_matrix.md).

---

## 16. Edge cases más relevantes

Lista canónica completa en [`contract.md` §16](../../20-modules/tasks/contract.md). Resumen operativo:

| ID | Caso | Estado |
|----|------|--------|
| EC-T8-01 | Maintenance se cierra sin marcar checklist requerido | ✅ Bloqueado con 400 + `missing_required` |
| EC-T8-12 | `due_date` en el pasado | ✅ Validación + bypass interno crons |
| EC-T8-19/20/21 | Reabrir/reasignar/editar prioridad de task cerrada | ✅ Bloqueado (TERMINAL_STATES guard) |
| EC-T8-22 | Auto-asignación cola pública | ✅ ADR-072 + ADR-079 §3.4 |
| EC-T8-28 | Listener `task.assigned` falla → evento perdido | ⬜ P-DEPLOY.4 (Outbox) |
| EC-T8-34 | Tabla `tasks` crece indefinidamente | ⬜ Sprint 13 Hardening (archivado >1 año) |
| **DC.34** | Eliminar físicamente endpoint `/tasks/:id/cancel` | ⬜ Sub-sprint limpieza |
| **DC.35** | Regenerar task automáticamente al vencer (`task.overdue` → nueva task) | ⬜ Sprint 16 Fase 16.D residual / sub-sprint |
| **DC.36** | Linkear `task_completion` notes al sistema vinculado original | ⬜ Sprint 22 / Sprint 13 |

---

## 17. Cómo testear este módulo (smoke manual canónico)

1. **Cliente Carla compra primer servicio** → task `client_lifecycle` aparece en widget agente → completar con nota obligatoria → verificar `client_notes` con `source_system='task_completion'` + `triggered_by_action='task.completed'` + `category='onboarding'`.
2. **Asignar ticket support a Carla** → task `support_ticket` aparece con badge `[SI <tier>]` → completar inline → ticket cerrado + nota en `client_notes` con `source_system='ticket'`.
3. **Cron `maintenance-monthly` (disparo manual)** crea task `support_inside_slot` → completar con maintenance log → ver email cliente con `client_facing_notes` + nota interna en `client_notes` con `source_system='maintenance_log'`.
4. **Cliente compra producto manual (plugin `manual`)** → task `provisioning_manual` aparece → marcar setup completado con nota → service activado.
5. **Widget sidebar** muestra badge numérico correcto (count tasks pendientes del agente).
6. **Widget dashboard** muestra top 5 tasks ordenadas por regla canónica §3.
7. **Superadmin toggle "Ver todas las tareas"** muestra tasks de todos los agentes; reasignación funciona vía `ReassignTaskModal`.
8. **Agente perfil cliente → "Añadir nota excepcional"** → modal → nota creada con `source_system='exceptional'`.
9. **Cron `support-resolved-auto-close` (Amendment A1)** → ticket en `resolved` >7d pasa a `closed` silencioso + agente recibe email `conversation.auto_closed`.
10. **Cliente responde sobre ticket `resolved`** → emite `conversation.reactivated` → nueva task bridge nace en cola pública.

---

## 18. Referencias

- [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) — **Doctrina canónica vigente** + Amendments A1/A2/A3
- [ADR-041](../../10-decisions/adr-041-sistema-tareas.md) — Sistema de tareas v1 (parcialmente superseded)
- [ADR-067](../../10-decisions/adr-067-granularidad-casl-rol-staff.md) — Granularidad CASL por rol staff
- [ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) — Cola pública + SLA (refinada)
- [ADR-074](../../10-decisions/adr-074-ticket-task-bridge.md) — Bridge ticket↔task (refinada)
- [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — Contrato `ProvisionerPlugin` v2
- [`docs/20-modules/tasks/contract.md`](../../20-modules/tasks/contract.md) — Contract canónico
- [`docs/30-data/tasks.md`](../../30-data/tasks.md) — Schema canónico
- [`docs/features/notes/admin.md`](../notes/admin.md) — Operativa staff sobre notas consolidadas
- [`docs/features/support/lifecycle.md`](../support/lifecycle.md) — Lifecycle canónico ticket vs chat
- [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md) — Crons + colas
- [`docs/50-operations/settings-reference.md`](../../50-operations/settings-reference.md) — Settings
- [`docs/features/tasks/agent.md`](./agent.md) — Vista agente (operativa diaria)
- [`docs/60-roadmap/completed/sprint-16-tasks-notes-refactor.md`](../../60-roadmap/completed/sprint-16-tasks-notes-refactor.md) — Retrospectiva
