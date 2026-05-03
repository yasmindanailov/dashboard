# Sprint 16 — Tasks refactor + Notes consolidation (cerrado)

> **Cierre formal:** 2026-05-02 — Fases 16.A → 16.E mergeadas en master.
> **Doctrina canónica vigente:** [ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) + Amendments A1/A2/A3 (todos in-file en el ADR).
> **Cobertura final:** **183/183 unit verde + 118/118 E2E verde**, 1 migración Prisma aplicada limpiamente, 4 PRs encadenados (#21 ADR-079 → #22 backend → #23 sync docs → #24 frontend + amendments + cierre).

---

## 1. Objetivo en una frase (re-confirmado)

Convertir el sistema de tareas en lo que originalmente debía ser: **bridge unidireccional read-only que organiza el trabajo del agente trayendo info de los demás sistemas (tickets, slots Support Inside, provisioning manual, ciclo de vida del cliente, proyectos) sin duplicar lógica**, con accionadores inline contextuales en cada card que delegan en el sistema vinculado, asignador automático por carga + rol, prioridad cross-sistema canónica, widget en sidebar + dashboard staff. **Y consolidar las notas dispersas en `client_notes`** con source tracking polimórfico (`source_system` + `source_id` + `triggered_by_action`).

✅ **Cumplido al 100%** — más los 3 amendments A1/A2/A3 que nacieron durante smoke testing y refinaron lifecycle ticket / cancelación humana / lifecycle chat.

---

## 2. Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Sesiones | ~3 sesiones |
| PRs | 4 (#21 doc-only ADR + #22 backend + #23 sync + #24 frontend + amendments + Fase 16.E) |
| Migraciones Prisma | 1 (`sprint16_tasks_notes_refactor`) |
| Cobertura unit final | **183/183 verde** (157 previos + 26 nuevos canónicos en `core/tasks/*`) |
| Cobertura E2E final | **118/118 verde** (10 specs adaptados al contrato canónico + 2 nuevos `client-lifecycle-welcome-task` + `notes` + 1 nuevo `support-conversation-lifecycle`) |
| Líneas modificadas | ~4.820 inserts / ~3.561 deletes en 68 archivos cross-stack |
| ADRs nacidos | 1 nuevo ([ADR-079](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)) + 3 amendments in-file (A1, A2, A3) |
| ADRs predecesores parcialmente superseded | 5 (ADR-038, ADR-041, ADR-072, ADR-073, ADR-074) |
| DCs cerradas | DC.32 (`MaintenanceLog.notes` → `client_facing_notes`), DC.33 (plantillas notif `conversation.resolved`/`conversation.auto_closed`) |
| DCs nuevas registradas | DC.34 (eliminar físicamente `PATCH /tasks/:id/cancel`), DC.35 (regenerar task al vencer), DC.36 (linkear `task_completion` notes), DC.37 (`useConversationDetail` con WebSocket), DC.38 (unificar `ChatMessages` + `PanelChat`) |

---

## 3. Cronología

| Fecha | Hito | PR / commit |
|-------|------|-------------|
| 2026-05-02 | **Fase 16.A — ADR-079 mergeado** (doc-only, congelar doctrina antes de código) | PR #21 (`2cebf26`) |
| 2026-05-02 | **Fase 16.B — Backend canónico mergeado** | PR #22 (`eefa046`) |
| 2026-05-02 | Sync ADR docs + banners de progreso post 16.B | PR #23 (`32e3eca`) |
| 2026-05-02 | **Fase 16.C — Frontend refactor + Amendments A1+A2+A3 + Fase 16.D residual + Fase 16.E doc** (commit single) | PR #24 (`8c1838e` + commits 16.E doc) |

---

## 4. Doctrina canónica congelada (ADR-079)

### 4.1 Tres invariantes duros (§1)

1. **Toda task viene de un trigger automático canónico.** Catálogo cerrado de 5. No existe `POST /tasks` ni botón "crear task".
2. **La fuente de verdad es el sistema vinculado.** Si éste cambia, la task refleja el cambio. Si el agente cierra la task, el cierre se delega.
3. **La task NO duplica datos del sistema vinculado.** Renderiza dinámicamente en la card consultando on-demand.

### 4.2 Catálogo cerrado de 5 triggers (§2)

- `support_ticket` — `conversation.assigned` + `conversation.reactivated` (Amendment A1)
- `support_inside_slot` — cron `maintenance-monthly` 06:00 UTC (filtro `anniversary_day = today`)
- `provisioning_manual` — plugin con `capabilities.completes_via_task=true` con `followUp: ['create_setup_task']`
- `client_lifecycle` — `service.activated` del **PRIMER** servicio del cliente (helper `clientsService.isFirstService`)
- `project` — promoción manual del superadmin (Sprint 22 — placeholder)

### 4.3 Schema simplificado (§3.1)

`tasks`: 16 → 11 columnas canónicas + UNIQUE parcial `(source_system, source_id) WHERE status IN ('pending','in_progress')`. Drop `task_tags` + `task_tag_assignments` + 11 columnas legacy.

`client_notes`: drop `conversation_id` y `task_id` directos. Add `source_system` (enum 5 valores: `ticket`/`chat`/`maintenance_log`/`task_completion`/`exceptional`) + `source_id` (uuid polimórfico, sin FK física salvo opcional a Task) + `triggered_by_action` (varchar 100). Enum `NoteCategory` reemplazado completo (5 → 7 valores).

`maintenance_logs`: `notes` → `client_facing_notes` (DC.32 cerrada). Drop `internal_notes` (ahora va a `client_notes` con `source_system='maintenance_log'`).

### 4.4 Helpers canónicos (§3.3 + §3.4 + §3.5)

- `core/tasks/priority-helper.ts` — sólo `support_ticket` mapea por tier SI; resto = `medium`.
- `core/tasks/auto-assign.ts` — V1 hardcoded por rol + carga (random tie-break).
- `core/tasks/sla-helper.ts` — SLA por `source_system` (4h/12h/24h/48h/null).
- `core/tasks/list-ordering.ts` — regla 2 niveles (vencidas → tickets por tier SI → resto agrupado por sistema).

### 4.5 Card canónica + accionadores inline (§3.6)

Una sola línea visible + 1 línea de contexto + accionadores inline (máx. 3 + CTA "Abrir [sistema] completo →"). Mapping canónico en `frontend/app/_shared/tasks/source-labels.ts`.

### 4.6 Consolidación notas (§3.8)

`ClientNotesService` consolidado en `modules/clients/` con 5 entrypoints canónicos: `createFromTicketCompletion` / `createFromChatCompletion` (Amendment A3) / `createFromMaintenanceCompletion` / `createFromTaskCompletion` / `createExceptional` + `findByClient/findByTask`.

### 4.7 Permisos CASL (§3.10)

- `Task`: superadmin Manage; agentes Read+Update (own + cola pública).
- `ClientNote`: superadmin + agent_full Manage; agent_billing + agent_support Read+Create+List.
- `Subject.TaskTag` **eliminado** (la tabla y los endpoints ya no existen).

---

## 5. Amendments nacidos durante smoke testing

Los 3 amendments A1+A2+A3 nacieron durante smoke testing post Fase 16.B y se consolidaron en el mismo PR Fase 16.C (`8c1838e`). Se mergearon **in-file** en ADR-079 (no ADRs separados) para preservar trazabilidad doctrinal completa.

### 5.1 Amendment A1 — Lifecycle ticket: `resolved` transitorio + auto-close + reactivación

**Motivación.** Smoke testing reveló dos agujeros del bridge `support_ticket`:
- La task quedaba en `completed` cuando se resolvía el ticket; si el cliente volvía a escribir y el ticket pasaba a `waiting_agent`, el agente perdía visibilidad.
- Los dos accionadores `[Resolver]` `[Cerrar]` en la TaskCard duplicaban semántica sin aportar valor operativo.

**Cambios canónicos:**
- Accionador inline `support_ticket` simplificado a 1 solo `Completar` (`InlineActionKind = 'bridge_complete'`). El frontend siempre envía `ticket_action='resolve'`. Cierre archivado manual sigue accesible desde `/admin/support/[id]`.
- Estado `resolved` = transitorio. Permite mensajes (cliente puede confirmar o responder), permite cambio de prioridad. Tres caminos posibles: cliente responde → reactiva, cliente confirma vía endpoint, cron auto-close pasados N días.
- Nuevo evento `conversation.reactivated` (`reason='client_replied'` o `'admin_reopened'`). Reemplaza patrón legacy ADR-074 EC#3.
- Nuevo cron `support-resolved-auto-close` (`30 2 * * *` UTC, evita colisión con `tasks-overdue` 02:00). Setting `support.auto_close_resolved_days` default 7.
- Nuevas plantillas notif `conversation.resolved` (cliente) y `conversation.auto_closed` (agente) — DC.33 cerrada.
- Nuevo endpoint cliente `PATCH /support/conversations/:id/confirm-resolution`.

### 5.2 Amendment A2 — Cancelación humana eliminada + reasignación canónica del superadmin

**Motivación.** Smoke testing reveló disonancia conceptual en el botón "Cancelar tarea" inline:
- Para `support_ticket`, "cancelar" era en realidad "liberar el ticket a cola pública".
- Para los 4 triggers restantes, "cancelar" no tenía contraparte canónica en el sistema vinculado: la task se cerraba dejando el trabajo huérfano.

> Yasmin: *"ninguna tarea se puede cancelar como tal. Cada sistema actúa según situaciones de cancelación de un servicio, y esto hace que la tarea esté en estado 'x' según eso. Las tareas lo único que se puede hacer es reasignar — eso es 'cancelar' realmente. Y el único que puede reasignar es el superadmin."*

**Cambios canónicos:**
- Cancelación humana eliminada de la UI. La cancelación es **consecuencia mecánica** de eventos del sistema vinculado, gestionada por listeners cross-sistema (`tasks-on-slot-released`, `tasks-on-service-cancelled`, `SupportTicketTaskCreatorListener.handleUnassigned`).
- `PATCH /tasks/:id/cancel` marcado `@deprecated` y restringido a `superadmin` only (DC.34 pendiente eliminación física).
- **Reasignación canónica única vía `PATCH /tasks/:id/assign`** exclusiva superadmin. Frontend `_shared/tasks/ReassignTaskModal.tsx`: dropdown filtrado por `ELIGIBLE_ROLES` del `source_system` + botón "Liberar a cola pública".

### 5.3 Amendment A3 — Lifecycle chat: estado terminal único `resolved` + ClientNote canónica + link al ticket escalado

**Motivación.** Smoke testing reveló asimetría no deseada: los chats heredaban el modelo de tickets (resolved transitorio + closed + Reabrir) pero el feedback en chat es inmediato; mantener esos botones no aportaba valor.

> Yasmin: *"el sistema de chat, no abre tarea, que es lo normal — una conversación de chat en sí es algo en el momento. Yo valoro solo tener lo de 'resolver', y si sigue habiendo problemas el cliente vuelve a chatear en nueva conversación. Aquí el estado de 'cerrar' no es necesario, porque el feedback del usuario es inmediato. Cuando se escala a ticket, el chat deberá estar cerrado."*

**Cambios canónicos:**
- Lifecycle chat reducido a terminal único `resolved` (inmutable absoluto). Backend `addMessage` rechaza escritura para ambos lados. Backend `updateConversation` lanza `BadRequestException` si se intenta `closed` o reabrir.
- ClientNote canónica al cerrar chat: `source_system='chat'`, `triggered_by_action='chat.resolved'`, `category='support'`, `source_id=conversation_id`. Mantiene paridad con el flujo de tickets.
- Frontend `ConversationHeader.tsx`: chats vivos muestran SOLO `Resolver` + `Escalar a ticket`. Chats `resolved`: sin botones. Tickets mantienen su set completo.
- Banner azul `escalated_to` en `/admin/support/[id]` y `/dashboard/support/[id]` cuando el chat tiene ticket destino. Lookup inverso enriquecido en `SupportQueryService.findOne`.

---

## 6. Métricas de impacto

| Bloque | Antes Sprint 16 | Después Sprint 16 |
|--------|-----------------|-------------------|
| Columnas `tasks` | 16 | 11 (+ updated_at) — drop 11 columnas legacy |
| Tablas legacy eliminadas | — | 2 (`task_tags`, `task_tag_assignments`) |
| Valores enum source/type | 7 (`TaskType`) | 5 (`TaskSourceSystem`) |
| Mecanismos de nota paralelos | 3 (`Task.client_note`, `client_notes(task_id)`, `MaintenanceLog.internal_notes`) | 1 (`client_notes` con source tracking) |
| Listeners cross-sistema en dominio tasks | 1 (`SupportTicketTaskCreatorListener`) | 5 (`SupportTicketTaskCreatorListener` adaptado, `ClientLifecycleTaskCreatorListener` nuevo, `tasks-on-slot-released` nuevo, `tasks-on-service-cancelled` nuevo, `ProvisioningOnTaskCompletedListener` filtrando) |
| Frontend `_shared/tasks/` | — | 5 nuevos (TaskCard, CompleteTaskModal, MaintenanceLogModal, ReassignTaskModal, source-labels) + widget |
| Eventos `conversation.*` | 2 (`assigned`, `created`) | 5 (+ `unassigned` ya existía + 3 nuevos: `resolved`, `reactivated`, `auto_closed`) |
| Crons BullMQ totales | 8 | 9 (+ `support-resolved-auto-close`) |
| `tasks.service.ts` LOC | 740 | 432 (R15 holgado) |

---

## 7. ADRs predecesores marcados parcialmente superseded

| ADR | Sección superseded |
|-----|---------------------|
| [ADR-038](../../10-decisions/adr-038-notas-estructuradas-cliente.md) | §"Categorías" (5 → 7 valores) + §"Origen de la nota" (añade source_system + source_id + triggered_by_action) |
| [ADR-041](../../10-decisions/adr-041-sistema-tareas.md) | §"Tipos canónicos" (7 → 5 source_system) + §"Creación manual" (eliminada) |
| [ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md) | §"Cola pública" refinada (sigue vigente; gestionada por `autoAssignTask` que devuelve null cuando no hay candidato) |
| [ADR-073](../../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md) | §"Tags M2M" (eliminados) + §"reason libre" (eliminado). §"Renombrado wow_call → contact_client" pierde relevancia |
| [ADR-074](../../10-decisions/adr-074-ticket-task-bridge.md) | §"Bridge ticket↔task" refinada (1 accionador inline post A1) + EC#3 superseded por `conversation.reactivated` |

Cada ADR predecesor lleva header explícito apuntando a la sección superseded.

---

## 8. Lo que aprendimos

### 8.1 ADR antes de código produce los mejores sprints (3ª confirmación)

Sprint 8 D.0 (ADR-075), Sprint 11.A (ADR-077), Sprint 11.D pre (ADR-078), y ahora Sprint 16.A (ADR-079) confirman que congelar la doctrina antes de tocar código produce sprints más cortos y con menos refactor cross-fase. **El patrón es canónico** en este proyecto: si un sprint introduce decisión arquitectónica, la primera fase es ADR doc-only.

### 8.2 Smoke testing genera amendments útiles, no fracasos

Los 3 amendments A1+A2+A3 nacieron durante smoke testing manual con Yasmin, NO fueron previstos en el ADR original. Pero los 3 son refinamientos coherentes con la doctrina canónica, no contradicciones. Mergear-los **in-file** (sin ADRs separados) preservó trazabilidad sin fragmentar la documentación canónica.

> Lección operativa: el smoke testing no es validación binaria (✅/❌). Es la fase donde la doctrina abstracta encuentra fricción operativa real y se refina.

### 8.3 Migración Opción B (drop+reseed) aprovechó ADR-069

Pre-producción ([ADR-069](../../10-decisions/adr-069-estrategia-deploy-diferido.md)) habilitó migración limpia sin backfill. El schema queda canónico desde el día 1, sin cargar deuda histórica. **Ventana cerrada** cuando llegue trigger de deploy productivo: post-Sprint 14 ya no será posible sin migración asistida.

### 8.4 Listeners cross-sistema cierran flujos de cancelación elegantes

Antes de Sprint 16, una task `provisioning_manual` cuyo servicio se cancelaba quedaba huérfana en el listado del agente. Los 3 listeners nuevos (`tasks-on-slot-released`, `tasks-on-service-cancelled`, `ClientLifecycleTaskCreatorListener`) cierran el flujo automáticamente. **Patrón replicable:** cada vez que una task tenga contraparte en sistema vinculado, el módulo dueño del sistema vinculado debe emitir evento de cancelación que cancele la task.

### 8.5 Auto-asignación V1 hardcoded basta hasta Sprint 12

El helper `core/tasks/auto-assign.ts` con `ROLES_BY_SOURCE` hardcoded + "menor carga + random desempate" es **suficiente** para el volumen actual. La migración V2 a settings configurables (`tasks.auto_assign_rules` jsonb) está prevista en Sprint 12 con misma firma input/output → cero refactor.

### 8.6 Reasignación canónica restringida a superadmin (Amendment A2) reduce drift operativo

Antes: `agent_full` podía reasignar entre agentes. Tras Amendment A2 sólo superadmin. **Resultado operativo:** disminuye reasignaciones impulsivas; la decisión de "quién hace este trabajo" la toma quien tiene visión global, no cualquier agente con full access.

---

## 9. Deuda nueva registrada

| DC | Descripción | Trigger |
|----|-------------|---------|
| **DC.34** | Eliminar físicamente endpoint `PATCH /tasks/:id/cancel` + tests E2E EC-T8-21 + spec `cancelar task bridge → ticket queda sin asignar` | Sub-sprint limpieza post Sprint 16.D residual |
| **DC.35** | Regenerar task automáticamente al vencer (`task.overdue` → nueva task con bump prioridad) | Sub-sprint dedicado tras Fase 16.E (requiere Amendment A4 a ADR-079 §3.2) |
| **DC.36** | Linkear `task_completion` notes al sistema vinculado de la task original (extender shape `ClientNote` desde backend con `task.source_system`/`task.source_id`) | Sprint 22 (módulo project) o Sprint 13 |
| **DC.37** | `useConversationDetail` con WebSocket para tiempo real cliente | Sprint 13 Hardening UX live cross-canales |
| **DC.38** | Unificar componentes de chat cliente (`ChatMessages` + `PanelChat`) en uno solo | Sprint 13 Hardening UX o sub-sprint refactor frontend |

Y deudas no resueltas en este sprint que se posponen:

- **EC-T8-44** — Sprint 9 Fase E listener `audit-tasks` para reasignaciones/transiciones.
- **EC-T8-28 / P-DEPLOY.4** — extender Outbox a `task.*` + `maintenance.*` events.
- **EC-T8-34** — Sprint 13 Hardening: archivado `not_completed_in_time` >1 año + N+1 audit.
- **DC.27** — migrar job E2E del CI a imagen oficial Playwright.

---

## 10. Próximas vías legítimas

Con Sprint 16 cerrado, la cola activa P2 vuelve a ser:

### Vía 1 (recomendada por defecto) — Sprint 15A Plugin Framework (P2.2)

- Manifest + loader + UI dinámica desde Settings + encriptación API keys + helpers `core/provisioning/plugin-utils.ts` extendidos.
- ~1-2 sesiones. Construye sobre el contrato congelado por ADR-077 + el nuevo bridge canónico de tasks (los plugins reales tendrán visibilidad en `/admin/tasks` por construcción cuando creen tasks `provisioning_manual`).

### Vía 2 — Sprint 13 Hardening §13.AUTH (P2.9)

- Cookies httpOnly + refresh rotation + CSRF + SC nativo bulk migrate. Cierra DC.6 + DC.28 acoplados según ADR-078.
- ~3-5 sesiones. Bloquea Sprint 12+ por ADR-078 §5.

### Vía 3 — Sprint 10 Infrastructure (P2.5, independiente)

- CRUD servidores + pools + capacidad detectada + docker_templates UI.
- ~2 sesiones. Emparejado con Sprint 15E (Plugin Docker Engine).

---

## 11. DoD Sprint 16 verificado

### Código
- [x] Backend: typecheck + lint:check + build + suite unit completa verde (**183/183 unit, +26 nuevos canónicos**).
- [x] Frontend: typecheck + lint + build verde.
- [x] Suite E2E **118/118 verde** sin regresión.
- [x] 1 migración Prisma aplicada limpiamente (`sprint16_tasks_notes_refactor`).

### Documentación (Fase 16.E)
- [x] ADR-079 escrito y mergeado (Fase A) + Amendments A1+A2+A3 in-file.
- [x] `docs/20-modules/tasks/contract.md` reescrito completo.
- [x] `docs/30-data/tasks.md` reescrito.
- [x] `docs/30-data/clients.md` (sección `client_notes`) reescrita.
- [x] `docs/features/tasks/admin.md` + `agent.md` reescritos.
- [x] `docs/features/notes/admin.md` (nuevo).
- [x] `docs/features/support/lifecycle.md` (nuevo).
- [x] `_events.md` + `_matrix.md` con listeners + eventos canónicos.
- [x] `docs/50-operations/jobs-reference.md` con cron `support-resolved-auto-close`.
- [x] `docs/50-operations/settings-reference.md` con `support.auto_close_resolved_days`.
- [x] Esta retrospectiva.
- [x] Sprint 16 movido de `current.md` a `completed/`.

### Proceso
- [x] Conventional Commits respetados (4 PRs mergeados con squash en master).
- [x] ADRs predecesores (038, 041, 072, 073, 074) mantienen sus headers actualizados con punteros a ADR-079.
- [x] Marker mecánico `TODO(ADR-078, Sprint 13)` en cada Client Component nuevo de Fase 16.C (esperado por ADR-078 §3.3).

### Smoke testing manual (Yasmin con cliente Carla)
- [x] Cliente Carla compra primer servicio → task `client_lifecycle` aparece → completar con nota obligatoria → verificado `client_notes` con `source_system='task_completion'` + `triggered_by_action='task.completed'` + `category='onboarding'`.
- [x] Asignar ticket support a Carla → task `support_ticket` aparece con badge `[SI <tier>]` → resolver inline → ticket cerrado + nota en `client_notes`.
- [x] Cron `maintenance-monthly` (disparo manual) crea task `support_inside_slot` → completar con maintenance log → email cliente con `client_facing_notes` + nota interna en `client_notes`.
- [x] Cliente compra producto manual → task `provisioning_manual` aparece → marcar setup completado con nota → service activado.
- [x] Widget sidebar muestra badge numérico correcto.
- [x] Widget dashboard muestra top 5 tasks ordenadas por regla canónica §3.3 ADR-079.
- [x] Superadmin toggle "Ver todas las tareas" muestra tasks de todos los agentes; reasignación funciona vía `ReassignTaskModal`.
- [x] Agente perfil cliente → "Añadir nota excepcional" → modal → nota creada con `source_system='exceptional'`.
- [x] Cron `support-resolved-auto-close` → ticket en `resolved` >7d pasa a `closed` silencioso + agente recibe email `conversation.auto_closed`.
- [x] Cliente responde sobre ticket `resolved` → emite `conversation.reactivated` → nueva task bridge nace en cola pública.

---

## 12. Documentación canónica vigente

- [`docs/10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md`](../../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) — Doctrina canónica + Amendments A1/A2/A3
- [`docs/20-modules/tasks/contract.md`](../../20-modules/tasks/contract.md) — Contrato canónico módulo tasks
- [`docs/30-data/tasks.md`](../../30-data/tasks.md) — Schema canónico tasks
- [`docs/30-data/clients.md`](../../30-data/clients.md) — Schema canónico `client_notes`
- [`docs/features/tasks/admin.md`](../../features/tasks/admin.md) — Operativa admin tasks
- [`docs/features/tasks/agent.md`](../../features/tasks/agent.md) — Guía agente tasks
- [`docs/features/notes/admin.md`](../../features/notes/admin.md) — Operativa notas consolidadas
- [`docs/features/support/lifecycle.md`](../../features/support/lifecycle.md) — Lifecycle ticket vs chat (Amendments A1+A3)
- [`docs/20-modules/_events.md`](../../20-modules/_events.md) — Catálogo eventos actualizado
- [`docs/20-modules/_matrix.md`](../../20-modules/_matrix.md) — Matriz dependencias actualizada
- [`docs/50-operations/jobs-reference.md`](../../50-operations/jobs-reference.md) — Catálogo crons + colas (incluye `support-resolved-auto-close`)
- [`docs/50-operations/settings-reference.md`](../../50-operations/settings-reference.md) — Settings (incluye `support.auto_close_resolved_days`)
