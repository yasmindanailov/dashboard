# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26 + closures Sprint 8 / 9 / 9.5 / 9.6 / 11.5 (2026-04-26 → 2026-05-01) + Sprint 11 Fases A+B (2026-05-01/02). Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)). Los sprints ✅ que aparecen abajo son punteros a `completed/`; viven aquí solo para trazabilidad cronológica de la ola P1.1.

> **Última actualización:** 2026-05-02 — **Sprint 11 cerrado al 100%** (Fases 11.A → 11.E mergeadas). Movido a [`completed/sprint-11-provisioning.md`](./completed/sprint-11-provisioning.md). 2 ADRs nuevos (077 contrato canónico + 078 auth server-side). 4 DCs nuevas registradas en `backlog.md` (DC.27/29/30/31). Cobertura final: **241/241 unit + 129/129 E2E verde**. Cola activa retoma con Sprint 15A (Plugin Framework) o Sprint 13 §13.AUTH según prioridad de Yasmin.
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

**Estado:** ⬜ pendiente — ADR-079 (contrato canónico) mergeable como PR doc-only inmediato. Fases B-E pendientes de arrancar.
**Inicio estimado:** próxima sesión tras merge ADR-079.
**Cierre estimado:** ~2-3 sesiones (5 fases A→E, A es ADR doc-only ya redactado).

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
| **16.A** | **ADR-079 — Contrato canónico tasks bridge + notes consolidation congelado** (firma TaskSourceSystem + 11 campos canónicos + helpers priority/auto-assign/sla/list-ordering + accionadores inline + consolidación client_notes + política migración Opción B + política extensión). PR doc-only. | ⬜ mergeable | PR #21 propuesto |
| **16.B** | **Migración + backend refactor**:<br>· Migración Prisma `sprint16_tasks_notes_refactor` (drop tablas, recrear schema canónico, drop `task_tags`, eliminar campos legacy, rename `MaintenanceLog.notes` → `client_facing_notes`, drop `internal_notes`).<br>· `backend/src/core/tasks/` nuevos helpers: `priority-helper.ts`, `auto-assign.ts`, `sla-helper.ts`, `list-ordering.ts`.<br>· `backend/src/modules/tasks/tasks.service.ts` reducido de 740 → ~250 LOC (eliminar create/update libre/setReason/tags/recurrencia; mantener assign/complete/cancel/findOne/findAll con nueva orden).<br>· Eliminar archivos: `task-tags.{controller,service,spec}.ts`, `task-notes.service.ts`, DTOs de tag/note.<br>· Refactor listeners: `support-ticket-task-creator` adaptado a `source_system`, `MaintenanceMonthlyService` adaptado, `provisioning-on-task-completed` filtra por `source_system='provisioning_manual'`.<br>· Listeners nuevos: `client-lifecycle-task-creator.listener.ts` (cliente), `tasks-on-slot-released.listener.ts`, `tasks-on-service-cancelled.listener.ts`.<br>· `client-notes.service.ts` consolidado en módulo `clients` con métodos canónicos.<br>· `core/casl/permissions.ts`: drop `Subject.TaskTag`, refinar `Task` y `ClientNote`.<br>· Tests unit reescritos (helpers + service + listeners). | ⬜ | suite full verde |
| **16.C** | **Frontend refactor**:<br>· `/admin/tasks/page.tsx` reescrita con nueva regla de orden + sin tabs scope.<br>· `NewTaskModal.tsx` eliminado (sin creación manual).<br>· `_shared/tasks/` nuevo: `source-labels.ts`, `TaskCard.tsx`, `CompleteTaskModal.tsx`.<br>· `_shared/widgets/TasksWidget.tsx` (dashboard) + badge sidebar item "Tareas".<br>· `/admin/page.tsx` insertar `<TasksWidget />`.<br>· `/admin/clients/[id]/ClientNotesTab.tsx` ajustado a nuevo schema + botón "Añadir nota excepcional" → `ExceptionalNoteModal.tsx`.<br>· Cada Client Component nuevo lleva marker `TODO(ADR-078, Sprint 13)`.<br>· DC.6 warnings nuevos esperados: ~5-10 (esperados por ADR-078 §3.3, NO bloqueantes). | ⬜ | UI canónica funcional |
| **16.D** | **Tests E2E + smoke testing**:<br>· `tests/e2e/tasks.spec.ts` ajustado al nuevo flujo (sin POST manual).<br>· `tests/e2e/tasks-crons.spec.ts` ajustado (campos del schema cambiados pero lógica intacta).<br>· `tests/e2e/support-inside.spec.ts` ajustado (notas a `client_notes`).<br>· `tests/e2e/client-lifecycle-welcome-task.spec.ts` (nuevo): cliente nuevo paga primer servicio → task aparece → completar con nota → verificar `client_notes` row.<br>· `tests/e2e/notes.spec.ts` (nuevo): cobertura flujo notas (5 source_systems + nota excepcional + filtros).<br>· Smoke testing manual con Carla (cliente seedeado): bridge ticket→task, mantenimiento mensual, plugin manual setup, llamada bienvenida, todas crean cards, completar pide nota cuando aplica, widget dashboard refleja correctamente. | ⬜ | suite full verde |
| **16.E** | **Cierre documental**:<br>· `docs/20-modules/tasks/contract.md` reescrito completo con la nueva doctrina (sustituyendo el banner ADR-079 actual).<br>· `docs/30-data/tasks.md` y `docs/30-data/clients.md` (sección notas) reescritos con schema canónico.<br>· `docs/features/tasks/admin.md` + `agent.md` reescritos.<br>· `docs/features/notes/admin.md` (nuevo): operativa de notas para staff.<br>· `docs/20-modules/_events.md` con listeners nuevos canónicos documentados.<br>· `docs/20-modules/_matrix.md` actualizado.<br>· `docs/50-operations/jobs-reference.md` revisado (los 3 crons de tasks-overdue/unassigned-overdue/maintenance-critical permanecen intactos en lógica, solo cambian campos consultados).<br>· Retrospectiva `completed/sprint-16-tasks-notes-refactor.md`.<br>· Mover Sprint 16 entero de `current.md` a `completed/`. | ⬜ | PR doc-only |

---

### 4. Definition of Done

#### Código
- [ ] Backend: typecheck + lint:check + build + suite unit completa verde (con +15 tests nuevos para helpers + listeners nuevos).
- [ ] Frontend: typecheck + lint (warnings DC.6 esperados, NO errores) + build verde.
- [ ] Suite E2E completa verde sin regresión (+2 specs nuevos: client-lifecycle-welcome-task + notes).
- [ ] 1 migración Prisma aplicada limpiamente: `sprint16_tasks_notes_refactor` (drop + recrear).

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
- [ ] Conventional Commits respetados.
- [ ] ADRs predecesores (038, 041, 072, 073, 074) mantienen sus headers actualizados con punteros a ADR-079 (ya hecho en Fase A).
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

> **Frase canónica para arrancar Sprint 16 con contexto fresco:**
>
> *"Lee `docs/90-meta/development-playbook.md`, `docs/10-decisions/adr-079-tasks-bridge-unidireccional-y-notas-source-tracking.md`, `docs/20-modules/tasks/contract.md`, `docs/30-data/tasks.md`, `docs/30-data/clients.md`, `docs/60-roadmap/current.md` §Sprint 16. Vamos con Sprint 16 Fase 16.B — migración + backend refactor. Crea rama `sprint16-fase-b-tasks-notes-backend` desde master."*

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
