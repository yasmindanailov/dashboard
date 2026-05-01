# Sprint 8 — Tasks + Support Inside ✅

> **Estado:** ✅ Cerrado
> **Cierre:** 2026-05-01 (~6 sesiones encadenadas, ~25 commits durante el sprint, en rama `sprint8-fase-c-d-backend`)
> **Identificadores:** P0.1 (mínimo desbloqueante 2026-04-26) + Fase A/B/C/D/E
> **ADRs nacidos durante el sprint:** [ADR-072](../../10-decisions/adr-072-tareas-sin-asignar-cola-publica.md), [ADR-073](../../10-decisions/adr-073-tipos-flexibles-tasks-reason-tags.md), [ADR-074](../../10-decisions/adr-074-ticket-task-bridge.md), [ADR-075](../../10-decisions/adr-075-support-inside-ux-lista-y-aislamiento-productos.md), [ADR-076](../../10-decisions/adr-076-checkout-unico-support-inside-via-evento.md)

---

## Objetivo

Cerrar el módulo Tasks como herramienta interna real del equipo Aelium (no solo schema): tipos canónicos, validaciones defensivas, transiciones de estado controladas, automatización vía crons BullMQ y bridge bidireccional con tickets de soporte. **Sobre esa base**, materializar Support Inside como **tier de cuenta visible** con UX dedicada (no producto técnico aislado), aislamiento del CRUD genérico de productos, y visibilidad transversal en 3 puntos de la UI.

---

## Lo que entregó

### 1. P0.1 — Mínimo desbloqueante (2026-04-26)

Listener `tasks-email.listener` consume `task.assigned` → email + notificación interna al agente. Helper `assertAssignableUser` en `tasks.service.ts` valida que `assigned_to` existe + `status='active'` + rol asignable (cierra **deuda A4** de [`_matrix.md`](../../20-modules/_matrix.md)). Tests E2E base en `tests/e2e/tasks.spec.ts`. Resuelve los 2 errores `no-unsafe-enum-comparison` que F0.6 había saltado por estar en Sprint 8 WIP.

### 2. Fase A — Schemas de checklist + maintenance + admin/users (`6509260`, 2026-04-29)

4 tablas Prisma nuevas (`task_checklist_completions`, `maintenance_logs`, `service_checklist_items`, `client_notes.task_id` FK) + UNIQUE compuesto `(service_id, billing_month, type)` para idempotencia mantenimiento mensual. Endpoint `GET /api/v1/admin/users` con `JwtAuthGuard + AdminOnlyGuard + PoliciesGuard(List.Agent)` para alimentar el selector de agentes en `NewTaskModal`. **Fix CASL crítico durante el sprint:** `inverted Manage.Agent` (wildcard) anulaba `Read/List.Agent`; refactorizado a `inverted [Create, Update, Delete]` para permitir lectura a los 3 staff + bloquear escritura a non-superadmin.

### 3. Fase B — Tablero, validaciones, bridge ticket↔task (B.1..B.10.fix2)

10 sub-fases consecutivas que dejaron Tasks como herramienta operativa real:

- **B.1** (`ec123bf`) — Tablero `/admin/tasks` con 3 tabs scope (Mis / Sin asignar / Todas), `getStats` honesto por scope, `statusFilter='pending'` default. **ADR-072** nace aquí: cola pública sin asignar como buffer doctrinal con SLA por tipo.
- **B.2 + B.4** (`8743cea`) — Bloques adaptativos por `TaskType` (Datos del cliente y plan en `contact_client`, Checklist en `maintenance`, link a Sprint 22 en `project_task`). `ClientNotesTab` admin con link "Tarea origen" (título + badge tipo); backend `listStructuredNotes` enriquecido sin N+1.
- **B.3** (`0e29c85`) — DS compliance: refactor masivo de tokens fantasma `--color-*` (la barra de prioridad se renderizaba transparente en producción) → tokens canónicos `--text-*/--brand/--border/--surface-*` + eliminación de 4 inline styles ad-hoc. 38 ocurrencias migradas. Suite E2E 88/88 sin regresión.
- **B.5** (`dbbf4b2`) — `ChecklistCompletionService` (upsert idempotente) + `MaintenanceLogService` (transacción atómica) + 3 endpoints. `MaintenanceCompletedListener` notifica cliente. **Cierra EC-T8-01** (items required sin completar bloquean cierre con 400 + `missing_required` array). **Fix oportunista crítico:** `GlobalExceptionFilter` ahora preserva metadata adicional del body cuando `HttpException` se construye con objeto.
- **B.6** (`840d964`) — Validaciones defensivas EC-T8-12..17: `assertDueDateNotInPast` (con bypass `allowOverdue` para crons), `assertServiceBelongsToClient`, `BILLING_MONTH_REGEX`, `@MaxLength(50000)` en description, auditoría de plantillas Handlebars (cero `{{{var}}}` con guard de seguridad).
- **B.7** (`d8f1d51`) — **ADR-073** nace aquí: tipos flexibles. Rename enum `wow_call → contact_client`. Catálogo `task_tags` + tabla pivote m2m + endpoints `/admin/task-tags`. Frontend tipos sincronizados con backend (antes divergían en `TaskPriority` y faltaba `not_completed_in_time`).
- **B.8** (`a2e5cc1`) — Header detail alineado con `ConversationHeader` (sin badges duplicados, tokens DS idénticos al canónico de support).
- **B.9** (`b6d6d20`) — Refactor notas: card inline persistente con POST inmediato + modal canónico `TaskCompletionModal`. Listener `TaskCompletedListener` notifica cliente vía email + campana cuando hay `clientNotes` y tipo no-maintenance. Schema FK física `client_notes.author` ON DELETE RESTRICT.
- **B.10** (`c204f08`) — **ADR-074** nace aquí: bridge ticket↔task. Nuevo `TaskType.support_ticket`. `SupportTicketTaskCreatorListener` consume `conversation.assigned` → crea/reasigna task bridge. Cierre canónico unificado en la tarea con dual path (resolver/cerrar ticket). 12 edge cases doctrinales documentados en el ADR.
- **B.10.fix + fix2** (`8bffaf4`, `2f5e2b8`, `7107de1`) — UI Select de asignación + cancelar libera ticket + 3 EC críticos del bridge (reabrir / nace asignado / desasignar libera).

**Cobertura final Fase B:** 86/86 unit, 107/107 E2E.

### 4. Fase C — Automatización vía crons BullMQ scheduled (`fe51931`, `5aa2449`, `8df107e`, `c632e19`, 2026-05-01)

3 colas BullMQ scheduled con leader election natural via Redis ([ADR-063](../../10-decisions/adr-063-decision.md) + [ADR-064](../../10-decisions/adr-064-decision.md)) — patrón canónico **service testeable + processor delgado + DLQ + listener delegando en `NotificationsService`**:

| Cola | Schedule UTC | Service | Listener | Destinatario |
|------|--------------|---------|----------|--------------|
| `tasks-overdue` | `0 2 * * *` | `TasksOverdueService` | `TasksOverdueListener` | Agente asignado |
| `tasks-unassigned-overdue` | `0 9 * * *` | `TasksUnassignedOverdueService` | `TasksUnassignedOverdueListener` | Superadmin (resumen agregado) |
| `maintenance-critical` | `0 8 * * *` | `MaintenanceCriticalService` | `MaintenanceCriticalListener` | Superadmin (resumen agregado, degradación elegante hasta Fase D) |

8 settings nuevos seedeados (`tasks.overdue_to_failure_days`, 6× `tasks.unassigned_sla_hours.*`, `support.maintenance_critical_threshold_days`). 6 plantillas Handlebars seedeadas con guard EC-T8-17 OK. Endpoint admin `POST /api/v1/admin/tasks/cron/:name` con `Manage.Job` (sólo superadmin) habilita smoke + E2E + recovery operativo.

**Cobertura final Fase C:** 107/107 unit (86 + 21 nuevos), 112/112 E2E (107 + 5 nuevos `tasks-crons.spec.ts`).

### 5. Fase D backend — Support Inside como tier de cuenta (`13f343f`, `e527ccd`, `071de84`, `8266960`)

Schema canónico (3 tablas + 5 enums + relaciones inversas), `SupportInsideService` con `subscribe/upgrade/cancel/addSlot/releaseSlot/getStatus`, 6 endpoints cliente + 3 endpoints admin + endpoint trigger cron. CASL extendido con `Subject.SupportInside`. **`SupportInsideIsolationGuard`** ([ADR-075](../../10-decisions/adr-075-support-inside-ux-lista-y-aislamiento-productos.md) §A.2 — defense in depth) bloquea POST/PATCH/DELETE sobre `type=support_inside` salvo header interno `X-Aelium-Source: support-inside-admin`. Cron `maintenance-monthly` (originalmente `0 6 1 * *` UTC). Seed canónico 3 planes Básico/Medium/Pro con pricing mensual + anual (15% descuento). Migración versionada `sprint8d_cleanup_legacy_support_inside_basic` para limpiar producto huérfano del seed previo.

**Cobertura final Fase D backend:** 135/135 unit (107 + 28 nuevos: 15 SupportInsideService + 7 MaintenanceMonthlyService + 6 IsolationGuard), 117/117 E2E (112 + 5 nuevos).

### 6. Fase D frontend — UX dedicada (mismo commit `8266960`)

3 rutas Next.js nuevas:
- `/dashboard/support-inside` (cliente) — comparador 3 cards lado a lado con toggle mensual/anual; vista de gestión (slots + canales + SLA + cancelar) si tiene plan activo.
- `/admin/support-inside-plans` (admin índice) — tabla vertical 3 filas (NO comparador — [ADR-075](../../10-decisions/adr-075-support-inside-ux-lista-y-aislamiento-productos.md) §B.2). Sin botón "Crear plan".
- `/admin/support-inside-plans/[slug]` (editor) — pila vertical de 5 secciones card extensibles. Cada card guarda con su propio botón (NO auto-save). Componente DS reutilizable `<EditorSectionCard>` con patrón canónico documentado: cada sprint añade UNA card al final, NO redistribuye.

Aislamiento ADR-075 frontend: constante `PRODUCT_TYPES_CREATABLE` excluye `support_inside`; listado `/admin/products` renderiza filas SI en gris con badge "Tier de cuenta"; detalle directo redirige al editor dedicado con toast.

### 7. Fase D.12 — Visibilidad transversal post-auditoría (`4bf974d`, 2026-05-01)

Auditoría detectó que Support Inside era módulo aislado, NO capa transversal. Cierre del gap completo en una sub-fase densa:

- **D.12.1** — Drift `anniversary_day`: campo nuevo en `support_inside_slots` (CHECK 1..28) + reescritura `MaintenanceMonthlyService` para filtrar `WHERE anniversary_day = EXTRACT(DAY FROM NOW())` + cron `0 6 1 * *` → `0 6 * * *` (diario, distribuye carga del equipo).
- **D.12.2** — `SupportInsidePriorityListener` consume `conversation.created` → mapea `priority_tier` → `ConversationPriority`. Compare-and-swap: solo escala si `priority='normal'` (preserva elección manual del agente — EC-T8-47).
- **D.12.3** — `SupportInsideAuditListener` consume los 4 eventos canónicos → `AuditService.logChange()`. Cumple R3 + alimenta portal transparencia cliente.
- **D.12.4-7** — Helpers single-query `clientsService.findOne` / `supportQueryService.findOne` / `dashboardService.getClientOverview` enriquecidos con info SI sin N+1. 3 badges UI nuevos (`ClientDetailHeader`, `ConversationHeader`, `ClientStats`) + 1 modal "Asignar slot".
- **D.12.9** — **ADR-076** nace aquí: refactor checkout vía evento. Modal subscribe eliminado del comparador; redirige a `/dashboard/billing/checkout?product_pricing_id=...`. Listener `SupportInsideOnServiceProvisionedListener` consume `service.provisioned` y crea/reactiva subscription. Un único motor de checkout cliente para Stripe/Redsys post-Sprint 14.
- **D.12.10** — Seed `cliente@aelium.test` (Carla) activa Plan Medium + 1 slot vía flujo canónico `BillingCheckoutService.checkout()` (entrena el flujo real, no atajo Prisma).
- **D.12.fix** — Auditoría post-test:
  - Bug "slot al propio plan SI" — defense in depth doble (`eligible-services` + `addSlot()`).
  - Bug `Console Error {}` — el helper `api()` lanza shape `{status, message, correlationId}` plain sin prototype; migrado a `console.warn(prefix, getErrorMessage(e))`.
  - **`applicable_product_types` por plan** — `ProductType[]` en `support_inside_config` con backfill canónico `['hosting_web', 'docker_service']`. Empty array = sin restricción (reservado para Enterprise futuro).
  - Clarificación doctrinal **DC.16**: `services.credit_balance_eur` reescrita como "buffer técnico de prorrateo, NO sistema de créditos". ADR-029 §"Cuándo revisar" con frontera explícita anti wallet de facto.

**Cobertura final D.12:** 157/157 unit (135 previos + 17 D.12 + 5 D.12.fix nuevos). Backend lint+build verde. Frontend typecheck+lint (0 errores; 48 warnings DC.6 preexistentes) verde. **3 migraciones aplicadas sin regresión**.

### 8. Fase E — Cierre documental (este commit)

- `docs/features/tasks/admin.md` + `agent.md` — operativa diaria del módulo Tasks.
- `docs/features/support-inside/admin.md` + `client.md` — operativa Support Inside.
- `docs/20-modules/_events.md` actualizado: cierre listeners D.12.2/3/9 + 4 eventos `support_inside.*` consumidos.
- `docs/20-modules/_matrix.md` actualizado: módulo `support_inside` añadido a la matriz; A4 cerrado; matriz inversa con dependencias nuevas; Sprint 8 cambios estructurales documentados.
- Esta retrospectiva.
- Movimiento de Sprint 8 entero de `current.md` a `completed/sprint-8-tasks-support-inside.md`.

---

## ADRs nacidos durante el sprint

| ADR | Título | Sub-fase |
|-----|--------|----------|
| 072 | Cola pública de tareas sin asignar + SLA | B.1 |
| 073 | Tipos flexibles tasks (reason + tags) | B.7 |
| 074 | Bridge ticket↔task | B.10 |
| 075 | Support Inside UX lista + aislamiento CRUD productos | D.0 |
| 076 | Checkout único Support Inside vía evento `service.provisioned` | D.12.9 |

---

## Lecciones aprendidas

1. **Auditoría profesional > confiar en la doc.** La sub-fase D.12 nació de detectar que la doctrina ADR-061 ("tier de cuenta visible") **no estaba materializada** en la UI tras cerrar Fase D. Sin la auditoría, Support Inside habría quedado como módulo aislado con un comparador bonito pero invisible al cliente y al agente fuera de su página dedicada. El patrón de revisar contra la doctrina canónica antes de declarar "cerrado" es **obligatorio**.

2. **Drift schema vs doctrina puede pasar.** El campo `anniversary_day` estaba **declarado en ADR-034 §recurrencia** desde antes pero nunca se materializó en schema. La auditoría D.12 lo detectó. **Procedimiento canónico aprendido**: al implementar un servicio que cita un ADR, releer el ADR para ver qué campos/comportamientos declara y verificar uno a uno contra el schema/código real.

3. **EditorSectionCard como patrón de extensibilidad.** Las 5 secciones del editor admin de planes están pensadas para crecer: cada sprint futuro añade UNA card al final, NO redistribuye. Documentado en JSDoc del componente. Patrón replicable a otros editores admin con muchos atributos (settings categorizada Sprint 12, etc.).

4. **Listener-based transversal > acoplamiento directo.** Los 3 listeners D.12 (`SupportInsidePriorityListener`, `SupportInsideAuditListener`, `SupportInsideOnServiceProvisionedListener`) cumplen R1 por construcción — el día que se necesite un nuevo efecto colateral SI, basta `@OnEvent('support_inside.*')` sin tocar `SupportInsideService`. La doctrina "hooks aspiracionales declarados desde el primer commit" pagó dividendos cuando llegó el momento de engancharlos.

5. **Helper single-query con `include` > queries separadas.** Los 3 helpers de la Fase D.12 (`clientsService`, `supportQueryService`, `dashboardService`) extendieron sus respuestas existentes con info SI **sin queries adicionales**. Patrón canónico: cuando un módulo necesita mostrar info cross-domain, NO añade su propia query — pide al servicio canónico que extienda el `include`.

6. **Bug `Console Error {}` revela contrato implícito.** El helper `api()` del frontend lanza objetos `{status, message, correlationId}` plain. `console.error()` los serializa como `{}` por falta de prototype Error. **Corolario para el futuro**: cualquier código que loguee errores debe pasar por `getErrorMessage(e)` (helper canónico) en lugar de inyectar el objeto crudo.

7. **DC.16 = clarificación doctrinal post-pregunta.** `services.credit_balance_eur` se reescribió como "buffer técnico de prorrateo, NO sistema de créditos" tras pregunta directa de Yasmin. Si el campo aparenta wallet/loyalty pero NO lo es, **documentar la frontera explícita** en el ADR canónico (ADR-029 §"Cuándo revisar"). Evita que un futuro desarrollador asuma capacidades que no existen.

---

## Estado DoD final

### Código
- [x] Backend: typecheck + lint + build + **157/157 unit tests** verdes.
- [x] Frontend: typecheck + lint (0 errores; 48 warnings DC.6 preexistentes) + build verde.
- [x] CI verde tras último push (rama `sprint8-fase-c-d-backend`).
- [x] Suite E2E **117/117 verde** sin regresión.
- [x] **5 migraciones Prisma** aplicadas limpiamente: `sprint8a_tasks_checklist_and_maintenance`, `sprint8d_support_inside_schema`, `sprint8d_cleanup_legacy_support_inside_basic`, `sprint8d12_anniversary_day`, `sprint8d12_applicable_product_types`.

### Documentación
- [x] `docs/features/tasks/admin.md` + `agent.md`
- [x] `docs/features/support-inside/admin.md` + `client.md`
- [x] `docs/20-modules/tasks/contract.md` actualizado (sub-fases A→C cerradas con SHA, eventos completos, settings actualizados).
- [x] `docs/20-modules/_events.md` con 8 eventos nuevos del Sprint 8 + listeners actualizados.
- [x] `docs/20-modules/_matrix.md` con `support_inside` añadido + Sprint 8 cambios estructurales + A4 cerrado.
- [x] `docs/30-data/tasks.md` y `docs/30-data/support.md` con tablas nuevas (4 + 3).
- [x] `docs/50-operations/jobs-reference.md` con 4 colas BullMQ scheduled nuevas.
- [x] `docs/50-operations/settings-reference.md` con 9 settings nuevos.
- [x] **5 ADRs nuevos** (072..076) escritos.
- [x] Esta retrospectiva.

### Proceso
- [x] Conventional Commits respetados en los ~25 commits del sprint.
- [x] Edge cases pendientes movidos al backlog DC.* (DC.16..26 — 11 deudas transversales).
- [x] Items diferidos a sprints específicos: `ContactClientTaskListener` (Sprint 11 Provisioning), Outbox `task.*` (P-DEPLOY.4 — ADR-069), archivado >1 año (Sprint 13 Hardening).

### Smoke testing manual
Pendiente Yasmin — checklist publicado en [`docs/features/support-inside/admin.md` §17](../../features/support-inside/admin.md) y [`docs/features/tasks/admin.md` §17](../../features/tasks/admin.md). Usar la cuenta seedeada Carla con plan Medium activo.

---

## Siguiente paso

Cola activa retoma con **P2.1 Sprint 11 — Provisioning** ([backlog.md](../backlog.md)): orquestador lifecycle servicios + interfaz `ProvisionerPlugin` extendida ([ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md)) + plugins iniciales triviales `internal` y `manual`. El listener `ContactClientTaskListener` (renombrado del histórico `WowCallCreatorListener` por ADR-073) entra ahí. Sprint 11 también cierra las relaciones cross-módulo nuevas (`tasks-on-service-cancelled`, `service-suspended → maintenance pause`, `provisioning-on-task-completed → activate manual service`).

---

**Métricas finales del Sprint 8:**

| Métrica | Valor |
|---------|-------|
| Sesiones | ~6 (P0.1 → A → B → C → D → D.12 → E) |
| Commits | ~25 |
| ADRs nuevos | 5 (072..076) |
| Tablas Prisma nuevas | 7 (4 tasks + 3 support_inside) |
| Migraciones | 5 |
| Endpoints nuevos | 18 (tasks: 11 + admin/users 1; support-inside: 6 cliente + 3 admin + 1 cron) |
| Listeners nuevos | 8 (tasks: 5; support-inside: 3) |
| Crons BullMQ scheduled | 4 (`tasks-overdue`, `tasks-unassigned-overdue`, `maintenance-critical`, `maintenance-monthly`) |
| Settings nuevos | 9 |
| Plantillas notification seed | 8 (3× task + 2× maintenance + 3 huérfanos cerrados) |
| Edge cases documentados | 52 (EC-T8-01..52) |
| Cobertura final | 157/157 unit + 117/117 E2E verde |
