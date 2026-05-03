# Tasks — Schema

> **Doctrina canónica vigente: [ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)** + Amendments A1/A2/A3 (Sprint 16, mergeado 2026-05-02).
> Schema simplificado: tasks como bridge unidireccional read-only desde 5 triggers automáticos cerrados. Notas consolidadas en `client_notes` con source tracking polimórfico.

> **Dominio:** capa transversal de organización del trabajo del agente humano (operativa diaria del staff).
> **Módulo:** [`docs/20-modules/tasks/contract.md`](../20-modules/tasks/contract.md).
> **Sprint origen:** Sprint 8 (modelo legacy) → Sprint 16 (refactor canónico ADR-079).
> **Estado:** ✅ schema canónico vivo desde migración `sprint16_tasks_notes_refactor` (2026-05-02).
> **ADRs activos:** [079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) (canónico vigente) · [041](../10-decisions/adr-041-sistema-tareas.md) parcial · [072](../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) (cola pública refinada) · [074](../10-decisions/adr-074-ticket-task-bridge.md) (bridge refinado) · [061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) (tiers SI consumidos por helpers).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `tasks` | ✅ Sprint 16 (refactor) | Capa transversal de trabajo del agente. UNIQUE parcial `(source_system, source_id) WHERE status IN ('pending','in_progress')` para idempotencia + permitir re-creación tras cierre. |
| `task_checklist_completions` | ✅ Sprint 8 Fase A | 1 fila por item de checklist completado dentro de una task `support_inside_slot`. Idempotente por `(task_id, item_id, item_kind)`. |
| `maintenance_logs` | ✅ Sprint 8 Fase A (refactor Sprint 16) | Registro inmutable 1:1 con tasks `support_inside_slot`. Visible al cliente. Campo `notes` renombrado a `client_facing_notes` en Sprint 16 (DC.32 cerrada). Sin `internal_notes`. |
| `service_checklist_items` | ✅ Sprint 8 Fase A | Snapshot de `product_checklist_items` al provisionar el servicio. |
| ~~`task_tags`~~ | 🪦 Eliminada Sprint 16 | DROP CASCADE — tabla muerta. |
| ~~`task_tag_assignments`~~ | 🪦 Eliminada Sprint 16 | DROP CASCADE — M2M inservible. |

---

## Tabla: `tasks` ✅ (refactor Sprint 16)

Capa transversal de organización del trabajo del agente humano. Cada `Task` es el reflejo organizado de un trigger automático canónico ([ADR-079 §1+§2](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)). NUNCA es la fuente de verdad — el "qué hay que hacer" vive en el sistema vinculado vía `(source_system, source_id)` polimórfico.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK, DEFAULT `gen_random_uuid()` | |
| `source_system` | enum `TaskSourceSystem` | NOT NULL | 5 valores cerrados: `support_ticket` · `support_inside_slot` · `provisioning_manual` · `client_lifecycle` · `project`. Reemplaza al enum legacy `TaskType` (eliminado en Sprint 16). |
| `source_id` | uuid | NOT NULL | ID en el sistema vinculado: `conversation_id` · `slot_id` · `service_id` · `client_id` · `project_id` (polimórfico, **sin FK física**). Se gana 1 columna y se pierde integridad referencial dura — aceptado porque listeners validan existencia antes de crear y las cancelaciones se gestionan vía listeners de cancelación cross-sistema. |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente afectado (denormalizado para query rápida + filtros UI). Siempre obligatorio post Sprint 16 (TASK-INV-3). |
| `assigned_to` | uuid | NULLABLE, FK → `users(id)` | null = cola pública (ADR-072 sigue vigente refinada por ADR-079 §3.4). |
| `priority` | enum `TaskPriority` | NOT NULL, DEFAULT `'medium'` | `low` · `medium` · `high` · `critical`. Calculada al crear según `core/tasks/priority-helper.ts` (sólo `support_ticket` mapea por tier SI; resto = `medium`). |
| `status` | enum `TaskStatus` | NOT NULL, DEFAULT `'pending'` | `pending` · `in_progress` · `completed` · `not_completed_in_time` · `cancelled`. Terminales inmutables (TASK-INV-2). |
| `due_date` | timestamptz | NULLABLE | Calculado al crear según `core/tasks/sla-helper.ts`. `project` queda null (sin SLA). |
| `completed_at` | timestamptz | NULLABLE | |
| `completed_by` | uuid | NULLABLE, FK → `users(id)` | Auditoría de quién completó. |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | `@updatedAt` Prisma |

**Índices:**

- **`tasks_uniq_active_per_source`** — UNIQUE parcial `(source_system, source_id) WHERE status IN ('pending','in_progress')`. Permite re-crear task tras cierre (patrón `conversation.reactivated` Amendment A1).
- `idx_tasks_assigned_to`, `idx_tasks_status`, `idx_tasks_client_id`, `idx_tasks_source_idx` (`source_system, source_id`), `idx_tasks_due_date`.

**Campos eliminados respecto al schema pre-Sprint 16** (16 → 12):

| Campo eliminado | Motivo |
|-----------------|--------|
| `type` (TaskType enum 7 valores) | Reemplazado por `source_system` (5 valores). El nombre semántico cambia: ya no es "qué clase de tarea es" sino "de qué sistema viene". |
| `title` (varchar 500) | Se renderiza dinámicamente desde el sistema vinculado (subject del ticket, "Mantenimiento mes X", "Llamada bienvenida cliente Y"). |
| `description` (text) | El "qué hay que hacer" vive en el sistema vinculado. |
| `created_by` (uuid) | Siempre cron/listener interno — no aporta info útil al agente. |
| `client_note` (string en task) | Va a `client_notes` con `source_system='task_completion'`. |
| `is_recurring`, `recurrence_day` | La recurrencia vive en el sistema vinculado (slot Support Inside). La task es para ESTE mes concreto. |
| `billing_month` (varchar 7) | Se deriva de `created_at` cuando aplica. No persistido. |
| `reason` (varchar 100) | No aplica — era texto humano para tasks manuales (ya no existen). |
| `metadata` (jsonb) | No aplica — no hay datos arbitrarios; el contexto vive en el sistema vinculado. |
| `service_id`, `conversation_id` (FK directas) | Reemplazados por `source_id` polimórfico con `source_system` que define a qué tabla apunta. |

**Notas de decisión:**

- Una task **completada nunca se reabre** (TASK-INV-2). Si el sistema vinculado vuelve a estar vivo (ticket reactivado), se crea task NUEVA — patrón `conversation.reactivated` (Amendment A1). Refuerzo runtime: `TERMINAL_STATES` guard en `TasksService.assertNotTerminal()`.
- Idempotencia por trigger:
  - `support_inside_slot`: 1 task activa por slot (UNIQUE parcial). Tras cierre, el slot puede volver a recibir task el mes siguiente.
  - `support_ticket`: 1 task activa por ticket (UNIQUE parcial). Reapertura emite `conversation.reactivated` → nueva task.
  - `provisioning_manual`: idempotencia por listener (`__idempotent_hit` flag) + UNIQUE parcial.
  - `client_lifecycle`: idempotencia por helper `clientsService.isFirstService(clientId)` + UNIQUE parcial.
  - `project`: idempotencia por endpoint `promote-to-task` (Sprint 22).
- `not_completed_in_time` se aplica vía cron `tasks-overdue` (BullMQ scheduled `0 2 * * *` UTC) — no se elimina la tarea, queda como evidencia.

---

## Tabla: `task_checklist_completions` ✅ Sprint 8 Fase A

1 fila por **item de checklist completado** dentro de una task `support_inside_slot`. Idempotente por `(task_id, item_id, item_kind)` — repetir el complete no duplica fila.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `task_id` | uuid | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE | |
| `item_id` | uuid | NOT NULL | Apunta a `product_checklist_items(id)` o `service_checklist_items(id)` según `item_kind` (FK polimórfica gestionada en código). |
| `item_kind` | enum `ChecklistItemKind` | NOT NULL | `product` (item global del producto) o `service` (snapshot al provisionar). |
| `completed_by` | uuid | NOT NULL, FK → `users(id)` | Agente que marcó el item. |
| `completed_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `notes` | text | NULLABLE | Comentario opcional del agente al completar el item. |

**Índices:**
- `idx_task_checklist_completions_task_id`
- `idx_task_checklist_completions_item_id_item_kind`
- **UNIQUE `(task_id, item_id, item_kind)`** — `task_checklist_completions_uniq`.

---

## Tabla: `maintenance_logs` ✅ Sprint 8 Fase A (refactor Sprint 16)

Registro inmutable de mantenimientos completados. Relación 1:1 con tasks `support_inside_slot`. Visible al cliente en su portal de transparencia (RGPD, [ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `task_id` | uuid | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE, **UNIQUE** | Una task genera **un solo** `maintenance_log`. |
| `service_id` | uuid | NOT NULL, FK → `services(id)` ON DELETE CASCADE | Servicio sobre el que se ejecutó el mantenimiento. |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente — denormalizado para queries rápidas en el portal del cliente. |
| `month_year` | varchar(7) | NOT NULL | YYYY-MM — mes natural al que corresponde el mantenimiento. |
| **`client_facing_notes`** | text | NOT NULL | **Renombrado en Sprint 16 (DC.32 cerrada)** — antes era `notes`. Resumen ejecutado VISIBLE al cliente: se inyecta en plantilla `maintenance.completed`. |
| `performed_by` | uuid | NOT NULL, FK → `users(id)` | Agente que completó. |
| `performed_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `metadata` | jsonb | NULLABLE | Avisos/observaciones (ej. items opcionales no completados — EC-T8-01). |

> **Cambios Sprint 16:**
> - `notes` → `client_facing_notes` (rename canónico — DC.32 ✅).
> - `internal_notes` **DROP COLUMN** — las notas internas viven ahora en `client_notes` con `source_system='maintenance_log'` + `triggered_by_action='maintenance.completed'` + `category='maintenance'`. La consolidación se hace vía `ClientNotesService.createFromMaintenanceCompletion()` invocada atómicamente por `MaintenanceLogService.recordCompletion()`.

**Índices:**
- UNIQUE `task_id` (relación 1:1 con tasks).
- `idx_maintenance_logs_service_id`, `idx_maintenance_logs_month_year`, `idx_maintenance_logs_client_id`.

**Notas de decisión:**
- Append-only de facto — una vez creado, no se edita.
- Al insertar (vía `MaintenanceLogService.recordCompletion`) → emite `maintenance.completed` → `MaintenanceCompletedListener.dispatchToUser(client_id, ...)` → email + campana.
- Si el agente marca menos del 100% de items obligatorios → 422. Si los items son opcionales, registra `metadata.warnings` con la lista pero deja completar (EC-T8-01).

---

## Tabla: `service_checklist_items` ✅ Sprint 8 Fase A

Snapshot de `product_checklist_items` cuando se provisiona un servicio. Permite que cambios futuros del producto **no afecten servicios activos**.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `service_id` | uuid | NOT NULL, FK → `services(id)` ON DELETE CASCADE | |
| `item_template_id` | uuid | NULLABLE | Apunta a `product_checklist_items(id)` original (opcional — si NULL es item ad-hoc añadido por agente). |
| `label` | varchar(300) | NOT NULL | Texto del item — copia del template al provisionar. |
| `is_required` | boolean | NOT NULL, DEFAULT `false` | |
| `order_index` | integer | NOT NULL, DEFAULT `0` | Orden de presentación al agente. |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_service_checklist_items_service_id`.

**Notas de decisión:**
- `item_template_id` es **NULLABLE no FK** porque no queremos `ON DELETE CASCADE` ni romper si el template original se borra. Es traceback informativo, no constraint duro.
- El snapshot se popula al provisionar el servicio (Sprint 11 Provisioning — `ProvisioningOrchestrator.provision`).

---

## Diagrama de relaciones (tasks)

```
tasks                                            ← schema canónico ADR-079 §3.1
  ├── source_system enum (5 valores cerrados)
  ├── source_id (polimórfico, sin FK física)
  │     ├── support_ticket           → conversations(id)        (validación listener)
  │     ├── support_inside_slot      → support_inside_slots(id) (validación listener)
  │     ├── provisioning_manual      → services(id)             (validación listener)
  │     ├── client_lifecycle         → users(id) cliente        (validación helper isFirstService)
  │     └── project                  → projects(id)             (Sprint 22 — placeholder)
  ├── client_id (FK física users)
  ├── assigned_to (FK física users, nullable)
  ├── completed_by (FK física users, nullable)
  ├── checklist_completions (1:N, solo support_inside_slot) → task_checklist_completions
  ├── maintenance_log (1:1, solo support_inside_slot) → maintenance_logs
  └── notes (1:N) → client_notes (vía source_system='task_completion' + source_id=task.id)
```

> **Diferencia clave con el modelo pre-Sprint 16:** desaparecen las FK directas `service_id` y `conversation_id` de `tasks`. Lo polimórfico (`source_system, source_id`) las reemplaza. La integridad la valida el listener creador antes de insertar; las cancelaciones cross-sistema las gestionan los 3 listeners (`tasks-on-slot-released`, `tasks-on-service-cancelled`, `support-ticket-task-creator.handleUnassigned`).

---

## Cron jobs relacionados

Detalle completo en [`docs/50-operations/jobs-reference.md`](../50-operations/jobs-reference.md).

| Cola BullMQ | Schedule UTC | Servicio | Función |
|-------------|-------------|----------|---------|
| `tasks-overdue` | `0 2 * * *` | `TasksOverdueService` | Marca tasks con asignado vencidas como `not_completed_in_time` (terminal). Compare-and-swap atómico. |
| `tasks-unassigned-overdue` | `0 9 * * *` | `TasksUnassignedOverdueService` | Cola pública fuera de SLA por `source_system` (ADR-072 + ADR-079 §3.4). Resumen agregado al superadmin. |
| `maintenance-critical` | `0 8 * * *` | `MaintenanceCriticalService` | Servicios con checklist sin `maintenance_log` >`support.maintenance_critical_threshold_days` (default 60). |
| `maintenance-monthly` | `0 6 * * *` (filtro `anniversary_day = today`) | `MaintenanceMonthlyService` | Crea task `support_inside_slot` por slot activo cuyo aniversario es hoy. |
| **`support-resolved-auto-close`** | **`30 2 * * *`** | **`SupportResolvedAutoCloseService`** | **Sprint 16 Amendment A1: tickets en `resolved` >`support.auto_close_resolved_days` (default 7) → `→closed` silencioso + emite `conversation.auto_closed`.** |

---

## Cross-references

- **Apuntan aquí (relaciones inversas):**
  - `task_checklist_completions.task_id` → `tasks(id)` ON DELETE CASCADE.
  - `maintenance_logs.task_id` → `tasks(id)` ON DELETE CASCADE, UNIQUE.
  - `client_notes.source_id` (cuando `source_system='task_completion'`) → `tasks(id)` polimórfico — FK opcional declarada en Prisma como relation `TaskClientNotes`.
- **Aquí apuntan:**
  - `users` ([auth.md](./auth.md)) — vía `client_id`, `assigned_to`, `completed_by`.
  - **NO** `services` ni `conversations` directas — se accede vía `(source_system, source_id)`.
- **Eventos emitidos:** `task.assigned`, `task.completed`, `task.overdue`, `task.unassigned_overdue`, `maintenance.completed`, `maintenance.critical` — ver [`_events.md`](../20-modules/_events.md).
- **Eventos consumidos:** `conversation.assigned`, `conversation.reactivated` (Amendment A1), `conversation.unassigned`, `service.activated` (primer servicio del cliente), `support_inside.slot_released`, `service.cancelled`.
- **Plantillas notification:** `task.assigned`, `task.completed`, `task.overdue`, `task.unassigned_overdue`, `maintenance.completed`, `maintenance.critical`, `conversation.resolved` (Amendment A1, DC.33), `conversation.auto_closed` (Amendment A1, DC.33).
- **Settings consumidos:** `tasks.overdue_to_failure_days`, `tasks.unassigned_sla_hours.*`, `support.maintenance_critical_threshold_days`, `support.auto_close_resolved_days` — ver [settings-reference](../50-operations/settings-reference.md).
- **Errores API canónicos:** `TASK_NOT_FOUND`, `TASK_TERMINAL_IMMUTABLE` (TASK-INV-2), `MAINTENANCE_REQUIRED_MISSING` (EC-T8-01).
- **AI Workers (Sprint 25 — futuro):** la promoción explícita checklist→task en proyectos (ADR-079 §3.7) habilita un AI Worker para items NO promovidos; los items promovidos siguen requiriendo agente humano.
