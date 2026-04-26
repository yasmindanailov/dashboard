# tasks — Contract

## 1. Propósito

Sistema interno de gestión de tareas para el equipo de Aelium. Permite que admins y agentes asignen, reasignen, completen y prioricen trabajo: tareas técnicas, gestiones administrativas, mantenimientos programados, comunicaciones con clientes. Cada tarea tiene tipo, prioridad, asignado, cliente vinculado opcional, servicio vinculado opcional, fecha límite y notas (cliente / internas).

NO es visible al cliente — es herramienta interna del equipo.

---

## 2. Estado de implementación

🟡 **Parcial — Sprint 8 cierre mínimo (P0.1) cerrado 2026-04-26.** Module + service + controller + DTOs implementados. Frontend (lista, detalle, modal de crear) implementado.

**Cerrado en P0.1:**

- ✅ Listener `task.assigned` → email al agente + notificación interna (`tasks-email.listener.ts`)
- ✅ Validación FK `assigned_to` (existe + status=`active` + rol en `superadmin|agent_*`)
- ✅ Tests E2E (3 tests en `tests/e2e/tasks.spec.ts`)
- ✅ 2 errores `no-unsafe-enum-comparison` resueltos (uso `TaskStatusDto.completed`)

**Pendiente Fases B-E del Sprint 8** (no bloquea desarrollo, sí bloquea cadena):

- Schema Fase A: `task_checklist_completions`, `maintenance_logs`, `product_checklist_items`, `service_checklist_items`, FK `client_notes.task_id`
- Validación explícita de transiciones de `status` (TASK-INV-2)
- Listeners `task.overdue`, `maintenance.completed`, `maintenance.critical`
- Cron `not_completed_in_time`
- Fase D Support Inside (UX dedicada, ADR-061)

---

## 3. Modelos Prisma propios

| Tabla | Descripción | Invariantes destacadas |
|-------|-------------|------------------------|
| `tasks` | Tareas internas del equipo | `assigned_to` puede ser null (sin asignar). `due_date` opcional. `status`: `pending`, `in_progress`, `completed`, `cancelled`. |

> Schema simple. No hay subtareas, dependencias entre tareas, ni etiquetas en este sprint. Si se priorizan en futuro, requieren tablas adicionales.

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
| `GET` | `/tasks` | Listar (paginated, filtros por status, priority, assigned_to, client_id, service_id) | `Read.Task` + role filter |
| `GET` | `/tasks/stats` | Contadores por estado (pendientes, hoy, semana) | `Read.Task` |
| `GET` | `/tasks/:id` | Detalle | `Read.Task` |
| `PATCH` | `/tasks/:id` | Actualizar (campos editables, ownership según rol) | `Update.Task` |
| `PATCH` | `/tasks/:id/complete` | Marcar como completada con notas | `Update.Task` |
| `DELETE` | `/tasks/:id` | Eliminar tarea | `Delete.Task` |

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
| `task.completed` | Tras `update({status: completed})` o `complete()` | ❌ | 🟡 Huérfano (audit futuro) |

> **Estado P0.1 (2026-04-26):** `task.assigned` ya tiene listener (`tasks-email.listener.ts`). Los otros dos siguen huérfanos a la espera del módulo `audit` (Sprint 9 P1.1).

---

## 8. Eventos consumidos

Ninguno actualmente.

> **Propuesta futura:** consumir `service.suspended` para crear automáticamente una tarea técnica al equipo cuando se suspende un servicio. Hoy se hace manualmente.

---

## 9. Servicios consumidos cross-módulo

Ninguno. `TasksService` directo (sin sub-services todavía — el archivo está cerca del límite R15 con ~280 líneas, candidato a refactor si crece).

---

## 10. CASL — Permisos

### Subjects gestionados

| Subject | Descripción |
|---------|-------------|
| `Subject.Task` | Tareas internas |
| `Subject.Maintenance` | (futuro) tareas de mantenimiento programado |

### Permisos por rol

| Subject | superadmin | agent_full | agent_billing | agent_support | client | partner |
|---------|------------|------------|---------------|---------------|--------|---------|
| `Task` | manage | manage | manage | manage | — | — |
| `Maintenance` | manage | manage | manage | manage | — | — |

> **Importante:** clientes y partners NO ven tareas. Es 100% herramienta interna.

> **Filtros adicionales en service** (no solo CASL):
> - Agentes ven solo sus tareas asignadas + sin asignar
> - Admin (`superadmin`, `agent_full`) ven todas

---

## 11. Settings consumidos

Ninguno actualmente.

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

Ninguno actualmente.

> **Candidato futuro:** cron diario que envíe digest a cada agente con sus tareas del día / próximas a vencer.

---

## 14. Invariantes

- **TASK-INV-1:** El `created_by` es inmutable tras creación. Trazabilidad de origen.
- **TASK-INV-2:** El `status` solo transiciona en orden válido: `pending → in_progress → completed`, o cualquier estado → `cancelled`. No hay vuelta atrás desde `completed` o `cancelled`. (Sprint 8 hardening pendiente: añadir validación explícita).
- **TASK-INV-3:** Una tarea puede no tener `client_id` ni `service_id` (tareas de admin internas, ej: revisar logs). Estas son visibles solo a roles internos.
- **TASK-INV-4:** Notas: `client_note` es texto visible al cliente si se exporta o muestra; `internal_note` es solo para el equipo. Mantener separación clara en UI.

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
- [ ] Validación explícita de transiciones de `status` (TASK-INV-2)
- [ ] Refactor preventivo R15 si `tasks.service.ts` supera 300 líneas
- [ ] **Futuro:** consumir `service.suspended` para crear tareas técnicas automáticas

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
