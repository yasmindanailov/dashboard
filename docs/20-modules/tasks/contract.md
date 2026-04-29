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
| `PATCH` | `/tasks/:id/complete` | Marcar como completada con notas (custom_work / wow_call) | `Update.Task` |
| `GET` | `/tasks/:id/checklist` | Sprint 8 Fase B.5 — items + completions de la task (cruzados con `service_checklist_items` snapshot o fallback `product_checklist_items`) | `Read.Task` |
| `POST` | `/tasks/:id/checklist/complete` | Sprint 8 Fase B.5 — marcar item como completado (idempotente upsert) | `Update.Task` |
| `POST` | `/tasks/:id/maintenance/log` | Sprint 8 Fase B.5 — flujo "Completar y notificar" maintenance: valida required (EC-T8-01) + crea `maintenance_log` + emite `maintenance.completed` (transacción atómica) | `Update.Task` |
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
| `task.completed` | Tras `update({status: completed})`, `complete()` o `MaintenanceLogService.recordCompletion()` | ❌ | 🟡 Huérfano (audit futuro) |
| `maintenance.completed` | Tras `MaintenanceLogService.recordCompletion()` post-commit (Sprint 8 Fase B.5) | ❌ — pendiente Outbox Sprint P-DEPLOY.4 | ✅ Consumido por `MaintenanceCompletedListener` → `NotificationsService` (email + campana cliente). |

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
| Validaciones de campo (Sprint 8 Fase B) | EC-T8-12..17 | ⬜ pendientes |
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
- [ ] **Sprint 8 Fase B (pendiente):** validaciones EC-T8-12..17 (due_date pasado, service_id↔client_id, regex billing_month, MaxLength description, sanitización plantillas)
- [ ] **Sprint 8 Fase C (pendiente):** listeners `task.overdue`, `maintenance.completed`, `maintenance.critical` + cron `not_completed_in_time` + cron `tasks-unassigned-overdue` (ADR-072) + WOW calls automáticos
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
