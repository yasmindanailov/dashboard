# provisioning — Contract

## 1. Propósito

Orquestador del lifecycle de servicios del cliente: recibe `invoice.paid` (vía R8 Outbox), decide qué `ProvisionerPlugin` invocar según `product.provisioner_slug`, le pasa contexto (servidor seleccionado por `infrastructure` cuando el plugin lo requiera, datos de cliente, configuración de producto), gestiona el resultado (success → `service.provisioned` + activar; failure → `service.provisioning_failed` + retries en BullMQ + DLQ), y mantiene el cache `service_info` en Redis que la página `/dashboard/services/[id]` consume.

**No habla con APIs externas.** El diálogo con cPanel, ResellerClub, Docker, Plesk, etc. lo hace cada plugin. El módulo `provisioning` es el **director de orquesta** que invoca la interfaz canónica.

## 2. Estado de implementación

✅ **Sprint 11 cerrado al 100% (2026-05-02). Fases 11.A → 11.E mergeadas en master.** Detalle completo + retrospectiva en [`completed/sprint-11-provisioning.md`](../../60-roadmap/completed/sprint-11-provisioning.md).

**Cerrado por fase:**

- ✅ **Fase 11.A** ([ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md), PR #13, commit master `a23f6bf` 2026-05-01): Contrato canónico `ProvisionerPlugin` v2 congelado (firma TypeScript + 8 capability flags + shapes + 9 ProvisionerErrorCode + pipeline de wrappers + política de versionado v2 estable + test contract genérico). Decisión arquitectónica antes de cualquier código.
- ✅ **Fase 11.B** (PR #14, commit master `67fd733` 2026-05-02): Orquestador + chasis canónico:
  - `core/provisioning/types.ts` literal del ADR-077 §1+§2 (10 secciones de shapes).
  - `core/provisioning/plugin-utils.ts` con 3 wrappers cross-cutting (`getServiceInfoWithCache`, `executeActionWithCacheInvalidation`, `getSsoUrlWithAudit`). Plugins NO llaman directamente a Redis, EventEmitter ni AuditService.
  - `core/provisioning/provisioning-cache.service.ts` (ioredis Redis DB 2, fail-open, prefijo `aelium-provisioning:service_info:<id>`).
  - `core/provisioning/plugin-registry.ts` (token DI multi-injection `PROVISIONER_PLUGINS` + 5 validaciones al boot: contractVersion, slug kebab-case, no duplicados, panel_label coherence, action slug uniqueness).
  - `ProvisioningOrchestratorService` con `@OnEvent('invoice.paid')` + processor BullMQ `provisioning-dispatch` con DLQ + retries [30s, 90s, 270s, ...]. Distinción retriable vs non-retriable errors.
  - Schema: `services.provisioner_slug` + `services.provider_reference` (NULLABLE, indexados). Migración `sprint11b_services_provisioner_columns`.
  - Setting `provisioning.service_info_ttl_seconds` (default 60s).
  - **26 unit tests nuevos** (suite **183/183 verde**): 7 PluginRegistryService + 9 wrappers + 10 orquestador.
- ✅ **Fase 11.C** (PR #16, commit master `179d7c4` 2026-05-02): Plugins triviales `internal` + `manual` + listener `provisioning-on-task-completed` filtrado por `capabilities.completes_via_task` (NO por `task.type`) + ESLint `no-restricted-imports` enforce R4 sobre `src/plugins/provisioners/**` + test contract genérico parametrizado por plugin (ADR-077 §7) + E2E `provisioning-manual-flow.spec.ts` + extensión `support-inside.spec.ts` con flujo end-to-end real (**hito histórico**: listener Sprint 8 D.12.9 validado por primera vez en flujo real). Suite **228/228 unit + 120/120 E2E verde**. Seed `support-inside-plans` migrado a `provisioner='internal'`.
- ✅ **Fase 11.D** (PR #18, commit master `e5fb67e` 2026-05-02): Frontend + REST endpoints:
  - **8 endpoints REST** (4 cliente + 4 admin — el plan inicial mencionaba 7; admin tiene también `GET :id` para detalle agente).
  - **3 páginas frontend** (`/dashboard/services`, `/dashboard/services/[id]`, `/admin/services`) + **5 componentes shared** en `_shared/services/` (ServiceHeader, MetricsBar, ActionsBar, SsoButton, helpers `service-status`).
  - SSO endpoint canónico devuelve `{ sso: SsoUrl | null }` (wrapper JSON profesional vs `null` literal).
  - **ADR-078 mergeado vía PR #17** como pre-requisito doctrinal: marker `TODO(ADR-078, Sprint 13)` aplicado en cada Client Component nuevo (5 entries verificables vía `grep -r "TODO(ADR-078" frontend/app`). Fase 11.D = **última excepción permitida** del patrón `'use client' + localStorage`.
  - Suite **241/241 unit + 129/129 E2E verde** (+13 unit + 9 E2E sobre Fase 11.C).
  - 51 warnings DC.6 esperados (ADR-078 §3.3) — NO bloqueantes en CI.
- ✅ **Fase 11.E** (PR #20, doc-only — esta fase): Cierre documental:
  - `docs/features/services/admin.md` + `client.md` (nuevos).
  - `docs/features/provisioning/admin.md` (vista interna del orquestador).
  - Este `contract.md` actualizado a estado ✅ implementado.
  - `_events.md`, `_matrix.md`, `billing.md`, `jobs-reference.md`, `settings-reference.md` — verificación + actualización con estado real (la mayoría ya al día desde commits 11.B-D).
  - 4 DCs nuevas registradas en `backlog.md` (DC.27 Playwright image, DC.29 bloque servicios admin/clients, DC.30 UI inline slot SI, DC.31 AuditLogFeed inline).
  - Retrospectiva `completed/sprint-11-provisioning.md` + Sprint 11 movido entero a `completed/` con puntero en `current.md`.

**Sprint 15C — Plugin Enhance CP (P2.3, en curso desde 2026-05-07)**:

- ✅ **Fase 15C.A** ([ADR-082](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) + [ADR-077 Amendment A1](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) + [ADR-083](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md), PR #36, commit master `0bb83b3` 2026-05-08): 3 ADRs frozen doc-only antes del primer commit funcional. ADR-082 transversal (modelo Domain↔Hosting + DNS doctrine, 6 invariantes DH-INV-1..6), ADR-077 Amendment A1 (capability `has_dns_management`), ADR-083 (35 decisiones específicas del plugin Enhance). Cross-refs en `current.md`, `backlog.md`, `_events.md` (2 eventos `service.*` aspiracionales declarados), `settings-reference.md` (2 settings `provisioning.*` aspiracionales).
- ✅ **Fase 15C.B** ([ADR-083 Amendment A1](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments), PR #37, commit master `156ea35` 2026-05-08): `EnhanceApiClient` cliente HTTP + 28 métodos cubriendo Fases C-H + `MockEnhanceServer` Express stub + 74 tests (24 http-client + 28 client + 22 integration). Mock canónicamente ubicado en `backend/test/mocks/enhance-server/` (ADR-083 Amendment A1). Suite **329/329 unit verde**.
- ✅ **Fase 15C.C** ([ADR-083 Amendment A2](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments) + [ADR-077 Amendment A2](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments), PR #38, commit master `69fed47` 2026-05-08): **Primer plugin SaaS real**. `EnhanceProvisionerPlugin` (los 6 métodos del contrato + manifest declarativo + 9 inlineActions + capabilities frozen incluido `has_dns_management=true`) + `EnhanceCustomersService` (lazy create + 3-step idempotency con `pg_advisory_xact_lock`) + tabla nueva `enhance_customers` PK natural `user_id` (Amendment A2 a ADR-083) + slug regex extendido a `/^[a-z][a-z0-9_-]*$/` (Amendment A2 a ADR-077, bug pre-existente del registry kebab-only que habría rechazado `enhance_cp` en boot) + DI registration en `ProvisioningModule`. Test contract genérico refactorizado a `mode='full' | 'static-only'` (ADR-077 §7) — `enhance_cp` opera en `static-only` porque sus comportamientos requieren mocks a service-level cubiertos en `enhance.plugin.spec.ts` (41 tests). Suite **395/400 unit verde + 5 skipped** (mode static-only para `enhance_cp` en contract genérico).
- ✅ **Fase 15C.D** ([ADR-082 §4/§5/§6](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) + [ADR-083 §5 decisiones 18-21](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md), PR #41, commit master `a319063` 2026-05-08): **DNS-as-capability orchestration**. Helper canónico [`core/provisioning/dns-authority-resolver.ts`](../../../backend/src/core/provisioning/dns-authority-resolver.ts) (PURO, R4 intacto — vive en core, los plugins NO se importan entre sí) + extensión `PluginRegistryService.getByCapability()` + extensión `SettingsService.getJson<T>()` + servicio `EnhanceDnsDefaultsService` (`applyClusterNameservers` idempotente NS-sync C3→C2 + `reconcileZoneDefaults` defensivo SIN borrar custom). 3 listeners canónicos en `ProvisioningModule`: `BootstrapEnhanceDefaultsOnPluginInstalledListener` (`@OnEvent('plugin.installed')`), `ReconcileDnsDefaultsOnServiceActivatedListener` (`@OnEvent('service.activated')`), `SyncDefaultNameserversToEnhanceListener` (`@OnEvent('provisioning.default_nameservers_changed')` aspiracional Sprint 12). 8 endpoints REST: 4 cliente `/services/:id/dns/records[/:recordId]` GET/POST/PATCH/DELETE + 4 admin espejo. Error canónico `404 + { code: 'DNS_MANAGED_EXTERNALLY' \| 'DNS_NO_AUTHORITY_PLUGIN', reason, nameservers, hint }`. 2 settings nuevos seedeados: `provisioning.default_nameservers` (JSON array, NS-sync C3) + `provisioning.enhance_cp.reconciliation_alert_threshold=5` (consumidor cron Fase H). Suite **445/450 unit verde + 5 skipped** (+50 vs base: 18 resolver + 3 registry + 10 dns-defaults + 13 listeners + 6 service pipeline). Smoke test cURL ✅ — los 4 casos de error canónicos del resolver verificados contra DB real.
- ✅ **Fase 15C.E** (PR #44, commit master `8de99fd` 2026-05-09): backend acciones curadas + flag canónico `ServiceAction.adminOnly` (ADR-077 A3) + 10ª action `list_available_plans` (ADR-083 A3) + enforcement HTTP 403 backend + evento `service.action_admin_only_violation`.
- ✅ **Fase 15C.E.2** (PR #45, commit master `99f4a0c` 2026-05-09): frontend acciones curadas — form admin productos `provisioner_config` UI dinámica (`@rjsf/core`) + filter `adminOnly` en `ActionsBar` (ADR-080 Amendment B + ADR-077 A3.5).
- ✅ **Fase 15C.F** (PR #46, commit master `801e748` 2026-05-09): SSO endpoints + admin impersonation + listener GDPR + transparency. Wrapper `getSsoUrlWithAudit` emite `service.admin_sso_impersonation` con shape ADR-083 §6. `AuditAdminSsoImpersonationListener` persiste con `metadata.target_user_id` para portal transparency.
- ✅ **Fase 15C.G** (PR #47, commit master `5207ff1` 2026-05-09): DNS records UI cliente — DS components (Select/Input/Modal) + 9 tipos canónicos en `lib/api.ts` + 4 Server Actions + página SC `/dashboard/services/[id]/dns/page.tsx` + 3 componentes + doc `features/services/client.md §7.5`.
- ✅ **Fase 15C.H** (PR [#49](https://github.com/yasmindanailov/dashboard/pull/49), commit master `1efeb83` 2026-05-09): **L3 reconciliation cron + 2 listeners** ([ADR-083 §6 decisión 24](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md) materializada). `EnhanceReconciliationCron` (`@Cron(EVERY_6_HOURS)` estático, patrón canónico in-process consistente con `AuditRetentionCron`/`NotificationsRetentionCron`) itera services `provisioner_slug='enhance_cp' AND status IN ('active','suspended')` y por cada uno hace `api.getSubscription` directo via `plugin.getApiClient()` (acoplamiento plugin-internal aceptable — el cron vive en el módulo Enhance). 3 escenarios drift: (a) `subscription_missing` (404) emite evento + log warn pero NO modifica `Service.status` (DH-INV-6 + dossier §6.10 + el enum Prisma no tiene `unknown`); (b) `status_divergence` adopta automáticamente (`active`↔`suspended`) o emit-only fuera del set safe-adopt (cancelled/expired/failed); (c) `plan_divergence` compara contra `service.metadata.enhance_plan_id` (snapshot por-servicio) NO contra `Product.provisioner_config` (catálogo) — A4 doctrina Fase H. **Bug fix incluido**: `actionChangePackage` ahora actualiza `service.metadata.enhance_plan_id` tras éxito del PATCH a Enhance, evitando false-positive de `plan_divergence` tras cualquier change_package admin. Listeners nuevos: `AuditOnServiceReconciledExternalChangeListener` (`audit_change_log` con `_meta.gdpr_visible_to_data_subject` per change_type) + `NotificationsOnReconciliationThresholdExceededListener` (SQL count `+1` race-tolerant + dedupe via setting interno `enhance_cp.reconciliation_last_alert_at` ventana 24h).
- ✅ **Fase 15C.J** (PR [#50](https://github.com/yasmindanailov/dashboard/pull/50), commit master `c1c9f41` 2026-05-09 — incluye hotfix `a34bb93` cableando `onRowClick` en lista admin): **Cierre operativo admin + plugin install seed dev**. Materializa el primer cliente Enhance contratable end-to-end. (1) Página admin `/admin/services/[id]` SC nativo paralelo al detalle cliente — reusa `ServiceHeader/MetricsBar/SsoButton/ActionsBar` de `_shared/services/`, añade Card "Datos del servicio (admin)" (owner link a `/admin/clients/[user_id]`, provisioner_slug, producto, fechas) + Card "Operaciones admin" con botón "Cambiar plan…" que abre `ChangePackageModal` (CC). El modal invoca primero `executeAction('list_available_plans')` para poblar dropdown, luego `executeAction('change_package', {planId})` con confirmación. (2) Blacklist `INTERNAL_HELPER_SLUGS = ['change_package', 'list_available_plans']` añadida a `_shared/services/ActionsBar.tsx` — slugs operados desde modal admin custom, ocultos del listado de botones standalone (tanto cliente como admin). Documentación inline cita ADR-083 §6 decisión 30 + Amendment A3 — único caso canónico de blacklist por slug, ortogonal al filter declarativo `adminOnly` (Sprint 15C Fase E.2). (3) Seed dev/QA `seedSampleEnhancePluginInstall` condicional a 4 condiciones AND: `NODE_ENV !== 'production'` + 3 env vars dev completas (`ENHANCE_DEV_BASE_URL`/`ENHANCE_DEV_MASTER_ORG_ID`/`ENHANCE_DEV_API_TOKEN`). Si activo: instancia `SecretVaultService` con shim `ConfigService` que delega a `process.env.ENCRYPTION_KEY` (mismo algoritmo AES-256-GCM que runtime — blob descifrable por el plugin tras boot), encripta apiToken, upsert `plugin_installs.enhance_cp` con `enabled=true`. Idempotente: fila existente preserved (admin config gana). En producción siempre skip — los plugins reales se configuran desde UI con secrets cifrados.
- ⏳ **Fase 15C.I** (pendiente): cierre formal del sprint — E2E completo flujo Enhance (Playwright) + smoke manual contra Enhance live + retrospectiva + actualización `_events.md` + `_matrix.md` + i18n strings finales. Última fase del sprint.

Cache Redis `service_info:<serviceId>` con TTL configurable + invalidación tras `executeAction` (gestionada por wrapper, no por plugin). Audit hooks emiten `service.action_executed`, `service.sso_opened`, `service.metrics_fetched` — listeners `audit` + `notifications` pendientes para cuando llegue plugin real con coste de fallo significativo (NO bloquean cierre Sprint 11; pipeline ya emite los eventos correctamente).

**Decisión local registrada (Fase 11.B, sin ADR aparte):** el orquestador emite un evento NUEVO `service.activated` cuando confirma `services.status='active'` tras `plugin.provision()` exitoso. NO sobreescribe `service.provisioned` que `BillingCheckoutService` emite al crear el service (consumido por listener Sprint 8 D.12.9 `SupportInsideOnServiceProvisionedListener`). Plugins reales Sprint 15 consumen `service.activated`. Documentado inline en docstring del orquestador.

## 3. Arquitectura → referencias canónicas

- [ADR-021](../../10-decisions/adr-021-provisioners.md) — interfaz mínima v1 `provision/deprovision/getStatus` y patrón "plugin libre dentro de la interfaz".
- [ADR-070](../../10-decisions/adr-070-service-info-sso-acciones-curadas.md) — decisión arquitectónica abstracta de `getServiceInfo` + `getSsoUrl` + `executeAction` + doctrina de acciones curadas (5 criterios para añadir una nueva).
- **[ADR-077](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md) — Contrato canónico `ProvisionerPlugin` v2 congelado (firma TypeScript + capability flags + shapes + pipeline canónico de wrappers + política de versionado + test contract genérico). Materializa ADR-070 a nivel de código. Sprint 11 Fase 11.A.**
- [ADR-071](../../10-decisions/adr-071-vista-admin-federada-infraestructura.md) — extensión opcional (vista admin federada) con `listRemoteServers` + `getProviderHealthSummary` para `/admin/infrastructure`. Mismo principio "no replicar panel del proveedor"; mapping inicial: `enhance_cp` ✅, `cpanel_whm` ✅, `plesk_obsidian` ✅, `directadmin` ⚠ parcial, `docker_engine` N/A (usa tabla `servers` directa), `resellerclub`/`internal`/`manual` ❌.
- [ADR-009](../../10-decisions/adr-009-estrategia-plugins.md) — patrón plugin general (manifest, loader, encriptación de credenciales).
- [ADR-043 §B](../../10-decisions/adr-043-infraestructura-self-hosted.md) — `infrastructure.pickServerForProduct()` se invoca **sólo** para plugins que consumen servidores propios (hoy únicamente `docker_engine` — Sprint 15E). El resto de plugins ignoran `infrastructure`.
- [ADR-033](../../10-decisions/adr-033-outbox-pattern-pendiente.md) — `invoice.paid` viaja por Outbox (R8); el orquestador consume desde el bus tras `OutboxDispatchProcessor`.
- [ADR-055](../../10-decisions/adr-055-resiliencia-circuit-breaker.md) — circuit breaker obligatorio en cada plugin (R11).
- [ADR-063](../../10-decisions/adr-063-bullmq-canonico-dlq-retries.md) — cola `provisioning-dispatch` con DLQ persistente; retries con backoff exponencial.
- [ADR-066](../../10-decisions/adr-066-tres-portales-raiz-portalbadge.md) — la página de servicio vive en `/dashboard/services/[id]` (portal cliente).
- **[ADR-082](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)** — modelo canónico Domain ↔ Hosting + DNS doctrine (transversal: 6 invariantes DH-INV-1..6 + 4 flujos checkout F1-F4 + capability `has_dns_management` + NS-sync 3 capas + listener reconcile defensivo + cross-plugin `dns-authority-resolver`). Materializado en código por Sprint 15C Fase 15C.D — helper `core/provisioning/dns-authority-resolver.ts` (PURO, R4 intacto, vive en core; los plugins NO se importan entre sí), extensión `PluginRegistryService.getByCapability(cap)`, servicio `EnhanceDnsDefaultsService` (NS-sync C3→C2 idempotente + reconcile zone defensivo SIN borrar custom), 3 listeners en `ProvisioningModule`, 8 endpoints REST `/services/:id/dns/records` cliente + admin.
- **[ADR-083](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md)** — Plugin Enhance CP specifics (35 decisiones frozen + Amendments A1/A2). Materializado en código por Sprint 15C Fases 15C.B + 15C.C + 15C.D.

## 4. Modelos Prisma propios

| Tabla | Estado | Propósito |
|-------|--------|-----------|
| `services` | ✅ stub Prisma (Sprint 5) | Servicio activo del cliente. Campos canónicos `status`, `provisioner_slug`, `server_id` (NULL salvo Docker), `provider_reference` (ID externo en el sistema del proveedor), `metadata` jsonb (datos del plugin). |
| `enhance_customers` | ✅ Sprint 15C Fase 15C.C | Mapping Client Aelium ↔ Customer Org Enhance (lazy create al primer hosting Enhance). Específica del plugin `enhance_cp` — los demás plugins NO la consumen. PK natural `user_id` con FK CASCADE a `users.id`. Schema canónico: [enhance-customers.md](../../30-data/enhance-customers.md). |
| `service_metrics_snapshot` | ⬜ futuro | Snapshot puntual de métricas por servicio si el plugin no es Docker (sin time-series). Default: no se persiste, sólo cache Redis. Decisión final en Sprint 11. |

> **No** se persisten métricas time-series por servicio salvo Docker (que reusa `server_metrics` filtradas por contenedor del cliente). Ver nota canónica de [`infrastructure.md`](../../30-data/infrastructure.md).

## 5. Modelos foráneos accedidos

- `services` — propio.
- `products` (lectura) — para resolver `provisioner_slug`, configuración de bloque del provisioner, `docker_template_id`.
- `clients` (lectura) — datos del cliente para inyectar en provisioning.
- `servers` + `server_pools` (lectura) — sólo cuando `provisioner_slug = 'docker_engine'`.
- `audit_access_log` (escritura via `AuditService`) — toda acción inline + SSO open + métricas fetched.
- `failed_jobs` (escritura via `DlqService`) — cuando un job de provisioning agota retries.

## 6. Eventos

### Emite

- `service.provisioned` — provisioning OK, servicio activado.
- `service.provisioning_failed` — provisioning falló tras retries (consumido por `notifications` → alerta admin).
- `service.suspended` / `service.resumed` / `service.cancelled` — lifecycle.
- `service.action_executed` — payload `{ serviceId, actionSlug, clientId, success, sideEffects }`.
- `service.sso_opened` — payload `{ serviceId, panelLabel, clientId, ip }`.
- `service.metrics_fetched` — payload `{ serviceId, fetchedAt, sourceLatencyMs }`.
- **Sprint 15A — `plugin.*` ([ADR-080](../../10-decisions/adr-080-plugin-framework.md)):**
  - `plugin.installed` — primer enable de un plugin no-bootstrap.
  - `plugin.config_changed` — emitido por `AdminPluginsService.update`. Consumido por `PluginRegistryService.handleConfigChanged` (recarga `activePlugins` sin re-validar contrato — ADR-080 §4).
  - `plugin.uninstalled` — reservado, no emitido en Sprint 15A.
  - `plugin.circuit_opened` / `plugin.circuit_closed` — emitidos por `HouseCircuitBreaker` cuando un proveedor cae o se recupera. Consumidos por `NotificationsPluginCircuitListener` → notif a superadmin.
- **Sprint 15C — `service.*` ([ADR-083](../../10-decisions/adr-083-plugin-enhance-cp-specifics.md)):**
  - `service.admin_sso_impersonation` — payload `{ service_id, user_id, agent_user_id, agent_ip, agent_user_agent, provisioner_slug, panel_label, opened_at, gdpr_visible_to_data_subject: true }`. Emisor: `getSsoUrlWithAudit` cuando `actorIsAdmin && service.user_id !== actorUserId` (predicado canónico, Sprint 15C Fase 15C.F). Consumidor: **`AuditAdminSsoImpersonationListener`** persiste en `audit_access_log` con `metadata.target_user_id = service.user_id` para que `/dashboard/transparency` lo exponga al cliente afectado. Filter del controller transparency extendido vía constante cerrada `TRANSPARENCY_VISIBLE_ACTIONS = ['read', 'admin_sso_impersonation']`.
  - `service.reconciled_external_change` — payload `{ service_id, user_id, plugin_slug, change_type: 'subscription_missing' | 'status_divergence' | 'plan_divergence', expected, actual, detected_at }`. Emisor: `EnhanceReconciliationCron` (Sprint 15C Fase 15C.H) — `@Cron(EVERY_6_HOURS)` estático que itera services `enhance_cp` activos/suspended y compara contra Enhance vía `api.getSubscription`. Consumidores: **`AuditOnServiceReconciledExternalChangeListener`** (`audit_change_log` con `_meta.gdpr_visible_to_data_subject` per change_type — true para subscription_missing/status_divergence, false para plan_divergence) + **`NotificationsOnReconciliationThresholdExceededListener`** (SQL count audit_change_log últimas 24h `+ 1` race-tolerant; si supera setting `provisioning.enhance_cp.reconciliation_alert_threshold` (default 5) → `dispatchToSuperadmins` + dedupe via setting interno `enhance_cp.reconciliation_last_alert_at` ventana 24h). Doctrina canónica: [DH-INV-6 ADR-082 §1](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) — Aelium adopta status auto solo dentro del set safe (`active`↔`suspended`); plan_divergence NO se auto-corrige (billing implication).
- **Sprint 15C Fase 15C.D — `provisioning.*` aspiracional ([ADR-082 §4](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)):**
  - `provisioning.default_nameservers_changed` — payload `{ newValue: string[], oldValue: string[], changedBy: string }`. Listener `SyncDefaultNameserversToEnhanceListener` ya escrito + testeado en Fase 15C.D; emisor llega con la UI admin de settings (Sprint 12). Propaga NS-sync C3 → C2 idempotentemente al cluster Enhance vía `EnhanceDnsDefaultsService.applyClusterNameservers(...)`.

### Consume

- `invoice.paid` — dispara provisioning del servicio asociado.
- `invoice.refunded` (futuro) — puede disparar `deprovision` según política.
- `task.completed` (cuando el provisioner es `manual`) — listener marca `service.status = active`.
- **Sprint 15C Fase 15C.D — listeners DNS-as-capability orchestration ([ADR-082 §4 + §5](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)):**
  - `plugin.installed` (filtro slug=`enhance_cp`) → `BootstrapEnhanceDefaultsOnPluginInstalledListener` lee setting `provisioning.default_nameservers` y propaga al cluster Enhance vía `EnhanceDnsDefaultsService.applyClusterNameservers(...)`.
  - `service.activated` (filtro `provisioner_slug=enhance_cp` + refs Enhance presentes en metadata) → `ReconcileDnsDefaultsOnServiceActivatedListener` ejecuta reconcile defensivo de la zona DNS del website (añade NS canónicos faltantes; NUNCA borra records inesperados).

## 7. API REST expuesta (Sprint 11)

> Split admin/cliente según [ADR-066](../../10-decisions/adr-066-tres-portales-raiz-portalbadge.md):

### Cliente (`/api/v1/services/`)

- `GET /api/v1/services` — lista servicios del cliente autenticado.
- `GET /api/v1/services/:id` — detalle + `getServiceInfo()` (cached 60s Redis).
- `POST /api/v1/services/:id/sso` — devuelve `SsoUrl` del plugin si soporta SSO. Audit obligatorio.
- `POST /api/v1/services/:id/actions/:actionSlug` — ejecuta acción inline. Validación de que `actionSlug` está en `capabilities.inline_actions`. Audit obligatorio. **Enforcement `adminOnly` (Sprint 15C Fase 15C.E — [ADR-077 Amendment A3](../../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments))**: si la action declara `adminOnly: true` y el actor no tiene rol staff, el wrapper `executeActionWithCacheInvalidation` lanza `HTTP 403 ForbiddenException + body { code: 'ACTION_ADMIN_ONLY', action_slug }` + audit `logAccess(action='service.action_admin_only_violation')` + emite evento `service.action_admin_only_violation`. Defensa profunda — el frontend ya filtra acciones por `adminOnly` para que el cliente NO las vea, pero el backend nunca confía en el frontend.
- **DNS records (Sprint 15C Fase 15C.D — [ADR-082 §6](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md))**:
  - `GET /api/v1/services/:id/dns/records` — lista records de la zona del service. Routea al plugin con `has_dns_management=true` resuelto via `dns-authority-resolver`.
  - `POST /api/v1/services/:id/dns/records` — crea record (kinds v1: `A | AAAA | CNAME | MX | TXT | SRV | CAA`). DTO validado class-validator + Ajv del plugin (`payloadSchema` de `add_dns_record`).
  - `PATCH /api/v1/services/:id/dns/records/:recordId` — actualiza record.
  - `DELETE /api/v1/services/:id/dns/records/:recordId` — elimina record (destructive — `confirmRequired` en UI).

### Admin (`/api/v1/admin/services/`)

- `GET /api/v1/admin/services` — vista agente (filtros por cliente, plugin, estado).
- `POST /api/v1/admin/services/:id/reprovision` — fuerza re-ejecución (úselo como escotilla cuando un plugin falla y se reparó la causa raíz).
- `POST /api/v1/admin/services/:id/deprovision` — desactiva servicio (cancelación admin).
- **DNS records admin espejo (Sprint 15C Fase 15C.D)**: `GET / POST /api/v1/admin/services/:id/dns/records` + `PATCH / DELETE /api/v1/admin/services/:id/dns/records/:recordId`. Triple guard `JwtAuthGuard + AdminOnlyGuard + PoliciesGuard` con bypass de ownership. Mismo pipeline que cliente.

### Admin Plugin Framework (`/api/v1/admin/plugins/*` — Sprint 15A, [ADR-080](../../10-decisions/adr-080-plugin-framework.md))

> Acceso exclusivo `superadmin` (CASL `Subject.Plugin` admin-puro, mismo patrón ADR-067 que `NotificationTemplate` / `Job`). El resto de staff recibe 403.

- `GET /api/v1/admin/plugins` — lista plugins disponibles (DI + contrato OK) con manifest + estado de instalación + circuit_state.
- `GET /api/v1/admin/plugins/:slug` — detalle. Secrets enmascarados como `'***'` (seteado) o `null` (no seteado). NUNCA plaintext.
- `PATCH /api/v1/admin/plugins/:slug` — actualiza `enabled`/`config`/`secrets`. Validación Ajv contra `manifest.configSchema` y `manifest.secretsSchema`. Secrets cifrados con `SecretVaultService` (AES-256-GCM). Audit `logChange` con secrets enmascarados (`<set>`/`<cleared>`). Emite `plugin.config_changed` + `plugin.installed` (primera vez).
- `POST /api/v1/admin/plugins/:slug/test-connection` — invoca `plugin.getStatus()` con service sintético. Solo si `manifest.testConnectionMethod === 'getStatus'`. NO persiste cambios.

**Operativa diaria documentada en [`docs/features/provisioning/admin-plugins.md`](../../features/provisioning/admin-plugins.md).**

## 8. Edge cases relevantes

- **Plugin sin SSO**: `getSsoUrl` devuelve `null` → frontend oculta botón "Abrir panel".
- **Plugin con métricas no disponibles temporalmente**: `getServiceInfo` devuelve `metrics: undefined` → frontend muestra placeholder "Métricas no disponibles".
- **Cache invalidation tras `executeAction`**: helper `executeActionWithCacheInvalidation()` lo gestiona; los plugins no deben invalidar manualmente.
- **Provisioning timeout** (>30s): cola BullMQ retiene el job, retries con backoff [30s, 90s, 270s]; tras 3 fallos → DLQ + `service.provisioning_failed` + alerta admin.
- **Servicio cancelado mientras provisioning está en cola**: el processor verifica estado actual antes de ejecutar; si `status = cancelled`, marca job como descartado y registra en audit.
- **Plugin desactivado** (admin lo deshabilitó en Settings tras tener servicios activos): `getStatus` retorna error controlado; frontend muestra warning "Plugin temporalmente inactivo, contacta soporte".
- **DNS gestionado externamente** ([ADR-082 §6](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md)): cuando el cliente abre `/dashboard/services/[id]/dns` de un dominio cuyos NS no coinciden con `provisioning.default_nameservers`, el resolver devuelve `authority='external'` y la API responde `404 + body { code: 'DNS_MANAGED_EXTERNALLY', reason, nameservers, hint }`. Frontend renderiza banner "DNS externo en `<ns>`" + acción curada `modify_ns` (con `confirm_required: true` + texto explicando impacto).
- **Cluster sin plugin DNS authority instalado**: caso degenerado tras desinstalar plugin `enhance_cp` con servicios hosting activos. El resolver devuelve `404 + { code: 'DNS_NO_AUTHORITY_PLUGIN' }`. Frontend muestra fallback "Sin gestor DNS — contacta soporte".
- **Reconcile defensivo NO borra**: el listener `ReconcileDnsDefaultsOnServiceActivatedListener` añade NS canónicos faltantes a la zona pero NUNCA borra records inesperados (CNAME/MX/TXT custom). Doctrina canónica: Aelium NO espeja zone state, sólo aplica defaults faltantes ([ADR-082 §5](../../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) + DH-INV-6).

## 9. Pendientes registrados

- ✅ Sprint 11 cerrado al 100% (2026-05-02). Plugins triviales `internal` + `manual` operativos; orquestador escucha `invoice.paid` y emite los 5 eventos canónicos.
- ✅ Sprint 15A cerrado al 100% (2026-05-06) — Plugin Framework. Manifest declarativo (JSON-Schema 7) + `SecretVaultService` AES-256-GCM + `plugin_installs` + loader runtime desde DB + circuit breaker tras interface + 5 eventos `plugin.*` + UI admin completa (`/admin/settings/plugins`). Ver [ADR-080](../../10-decisions/adr-080-plugin-framework.md).
- Listener `notifications-on-provisioning-failed` para alertar superadmin cuando llegue plugin con coste de fallo significativo (Sprint 12 o cuando llegue primer plugin real).
- Listener `audit-on-service-events` para persistir `service.metrics_fetched` / `service.action_executed` / `service.sso_opened` en `audit_change_log` + portal RGPD cliente (Sprint 12.5 Portal Transparencia o sub-sprint dedicado).
- **Sprint 15C — Plugin Enhance CP** (P2.3, en curso): Fases A/B/C/D ✅ cerradas (PRs #36/#37/#38/#41). Fase D cerró el bloque transversal **DNS-as-capability orchestration** (helper canónico `dns-authority-resolver` + 3 listeners + 8 endpoints REST + 2 settings + servicio `EnhanceDnsDefaultsService`). Fases E-I pendientes (acciones admin curadas + SSO endpoints + UI DNS records 7 tipos + cron 6h + E2E + retrospectiva). Hereda TODO el framework Sprint 15A.
- Sprint 15D/E/G — Plugins reales restantes (ResellerClub, Docker Engine, Plesk Obsidian) — desbloqueados tras cierre Sprint 15C (autoridad DNS Enhance operativa). Solo declaran 6 métodos del contrato + manifest + (RC consume `domain.zone_pre_create` handshake con plugin Enhance).
- Sprint 15A — E2E circuit breaker (Fase J.2 diferida): los unit tests cubren la lógica del breaker exhaustivamente (16/16 verde) con tiempo determinista. El E2E genuino llegará con el primer plugin real (Sprint 15C/D/E) cuando se simule la caída de un proveedor real.
- Cuando se implemente Sprint 15E (Plugin Docker), añadir a `service_metrics` lectura filtrada por contenedor del cliente.
- Cuando se implemente Sprint 19 (Partner Module), abrir tema "qué partners pueden invocar `executeAction` de servicios de sus clientes" — decisión pendiente con ADR específico.
- DC.29 (backlog): bloque "Servicios contratados" en `/admin/clients/[id]` (vista relacional cotidiana del agente).
- DC.30 (backlog): UI inline del slot Support Inside desde `/dashboard/services/[id]` (DC.17 cierre parcial).
- DC.31 (backlog): `<AuditLogFeed>` inline en `/dashboard/services/[id]` (diferido — `/dashboard/transparency` cubre el caso global).
