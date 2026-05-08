# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26 + closures Sprint 8 / 9 / 9.5 / 9.6 / 11.5 (2026-04-26 → 2026-05-01) + Sprint 11 Fases A+B (2026-05-01/02). Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)). Los sprints ✅ que aparecen abajo son punteros a `completed/`; viven aquí solo para trazabilidad cronológica de la ola P1.1.

> **Última actualización:** 2026-05-08 — **Sprint 15C Fases A + B + C cerradas y mergeadas a master**. Fase 15C.A doc-only (PR #36, master `0bb83b3`) congeló 3 ADRs (082 transversal Domain↔Hosting + 077 Amendment A1 `has_dns_management` + 083 Plugin Enhance specifics 35 decisiones). Fase 15C.B (PR #37, master `156ea35`) materializó `EnhanceApiClient` (28 métodos + 74 tests) + `MockEnhanceServer` Express stub + ADR-083 Amendment A1 (ubicación canónica del mock `backend/test/mocks/enhance-server/`). Fase 15C.C (PR #38, master `69fed47`) cerró el primer plugin SaaS real: `EnhanceProvisionerPlugin` (6 métodos contrato + manifest + 9 inlineActions + capabilities frozen) + `EnhanceCustomersService` (lazy create + 3-step idempotency con `pg_advisory_xact_lock`) + tabla nueva `enhance_customers` PK natural `user_id` (ADR-083 Amendment A2) + slug regex extendido `/^[a-z][a-z0-9_-]*$/` snake+kebab (ADR-077 Amendment A2, fix bug pre-existente registry kebab-only) + DI registration + 49 tests nuevos. Suite total: **395/400 unit verde + 5 skipped** (mode='static-only' del contract test para `enhance_cp`). Cierre doctrinal del PR #38: schema doc nueva [`enhance-customers.md`](../30-data/enhance-customers.md), `provisioning/contract.md` actualizado §2/§4/§6/§9, 10 términos nuevos al [glossary.md](../00-foundations/glossary.md) (cierre deuda histórica PR #36 — DH-INV-N + NS-sync 3 capas + DNS authority resolver + Default DNS records platform-level + Checkout flows F1-F4 + Enhance Customer + Master Org Aelium + Customer Org Enhance + OTP SSO URL + Reconcile drift detection). Smoke test browser ✅ — plugin renderiza correctamente en `/admin/settings/plugins/enhance-cp`. Earlier 2026-05-07 — **Sprint 15C arrancado** (rama `sprint15c-plugin-enhance-cp` desde master `80492ad`). Earlier 2026-05-07 — **Pre-sprint dossier 15C Enhance CP completado**. Cabeza de cola activa P2.3 (primer plugin real post Sprint 15A). Iteración con Yasmin produjo: spec `orchd v12.21.3` capturado literal en [`docs/_research/sprint-15c/orchd-oas3-api.yaml`](../_research/sprint-15c/orchd-oas3-api.yaml) (588 KB, ~280 paths, OpenAPI 3.0.3) + dossier formal 11 secciones en [`sprint-15c-enhance-cp-dossier.md`](./sprint-15c-enhance-cp-dossier.md) con catálogo exhaustivo Enhance API, scope frozen (28 in / 17+ out, supera WHMCS/Blesta/WiseCP/Upmind en DNS+métricas+audit+cross-plugin), 16 deudas explícitas (DC.NEW-15C-1..16), 3 ADRs futuros (082 transversal Domain↔Hosting con DH-INV-1..6 + 077 Amendment A1 `has_dns_management` flag + 083 plugin specifics). Decisiones canónicas frozen: provision 6-step idempotente con search-by-email, SSO 2-call OTP via `/orgs/{cust}/members/{owner}/sso`, default DNS records globales en cluster (reemplaza listener inline), reconcile 3 capas (60s/on-demand/6h), DH-INV-6 (Enhance gana en conflicto operacional). Earlier 2026-05-07 — **Inversión orden P2.3 ↔ P2.4** (Sprint 15C antes que Sprint 15D ResellerClub) por razón técnica DNS authority. Pre-sprint dossier 15D en [`sprint-15d-resellerclub-dossier.md`](./sprint-15d-resellerclub-dossier.md) ya en master (`542d589`). Anterior: 2026-05-06 — **Sprint 15A Plugin Framework cerrado al 100% y mergeado a master `bee90d8`**. ADR-080 (manifest declarativo + vault de secretos AES-256-GCM + loader desde DB + circuit breaker tras interface) materializado en 8 commits (6 originales + Amendment A1 con 2 fixes post-CI: `cad735b` ENCRYPTION_KEY 64 hex + `95659fb` audit_change_log entity_id UUID v5 derivado del slug). Cobertura final: **255/255 unit verde** (+57 nuevos), 7 E2E REST (`admin-plugins.spec.ts`), typecheck + lint verde backend & frontend, 5/5 CI checks verdes. Plugins reales 15B/C/D/E/G heredan TODO el framework — solo declaran 6 métodos del contrato + manifest. Detalle en [`completed/sprint-15a-plugin-framework.md`](./completed/sprint-15a-plugin-framework.md). PR [#31](https://github.com/yasmindanailov/dashboard/pull/31).
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


## ✅ Sprint 13.5 — Hardening + Saneamiento de Deuda Continua (cerrado 2026-05-03)

> Sub-sprint dedicado a cerrar deuda continua acumulada antes de Sprint 15A Plugin Framework. Movido a [`completed/sprint-13-5-hardening-deuda-continua.md`](./completed/sprint-13-5-hardening-deuda-continua.md) con retrospectiva completa, métricas, lecciones aprendidas y plan de Sprint 13.5.5 CI Infra (sub-sprint nacido del aprendizaje). 8 DCs cerradas (DC.32/33/34 + DC.14/37/38 + DC.8/11/15 parciales) + 2 diferidas (DC.13 + DC.27 → Sprint 13.5.5). Cobertura final: **183/183 unit + 118/118 E2E verde** sin regresión.

---

## ✅ Sprint 13.5.5 — CI Infra (cerrado 2026-05-03)

> Sub-sprint cerrado al 100%. Movido a [`completed/sprint-13-5-5-ci-infra.md`](./completed/sprint-13-5-5-ci-infra.md) con retrospectiva completa, métricas, decisión arquitectónica + lecciones aprendidas. **DC.27 ✅** (imagen oficial Playwright `mcr.microsoft.com/playwright:v1.59.1-noble` + service names + MinIO `bitnamilegacy/minio:2025.7.23-debian-12-r5` como service container) + **DC.13 ✅ parcial-canónica** (sharding CI con `--shard=N/M` × 3 shards paralelos, wall-clock CI 25 min → ~10 min). Paralelización local con `workers > 1` **diferida a sub-sprint condicionado** Sprint 13.5.6 (trigger: suite local > 2 min) — el cuello real estaba en CI, no en local. Decisión arquitectónica completa en la retrospectiva §4.

---

## ✅ Sprint 16 — Tasks refactor + Notes consolidation (P2.1.5) (cerrado 2026-05-02)

> Sprint cerrado al 100%. Movido a [`completed/sprint-16-tasks-notes-refactor.md`](./completed/sprint-16-tasks-notes-refactor.md) con retrospectiva completa, métricas, ADR nacido (ADR-079 + Amendments A1/A2/A3) y lecciones aprendidas. Cobertura final: **183/183 unit + 118/118 E2E verde**, 1 migración aplicada (`sprint16_tasks_notes_refactor`), 4 PRs encadenados (#21 ADR-079 → #22 backend → #23 sync → #24 frontend + amendments + cierre documental).

> **Documentación canónica del módulo:**
> - [`docs/20-modules/tasks/contract.md`](../20-modules/tasks/contract.md) — Contract canónico tasks (post-ADR-079).
> - [`docs/30-data/tasks.md`](../30-data/tasks.md) — Schema canónico tasks.
> - [`docs/30-data/clients.md`](../30-data/clients.md) — Schema canónico `client_notes` (consolidación con source tracking).
> - [`docs/features/tasks/admin.md`](../features/tasks/admin.md) — Operativa admin.
> - [`docs/features/tasks/agent.md`](../features/tasks/agent.md) — Guía agente.
> - [`docs/features/notes/admin.md`](../features/notes/admin.md) — Operativa notas consolidadas (nuevo).
> - [`docs/features/support/lifecycle.md`](../features/support/lifecycle.md) — Lifecycle ticket vs chat (Amendments A1+A3, nuevo).

---

## ✅ Sprint 13 §13.AUTH — Auth server-side con cookies httpOnly + Server Components nativos (cerrado 2026-05-03)

> Sprint cerrado al 100%. Movido a [`completed/sprint-13-auth-cookies-httponly.md`](./completed/sprint-13-auth-cookies-httponly.md) con retrospectiva completa, métricas, ADR-078 Amendment A1 (Modelo A), 11 commits encadenados en rama `sprint13-auth-cookies-httponly`, lecciones aprendidas (smoke HTTP real desbloqueando bugs IPv6 + jti, decisión arquitectónica Opción B ESLint per-línea, modelo cross-origin cookies httpOnly Next.js + handshake WS via endpoint dedicado). Cobertura final: **198/198 unit backend verde + 3 specs E2E nuevos** (`auth-cookies-flow` + `auth-replay-detection` + `auth-no-localStorage`) + frontend `pnpm typecheck` + `pnpm lint:check --max-warnings=0` + `pnpm build` verdes. Cierra **DC.6 + DC.28**.

> **Documentación canónica del módulo (post-Sprint 13 §13.AUTH):**
> - [ADR-078 + Amendment A1](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) — Modelo A (cookies httpOnly viven en dominio Next.js).
> - [`docs/00-foundations/rules.md` §R17](../00-foundations/rules.md#r17--jwt-en-cookies-httponly-de-nextjs-no-en-localstorage) — JWT en cookies httpOnly de Next.js, NO en localStorage.
> - [`docs/20-modules/auth/contract.md`](../20-modules/auth/contract.md) — §5 (`/auth/ws-token`), §7 (`auth.refresh_replay_detected`), §11 (env vars frontend `BACKEND_URL` + `NEXT_RUNTIME_SECRET`), §14 (AUTH-INV-8/9).
> - [`docs/50-operations/api-errors.md`](../50-operations/api-errors.md) — `AUTH_REPLAY_DETECTED`.

---

## ✅ Sprint 15A — Plugin Framework (P2.2) (cerrado 2026-05-06)

> Sprint cerrado al 100% y mergeado a master `bee90d8` (squash-merge PR #31). Movido a [`completed/sprint-15a-plugin-framework.md`](./completed/sprint-15a-plugin-framework.md) con retrospectiva completa, métricas, ADR-080 nacido (Plugin Framework: manifest declarativo + vault de secretos AES-256-GCM + loader desde DB + circuit breaker tras interface + 5 eventos `plugin.*`), 8 commits encadenados en rama `sprint15a-plugin-framework` (6 originales + Amendment A1 con 2 fixes CI post-cierre: ENCRYPTION_KEY 64 hex + audit_change_log entity_id UUID v5 derivado del slug), 9 lecciones aprendidas. Cobertura final: **255/255 unit verde** (+57 vs base post Sprint 13: 18 vault + 11 registry + 16 breaker + 15 admin-plugins + 2 manifest contract) + **7 E2E nuevos** (`admin-plugins.spec.ts`) + frontend `pnpm typecheck` + `pnpm lint:check --max-warnings=0` + `pnpm build` verdes. Plugins reales 15B/C/D/E/G heredan TODO el framework — solo declaran 6 métodos del contrato + manifest. PR [#31](https://github.com/yasmindanailov/dashboard/pull/31).

> **Documentación canónica del módulo (post-Sprint 15A):**
> - [ADR-080](../10-decisions/adr-080-plugin-framework.md) — Plugin Framework canónico (manifest declarativo JSON-Schema 7 + tabla `plugin_installs` + `SecretVaultService` AES-256-GCM + loader runtime desde DB + circuit breaker tras interface).
> - [`docs/30-data/plugin-installs.md`](../30-data/plugin-installs.md) — Schema canónico `plugin_installs` con justificación PK natural slug.
> - [`docs/features/provisioning/admin-plugins.md`](../features/provisioning/admin-plugins.md) — Operativa diaria del superadmin (4 flujos canónicos + auditoría + errores comunes).
> - [`docs/20-modules/_events.md` §🔌 plugin.*](../20-modules/_events.md) — 5 eventos `plugin.*` + 3 listeners nuevos.
> - [`docs/20-modules/provisioning/contract.md` §7 Admin Plugin Framework](../20-modules/provisioning/contract.md) — REST endpoints `/admin/plugins/*` + sección Pendientes actualizada.
> - [`docs/00-foundations/glossary.md`](../00-foundations/glossary.md) — 3 términos canónicos nuevos: Plugin Manifest, Secret Vault, Circuit Breaker.

---

## 🔄 Sprint 15C — Plugin Enhance CP (P2.3) (Fases A+B+C cerradas; D-I pendientes)

> Cabeza de cola activa P2.3 — primer plugin real post Sprint 15A. 9 fases planificadas (15C.A → 15C.I) — 7-10.5 sesiones según [`sprint-15c-enhance-cp-dossier.md` §7](./sprint-15c-enhance-cp-dossier.md#7-estimación-esfuerzo-sprint-15c--9-fases). Bloqueante operacional para Sprint 15D RC (sin DNS authority cluster Enhance, los dominios registrados con NS=Aelium quedarían sin destino).

### Fases cerradas

| Fase | PR | Master commit | Contenido |
|---|---|---|---|
| ✅ **15C.A** — ADRs frozen | [#36](https://github.com/yasmindanailov/dashboard/pull/36) | `0bb83b3` (2026-05-08) | 3 ADRs doc-only: [ADR-082](../10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md) transversal Domain↔Hosting + DNS doctrine (6 invariantes DH-INV-1..6, DH-INV-6 ⭐ Enhance gana en conflicto + 4 flujos F1-F4 + DNS-as-capability + NS-sync 3 capas + listener reconcile defensivo + cross-plugin resolver), [ADR-077 Amendment A1](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments) capability `has_dns_management` (required, compatible hacia atrás), [ADR-083](../10-decisions/adr-083-plugin-enhance-cp-specifics.md) Plugin Enhance CP specifics (35 decisiones contra spec literal). |
| ✅ **15C.B** — Cliente HTTP + Mock | [#37](https://github.com/yasmindanailov/dashboard/pull/37) | `156ea35` (2026-05-08) | `EnhanceApiClient` (28 métodos cubriendo Fases C-H) + types TypeScript del spec literal orchd v12.21.3 + `MockEnhanceServer` Express stub (state in-memory + idempotencia 409 + default records auto) + 74 tests nuevos (24 http-client + 28 client + 22 integration cliente↔mock). Suite **329/329 unit verde**. [ADR-083 Amendment A1](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments): ubicación canónica del mock `backend/test/mocks/enhance-server/`. |
| ✅ **15C.C** — Plugin core + DI | [#38](https://github.com/yasmindanailov/dashboard/pull/38) | `69fed47` (2026-05-08) | **Primer plugin SaaS real**. `EnhanceProvisionerPlugin` (6 métodos contrato + manifest declarativo `configSchema`+`secretsSchema` + 9 inlineActions: 3 cliente + 4 DNS + 2 admin + capabilities frozen incluido `has_dns_management=true`) + `EnhanceCustomersService` (lazy create + 3-step idempotency con `pg_advisory_xact_lock` + caché identificadores Enhance para SSO 1-call) + tabla nueva `enhance_customers` PK natural `user_id` ([ADR-083 Amendment A2](../10-decisions/adr-083-plugin-enhance-cp-specifics.md#amendments)) + slug regex extendido `/^[a-z][a-z0-9_-]*$/` snake+kebab ([ADR-077 Amendment A2](../10-decisions/adr-077-contrato-provisioner-plugin-v2.md#amendments), fix bug pre-existente registry kebab-only) + DI registration `ProvisioningModule` + 49 tests nuevos (8 customers + 41 plugin) + cierre doctrinal completo (schema doc [`enhance-customers.md`](../30-data/enhance-customers.md) + `provisioning/contract.md` §2/§4/§6/§9 + 10 términos nuevos en [glossary](../00-foundations/glossary.md) cerrando deuda histórica PR #36). Suite **395/400 unit verde + 5 skipped** (mode='static-only' del contract test para `enhance_cp`). Smoke test browser ✅ — `@rjsf/core` renderiza el form en `/admin/settings/plugins/enhance-cp` con los 4 campos (i18n keys raw esperadas — strings en Fase G/I). |

### Fases pendientes

- ⏳ **15C.D** — Listener reconcile defensivo + setting `provisioning.default_nameservers` + propagación cluster + helper `core/provisioning/dns-authority-resolver.ts` + endpoints orquestador `GET/POST/PATCH/DELETE /api/v1/services/{id}/dns/records` (1-1.5 sesión).
- ⏳ **15C.E** — Acciones curadas (reset_password, view_disk, view_bandwidth, change_package admin, force_resync admin) + audit completo (0.5-1 sesión).
- ⏳ **15C.F** — SSO endpoints (cliente Customer Panel + admin impersonation + evento `service.admin_sso_impersonation` + listener GDPR) (0.5-1 sesión).
- ⏳ **15C.G** — DNS records management UI (7 tipos via `@rjsf/core` heredado Sprint 15A) — pieza pesada, frontend `/dashboard/services/[id]/dns` (1.5-2 sesiones).
- ⏳ **15C.H** — Cron `reconcile-enhance-services` 6h + setting threshold + evento `service.reconciled_external_change` + listener audit con flag GDPR + tests (0.5 sesión).
- ⏳ **15C.I** — E2E (mock server completo + smoke contra live) + cierre documental + retrospectiva + i18n strings (1 sesión).

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
