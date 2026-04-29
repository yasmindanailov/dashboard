# Tasks — Schema

> **Dominio:** tareas internas (operativa diaria del equipo).
> **Módulo:** [`docs/20-modules/tasks/contract.md`](../20-modules/tasks/contract.md).
> **Sprint origen:** Sprint 8 (en curso — Fase A cerrada 2026-04-29, Fases B-E pendientes).
> **Estado:** ✅ `tasks` (P0.1) + ✅ `task_checklist_completions` + ✅ `maintenance_logs` + ✅ `service_checklist_items` (Sprint 8 Fase A, 2026-04-29).
> **ADRs:** [041](../10-decisions/adr-041-sistema-tareas.md) (tareas) · [022](../10-decisions/adr-022-wdify-deprecado-proyectos.md) (WDIFY deprecado) · [046](../10-decisions/adr-046-sistema-proyectos.md) (proyectos como reemplazo de WDIFY) · [061](../10-decisions/adr-061-support-inside-tier-cuenta-ux.md) (Support Inside como tier de cuenta).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `tasks` | ✅ | Tareas del equipo (auto o manuales). UNIQUE `(service_id, billing_month, type)` para idempotencia mantenimiento mensual. |
| `task_checklist_completions` | ✅ Sprint 8 Fase A | Una fila por item de checklist completado dentro de una tarea (idempotente por `(task_id, item_id, item_kind)`) |
| `maintenance_logs` | ✅ Sprint 8 Fase A | Registro inmutable 1:1 con `tasks` de mantenimiento — historial visible al cliente |
| `service_checklist_items` | ✅ Sprint 8 Fase A | Snapshot de `product_checklist_items` al provisionar el servicio (cambios futuros del producto no afectan servicios activos) |

---

## Tabla: `tasks` ✅

Tareas del equipo. Generadas automáticamente o manualmente. Asignación 1:1 con un agente ([ADR-041](../10-decisions/adr-041-sistema-tareas.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `type` | enum | NOT NULL | `contact_client` · `maintenance` · `maintenance_management` · `project_task` (Sprint 22, [projects.md](./projects.md)) · `custom_work` · `support_setup`. Sprint 8 Fase B.7 ([ADR-073](../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md)) renombró `wow_call` → `contact_client`; el contexto histórico se preserva en `reason='Bienvenida primer servicio'`. |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `in_progress` · `completed` · `not_completed_in_time` · `cancelled` |
| `priority` | enum | NOT NULL, DEFAULT `'medium'` | `low` · `medium` · `high` · `critical` |
| `assigned_to` | uuid | NULLABLE, FK → `users(id)` | Agente asignado. Validación FK `assertAssignableUser` (rol staff + status active) cerrada en Sprint 8 P0.1 |
| `created_by` | uuid | NOT NULL, FK → `users(id)` | Agente que creó la tarea |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente sobre el que se ejecuta la tarea |
| `service_id` | uuid | NULLABLE, FK → `services(id)` ON DELETE SET NULL | Servicio relacionado (si aplica) |
| `conversation_id` | uuid | NULLABLE | Conversación origen (escalación de soporte) |
| `title` | varchar(500) | NOT NULL | |
| `description` | text | NULLABLE | |
| `client_note` | text | NULLABLE | Nota inline rápida del agente. **Coexiste** con `client_notes.task_id` (notas estructuradas en timeline del cliente, ADR-038 + decisión Sprint 8 §3.4). Ambos campos sirven propósitos distintos. |
| `due_date` | timestamptz | NULLABLE | |
| `completed_at` | timestamptz | NULLABLE | |
| `is_recurring` | boolean | NOT NULL, DEFAULT `false` | |
| `recurrence_day` | integer | NULLABLE | Día del mes para tareas recurrentes |
| `billing_month` | varchar(7) | NULLABLE | YYYY-MM — a qué mes corresponde el mantenimiento. Idempotencia mensual reforzada por UNIQUE `(service_id, billing_month, type)` (Sprint 8 Fase A). Validación regex en DTO (EC-T8-15). |
| `reason` | varchar(100) | NULLABLE | POR QUÉ humano de la tarea. Texto libre. Sprint 8 Fase B.7 ([ADR-073](../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md)). |
| `metadata` | jsonb | NULLABLE | Datos adicionales del provisioner / listener creador |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_tasks_assigned_to` — en `assigned_to`
- `idx_tasks_client_id` — en `client_id`
- `idx_tasks_status` — en `status`
- `idx_tasks_due_date` — en `due_date`
- `idx_tasks_billing_month` — en `billing_month`
- **UNIQUE `(service_id, billing_month, type)`** — Sprint 8 Fase A. Garantiza idempotencia del cron `MaintenanceMonthlyCron` (EC-T8-02): si el processor se ejecuta dos veces el mismo día por crash recovery, la segunda inserción falla con conflict y el job se marca skipped en lugar de duplicar tarea.

**Notas de decisión:**
- Una tarea **completada nunca se reabre** ([ADR-041](../10-decisions/adr-041-sistema-tareas.md)) — auditabilidad. Si hace falta retomar, se crea tarea nueva.
- `not_completed_in_time` se aplica vía cron `TasksOverdueProcessor` (Sprint 8 Fase C, planificado) — no se elimina la tarea, queda como evidencia.
- Sprint 8 P0.1 (2026-04-26): listener `task.assigned` + validación FK `assigned_to` cerrados.
- Sprint 8 Fase A (2026-04-29): UNIQUE compuesto + relaciones inversas hacia `task_checklist_completions`, `maintenance_logs`, `client_notes` añadidos.

---

## Tabla: `task_checklist_completions` ✅ Sprint 8 Fase A

Una fila por **item de checklist completado** dentro de una tarea. Idempotente por `(task_id, item_id, item_kind)` — repetir el complete no duplica fila.

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

**Notas de decisión:**
- FK polimórfica (`item_id` apunta a 2 tablas según `item_kind`) — alternativa a 2 columnas separadas, más compacta y consistente con la doctrina del proyecto de evitar campos sparse. La integridad referencial se valida en `ChecklistCompletionService` (Sprint 8 Fase B).

---

## Tabla: `maintenance_logs` ✅ Sprint 8 Fase A

Registro inmutable de mantenimientos completados. Relación 1:1 con `tasks` de tipo `maintenance` / `maintenance_management`. Visible al cliente en su portal de transparencia (RGPD, [ADR-010](../10-decisions/adr-010-rgpd-retencion-datos.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `task_id` | uuid | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE, **UNIQUE** | Una tarea genera **un solo** `maintenance_log`. |
| `service_id` | uuid | NOT NULL, FK → `services(id)` ON DELETE CASCADE | Servicio sobre el que se ejecutó el mantenimiento. |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente — denormalizado para queries rápidas en el portal del cliente. |
| `month_year` | varchar(7) | NOT NULL | YYYY-MM — mes natural al que corresponde el mantenimiento. |
| `notes` | text | NOT NULL | Resumen ejecutado. Se inyecta en `notification.template` cuando se emite `maintenance.completed`. |
| `performed_by` | uuid | NOT NULL, FK → `users(id)` | Agente que completó. |
| `performed_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `metadata` | jsonb | NULLABLE | Avisos/observaciones (ej: items opcionales no completados — EC-T8-01). |

**Índices:**
- UNIQUE `task_id` (relación 1:1 con `tasks`).
- `idx_maintenance_logs_service_id`, `idx_maintenance_logs_month_year`, `idx_maintenance_logs_client_id`.

**Notas de decisión:**
- Append-only de facto — una vez creado, no se edita.
- Al insertar (vía `MaintenanceLogService.recordCompletion` — Sprint 8 Fase B) → emite `maintenance.completed` → `NotificationsService.dispatchToUser(client_id, 'maintenance.completed', payload)`.
- Si el agente marca menos del 100% de items obligatorios al cerrar la task → `MaintenanceLogService` registra `metadata.warnings` y la task NO se cierra (devuelve 422). Si los items son opcionales, registra `metadata.warnings` con la lista pero deja completar (EC-T8-01).

---

## Tabla: `service_checklist_items` ✅ Sprint 8 Fase A

Snapshot de `product_checklist_items` cuando se provisiona un servicio. Permite que cambios futuros del producto **no afecten servicios activos** — el cliente que contrató con un checklist de 5 items mantiene esos 5 items aunque el producto pase a 7 luego.

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
tasks
  ├── assigned_to → users (agente)
  ├── created_by → users (agente)
  ├── client_id → users (cliente)
  ├── service_id (opcional, ON DELETE SET NULL) → services
  ├── conversation_id (opcional) → conversations  (escalación soporte)
  ├── checklist_completions (1:N) → task_checklist_completions
  ├── maintenance_log (1:1, opcional) → maintenance_logs
  └── structured_notes (1:N) → client_notes  (vía client_notes.task_id, ADR-038)

services
  ├── tasks (1:N via service_id)
  │     └── UNIQUE (service_id, billing_month, type)  (idempotencia mantenimiento mensual)
  ├── maintenance_logs (1:N via service_id)
  └── checklist_items (1:N) → service_checklist_items  (snapshot al provisionar)
```

---

## Cron jobs relacionados (aspiracionales — pendientes Sprint 8)

| Cron | Schedule | Función |
|------|----------|---------|
| **Crear tareas mensuales de mantenimiento** | Mensual en `anniversary_day` | Por cada `support_inside_slot` activo, crear `task` tipo `maintenance` o `maintenance_management` con `billing_month` correspondiente |
| **Detectar tareas no completadas a tiempo** | Diario | `pending` con `due_date < now` → `not_completed_in_time` |
| **Alertas de mantenimiento crítico** | Diario | Tareas `maintenance` con `due_date - now < support.maintenance_critical_threshold_days` → notificación al agente + admin |

Ver [jobs-reference](../50-operations/jobs-reference.md) para más detalles.

---

## Cross-references

- **Apuntan aquí (relaciones inversas):**
  - `task_checklist_completions.task_id` → `tasks(id)` ON DELETE CASCADE (interno).
  - `maintenance_logs.task_id` → `tasks(id)` ON DELETE CASCADE, UNIQUE (interno, 1:1).
  - `client_notes.task_id` → `tasks(id)` ON DELETE SET NULL — Sprint 8 Fase A. Permite vincular notas estructuradas timeline cliente con la task que las generó (ver [clients.md](./clients.md)).
- **Aquí apuntan:**
  - `services` ([billing.md](./billing.md)) — vía `service_id` (ON DELETE SET NULL).
  - `users` ([auth.md](./auth.md)) — vía `assigned_to`, `created_by`, `client_id`.
- **Eventos emitidos:** `task.created`, `task.assigned` (✅ P0.1), `task.completed`, `task.overdue` (Fase C), `maintenance.completed` (Fase B), `maintenance.critical` (Fase C) — ver [`_events.md`](../20-modules/_events.md).
- **Plantillas notification (`notification_templates`):** `task.assigned` (✅ P0.1 + migración a Sprint 9 listener); `task.overdue`, `maintenance.completed`, `maintenance.critical` pendientes Sprint 8 Fase C/D.
- **Settings consumidos:** `tasks.overdue_to_failure_days`, `support.maintenance_critical_threshold_days` (Sprint 8 Fase C/D — pendientes seed) — ver [settings-reference](../50-operations/settings-reference.md).
- **Errores API:** `TASK_NOT_FOUND`, `CANNOT_EDIT_OTHERS_TASK`, `ASSIGNED_USER_NOT_ASSIGNABLE` (P0.1) — ver [api-errors](../50-operations/api-errors.md).
- **AI Workers (Sprint 25 — futuro):** tareas `project_task` y `custom_work` podrán asignarse a un AI Worker en lugar de agente humano. El agente humano siempre revisa y aprueba.

---

## `task_tags` (Sprint 8 Fase B.7 — [ADR-073](../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md))

Catálogo de etiquetas extensibles asignables a tareas. Sustituye al uso del enum `TaskType` para capturar contextos operativos no canónicos ("renovación", "incidencia", "migración"…). El admin con `Manage.TaskTag` (superadmin + agent_full) crea y borra; el resto del staff con `Manage.Task` los lee y asigna.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `slug` | varchar(50) | NOT NULL, UNIQUE | Canónico kebab-case (regex `^[a-z0-9]+(?:-[a-z0-9]+)*$`). Estable para listeners/automatizaciones futuras (ej. `ContactClientTaskListener` asigna `slug='bienvenida'`). |
| `label` | varchar(50) | NOT NULL | Mostrable. Editable sin afectar al slug. |
| `color` | varchar(7) | NULLABLE | Hex `#RRGGBB` opcional para el chip. |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `created_by` | uuid | NULLABLE, FK → `users(id)` ON DELETE SET NULL | Trazabilidad de autoría. |

**Seed canónico** (`backend/prisma/seeds/sample-task-tags.ts` — idempotente vía slug, ejecuta en cualquier entorno): `bienvenida`, `renovacion`, `incidencia`, `migracion`, `cortesia`.

---

## `task_tag_assignments` (Sprint 8 Fase B.7 — ADR-073)

Tabla pivote M2M explícita Task ↔ TaskTag. M2M explícita (no implícita Prisma) para que CASL pueda filtrar por tag y para futuras extensiones (`assigned_by`, contadores, etc.).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `task_id` | uuid | FK → `tasks(id)` ON DELETE CASCADE | |
| `tag_id` | uuid | FK → `task_tags(id)` ON DELETE CASCADE | |
| `assigned_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**PK compuesta:** `(task_id, tag_id)` — un mismo tag no puede asignarse dos veces a la misma tarea.

**Índices:** `task_tag_assignments_tag_id_idx` — para listar tareas por tag (filtro de tablero).

**Validación backend (`TasksService.create/update`):** todos los `tag_ids` recibidos del DTO deben existir en `task_tags` (helper `assertTagsExist`). Fail-fast: si alguno no existe, 400 antes de crear/modificar la tarea.

**Límite por tarea:** 10 tags (DTO `@ArrayMaxSize(10)`).
