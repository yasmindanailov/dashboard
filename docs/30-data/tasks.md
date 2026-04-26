# Tasks — Schema

> **Dominio:** tareas internas (operativa diaria del equipo).
> **Módulo:** [`docs/20-modules/tasks/contract.md`](../20-modules/tasks/contract.md).
> **Sprint origen:** Sprint 8 (en curso — WIP).
> **Estado:** ✅ `tasks` implementada parcialmente. ⬜ checklist completions y maintenance logs.
> **ADRs:** [041](../10-decisions/adr-041-sistema-tareas.md) (tareas) · [022](../10-decisions/adr-022-wdify-deprecado-proyectos.md) (WDIFY deprecado) · [046](../10-decisions/adr-046-sistema-proyectos.md) (proyectos como reemplazo de WDIFY).

---

## Resumen de tablas

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `tasks` | ✅ parcial | Tareas del equipo (auto o manuales). Sprint 8 WIP — listeners pendientes |
| `task_checklist_completions` | ⬜ | Estado de completitud de cada item del checklist en una tarea |
| `maintenance_logs` | ⬜ | Registro inmutable de mantenimientos completados |

---

## Tabla: `tasks` ✅ parcial

Tareas del equipo. Generadas automáticamente o manualmente. Asignación 1:1 con un agente ([ADR-041](../10-decisions/adr-041-sistema-tareas.md)).

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `type` | enum | NOT NULL | `wow_call` · `maintenance` · `maintenance_management` · ~~`we_do_it_for_you`~~ (DEPRECADO, [ADR-022](../10-decisions/adr-022-wdify-deprecado-proyectos.md)) · `project_task` (Sprint 22, [projects.md](./projects.md)) · `custom_work` · `support_setup` |
| `status` | enum | NOT NULL, DEFAULT `'pending'` | `pending` · `in_progress` · `completed` · `not_completed_in_time` |
| `priority` | enum | NOT NULL, DEFAULT `'medium'` | `low` · `medium` · `high` · `critical` |
| `assigned_to` | uuid | NULLABLE, FK → `users(id)` | Agente asignado. **Nunca debería ser NULL en producción** (ADR-041) — pendiente validación en code (Sprint 8 WIP) |
| `client_id` | uuid | NOT NULL, FK → `users(id)` | Cliente sobre el que se ejecuta la tarea |
| `service_id` | uuid | NULLABLE, FK → `services(id)` | Servicio relacionado (si aplica) |
| `slot_id` | uuid | NULLABLE, FK → `support_inside_slots(id)` | Slot que originó la tarea (mantenimientos) |
| `project_id` | uuid | NULLABLE, FK → `projects(id)` | Tarea de proyecto. Mutuamente excluyente con `service_id` durante desarrollo ([projects.md](./projects.md)) |
| `title` | varchar(300) | NOT NULL | |
| `description` | text | NULLABLE | |
| `client_note` | text | NULLABLE | Nota del cliente al contratar (legacy WDIFY) |
| `due_date` | timestamptz | NULLABLE | |
| `completed_at` | timestamptz | NULLABLE | |
| `is_recurring` | boolean | NOT NULL, DEFAULT `false` | |
| `recurrence_day` | integer | NULLABLE | Día del mes para tareas recurrentes |
| `billing_month` | varchar(7) | NULLABLE | YYYY-MM — a qué mes corresponde el mantenimiento (idempotencia: una tarea por slot por mes) |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Índices:**
- `idx_tasks_assigned_to` — en `assigned_to`
- `idx_tasks_client_id` — en `client_id`
- `idx_tasks_status` — en `status`
- `idx_tasks_due_date` — en `due_date`
- `idx_tasks_billing_month` — en `billing_month` (verificación rápida de mantenimientos del mes)

**Notas de decisión:**
- Una tarea **completada nunca se reabre** ([ADR-041](../10-decisions/adr-041-sistema-tareas.md)) — auditabilidad. Si hace falta retomar, se crea tarea nueva.
- `not_completed_in_time` se aplica vía cron — no se elimina la tarea, queda como evidencia.
- **Deuda Sprint 8 WIP:** listener `task.assigned` ausente, validación de `assigned_to` no nulo pendiente, 2 errores lint `no-unsafe-enum-comparison` — ver [development-playbook §1](../90-meta/development-playbook.md).

---

## Tabla: `task_checklist_completions` ⬜

Estado de completitud de cada item del checklist en una tarea de mantenimiento.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `task_id` | uuid | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE | |
| `checklist_item_id` | uuid | NOT NULL, FK → `service_checklist_items(id)` | |
| `completed` | boolean | NOT NULL, DEFAULT `false` | |
| `completed_at` | timestamptz | NULLABLE | |
| `completed_by` | uuid | NULLABLE, FK → `users(id)` | |

**Índices:**
- UNIQUE `(task_id, checklist_item_id)`

---

## Tabla: `maintenance_logs` ⬜

Registro inmutable de mantenimientos completados. Se crea al completar una tarea de tipo `maintenance` o `maintenance_management`.

| Campo | Tipo | Restricciones | Notas |
|-------|------|---------------|-------|
| `id` | uuid | PK | |
| `task_id` | uuid | NOT NULL, FK → `tasks(id)`, UQ | Una tarea completada genera **un solo** maintenance_log |
| `service_id` | uuid | NOT NULL, FK → `services(id)` | |
| `completed_by` | uuid | NOT NULL, FK → `users(id)` | |
| `client_notes` | text | NULLABLE | Notas para el cliente. Se inyectan en plantilla de email |
| `internal_notes` | text | NULLABLE | Solo visibles para el equipo |
| `notified_channels` | jsonb | NOT NULL, DEFAULT `'[]'` | Canales usados: `["email", "whatsapp"]` |
| `created_at` | timestamptz | NOT NULL, DEFAULT `now()` | |

**Notas de decisión:**
- Append-only de facto — una vez creado, no se edita.
- Al insertar → emite `maintenance.completed` → módulo notifications despacha al cliente con plantilla y variables (`client.name`, `service.name`, `maintenance.notes`).
- Plantilla pendiente de implementar — ver [email-templates](../50-operations/email-templates.md).

---

## Diagrama de relaciones (tasks)

```
tasks
  ├── assigned_to → users (agente)
  ├── client_id → users (cliente)
  ├── service_id (opcional) → services
  ├── slot_id (opcional) → support_inside_slots
  ├── project_id (opcional) → projects (Sprint 22)
  ├── task_checklist_completions (1:N)
  └── maintenance_logs (1:1, opcional)

support_inside_slots
  └── tasks (1:N via slot_id)
        └── billing_month (idempotencia)
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

- **Apuntan aquí:**
  - `task_checklist_completions.task_id` → `tasks` (interno)
  - `maintenance_logs.task_id` → `tasks` (interno)
- **Aquí apuntan:**
  - `services` ([billing.md](./billing.md)) — vía `service_id`
  - `support_inside_slots` ([support.md](./support.md)) — vía `slot_id`
  - `projects` ([projects.md](./projects.md)) — vía `project_id`
  - `service_checklist_items` ([billing.md](./billing.md)) — vía `task_checklist_completions.checklist_item_id`
- **Eventos emitidos:** `task.created`, `task.assigned`, `task.completed`, `task.overdue`, `maintenance.completed`, `maintenance.critical` — ver [`_events.md`](../20-modules/_events.md). Hoy mayoría huérfanos (Sprint 8 WIP).
- **Plantillas email:** pendientes (`task.assigned`, `task.overdue`, `maintenance.completed`) — ver [email-templates](../50-operations/email-templates.md).
- **Settings consumidos:** `support.maintenance_critical_threshold_days` — ver [settings-reference](../50-operations/settings-reference.md).
- **Errores API:** `TASK_NOT_FOUND`, `CANNOT_EDIT_OTHERS_TASK` — ver [api-errors](../50-operations/api-errors.md).
- **AI Workers (Sprint 25 — futuro):** tareas `project_task` y `custom_work` podrán asignarse a un AI Worker en lugar de agente humano (`docs/AI_WORKERS.md` futuro). El agente humano siempre revisa y aprueba.
