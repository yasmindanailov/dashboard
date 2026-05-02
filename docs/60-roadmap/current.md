# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26 + closures Sprint 8 / 9 / 9.5 / 9.6 / 11.5 (2026-04-26 → 2026-05-01) + Sprint 11 Fases A+B (2026-05-01/02). Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)). Los sprints ✅ que aparecen abajo son punteros a `completed/`; viven aquí solo para trazabilidad cronológica de la ola P1.1.

> **Última actualización:** 2026-05-02 — Sprint 11 Fases 11.A (ADR-077) + 11.B (orquestador + chasis canónico) + 11.C (plugins triviales + listener task→active, PR #16) + **11.D (REST endpoints + frontend services pages, PR #18, commit `e5fb67e`)** mergeadas. ADR-078 (auth server-side + DC.28) mergeado vía PR #17. Sprint 11 sigue 🟡 WIP — única fase pendiente: **11.E (cierre documental + retrospectiva + mover Sprint 11 a `completed/`)**.
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

## 🔄 Sprint 11 — Provisioning (P2.1, plan canónico)

**Estado:** 🟡 en curso — Fases 11.A + 11.B + 11.C + 11.D mergeadas en master (2026-05-01 → 2026-05-02). Sólo queda **Fase 11.E** (cierre documental + retro).
**Inicio:** 2026-05-01 (Fase 11.A — ADR-077 redactado y mergeado vía PR #13).
**Cierre estimado:** ~0.5 sub-sesión (sólo Fase 11.E pendiente).

> **Doctrina aplicada:** ADR antes de código (ADR-077 mergeado primero, cero ambigüedad de contrato), sub-fases atómicas con su DoD propio (PR aislados), Server Components nativos en frontend (cierra parte de DC.6). Replica el patrón Sprint 8 que produjo el sprint más robusto del proyecto.

---

### 1. Objetivo en una frase

Automatizar el lifecycle de servicios del cliente: cuando una factura se paga, un orquestador escucha el evento, decide qué `ProvisionerPlugin` invocar según el producto, y gestiona el resultado (activar / esperar tarea / reintentar / DLQ + alerta admin). Sin orquestador, "vender hosting" es trabajo manual lineal con el número de clientes.

---

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué del sprint |
|---|-------------|--------|------------------------|
| 1 | Sprint 5 (services schema base) | ✅ | Toda Fase 11.B |
| 2 | Sprint 6 (billing engine + invoice.paid event) | ✅ | Listener `invoice.paid` |
| 3 | Sprint 9 (BullMQ + DLQ + AuditService) | ✅ | Cola `provisioning-dispatch` + audit hooks |
| 4 | Sprint 8 Fase D.12.9 (listener `service.provisioned` Support Inside) | ✅ | Coexistencia con flujo histórico (decisión local: emitir `service.activated` nuevo, no sobreescribir `service.provisioned`) |
| 5 | [ADR-070](../10-decisions/adr-070-service-info-sso-acciones-curadas.md) (decisión arquitectónica abstracta) | ✅ | Toda la fase |
| 6 | [ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) (contrato congelado) | ✅ Fase 11.A mergeada PR #13 | Resto del sprint |

---

### 3. Produce (contratos nuevos)

#### 3.1 Endpoints REST nuevos (Fase 11.D)

- `GET /api/v1/services` — lista servicios del cliente autenticado.
- `GET /api/v1/services/:id` — detalle + `getServiceInfo()` cacheado.
- `POST /api/v1/services/:id/sso` — devuelve `SsoUrl` del plugin (audit obligatorio).
- `POST /api/v1/services/:id/actions/:slug` — ejecuta acción inline (validación + audit obligatorio).
- `GET /api/v1/admin/services` — vista agente con filtros.
- `POST /api/v1/admin/services/:id/reprovision` — fuerza re-ejecución (escotilla admin).
- `POST /api/v1/admin/services/:id/deprovision` — cancelación admin.

#### 3.2 Eventos nuevos emitidos

| Evento | Sub-fase | Emisor | Consumidor |
|---|---|---|---|
| `service.activated` | 11.B ✅ | `ProvisioningOrchestratorService.markActive()` | (Fase 11.C: plugins futuros) |
| `service.provisioning_failed` | 11.B ✅ | Orquestador en error no-retriable | `notifications` (alerta superadmin — pendiente listener) |
| `service.metrics_fetched` | 11.B ✅ | Wrapper `getServiceInfoWithCache` (cache miss) | `audit` (RGPD: cliente sabe cuándo se consultó al proveedor) |
| `service.action_executed` | 11.B ✅ | Wrapper `executeActionWithCacheInvalidation` | `audit` + opcional `notifications` (acciones destructivas) |
| `service.sso_opened` | 11.B ✅ | Wrapper `getSsoUrlWithAudit` | `audit` |

#### 3.3 Servicios inyectables nuevos (Fase 11.B ✅)

- `ProvisioningOrchestratorService` — listener `invoice.paid` + `provisionService(serviceId, correlationId)`.
- `ProvisioningDispatchProcessor` — worker BullMQ delegando en orquestador.
- `PluginRegistryService` — registry global con validaciones al boot.
- `ProvisioningCacheService` — cache Redis DB 2 con fail-open.

#### 3.4 Tablas o campos Prisma nuevos (Fase 11.B ✅)

- `services.provisioner_slug` (varchar 100, NULLABLE, indexado): denormalizado de `product.provisioner` al provisionar. Inmutable tras `service.activated`.
- `services.provider_reference` (varchar 500, NULLABLE, indexado): ID externo del recurso en el sistema del proveedor.

#### 3.5 Settings nuevos (Fase 11.B ✅)

- `provisioning.service_info_ttl_seconds` (default 60s) — consumido por `getServiceInfoWithCache`.

#### 3.6 Permisos CASL nuevos

- `Subject.Service` ya existía. Fase 11.D refinará permisos por rol (cliente solo sus servicios; admin todos).

---

### 4. Modifica (contratos existentes)

#### 4.1 Servicios modificados

- `BillingCheckoutService` (Sprint 8 D.12.9 ya emite `service.provisioned` al crear el service) → **NO se toca** en Sprint 11. El orquestador emite `service.activated` aparte (decisión local, ver §9).

#### 4.2 BREAKING changes

- (ninguno) — toda la API es additive. Sprint 8 D.12.9 listener sigue funcionando intacto.

---

### 5. Pasos atómicos (sub-sprints)

| # | Paso | Estado |
|---|------|--------|
| **11.A** | **ADR-077 — Contrato canónico `ProvisionerPlugin` v2 congelado** (firma TypeScript + 8 capability flags + shapes exhaustivos + 9 ProvisionerErrorCode + pipeline canónico de wrappers + política de versionado v2 estable + test contract genérico). PR #13 doc-only. | ✅ Mergeado 2026-05-01 (`a23f6bf`) |
| **11.B** | **Orquestador + chasis canónico** (modules/provisioning + core/provisioning):<br>· `core/provisioning/types.ts` literal del ADR-077 §1+§2.<br>· `core/provisioning/plugin-utils.ts` con 3 wrappers (`getServiceInfoWithCache`, `executeActionWithCacheInvalidation`, `getSsoUrlWithAudit`).<br>· `core/provisioning/provisioning-cache.service.ts` (ioredis Redis DB 2, fail-open).<br>· `core/provisioning/plugin-registry.ts` (token DI multi-injection + 5 validaciones al boot).<br>· `ProvisioningOrchestratorService` con listener `invoice.paid` + processor BullMQ + DLQ.<br>· Schema: 2 columnas + 2 índices.<br>· Setting `provisioning.service_info_ttl_seconds`.<br>· **26 unit tests nuevos** (suite full **183/183 verde**). | ✅ Mergeado 2026-05-02 (`67fd733`) |
| **11.C** | **Plugins triviales `internal` + `manual`**:<br>· Plugin `internal` en `backend/src/plugins/provisioners/internal/internal.plugin.ts` — `provision()` devuelve `{ providerReference: null, metadata: {}, followUp: ['mark_active'] }`. Para servicios sin proveedor externo (ej. Support Inside).<br>· Plugin `manual` en `backend/src/plugins/provisioners/manual/manual.plugin.ts` — `provision()` devuelve `{ followUp: ['create_setup_task'] }`. Setea `capabilities.completes_via_task=true`.<br>· Listener `provisioning-on-task-completed.listener.ts` filtrado por `capabilities.completes_via_task` (NO por `task.type` hardcoded — diseño abierto a Sprint 22 Projects).<br>· Wirear plugins al `PROVISIONER_PLUGINS` token en `provisioning.module.ts`.<br>· Tests unit cada plugin (4-5 cada uno) + listener (5-6 tests).<br>· **Test E2E `provisioning-manual-flow.spec.ts`**: cliente paga producto manual → orquestador crea task → agente completa task → service activated.<br>· **Extensión `support-inside.spec.ts`** con flujo end-to-end real: cliente compra Plan Pro vía `/dashboard/billing/checkout` → orquestador + plugin `internal` + listener Sprint 8 D.12.9 coordinan → subscription creada → service active. **Hito histórico**: el listener D.12.9 se valida por primera vez en flujo real. | ✅ Mergeado 2026-05-02 (`179d7c4`, PR #16) |
| **11.D** | **Frontend `/dashboard/services/[id]` + endpoints REST** — **ÚLTIMA EXCEPCIÓN PERMITIDA del patrón Client Component clásico ([ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) §3.2)**:<br>· Endpoints REST cliente (4) + admin (3) en `provisioning.controller.ts` y `admin-provisioning.controller.ts`.<br>· DTOs con class-validator + CASL `Subject.Service` refinado.<br>· Página `/dashboard/services` (listado cliente).<br>· Página `/dashboard/services/[id]` (detalle, condicionado por `capabilities` flags del plugin).<br>· Componentes DS reusables en `_shared/services/`: `<ServiceHeader>`, `<MetricsBar>`, `<ActionsBar>`, `<SsoButton>`, `service-status` helpers.<br>· Página `/admin/services` (listado admin con filtros — vista cross-cliente para ops/incidentes; ver DC nueva en Fase 11.E para "bloque Servicios en `/admin/clients/[id]`" como vista relacional cotidiana del agente).<br>· Slot UI placeholder "Solicitar desarrollo personalizado" (Sprint 22 Projects lo habilitará).<br>· `AuditLogFeed` NO entregado en 11.D — diferido a 11.E o sprint posterior (no es bloqueante: la transparencia RGPD ya vive en `/dashboard/transparency` desde Sprint 9).<br>· **Doctrina ADR-078 aplicada**: cada Client Component nuevo lleva `// TODO(ADR-078, Sprint 13): migrar a SC cuando cookies httpOnly estén activas`. La doctrina anti-DC.6 (Server Components nativos) se difiere a Sprint 13 §13.AUTH porque requiere primero auth server-side (DC.28). Ver [ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) §3.3 para el patrón canónico de marker.<br>· DC.17 cierre parcial: el endpoint cliente y la vista detalle quedan listos para asignar slot SI desde la card del servicio; UI inline del slot (formulario en `/dashboard/services/[id]`) queda pendiente para Fase 11.E o iteración posterior. | ✅ Mergeado 2026-05-02 (`e5fb67e`, PR #18) + fix lint (`7415c2f`) |
| **11.E** | **Cierre documental + retrospectiva**:<br>· `docs/features/services/admin.md` + `client.md`.<br>· `docs/features/provisioning/admin.md` (vista interna del módulo).<br>· `docs/20-modules/provisioning/contract.md` → "✅ implementado".<br>· Verificar `_events.md` + `_matrix.md` cubren los 5 eventos nuevos + listeners + módulo desestubeado.<br>· `docs/30-data/billing.md` (services schema) actualizado con `provisioner_slug` + `provider_reference` como columnas reales.<br>· `docs/50-operations/jobs-reference.md` con cola `provisioning-dispatch`.<br>· `docs/50-operations/settings-reference.md` con setting nuevo.<br>· Smoke testing manual punta a punta con Carla.<br>· Retrospectiva `completed/sprint-11-provisioning.md`.<br>· Mover Sprint 11 entero de `current.md` a `completed/`. | ⬜ |

---

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-P11-01 | Coexistencia `service.provisioned` (BillingCheckoutService histórico) vs `service.activated` (orquestador nuevo) | ✅ Resuelto Fase 11.B: orquestador emite evento NUEVO `service.activated`. Listener Sprint 8 D.12.9 sigue intacto consumiendo `service.provisioned`. Plugins reales Sprint 15 consumen `service.activated`. Documentado inline en docstring del orquestador. |
| EC-P11-02 | Plugin no registrado al recibir `invoice.paid` | ✅ Resuelto Fase 11.B: orquestador emite `service.provisioning_failed` con `reason='plugin_not_registered'`. Service queda en `pending`. |
| EC-P11-03 | Cliente cancela el service mientras provisioning está en cola BullMQ | ✅ Resuelto Fase 11.B: `provisionService()` verifica `service.status` antes de ejecutar. Si `cancelled`/`terminated`, descarta job. |
| EC-P11-04 | Provisioning concurrente del mismo service (factura pagada 2 veces) | ✅ Resuelto Fase 11.B: idempotente por `service.status='active'` check al inicio. Job duplicado se descarta. |
| EC-P11-05 | Plugin lanza error retriable (timeout, rate limit) | ✅ Resuelto Fase 11.B: orquestador re-throw para BullMQ retry con backoff [30s, 90s, 270s, ...]. |
| EC-P11-06 | Plugin lanza error no-retriable (auth fail, invalid payload) | ✅ Resuelto Fase 11.B: marca `services.status='cancelled'` + `cancellation_reason='provisioning_failed:<code>'` + emite `service.provisioning_failed`. |
| EC-P11-07 | Listener `provisioning-on-task-completed` se enreda con bridge ticket↔task Sprint 8 (`task.type=support_ticket`) | Plan Fase 11.C: listener nuevo filtra por `plugin.capabilities.completes_via_task=true`, NO por `task.type`. Bridge filtra por `task.conversation_id != null`. Mutuamente excluyentes — race condition imposible. |
| EC-P11-08 | Race en cola pública: dos agentes intentan completar la misma `support_setup` task simultáneamente | Compare-and-swap ya existente en TasksService.update (Sprint 8 EC-T8-22). Heredado. |
| EC-P11-09 | Cache Redis DB 2 cae mientras orquestador está procesando | ✅ Resuelto Fase 11.B: cache fail-open con log warn. Llamadas posteriores van directo al plugin. Degradación elegante. |
| EC-P11-10 | Plugin importa orquestador directamente (rompe R4) | Plan Fase 11.C: regla ESLint `no-restricted-imports` que prohíbe `from 'src/modules/provisioning/*'` en `src/plugins/provisioners/**`. Solo se permite `from 'src/core/provisioning/*'`. |
| EC-P11-11 | Sprint 22 Projects necesita `services.status='project_development'` | Documentado pero NO añadido al enum hoy. Sprint 22 lo extenderá. Frontend `/dashboard/services/[id]` (Fase 11.D) usa `getServiceInfo().status` (string), no enum hardcoded. |
| EC-P11-12 | Plugin con `contractVersion !== 'v2'` intenta registrarse | ✅ Resuelto Fase 11.B: PluginRegistryService rechaza con log error + alerta admin. ADR-077 §6 política de versionado. |

---

### 7. Definition of Done

#### Código
- [x] Fase 11.A ✅ (ADR-077 mergeado).
- [x] Fase 11.B ✅ (orquestador + chasis + 26 unit tests, suite 183/183 verde).
- [ ] Fase 11.C — plugins triviales + listener + tests E2E.
- [ ] Fase 11.D — frontend Server Components + endpoints.
- [ ] Fase 11.E — docs canónicas + retro.
- [ ] Suite final unit ≥190/190 verde, E2E ≥120/120 verde sin regresión.
- [ ] Backend typecheck + lint + build verde.
- [ ] Frontend typecheck + lint (DC.6 warnings ≤ 48 — idealmente bajan al usar Server Components nativos) + build verde.

#### Documentación
- [x] ADR-077 escrito y mergeado.
- [ ] `docs/features/services/admin.md` + `client.md`.
- [ ] `docs/features/provisioning/admin.md`.
- [ ] `docs/20-modules/provisioning/contract.md` → ✅ implementado.
- [ ] `_events.md` con 5 eventos nuevos `service.*` y listeners.
- [ ] `_matrix.md` con módulo `provisioning` desestubeado.
- [ ] `docs/30-data/billing.md` con columnas reales.
- [ ] `docs/50-operations/jobs-reference.md` con cola nueva.
- [ ] `docs/50-operations/settings-reference.md` con setting nuevo.
- [ ] Retrospectiva `completed/sprint-11-provisioning.md`.

#### Proceso
- [ ] Conventional Commits respetados.
- [ ] Edge cases pendientes movidos al backlog DC.* con justificación.
- [ ] EC-T8-25, EC-T8-26, EC-T8-27 (Sprint 11 listeners cross-módulo) cerrados o reagendados.

#### Smoke testing manual (Yasmin)
- [ ] Cliente Carla compra producto `manual` vía `/dashboard/billing/checkout` → tarea `support_setup` aparece en cola pública admin → agente la completa → service pasa a `active` → cliente lo ve en `/dashboard/services`.
- [ ] Cliente Carla compra Plan Pro Support Inside vía `/dashboard/billing/checkout` → subscription creada (listener Sprint 8 D.12.9 + plugin `internal` coordinan) → cliente lo ve en `/dashboard/support-inside` y en `/dashboard/services`.
- [ ] Cliente entra a `/dashboard/services/[id]` → ve info normalizada del servicio.
- [ ] Sin errores en consola del navegador.
- [ ] UI cumple Design System.

---

### 8. Riesgos identificados

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Coexistencia `service.provisioned` ↔ `service.activated` confunde a desarrolladores futuros | Medio (deuda doctrinal si no se documenta bien) | ✅ Fase 11.B: docstring orquestador + EC-P11-01 + esta entrada |
| Plugin manual + listener `provisioning-on-task-completed` choca con bridge Sprint 8 | Alto (race condition real) | Plan Fase 11.C: filtrado por capability flag, NO por task.type. EC-P11-07 documentado. |
| DC.6 warnings explotan al añadir 8 componentes UI nuevos en frontend | Medio | Plan Fase 11.D: Server Components nativos desde el inicio. Net: warnings DC.6 estables o bajan. |
| Listener Sprint 8 D.12.9 deja de funcionar con flujo real (descubrimos bug oculto) | Alto (regresión Sprint 8) | Plan Fase 11.C: extensión `support-inside.spec.ts` con flujo end-to-end real lo valida explícitamente. |
| Sprint 22 Projects descubre tarde que necesita extension de enum `services.status` | Bajo | Plan Fase 11.D: frontend usa `getServiceInfo().status` string, no enum. Sprint 22 extiende sin tocar UI. EC-P11-11. |

---

### 9. Decisiones registradas

#### ADRs nuevos confirmados (Sprint 11)

- **[ADR-077](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md)** — Contrato canónico `ProvisionerPlugin` v2 congelado. Firma TypeScript exhaustiva + 8 capability flags + shapes + 9 ProvisionerErrorCode + pipeline de wrappers + política de versionado v2 estable + test contract genérico. **Mergeado 2026-05-01 vía PR #13 antes de Fase 11.B.**
- **[ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md)** — Auth server-side con cookies httpOnly para Server Components. Plan canónico de migración DC.6 + DC.28 acoplada en Sprint 13 §13.AUTH (httpOnly + refresh rotation + replay detection + CSRF middleware + frontend SC nativo bulk migrate). Marker mecánico `TODO(ADR-078)` en cada Client Component nuevo de Fase 11.D para trazabilidad de migración. **Fase 11.D = última excepción permitida del patrón `'use client' + localStorage`** — Sprint 12 (Settings + KB) ya no lo permite. **Mergeado vía PR doc-only antes de Fase 11.D.**

#### Decisión local sin ADR (documentada inline)

- **`service.activated` (nuevo) coexiste con `service.provisioned` (histórico)**: el orquestador (Fase 11.B) emite un evento NUEVO `service.activated` cuando confirma que el provisioning real terminó OK y `services.status='active'`. NO sobreescribe `service.provisioned` que `BillingCheckoutService` emite al crear el service (consumido por listener Sprint 8 D.12.9 `SupportInsideOnServiceProvisionedListener`). Plugins reales Sprint 15 consumen `service.activated`. Documentado en docstring de `ProvisioningOrchestratorService`. NO requiere ADR — es detalle de implementación que respeta el contrato canónico.

#### Deudas registradas en backlog (NO entran en Sprint 11)

- DC.27 (potencial — pendiente de redactar): Migrar job E2E del CI a imagen oficial Playwright (`mcr.microsoft.com/playwright:v<X>-noble`). Elimina `apt-get install` flake. Detectado 2026-05-02 cuando un runner se quedó 2h colgado en espejos Azure. Solución estructural canónica documentada por Playwright. Mejora colateral: ~2 min menos por run. Cuándo abordar: oportunista cuando el flake reincida o cuando se aborde Sprint 13 Hardening.

---

### 10. Cierre del sprint

> Sprint 11 sigue **WIP**. **Fases 11.A + 11.B + 11.C + 11.D mergeadas en master**. Cola restante: **11.E** (cierre documental + retro).

**Cierres registrados:**

| Sub-sprint | Fecha | Commit master | PR |
|---|---|---|---|
| 11.A — ADR-077 contrato canónico | 2026-05-01 | `a23f6bf` | #13 |
| 11.B — Orquestador + chasis | 2026-05-02 | `67fd733` | #14 |
| 11.B.fix — Lint specs (prettier + unbound-method + unsafe-access) | 2026-05-02 | (incluido en `67fd733` squash) | #14 amend |
| 11.B doc closure + plan 11.C-E | 2026-05-02 | `8aa83dd` | #15 |
| 11.C — Plugins triviales internal + manual + listener task→active | 2026-05-02 | `179d7c4` | #16 |
| ADR-078 auth server-side cookies httpOnly (pre-requisito 11.D) | 2026-05-02 | `6c3f300` | #17 |
| 11.D — REST endpoints + frontend services pages | 2026-05-02 | `e5fb67e` | #18 |
| 11.D.fix — Lint:check verde (prettier + no-unsafe disable canónico Jest) | 2026-05-02 | (incluido en `e5fb67e` squash) | #18 amend |

**Estado DoD parcial al cierre Fase 11.B (2026-05-02):**

- ✅ Backend typecheck + lint + build + **183/183 unit tests** (157 base Sprint 8 + 26 Fase 11.B).
- ✅ E2E suite full **117/117 verde** sin regresión (Fase 11.B no añade E2E nuevos — esos vienen en Fase 11.C).
- ✅ **1 migración nueva**: `sprint11b_services_provisioner_columns` (provisioner_slug + provider_reference + 2 índices).
- ✅ **Chasis funcional pero sin plugins concretos**: el orquestador arranca, registra "0/0 plugins" sin error. Pagar una factura emite `service.provisioning_failed` con `reason='plugin_not_registered'` — esperado y correcto. Fase 11.C cierra esto.
- ✅ Token DI multi-injection `PROVISIONER_PLUGINS` en `provisioning.module.ts` con `useValue: []` placeholder.
- ✅ ADR-077 mergeado y enlazado desde 4 archivos canónicos.

**Estado DoD parcial al cierre Fase 11.C (2026-05-02):**

- ✅ Backend typecheck + lint + build + **228/228 unit tests** (+45 desde 183: internal 7 + manual 7 + listener 9 + contract genérico 22).
- ✅ E2E suite full **120/120 verde** (+3 desde 117 — provisioning-manual-flow + extensión support-inside con flujo end-to-end real).
- ✅ Plugins `internal` + `manual` registrados al `PROVISIONER_PLUGINS` token via `useFactory` (NestJS DI no soporta `multi: true` Angular-style — array compuesto manualmente).
- ✅ Listener `provisioning-on-task-completed` con filtrado canónico por `capabilities.completes_via_task` (NO hardcoded por `task.type`). EC-P11-07 mutuamente excluyente con bridge ticket↔task.
- ✅ Test contract genérico parametrizado por plugin (ADR-077 §7) — extensible a Sprint 15A/C/D/E/G automáticamente.
- ✅ ESLint `no-restricted-imports` enforce R4 + EC-P11-10 sobre `src/plugins/provisioners/**`.
- ✅ Seed `support-inside-plans` migrado a `provisioner='internal'` (ADR-077 §3 mapping canónico).
- ✅ **Hito histórico**: listener Sprint 8 D.12.9 (`SupportInsideOnServiceProvisionedListener`) validado por primera vez en flujo real (E2E `support-inside.spec.ts` Sprint 11 Fase 11.C).

**Estado DoD parcial al cierre Fase 11.D (2026-05-02):**

- ✅ Backend typecheck + lint:check + build + **241/241 unit tests** (+13 desde 228 — `provisioning.service.spec` cubre listForUser/Admin filtros, ownership 403, reprovision/deprovision con audit, plugin no registrado fallback).
- ✅ E2E suite full **129/129 verde** (+9 desde 120 — `provisioning-services-rest.spec.ts` cubre los 7 endpoints + ownership 403 + AdminOnlyGuard 403 + audit_change_log filas + service.cancelled).
- ✅ **7 endpoints REST**: 4 cliente (`GET /services`, `GET /services/:id`, `POST /services/:id/sso`, `POST /services/:id/actions/:slug`) + 3 admin (`GET /admin/services`, `POST /admin/services/:id/reprovision`, `POST /admin/services/:id/deprovision`).
- ✅ **3 páginas frontend** + **5 componentes shared `_shared/services/`** + AdminSidebar + permissions.ts actualizados.
- ✅ **SSO endpoint canónico** devuelve `{ sso: SsoUrl | null }` (wrapper profesional vs `null` literal — coherente con clientes JSON).
- ✅ **ADR-078 marker aplicado**: `grep -r "TODO(ADR-078" frontend/app` → 5 `'use client'` nuevos + 3 SC-compat documentados. Sprint 13 §13.AUTH cerrará la migración bulk.
- ✅ Frontend lint: **51 warnings DC.6** (27 base + 24 nuevos) — esperados por ADR-078 §3.3, NO bloqueantes en CI.
- ✅ CI verde tras fix `7415c2f` (prettier + disable canónico `no-unsafe-*` en spec Jest).
- ⚠️ **Cierres parciales registrados** para resolver en 11.E o backlog:
  - DC.17 cierre parcial: endpoint + vista detalle listos; UI inline del slot SI en `/dashboard/services/[id]` queda pendiente.
  - **DC nueva (registrar en Fase 11.E)**: añadir bloque "Servicios contratados" en `/admin/clients/[id]` como vista relacional cotidiana del agente. La actual `/admin/services` queda como vista cross-cliente para ops/incidentes (filtros por estado/plugin), no para atención al cliente.
  - `<AuditLogFeed>` componente NO entregado — la transparencia RGPD ya vive en `/dashboard/transparency` desde Sprint 9; si Fase 11.E decide replicar feed inline en detalle servicio, se diseña ahí.

---

### ✍ Próxima sesión — orden recomendado

> **Frase canónica para arrancar la siguiente sesión con contexto fresco:**
>
> *"Lee `docs/90-meta/development-playbook.md`, `docs/10-decisions/adr-077-contrato-provisioner-plugin-v2.md`, `docs/10-decisions/adr-078-auth-server-side-cookies-httponly.md`, `docs/20-modules/provisioning/contract.md`, `docs/60-roadmap/current.md` §Sprint 11. Vamos con Sprint 11 Fase 11.E — cierre documental + retrospectiva + mover Sprint 11 a `completed/`. Crea rama `sprint11-fase-e-cierre-documental` desde master."*

#### Atención al arrancar Fase 11.E

- **Verificar primero que master está sincronizado** con commits 11.A→11.D (`a23f6bf` → `e5fb67e`). Master limpio, suite full verde (241/241 unit + 129/129 E2E).
- **Documentación canónica a producir/actualizar** (PR doc-only, sin código):
  - `docs/features/services/admin.md` + `client.md` — operativa del módulo Services para staff y cliente.
  - `docs/features/provisioning/admin.md` — vista interna del orquestador (cómo opera el agente la cola `provisioning-dispatch`, qué hace cada plugin, cómo reprovisionar/deprovisionar).
  - `docs/20-modules/provisioning/contract.md` → marcar **✅ implementado** y completar las 12 secciones canónicas con el estado real.
  - `docs/20-modules/_events.md` — verificar 5 eventos `service.*` (`activated`, `provisioning_failed`, `metrics_fetched`, `action_executed`, `sso_opened`, `cancelled`) + listener `provisioning-on-task-completed` documentados.
  - `docs/20-modules/_matrix.md` — desestubear módulo `provisioning` (ya no es ❌ stub).
  - `docs/30-data/billing.md` — actualizar `services` schema con `provisioner_slug` + `provider_reference` como columnas reales (ya en BD desde 11.B).
  - `docs/50-operations/jobs-reference.md` — añadir cola `provisioning-dispatch` (BullMQ + DLQ + retries [30s, 90s, 270s]).
  - `docs/50-operations/settings-reference.md` — añadir setting `provisioning.service_info_ttl_seconds` (default 60).
- **Backlog DC nuevas a registrar en Fase 11.E** (no son trabajo de esta fase, sólo documentación):
  - DC nueva: bloque "Servicios contratados" en `/admin/clients/[id]` (vista relacional cotidiana del agente). Justificación arquitectónica: `/admin/services` (vista cross-cliente) sirve para ops/incidentes (filtros por estado/plugin); `/admin/clients/[id]` debe tener bloque relacional para que el agente vea los services del cliente al abrir su ficha.
  - DC.17 cierre parcial pendiente: UI inline del slot SI desde `/dashboard/services/[id]` (cliente lo solicita desde la card del servicio). El endpoint y la vista listos; falta el formulario inline + tests E2E.
  - `<AuditLogFeed>` inline en `/dashboard/services/[id]` — diferido (la transparencia RGPD ya vive en `/dashboard/transparency`).
- **Smoke testing manual** punta a punta con cliente Carla:
  - Login Carla → `/dashboard/services` → detalle de un service activo → SSO null para `internal`/`manual` (no rompe UI) → ActionsBar vacío para plugins triviales (sí, esperado).
  - Login superadmin → `/admin/services` → filtra por `provisioner_slug=internal` → reprovision sobre service `pending` → ver audit_change_log.
- **Retrospectiva** en `docs/60-roadmap/completed/sprint-11-provisioning.md`:
  - Métricas: 4 PRs (#13, #14, #15, #16, #17, #18) en ~3 sesiones de trabajo activo (2026-05-01 → 2026-05-02).
  - 2 ADRs nacidos: 077 (contrato canónico) + 078 (auth server-side).
  - Tests: 157 base Sprint 8 → **241/241 unit** (+84 nuevos en Sprint 11).
  - E2E: 117 base → **129/129** (+12 nuevos: 2 manual flow + 1 SI extendido + 9 REST).
  - Lecciones aprendidas: ADR antes de código (077, 078) replicó el patrón Sprint 8 D.0 (075). Marker mecánico `TODO(ADR-078)` cierra deuda futura sin olvido. Backend lint local con `--fix` enmascara drift CI (`lint:check`) — corregido tras fix #18 amend.
- **Mover Sprint 11 entero** de `current.md` a `completed/sprint-11-provisioning.md` con header puntero.
- **NO añadir código** en Fase 11.E — es PR doc-only. Si surge una corrección de bug pequeña que se descubre haciendo smoke testing, abrir issue separada o sub-fase 11.E.fix.

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
