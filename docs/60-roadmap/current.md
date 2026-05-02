# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26 + closures Sprint 8 / 9 / 9.5 / 9.6 / 11.5 (2026-04-26 → 2026-05-01) + Sprint 11 Fases A+B (2026-05-01/02). Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)). Los sprints ✅ que aparecen abajo son punteros a `completed/`; viven aquí solo para trazabilidad cronológica de la ola P1.1.

> **Última actualización:** 2026-05-02 — **Sprint 16 Fase 16.B mergeada en master** (commit `eefa046`, PR #22). Backend canónico ADR-079 vivo: `TaskSourceSystem` (5 valores) + `client_notes` con source tracking + 4 helpers `core/tasks/*` (priority/sla/auto-assign/list-ordering) + 3 listeners nuevos (client-lifecycle / slot-released / service-cancelled) + suite E2E migrada al contrato canónico. Cobertura: **183/183 unit + 118/118 E2E verde**. Próxima: Sprint 16 Fase 16.C (frontend).
> **Cambios estructurales recientes:**
> - 📜 **[ADR-069 (2026-04-29)](../10-decisions/adr-069-estrategia-deploy-diferido.md)** reclasifica **Sprint 14 Deploy real** como **gate condicionado P-DEPLOY** (no está en cola activa). Se activa sólo con trigger de negocio explícito (cliente real, demo, captación, validación externa). La cola activa post-cierre Sprint 8 son features (Sprint 11 Provisioning como cabeza, Sprint 10 Infrastructure independiente, sub-sprint billing prorrateo cross-plan ADR-077 propuesto, Sprint 12 Settings+KB, Sprint 13 Hardening) según valor funcional.
> - **Sprint 11 Fases 11.A + 11.B mergeadas en master 2026-05-02** — ADR-077 (contrato canónico `ProvisionerPlugin` v2 congelado) + orquestador + cola BullMQ `provisioning-dispatch` + cache Redis dedicado (DB 2) + plugin registry. **183/183 unit verde** (157 base Sprint 8 + 26 nuevos). Plugins concretos pendientes (Fase 11.C). Plan canónico abajo.
> - **Sprint 8 (Tasks + Support Inside) cerrado 2026-05-01** — 5 ADRs nacieron en el sprint (072..076), 157/157 unit + 117/117 E2E verde, 5 migraciones. Detalle en [`completed/sprint-8-tasks-support-inside.md`](./completed/sprint-8-tasks-support-inside.md).
> - **Sprint 11.5 (MinIO Storage)** añadido como sprint independiente — antes estaba dentro del Sprint 14 Deploy. Desbloquea adjuntos chat/tickets sin obligar a desplegar a producción.
> - **Sprint 14 (Deploy)** limpiado — solo lo que realmente requiere producción real. **Hoy gate condicionado bajo ADR-069.**
> - **Sprint 15 (Plugins)** partido en sub-sprints 15A-15H independientes — cada plugin se aborda según necesidad real, no en cadena.

---

## 🔄 Sprint 7 — Billing Hardening + Support

**Estado:** ~95% completo, **bloqueado por dependencias externas** para los pasos restantes.
**Inicio:** Sprint 6 (continuación). **Cierre formal estimado:** cuando se desbloqueen Sprints 14, 15, 8.

### ✅ Lo cerrado (verificado contra código)

- **Billing hardening (5 pasos):** admin checkout selector, validar `targetUserId`, perfil de facturación contra cliente destino, IVA recálculo en edición, descuento anual aplicado.
- **Support core (8 pasos):** SupportService completo, WebSocket gateway con auth dual JWT+guest, chat tiempo real, arquitectura dual chat+ticket, escalación, panel agente 3 columnas, bandeja tickets, detalle conversación, plantillas de email, admin.md.
- **Support hardening (25 pasos H1-H25):** dedup WS+REST, escalación única, cleanup typing, post-escalación redirige al ticket, página `[id]` diferenciada, sorting waiting_agent, indicador asignación, unread separado por type, stats filtrados, sync notas, nota obligatoria al reabrir, coherencia acciones panel, sidebar contexto cliente, etc.
- **Chat anónimo (8 pasos):** guest token, endpoint guest, rate limit 3/h, gateway auth fallback, widget guest mode, vinculación por email, vinculación manual, cleanup cron 30d.
- **Refactorización R15 (9 pasos R15.1-R15.9):** chats/page (907→77), ChatWidget (671→155), support/page (557→102), support/[id] (733→88), checkout (570→233), layout (394→79), clients/[id] (683→243), products (323→282), products/new (347→296). **Backend support refactor:** support.service (1054→90 fachada + 4 sub-servicios), gateway (526→232).

### ⏳ Lo pendiente (todo bloqueado)

| Paso | Bloqueado por | Cuándo se desbloquea |
|------|---------------|----------------------|
| 7.6.1-3 Horario soporte | Nada — se puede hacer ya | Decisión de priorizar |
| 7.7 Adjuntos archivos | **Sprint 14 — MinIO** | Tras Sprint 14 |
| 7.6.1-4 Ticket UX (rich text + email-style + adjuntos + subject editable) | **Sprint 7.5 Fase 2 + Sprint 14 MinIO** | Cuando ambos cierren |
| 7.8/7.9 IA filtro + copilot | **Sprint 15 Plugins (Claude AI)** | Tras Sprint 15 |
| 7.SI.1/2 Support Inside (badge, página cliente) | **Sprint 8 Fase D** | Tras cierre Sprint 8 |

**Acción recomendada:** **NO cerrar Sprint 7 formalmente** todavía. Cuando todos los bloqueos se resuelvan en sus respectivos sprints, se cierra de una vez.

---

## 🔄 Sprint 7.5 — Design System Foundation

**Estado:** Fase 1 ✅ cerrada. Fase 2 parcial.

### ✅ Fase 1 — Tokens y componentes base (D1–D10f, D11)

Verificada completa contra código en `frontend/components/ui/`:

- D1 Tokens CSS, D2 Button, D3 Input/Select/SearchInput/Textarea, D4 Badge/StatusDot, D5 Card, D6 Modal, D7 Table, D8 Toast, D9 EmptyState/Skeleton, D10 Avatar/Tooltip/Dropdown, D10b Pagination/StatsCard/AlertBanner, D10c UI_SPEC.md, D10d StatusTabs, D10e Breadcrumb, D10f Tabs.
- D11 Dashboard shell migrado (Sidebar, Topbar, Layout) — CSS modules, eliminados inline styles.

### ⏳ Fase 2 — Migración de páginas existentes (parcial)

Algunas páginas migradas en Sprint 7 R15 (chats, support, checkout, layout, clients, products). Otras pendientes — el playbook no enumera el % exacto. Acción: **cuando se aborde una página por trabajo de feature, migrarla al DS en el mismo PR** (oportunismo) en lugar de un sprint dedicado de migración masiva.

---

## ✅ Sprint 8 — Tasks + Support Inside (cerrado 2026-05-01)

> Sprint cerrado al 100%. Movido a [`completed/sprint-8-tasks-support-inside.md`](./completed/sprint-8-tasks-support-inside.md) con retrospectiva completa, métricas, ADRs nacidos (072..076) y lecciones aprendidas. Cobertura final: 157/157 unit + 117/117 E2E verde, 5 migraciones aplicadas.

> Las páginas operativas del módulo viven en:
> - [`docs/features/tasks/admin.md`](../features/tasks/admin.md) — operativa diaria del módulo Tasks
> - [`docs/features/tasks/agent.md`](../features/tasks/agent.md) — guía del agente
> - [`docs/features/support-inside/admin.md`](../features/support-inside/admin.md) — operativa Support Inside (staff)
> - [`docs/features/support-inside/client.md`](../features/support-inside/client.md) — guía cliente Support Inside

---

## ✅ Sprint 9 — Audit + Notifications Full + BullMQ + DLQ (P1.1) (cerrado 2026-04-27)

> Sprint cerrado al 100% del alcance MVP. Movido a [`completed/sprint-9-audit-notifications-bullmq.md`](./completed/sprint-9-audit-notifications-bullmq.md) el 2026-05-01 (saneamiento documental post-Sprint 8 cierre). DoD verificado: typecheck + lint + build + 21/21 unit + 30/30 E2E + boot real con 3 colas BullMQ + 8 crons in-process. P1.1 desbloquea Sprint 14 Deploy sin bloqueos críticos.

---

## ✅ Sprint 9.5 — UX admin de notifications + cabos sueltos (P1.1.5) (cerrado 2026-04-27)

> Sprint cerrado en 1 sesión densa. Movido a [`completed/sprint-9-5-ux-admin-notifications.md`](./completed/sprint-9-5-ux-admin-notifications.md) el 2026-05-01.

---

## ✅ Sprint 11.5 — MinIO Storage local (P1.2) (cerrado 2026-04-26)

> Sub-sprint independiente que aisló storage local del Sprint 14 Deploy para desbloquear adjuntos chat/tickets. Movido a [`completed/sprint-11-5-minio-storage.md`](./completed/sprint-11-5-minio-storage.md) el 2026-05-01.

---

## ✅ Sprint 9.6 — Split admin/cliente retroactivo + 3 portales raíz + permisos granulares (P1.1.6 / DC.7) (cerrado 2026-04-28)

> Sprint cerrado en 1 sesión densa, 12 commits encadenados. ADR-066 + ADR-067 + ADR-068 nacieron aquí. Tres portales raíz formalizados (`/admin/*`, `/dashboard/*`, `/partner/*`). Retrospectiva ejecutiva + plan canónico completo en [`completed/sprint-9-6-split-admin-cliente.md`](./completed/sprint-9-6-split-admin-cliente.md).

---

## ✅ Sprint 11 — Provisioning (P2.1) (cerrado 2026-05-02)

> Sprint cerrado al 100%. Movido a [`completed/sprint-11-provisioning.md`](./completed/sprint-11-provisioning.md) con retrospectiva completa, métricas, 2 ADRs nacidos (077 contrato canónico `ProvisionerPlugin` v2 + 078 auth server-side cookies httpOnly) y lecciones aprendidas. Cobertura final: **241/241 unit + 129/129 E2E verde**, 1 migración aplicada, 7 PRs encadenados (#13 ADR-077 → #14 chasis → #15 cierre doc 11.B → #16 11.C plugins triviales → #17 ADR-078 → #18 11.D REST + frontend → #19 sync), 8 endpoints REST nuevos, 1 cola BullMQ nueva (`provisioning-dispatch`), 5 eventos `service.*` nuevos, 4 DCs nuevas registradas en `backlog.md` (DC.27/29/30/31).

> **Documentación canónica del módulo:**
> - [`docs/features/services/admin.md`](../features/services/admin.md) — operativa diaria del módulo Services para staff.
> - [`docs/features/services/client.md`](../features/services/client.md) — guía cliente.
> - [`docs/features/provisioning/admin.md`](../features/provisioning/admin.md) — vista interna del orquestador.
> - [`docs/20-modules/provisioning/contract.md`](../20-modules/provisioning/contract.md) — contrato canónico (12 secciones, marcado ✅ implementado).

---

## 🔄 Sprint 16 — Tasks refactor + Notes consolidation (P2.1.5, plan canónico)

**Estado:** Fases 16.A + 16.B ✅ mergeadas. Fase 16.C (frontend) próxima. Fases 16.D + 16.E pendientes.
**Inicio:** 2026-05-02 (ADR-079 mergeado en PR #21).
**Avance:** 2026-05-02 (Fase 16.B mergeada en PR #22, commit `eefa046`).
**Cierre estimado:** ~1-2 sesiones más (16.C frontend + 16.D E2E nuevos + 16.E doc).

> **Doctrina aplicada:** ADR antes de código (replica el patrón Sprint 8 D.0 / Sprint 11 A / Sprint 11 D pre). [ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) congela toda la doctrina (modelo de datos, lifecycle, auto-asignación, prioridad, accionadores inline, consolidación notas, política de extensión, política de migración) antes de tocar código de Sprint 16.

---

### 1. Objetivo en una frase

Convertir el sistema de tareas en lo que originalmente debía ser: **bridge unidireccional read-only que organiza el trabajo del agente trayendo info de los demás sistemas (tickets, slots Support Inside, provisioning manual, ciclo de vida del cliente, proyectos) sin duplicar lógica**, con accionadores inline contextuales en cada card que delegan en el sistema vinculado, asignador automático por carga + rol, prioridad cross-sistema canónica, widget en sidebar + dashboard staff. **Y consolidar las notas dispersas en `client_notes` con source tracking** (`source_system` + `source_id` + `triggered_by_action`).

---

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué del sprint |
|---|-------------|--------|------------------------|
| 1 | Sprint 8 (tasks core + ClientNote) | ✅ | Refactor base |
| 2 | Sprint 11 (Provisioning + plugin manual + listener `provisioning-on-task-completed`) | ✅ | El listener se adapta a `source_system='provisioning_manual'` |
| 3 | [ADR-069](../10-decisions/adr-069-estrategia-deploy-diferido.md) (deploy diferido) | ✅ | Habilita migración Opción B (drop + reseed sin backfill) |
| 4 | [ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md) (contrato canónico) | ⬜ Fase A pendiente — mergeable inmediato como PR doc-only | Resto del sprint |

---

### 3. Pasos atómicos (sub-fases)

| # | Fase | Estado | Salida |
|---|------|--------|--------|
| **16.A** | **ADR-079 — Contrato canónico tasks bridge + notes consolidation congelado** (firma TaskSourceSystem + 11 campos canónicos + helpers priority/auto-assign/sla/list-ordering + accionadores inline + consolidación client_notes + política migración Opción B + política extensión). | ✅ **mergeada** | PR #21 (commit `2cebf26`) |
| **16.B** | **Migración + backend refactor**:<br>· Migración Prisma `sprint16_tasks_notes_refactor` aplicada (drop tablas legacy, recrear schema canónico, drop `task_tags` + `task_tag_assignments`, eliminar 5 campos task, rename `MaintenanceLog.notes` → `client_facing_notes`).<br>· 4 helpers `core/tasks/` creados: `priority-helper.ts`, `auto-assign.ts`, `sla-helper.ts`, `list-ordering.ts` (cobertura 26 unit tests nuevos).<br>· `TasksService` reducido 740→432 LOC. API canónica: `createFromTrigger` (interno), `assign`, `complete`, `completeTicketBridge`, `cancel`, `findOne`, `findAll`, `getStats`. Sin POST manual ni PATCH libre.<br>· `TasksController` con endpoints `/assign` `/complete` `/complete-ticket-bridge` `/cancel` `/checklist*` `/maintenance/log` `/notes` (GET).<br>· `ClientNotesService` consolidado en `modules/clients/` con 5 entrypoints canónicos.<br>· Listeners adaptados (support-ticket / provisioning-on-task-completed / maintenance-monthly / maintenance-log / support-message / task-completed / tasks-email).<br>· 3 listeners nuevos: `client-lifecycle-task-creator` (consume `service.activated`+`isFirstService`), `tasks-on-slot-released`, `tasks-on-service-cancelled`.<br>· Eliminados: `task-tags.{controller,service,spec}`, `task-notes.service`, DTOs legacy, `Subject.TaskTag` CASL, seed `sample-task-tags`.<br>· Suite E2E migrada al nuevo contrato (helper `tests/e2e/fixtures/tasks.ts` + 10 specs adaptados + `tasks-reason-and-tags.spec.ts` eliminado).<br>· Bug fix: `createFromTrigger` con flag `__idempotent_hit` reemplaza heurística temporal frágil del cron `maintenance-monthly`.<br>· Cobertura: **183/183 unit + 118/118 E2E verde**. | ✅ **mergeada** | PR #22 (commit `eefa046`) |
| **16.C** | **Frontend refactor**:<br>· `/admin/tasks/page.tsx` reescrita con nueva regla de orden + sin tabs scope.<br>· `NewTaskModal.tsx` eliminado (sin creación manual).<br>· `_shared/tasks/` nuevo: `source-labels.ts`, `TaskCard.tsx`, `CompleteTaskModal.tsx`.<br>· `_shared/widgets/TasksWidget.tsx` (dashboard) + badge sidebar item "Tareas".<br>· `/admin/page.tsx` insertar `<TasksWidget />`.<br>· `/admin/clients/[id]/ClientNotesTab.tsx` ajustado a nuevo schema + botón "Añadir nota excepcional" → `ExceptionalNoteModal.tsx`.<br>· Cada Client Component nuevo lleva marker `TODO(ADR-078, Sprint 13)`.<br>· DC.6 warnings nuevos esperados: ~5-10 (esperados por ADR-078 §3.3, NO bloqueantes). | ⬜ | UI canónica funcional |
| **16.D** | **Tests E2E nuevos + smoke testing manual**:<br>· `tests/e2e/client-lifecycle-welcome-task.spec.ts` (nuevo): cliente nuevo paga primer servicio → task aparece → completar con nota → verificar `client_notes` row.<br>· `tests/e2e/notes.spec.ts` (nuevo): cobertura flujo notas (5 source_systems + nota excepcional + filtros por categoría/source_system).<br>· Smoke testing manual con Carla: bridge ticket→task, mantenimiento mensual, plugin manual setup, llamada bienvenida, todas crean cards, completar pide nota cuando aplica, widget dashboard refleja correctamente. | 🟡 parcial | 16.B adelantó adaptación de los 11 specs existentes; falta 2 specs nuevos. |
| **16.E** | **Cierre documental**:<br>· `docs/20-modules/tasks/contract.md` reescrito completo con la nueva doctrina (sustituyendo el banner ADR-079 actual).<br>· `docs/30-data/tasks.md` y `docs/30-data/clients.md` (sección notas) reescritos con schema canónico.<br>· `docs/features/tasks/admin.md` + `agent.md` reescritos.<br>· `docs/features/notes/admin.md` (nuevo): operativa de notas para staff.<br>· `docs/20-modules/_events.md` con listeners nuevos canónicos documentados.<br>· `docs/20-modules/_matrix.md` actualizado.<br>· `docs/50-operations/jobs-reference.md` revisado (los 3 crons de tasks-overdue/unassigned-overdue/maintenance-critical permanecen intactos en lógica, solo cambian campos consultados).<br>· Retrospectiva `completed/sprint-16-tasks-notes-refactor.md`.<br>· Mover Sprint 16 entero de `current.md` a `completed/`. | ⬜ | PR doc-only |

---

### 4. Definition of Done

#### Código
- [x] Backend: typecheck + lint:check + build + suite unit completa verde (**183/183 unit, +26 nuevos canónicos**).
- [ ] Frontend: typecheck + lint + build verde (Fase 16.C pendiente).
- [x] Suite E2E **118/118 verde** sin regresión (10 specs adaptados al contrato canónico). Faltan 2 specs nuevos (Fase 16.D): `client-lifecycle-welcome-task` + `notes`.
- [x] 1 migración Prisma aplicada limpiamente: `sprint16_tasks_notes_refactor`.

#### Documentación
- [x] ADR-079 escrito y mergeado (Fase A).
- [ ] `docs/20-modules/tasks/contract.md` reescrito completo.
- [ ] `docs/30-data/tasks.md` reescrito.
- [ ] `docs/30-data/clients.md` (sección `client_notes`) reescrita.
- [ ] `docs/features/tasks/admin.md` + `agent.md` reescritos.
- [ ] `docs/features/notes/admin.md` (nuevo).
- [ ] `_events.md` + `_matrix.md` con listeners nuevos.
- [ ] Retrospectiva `completed/sprint-16-tasks-notes-refactor.md`.

#### Proceso
- [x] Conventional Commits respetados (Fase 16.A + 16.B mergeadas con squash en master).
- [x] ADRs predecesores (038, 041, 072, 073, 074) mantienen sus headers actualizados con punteros a ADR-079 (Fase 16.A).
- [ ] Marker mecánico `TODO(ADR-078, Sprint 13)` en cada Client Component nuevo de Fase 16.C.

#### Smoke testing manual (Yasmin)
- [ ] Cliente Carla compra primer servicio → task `client_lifecycle` aparece en widget agente → completar con nota obligatoria → verificar `client_notes` row con `source_system='task_completion'` + `triggered_by_action='task.completed'` + `category='onboarding'`.
- [ ] Asignar ticket support a Carla → task `support_ticket` aparece con badge `[SI <tier>]` si tiene SI activo → resolver inline → ticket cerrado + nota en `client_notes`.
- [ ] Cron `maintenance-monthly` (disparo manual) crea task `support_inside_slot` → completar con maintenance log → ver email cliente con `client_facing_notes` + nota interna en `client_notes`.
- [ ] Cliente compra producto manual (plugin `manual`) → task `provisioning_manual` aparece → marcar setup completado con nota → service activado.
- [ ] Widget sidebar muestra badge numérico correcto (count tasks pendientes del agente).
- [ ] Widget dashboard muestra top 5 tasks ordenadas por regla canónica §3.3 ADR-079.
- [ ] Superadmin toggle "Ver todas las tareas" muestra tasks de todos los agentes; reasignación funciona.
- [ ] Agente perfil cliente → "Añadir nota excepcional" → modal → nota creada con `source_system='exceptional'`.

---

### 5. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Migración drop pierde datos demo en BD local del desarrollador | Bajo (pre-producción ADR-069) | Reseed canónico tras migración deja BD funcional |
| Frontend de Client Components nuevos suma warnings DC.6 | Bajo | Esperado por ADR-078 §3.3, NO bloquea CI; cierre bulk en Sprint 13 §13.AUTH |
| Listeners cross-módulo nuevos (`client-lifecycle-task-creator`, `tasks-on-slot-released`, `tasks-on-service-cancelled`) introducen efectos inesperados | Medio | Tests E2E cubren los 5 flujos completos; smoke testing con Carla valida punta a punta |
| Drop de `task_tags` rompe seeds o E2E que dependían de chips de tags | Bajo | Seeds y E2E ya no referencian tags tras refactor de Fase 16.B |
| Sprint 12 (Settings + KB) llega y descubre que `calculateTaskPriority` necesita más flexibilidad | Bajo | Helper tiene mismo input/output que la versión settings → migración a settings = cero refactor §3.3 ADR-079 |
| Plan checklist→task promotion (Sprint 22) genera fricción cuando llegue | Bajo | Doctrina congelada §3.7 ADR-079; Sprint 22 nace alineado |

---

### 6. Decisiones registradas

#### ADR nuevo confirmado
- **[ADR-079](../10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md)** — Tasks como bridge unidireccional read-only + consolidación de notas con source tracking. Supersedes parciales: ADR-041 §"Tipos canónicos" + §"Creación manual"; ADR-073 §"Tags M2M" + §"reason libre"; ADR-038 §"Categorías" + §"Origen de la nota". Refina: ADR-072 §"Cola pública", ADR-074 §"Bridge ticket↔task". **Mergeable inmediato** como PR doc-only antes de Fase 16.B.

#### Decisiones locales sin ADR (documentadas en ADR-079)
- **Migración Opción B** (drop + reseed) — pre-producción ADR-069 lo permite; schema limpio sin debt legacy.
- **Auto-asignación V1 hardcoded** ahora; V2 settings configurable diferida a Sprint 12.
- **Promoción checklist→task Opción A** (explícita) sobre Opción B (assignable inline) — preserva pureza del sistema.

---

### ✍ Próxima sesión — orden recomendado

> **Frase canónica para arrancar Sprint 16 Fase 16.C (frontend) con contexto fresco:**
>
> *"Lee `docs/90-meta/development-playbook.md`, `docs/10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md` §3.6 (card canónica) + §3.11 (widget) + §3.10 (CASL frontend), `docs/60-roadmap/current.md` §Sprint 16. Vamos con Sprint 16 Fase 16.C — frontend refactor. Crea rama `sprint16-fase-c-tasks-notes-frontend` desde master."*

#### Estado backend (post Fase 16.B) — contrato vivo que debe consumir el frontend

**Endpoints REST canónicos disponibles** (todos bajo `/api/v1`):

| Método | Path | Body | Descripción |
|--------|------|------|-------------|
| `GET` | `/tasks` | `?scope=mine\|unassigned\|all&source_system=...&priority=...&page=...` | Listado paginado con orden canónico aplicado. |
| `GET` | `/tasks/stats` | `?scope=...` | Counters StatusTabs. |
| `GET` | `/tasks/:id` | — | Detalle. Shape: source_system, source_id, client_id, assigned_to, priority, status, due_date, completed_at, completed_by + relations (assignee/client/completer). |
| `PATCH` | `/tasks/:id/assign` | `{ assigned_to: string \| null }` | Asignar / reasignar / liberar a cola pública. CASL §3.10. |
| `PATCH` | `/tasks/:id/complete` | `{ note: string }` | Solo `provisioning_manual` / `client_lifecycle` / `project`. Nota obligatoria. |
| `PATCH` | `/tasks/:id/complete-ticket-bridge` | `{ ticket_action: 'resolve'\|'close', resolution_note: string }` | Solo `support_ticket`. Delega en module support. |
| `PATCH` | `/tasks/:id/cancel` | `{ reason?: string }` | Cancelar (libera ticket si bridge). |
| `GET` | `/tasks/:id/checklist` | — | Solo `support_inside_slot`. Items + completions. |
| `POST` | `/tasks/:id/checklist/complete` | `{ item_id, item_kind, notes? }` | Idempotente. |
| `POST` | `/tasks/:id/maintenance/log` | `{ client_facing_notes, internal_notes?, month_year?, checklist_completions? }` | Solo `support_inside_slot`. |
| `GET` | `/tasks/:id/notes` | — | Notas vinculadas (source_system='task_completion'). |
| `GET` | `/admin/clients/:id/structured-notes` | `?source_system=...&category=...&pinned_only=...` | Listado canónico con filtros. |
| `POST` | `/admin/clients/:id/structured-notes` | `{ body, is_pinned? }` | Crea nota excepcional (única vía pública). |
| `PATCH` | `/admin/clients/notes/:noteId/pin` | — | Toggle pin. |

**Enums canónicos exportados desde `@prisma/client`** (frontend debe sincronizar tipos):
- `TaskSourceSystem`: `support_ticket` | `support_inside_slot` | `provisioning_manual` | `client_lifecycle` | `project`
- `TaskStatus`: `pending` | `in_progress` | `completed` | `cancelled` | `not_completed_in_time`
- `TaskPriority`: `low` | `medium` | `high` | `critical`
- `NoteCategory`: `support` | `maintenance` | `onboarding` | `billing` | `project` | `technical_incident` | `exceptional`
- `NoteSourceSystem`: `ticket` | `chat` | `maintenance_log` | `task_completion` | `exceptional`

**Lo que el frontend debe ELIMINAR:**
- `frontend/app/admin/tasks/NewTaskModal.tsx` — sin creación manual.
- Cualquier referencia a `task.title` / `task.type` / `task.description` / `task.client_note` / `task.reason` / `task_tags` / `service_id` / `conversation_id` en el shape de Task.
- Filtros y chips de tags.
- Fetch de catálogo `/admin/task-tags` (eliminado).

**Lo que el frontend debe AÑADIR:**
- `frontend/app/_shared/tasks/source-labels.ts` con mapping `source_system → { icon, label, route }` (ADR-079 §3.6 tabla).
- `frontend/app/_shared/tasks/TaskCard.tsx` — card canónica simple con accionadores inline contextuales (§3.6.1 tabla).
- `frontend/app/_shared/tasks/CompleteTaskModal.tsx` — modal con nota obligatoria condicional (§3.9 tabla).
- `frontend/app/_shared/widgets/TasksWidget.tsx` — top-5 tasks dashboard (§3.11).
- Badge numérico en sidebar item "Tareas".
- `frontend/app/admin/clients/[id]/ClientNotesTab.tsx` ajustado a nuevo schema + botón "Añadir nota excepcional".
- `frontend/app/_shared/notes/ExceptionalNoteModal.tsx`.

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
