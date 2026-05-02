# Sprint 11 — Provisioning ✅

> **Estado:** ✅ Cerrado
> **Cierre:** 2026-05-02 (~3 sesiones de trabajo activo, 7 PRs encadenados, en rama múltiple `sprint11-fase-*`)
> **Identificadores:** P2.1 — cabeza de cola activa post Sprint 8 según [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md)
> **ADRs nacidos durante el sprint:** [ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) (Fase 11.A — contrato `ProvisionerPlugin` v2 congelado) + [ADR-078](../../10-decisions/adr-078-auth-server-side-cookies-httponly.md) (pre-Fase 11.D — auth server-side con cookies httpOnly + plan migración SC nativo bulk Sprint 13)

---

## Objetivo

Automatizar el lifecycle de servicios del cliente: cuando una factura se paga, un orquestador escucha el evento, decide qué `ProvisionerPlugin` invocar según el producto, y gestiona el resultado (activar / esperar tarea / reintentar / DLQ + alerta admin). Sin orquestador, "vender hosting" era trabajo manual lineal con el número de clientes. Sprint 11 materializa el **núcleo operativo del producto** — sin él, los plugins reales (Sprint 15A-G) no tendrían contrato canónico al que adherirse.

---

## Lo que entregó

### 1. Fase 11.A — ADR-077 contrato canónico congelado (`a23f6bf`, 2026-05-01, PR #13)

**Doc-only.** Antes de cualquier código de orquestador, congelación del contrato `ProvisionerPlugin` v2 con:

- **Firma TypeScript exhaustiva** de los 6 métodos canónicos (3 heredados ADR-021 + 3 nuevos ADR-070).
- **8 capability flags** cerrados con mapping inicial canónico para 7 plugins (`internal`, `manual`, `enhance_cp`, `cpanel_whm`, `resellerclub`, `docker_engine`, `plesk_obsidian`).
- **Shapes congelados** de `ProvisionContext`, `ProvisionResult`, `ServiceInfo`, `ServiceMetrics`, `ServiceCapabilities`, `SsoUrl`, `ServiceAction`, `ActionResult`, `ProvisionerPluginError`.
- **9 ProvisionerErrorCode** con semántica retriable / no-retriable explícita.
- **Pipeline canónico de 3 wrappers** cross-cutting (`getServiceInfoWithCache`, `executeActionWithCacheInvalidation`, `getSsoUrlWithAudit`) que centralizan cache + audit + circuit breaker.
- **Política de versionado** v2 estable + procedimiento de bump v3 si llega cambio breaking + sección Amendments para cambios compatibles hacia atrás.
- **Test contract genérico** parametrizado por plugin (sección §7 del ADR) — extensible automáticamente a Sprint 15A-G.

> **Patrón replicado del Sprint 8 D.0** (ADR-075 redactado antes de la Fase D código): cuando llegó Fase 11.B, cero ambigüedad de contrato. El orquestador y los wrappers se construyeron literalmente desde el ADR.

### 2. Fase 11.B — Orquestador + chasis canónico (`67fd733`, 2026-05-02, PR #14)

Materialización en código del ADR-077:

- **`core/provisioning/types.ts`** literal del ADR-077 §1+§2 (10 secciones de shapes + enum `ProvisionerErrorCode` + clase `ProvisionerPluginError`).
- **`core/provisioning/plugin-utils.ts`** con los 3 wrappers cross-cutting. **Regla canónica**: los plugins NUNCA llaman directamente a Redis, EventEmitter ni AuditService — pasa por wrappers o contexto inyectado.
- **`core/provisioning/provisioning-cache.service.ts`** — ioredis Redis DB 2, fail-open (cae Redis → log warn + llamada directa al plugin), prefijo `aelium-provisioning:service_info:<id>`.
- **`core/provisioning/plugin-registry.ts`** — token DI multi-injection `PROVISIONER_PLUGINS` + 5 validaciones al boot (contractVersion, slug kebab-case, no duplicados, panel_label coherence, action slug uniqueness).
- **`ProvisioningOrchestratorService`** con `@OnEvent('invoice.paid')` + `provisionService(serviceId, correlationId)` + `markActive()` + procesamiento de `followUp` (`mark_active` / `wait_for_task_completion` / `create_setup_task`) + distinción retriable vs non-retriable.
- **`ProvisioningDispatchProcessor`** — worker BullMQ delgado que delega en orquestador. Cola `provisioning-dispatch` con DLQ + retries `[30s, 90s, 270s, 810s, 2430s]`.
- **Schema:** 2 columnas nuevas `services.provisioner_slug` (varchar 100, NULLABLE, indexado) + `services.provider_reference` (varchar 500, NULLABLE, indexado). Migración `sprint11b_services_provisioner_columns`.
- **Setting nuevo** `provisioning.service_info_ttl_seconds` (default 60s) — consumido por `getServiceInfoWithCache`.
- **Decisión local sin ADR**: el orquestador emite evento NUEVO `service.activated` cuando confirma `services.status='active'` tras `plugin.provision()` exitoso. NO sobreescribe `service.provisioned` que `BillingCheckoutService` emite al CREAR el service (Sprint 8 D.12.9 listener intacto). Plugins reales Sprint 15 consumen `service.activated`. Documentado en docstring del orquestador.

**Cobertura final Fase 11.B:** **183/183 unit verde** (157 base Sprint 8 + 26 nuevos: 7 PluginRegistryService + 9 wrappers + 10 orquestador). E2E sin nuevos (esos vienen en 11.C).

### 3. Fase 11.C — Plugins triviales `internal` + `manual` + listener task→active (`179d7c4`, 2026-05-02, PR #16)

Primer uso real del chasis:

- **Plugin `internal`** en `backend/src/plugins/provisioners/internal/internal.plugin.ts` — `provision()` → `followUp: ['mark_active']`. Para servicios sin proveedor externo (Support Inside, productos puramente Aelium-side, futuros add-ons digitales).
- **Plugin `manual`** en `backend/src/plugins/provisioners/manual/manual.plugin.ts` — `provision()` → `followUp: ['create_setup_task']` + `capabilities.completes_via_task=true`. Para productos con activación manual del agente (hosting hoy, productos sin API automatizable).
- **Listener `provisioning-on-task-completed.listener.ts`** filtrado por `capabilities.completes_via_task` — **NO por `task.type` hardcoded**. Diseño abierto a Sprint 22 Projects con plugin `project` futuro reusando el mismo listener. **EC-P11-07 mutuamente excluyente con bridge ticket↔task** (Sprint 8 ADR-074): bridge filtra por `task.conversation_id != null`; este listener filtra por `service_id != null` + capability flag.
- **Wirado canónico al `PROVISIONER_PLUGINS` token** vía `useFactory` + `inject` (NestJS DI no soporta `multi: true` Angular-style — array compuesto manualmente).
- **ESLint `no-restricted-imports`** enforce R4 + EC-P11-10 sobre `src/plugins/provisioners/**`: plugins importan SOLO de `core/provisioning/types`.
- **Test contract genérico parametrizado** (`tests/unit/plugin-contract.spec.ts`) — extensible a Sprint 15A-G automáticamente. Verifica las 12 invariantes del ADR-077 §7 sobre cualquier plugin registrado.
- **E2E `provisioning-manual-flow.spec.ts`**: cliente paga producto manual → orquestador crea task → agente completa → service activado.
- **Extensión `support-inside.spec.ts`** con flujo end-to-end real: cliente compra Plan Pro vía `/dashboard/billing/checkout` → orquestador + plugin `internal` + listener Sprint 8 D.12.9 coordinan → subscription creada → service active. **Hito histórico**: el listener Sprint 8 D.12.9 (`SupportInsideOnServiceProvisionedListener`) se valida por primera vez en flujo real (hasta entonces sólo en tests unit aislados).
- **Seed `support-inside-plans` migrado** a `provisioner='internal'` (ADR-077 §3 mapping canónico).

**Cobertura final Fase 11.C:** **228/228 unit + 120/120 E2E verde** (+45 unit + 3 E2E sobre 11.B: internal 7 + manual 7 + listener 9 + contract genérico 22; 2 manual flow + 1 SI extendido).

### 4. ADR-078 — Auth server-side con cookies httpOnly (`6c3f300`, 2026-05-02, PR #17)

**Doc-only**, mergeado como pre-requisito doctrinal de Fase 11.D. Plan canónico congelado de migración DC.6 + DC.28:

- Backend emite cookies httpOnly + Secure + sameSite además del body JSON (compat tests).
- `JwtStrategy` lee de header **o** de cookies (header preference para compat).
- Refresh rotation con detección de replay + invalidación de cadena.
- CSRF middleware en mutaciones cookie-authenticated (double-submit pattern).
- Frontend `getServerSession()` + `serverFetch()` helpers para Server Components nativos.
- **Marker mecánico `TODO(ADR-078, Sprint 13)`** en cada Client Component nuevo creado durante coexistencia. Trazabilidad por `grep -r "TODO(ADR-078" frontend/app`.
- **Bloqueante**: Sprint 12 (Settings + KB) NO arranca hasta que Sprint 13 §13.AUTH cierre. Sprint 11 Fase 11.D = **última excepción permitida** del patrón `'use client' + localStorage`.

> **Por qué ADR antes de Fase 11.D:** sin este plan, Fase 11.D habría creado 5 Client Components nuevos sin marker → al llegar Sprint 13 se habrían perdido en el grep. La inversión de redactar el ADR cierra la deuda futura sin olvido posible.

### 5. Fase 11.D — REST endpoints + frontend services pages (`e5fb67e`, 2026-05-02, PR #18)

UI cliente + admin sobre el chasis:

- **8 endpoints REST** (4 cliente + 4 admin):
  - Cliente: `GET /services`, `GET /services/:id`, `POST /services/:id/sso`, `POST /services/:id/actions/:slug`.
  - Admin: `GET /admin/services`, `GET /admin/services/:id`, `POST /admin/services/:id/reprovision`, `POST /admin/services/:id/deprovision`. **El plan inicial mencionaba 7** — admin tiene también `GET :id` para detalle agente que se incorporó durante implementación.
- **DTOs** con class-validator + CASL `Subject.Service` refinado (ownership cliente vs `AdminOnlyGuard` + `Manage.Service`).
- **3 páginas frontend Next.js**:
  - `/dashboard/services` — listado cliente paginado con filtros.
  - `/dashboard/services/[id]` — detalle único para todos los plugins (UI ramifica por `info.capabilities`, NUNCA por `service.provisioner_slug`).
  - `/admin/services` — listado admin cross-cliente con filtros (cliente, plugin, estado, texto libre).
- **5 componentes shared** en `_shared/services/`: `<ServiceHeader>`, `<MetricsBar>`, `<ActionsBar>`, `<SsoButton>`, helpers `service-status` (label + tone DS).
- **SSO endpoint canónico** devuelve `{ sso: SsoUrl | null }` (wrapper JSON profesional vs `null` literal — coherente con clientes JSON estrictos).
- **AdminSidebar + permissions.ts** actualizados con entradas `/admin/services` para roles staff con visibilidad.
- **Doctrina ADR-078 aplicada**: marker `TODO(ADR-078, Sprint 13)` presente en los 5 Client Components nuevos de Fase 11.D + 3 SC-compat documentados (verificable: `grep -r "TODO(ADR-078" frontend/app` → 5 entries esperadas).
- **Frontend lint**: 51 warnings DC.6 (27 base + 24 nuevos) — esperados por ADR-078 §3.3, NO bloqueantes en CI.
- **Fix lint `7415c2f`**: prettier + disable canónico `no-unsafe-*` en spec Jest. Causa raíz: backend lint local con `--fix` enmascaraba drift CI (`lint:check`). Aprendizaje canónico documentado en este sprint.

**Cobertura final Fase 11.D:** **241/241 unit + 129/129 E2E verde** (+13 unit + 9 E2E sobre 11.C: `provisioning.service.spec` cubre listForUser/Admin filtros, ownership 403, reprovision/deprovision con audit, plugin no registrado fallback; `provisioning-services-rest.spec.ts` cubre los 8 endpoints + ownership 403 + AdminOnlyGuard 403 + audit_change_log filas + service.cancelled).

### 6. Fase 11.E — Cierre documental + retrospectiva (este PR)

**Doc-only.** Cero código nuevo:

- `docs/features/services/admin.md` + `client.md` — operativa del módulo Services para staff y cliente.
- `docs/features/provisioning/admin.md` — vista interna del orquestador (cómo opera el agente la cola, qué hace cada plugin, cómo reprovisionar/deprovisionar, semántica de `ProvisionerErrorCode`).
- `docs/20-modules/provisioning/contract.md` → marcado **✅ implementado** con cierre de las 4 fases mergeadas + decisión local registrada.
- `docs/20-modules/_events.md` — verificados 5 eventos `service.*` nuevos + análisis del dominio actualizado al cierre + listener `provisioning-on-task-completed` documentado.
- `docs/20-modules/_matrix.md` — módulo `provisioning` desestubeado a "implementado". Sprint 11 cambios estructurales actualizados (cola BullMQ, eventos, schema, ADR-078 doctrina).
- `docs/30-data/billing.md` — `provisioning_log` aclarado como tabla NO materializada (decisión Sprint 11 cierre: log distribuido en 3 fuentes existentes).
- `docs/50-operations/jobs-reference.md` + `settings-reference.md` — verificados (cola `provisioning-dispatch` + setting `provisioning.service_info_ttl_seconds` ya documentados desde commits 11.B).
- **4 DCs nuevas registradas en `backlog.md`**: DC.27 (Playwright image), DC.29 (bloque Servicios admin/clients), DC.30 (UI inline slot SI), DC.31 (AuditLogFeed inline diferido).
- Esta retrospectiva.
- Movimiento de Sprint 11 entero de `current.md` a `completed/sprint-11-provisioning.md` con header puntero en `current.md`.

---

## ADRs nacidos durante el sprint

| ADR | Título | Sub-fase | PR |
|-----|--------|----------|----|
| 077 | Contrato canónico `ProvisionerPlugin` v2 congelado | 11.A | #13 |
| 078 | Auth server-side con cookies httpOnly + plan SC bulk migrate Sprint 13 §13.AUTH | pre-11.D | #17 |

---

## Decisiones locales sin ADR (documentadas inline)

1. **Coexistencia `service.activated` (nuevo) ↔ `service.provisioned` (legacy)** — el orquestador (Fase 11.B) emite un evento NUEVO `service.activated` cuando confirma `services.status='active'` tras `plugin.provision()` exitoso. NO sobreescribe `service.provisioned` que `BillingCheckoutService` emite al crear el service (consumido por listener Sprint 8 D.12.9 intacto). Plugins reales Sprint 15 consumen `service.activated`. Documentado en docstring de `ProvisioningOrchestratorService`. NO requiere ADR — es detalle de implementación que respeta el contrato canónico.

2. **Tabla `provisioning_log` NO se materializa** (Fase 11.E) — el historial de intentos vive distribuido en 3 fuentes que cubren el mismo caso de uso: logs estructurados con `correlation_id` propagado (R9), cola BullMQ `provisioning-dispatch` + `failed_jobs` DLQ, `audit_change_log` para acciones manuales del agente. Crear la tabla añadiría una 4ª fuente parcialmente redundante. Si en el futuro un caso real lo justifica (auditoría fiscal, dashboard de incidentes por proveedor), ADR específico + sprint dedicado.

3. **8 endpoints REST en lugar de los 7 planificados** — `GET /admin/services/:id` se incorporó durante Fase 11.D para soportar el detalle agente sin penalizar la lectura cross-cliente. El plan inicial era ramificar el GET cliente con override admin, decisión final fue endpoint dedicado por claridad CASL.

---

## Lecciones aprendidas

1. **ADR antes de código → cero refactor cross-sprint.** ADR-077 redactado antes de Fase 11.B materializó el contrato literal sin reinterpretación. Cuando llegó Fase 11.C, los plugins triviales se construyeron en una sesión sin debate "¿esto debería ser opcional o obligatorio?". Réplica del patrón Sprint 8 D.0 (ADR-075 antes de Fase D): el sprint más robusto del proyecto usó este patrón y Sprint 11 lo confirma. **Procedimiento canónico**: cuando un sprint introduce un contrato cross-cutting (interfaz de plugin, doctrina UX, plan de migración), redactar ADR como PR independiente ANTES de la primera línea de código.

2. **Marker mecánico cierra deuda futura sin olvido.** ADR-078 introdujo el marker `TODO(ADR-078, Sprint 13)` en cada Client Component nuevo de Fase 11.D. Trazabilidad por `grep` da la lista exacta de archivos a migrar cuando llegue Sprint 13 §13.AUTH. **Patrón replicable**: cualquier deuda transversal que se difiere por bloqueo de cola debe llevar marker mecánico. Las notas en `current.md` se evaporan; el grep no.

3. **Wrappers cross-cutting > duplicación en cada plugin.** Los 3 wrappers (`getServiceInfoWithCache`, `executeActionWithCacheInvalidation`, `getSsoUrlWithAudit`) centralizan cache + audit + circuit breaker. Cada plugin solo escribe lógica del proveedor. Sin esto, los 7 plugins reales Sprint 15A-G habrían duplicado ~150 líneas de boilerplate cada uno con divergencias inevitables. **Regla canónica reforzada**: cross-cutting concerns van en wrappers/helpers de `core/`, plugins son librerías delgadas que reciben dependencias por contexto.

4. **Capability flags > `if (provisioner === 'X')`.** La página `/dashboard/services/[id]` ramifica por `info.capabilities` (has_sso_panel, has_metrics, inlineActions). Cero condicional por slug. Cuando llegue plugin nuevo Sprint 15, la UI lo soporta sin tocar archivo de UI — basta con que el plugin declare las capabilities correctas. **Antipatrón cerrado** que el ADR-070 §🚪 Cierra advertía explícitamente.

5. **Idempotencia triple guard en jobs BullMQ.** El processor `provisioning-dispatch` tiene 3 capas de idempotencia: jobId estable (BullMQ descarta duplicados), check `services.status` al inicio (skip si ya `active`/`cancelled`/`terminated`), responsabilidad del plugin de ser idempotente por `provider_reference`. Resultado: pagar la misma factura 2 veces (humanly possible en pruebas) NO crea recursos duplicados ni provoca race conditions. **Patrón canónico** para cualquier cola de provisioning futura.

6. **Backend lint local con `--fix` enmascara drift CI.** Fase 11.D necesitó fix `7415c2f` (prettier + disable canónico `no-unsafe-*` en spec Jest) tras CI rojo. Causa raíz: el comando local `pnpm lint` con `--fix` corregía silenciosamente lo que CI verifica con `lint:check`. **Procedimiento aprendido**: siempre ejecutar `pnpm lint:check` (sin fix) antes de push final. Idealmente añadir hook pre-push o editar el `pre-push` existente para correr `lint:check` también.

7. **Doctrina "tabla nueva sólo si caso real lo exige".** `provisioning_log` se diseñó en `docs/30-data/billing.md` desde Sprint 5 como aspiracional. Sprint 11 decidió NO crearla — los 3 mecanismos existentes (logs estructurados, BullMQ failed_jobs, audit_change_log) cubren el caso. **Patrón canónico**: antes de añadir una tabla nueva, verificar si lo que va a contener YA vive distribuido y si la consolidación añade valor real o sólo redundancia. La regla "una fuente de verdad" no aplica a metadatos/audit que pueden vivir distribuidos legítimamente.

8. **Listener filtrado por capability flag > por task.type hardcoded.** El listener `provisioning-on-task-completed` filtra por `plugin.capabilities.completes_via_task`. NO por `task.type === 'support_setup'`. Cuando Sprint 22 Projects introduzca plugin `project` con `completes_via_task=true`, el mismo listener lo cubre sin código nuevo. **Patrón canónico**: cuando un listener cross-módulo necesita decidir si actuar, la fuente de verdad es la capability del plugin, no el tipo del evento entrante.

9. **`service.activated` nuevo coexiste con `service.provisioned` legacy.** En lugar de sobreescribir el evento histórico (que rompería Sprint 8 D.12.9), Fase 11.B introdujo evento NUEVO con semántica más estricta (post-provision real OK, no creación). Plugins reales Sprint 15 consumen el nuevo. Coexistencia documentada en docstring + ADR-077 §6 (política de versionado de eventos análoga a la de contratos). **Patrón canónico** cuando un evento existente debe mantenerse pero la semántica se refina: introducir evento nuevo, mantener legacy intacto, documentar coexistencia.

---

## Estado DoD final

### Código

- [x] Backend: typecheck + lint:check + build + **241/241 unit tests** verdes.
- [x] Frontend: typecheck + lint (0 errores; 51 warnings DC.6 esperados ADR-078 §3.3) + build verde.
- [x] CI verde tras último push (rama `master`).
- [x] Suite E2E **129/129 verde** sin regresión.
- [x] **1 migración Prisma** aplicada limpiamente: `sprint11b_services_provisioner_columns` (provisioner_slug + provider_reference + 2 índices).

### Documentación

- [x] **2 ADRs nuevos** (077 contrato canónico + 078 auth server-side).
- [x] `docs/features/services/admin.md` + `client.md` (nuevos).
- [x] `docs/features/provisioning/admin.md` (nuevo).
- [x] `docs/20-modules/provisioning/contract.md` → ✅ implementado, 4 fases cerradas con SHA + decisión local + pendientes Sprint 12+ explícitos.
- [x] `docs/20-modules/_events.md` con 5 eventos `service.*` nuevos + listener `provisioning-on-task-completed` + análisis del dominio actualizado al cierre.
- [x] `docs/20-modules/_matrix.md` con `provisioning` desestubeado a "implementado" + Sprint 11 cambios estructurales completos.
- [x] `docs/30-data/billing.md` — columnas Sprint 11.B documentadas (commits 11.B) + clarificación `provisioning_log` no materializada (Fase 11.E).
- [x] `docs/50-operations/jobs-reference.md` con cola `provisioning-dispatch` (commits 11.B).
- [x] `docs/50-operations/settings-reference.md` con setting `provisioning.service_info_ttl_seconds` (commits 11.B).
- [x] **4 DCs nuevas** registradas en `backlog.md` (DC.27 / DC.29 / DC.30 / DC.31).
- [x] Esta retrospectiva.
- [x] Movimiento Sprint 11 de `current.md` a `completed/sprint-11-provisioning.md` con header puntero.

### Proceso

- [x] Conventional Commits respetados en los 7 PRs del sprint (#13 / #14 / #15 / #16 / #17 / #18 / #19).
- [x] Edge cases pendientes movidos al backlog DC.* con justificación (DC.27/29/30/31).
- [x] Items diferidos a sprints específicos: listener `notifications-on-provisioning-failed` (Sprint 12+), listener `audit-on-service-events` (Sprint 12.5 / portal RGPD), reconciliación cron (Sprint 15C+), webhook async (cuando llegue plugin async), vista admin `/admin/services/:id` detalle (Sprint 13 §13.AUTH).

### Smoke testing manual

Pendiente Yasmin — checklists publicados en [`docs/features/services/admin.md` §10](../../features/services/admin.md) y [`docs/features/provisioning/admin.md` §10](../../features/provisioning/admin.md). Usar la cuenta seedeada Carla (`cliente@aelium.test` / `Cliente2026!`).

---

## Siguiente paso

Cola activa retoma según [`backlog.md`](../backlog.md):

- **Vía recomendada (P2.2 Sprint 15A — Plugin Framework)**: manifest + loader + UI dinámica desde Settings + encriptación API keys + helpers `core/provisioning/plugin-utils.ts` extendidos. ~1-2 sesiones. Construye sobre el contrato Sprint 11 sin tocarlo.
- **Vía alternativa (P2.7 Sprint 12 — Settings + KB)**: condicionada a que Sprint 13 §13.AUTH cierre primero (ADR-078 §5). Si no se prioriza Sprint 13 antes, Sprint 12 queda bloqueado por la doctrina canónica anti-DC.6.
- **Vía técnica (P2.9 Sprint 13 — Hardening §13.AUTH)**: cierra DC.6 + DC.28 + DC.13 + DC.14 + DC.15 + DC.27 (oportunista). ~3-5 sesiones. Desbloquea Sprint 12.

Decisión de Yasmin al arrancar la siguiente sesión.

---

**Métricas finales del Sprint 11:**

| Métrica | Valor |
|---------|-------|
| Sesiones | ~3 (11.A → 11.B → 11.C+11.D+11.E encadenadas) |
| PRs | 7 (#13 ADR-077, #14 chasis, #15 cierre doc 11.B, #16 11.C, #17 ADR-078, #18 11.D, #19 sync) + #20 (esta Fase 11.E) |
| ADRs nuevos | 2 (077 + 078) |
| Tablas Prisma nuevas | 0 (sólo 2 columnas en `services`) |
| Migraciones | 1 |
| Endpoints nuevos | 8 (4 cliente + 4 admin) |
| Listeners nuevos | 2 (`ProvisioningOrchestratorService.handleInvoicePaid` + `ProvisioningOnTaskCompletedListener`) |
| Wrappers cross-cutting nuevos | 3 (`getServiceInfoWithCache` + `executeActionWithCacheInvalidation` + `getSsoUrlWithAudit`) |
| Plugins triviales nuevos | 2 (`internal` + `manual`) |
| Eventos nuevos emitidos | 5 (`service.activated` + `service.provisioning_failed` + `service.metrics_fetched` + `service.action_executed` + `service.sso_opened`) |
| Eventos consumidos | 2 (`invoice.paid` + `task.completed`) |
| Colas BullMQ nuevas | 1 (`provisioning-dispatch` con DLQ + retries) |
| Settings nuevos | 1 (`provisioning.service_info_ttl_seconds`) |
| Componentes frontend shared nuevos | 5 (`ServiceHeader`, `MetricsBar`, `ActionsBar`, `SsoButton`, helpers `service-status`) |
| Páginas frontend nuevas | 3 (`/dashboard/services`, `/dashboard/services/[id]`, `/admin/services`) |
| Edge cases documentados | 12 (EC-P11-01..12) |
| DCs nuevas registradas | 4 (DC.27 + DC.29 + DC.30 + DC.31) |
| Cobertura final | 241/241 unit + 129/129 E2E verde |
| Cobertura crecimiento | +84 unit (+50%) + +12 E2E (+10%) sobre Sprint 8 |
