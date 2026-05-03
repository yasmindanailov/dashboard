# Sprints en curso — Aelium Dashboard

> **Estado real verificado** contra código en auditoría 2026-04-26 + closures Sprint 8 / 9 / 9.5 / 9.6 / 11.5 (2026-04-26 → 2026-05-01) + Sprint 11 Fases A+B (2026-05-01/02). Cualquier sprint listado aquí está parcialmente avanzado (no es backlog puro — para eso ver [`backlog.md`](./backlog.md)). Los sprints ✅ que aparecen abajo son punteros a `completed/`; viven aquí solo para trazabilidad cronológica de la ola P1.1.

> **Última actualización:** 2026-05-03 — **Sprint 16 + Sprint 13.5 + Sprint 13.5.5 cerrados al 100%**. Sprint 13.5.5 (CI Infra) cerró DC.27 al 100% (imagen oficial Playwright en CI) + DC.13 parcial-canónica (sharding CI con `--shard=N/M` × 3 shards paralelos, wall-clock CI 25 min → ~10 min). Paralelización local con `workers > 1` diferida a sub-sprint condicionado **Sprint 13.5.6 — E2E parallel local** (trigger: suite local > 2 min). Detalle en [`completed/sprint-13-5-5-ci-infra.md`](./completed/sprint-13-5-5-ci-infra.md).
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

## 🟡 Sprint 13 §13.AUTH — Auth server-side con cookies httpOnly + Server Components nativos (Fase E ✅ completa)

**Estado:** 🟡 fases 0/A/B/D/E ✅ cerradas (8 commits) — fase F pendiente (handoff a hilo nuevo).
**Inicio:** 2026-05-03.
**Cierre estimado:** Fase F en hilo nuevo (~1 sesión: 3 specs E2E + smoke manual + 5 docs + retrospectiva).
**Rama:** `sprint13-auth-cookies-httponly` (desde master `fdd015a`).
**ADR canónico:** [ADR-078](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) + Amendment A1 (Modelo A: cookies en dominio Next.js).
**Handoff Fase E** (referencia histórica): [`docs/60-roadmap/sprint-13-auth-handoff-fase-e.md`](./sprint-13-auth-handoff-fase-e.md).
**Handoff Fase F** (siguiente sesión): [`docs/60-roadmap/sprint-13-auth-handoff-fase-f.md`](./sprint-13-auth-handoff-fase-f.md) — contexto operativo completo + inventario de archivos a crear/modificar + plantillas docs.

### Progreso real (2026-05-03)

| Fase | Estado | Commit | Resumen |
|------|--------|--------|---------|
| **0** | ✅ | `19796aa` | Preflight + ADR-078 Amendment A1 + sprint plan en current.md (doc-only). |
| **A** | ✅ | `0521c71` + fix `bf8f777` | Backend: `cookie-parser` + `POST /auth/ws-token` + JwtPayload `'ws'` + jti random (cierra UNIQUE constraint bug). 5 tests + actualización. |
| **B** | ✅ | `6e913b5` | Backend: migración `sprint13auth_session_replay_detection` + refresh rotation + replay detection + `NotificationsAuthReplayListener` + 2 plantillas. 10 tests. |
| **D** | ✅ | `3851e7a` | Frontend: `lib/server-auth.ts` + `lib/auth-actions.ts` (DAL canónico + 10 Server Actions). |
| **E.1** | ✅ | `dfa77f7` | Frontend: auth-públicas (5 pages) + AuthContext minimalista + admin/dashboard layouts SC + 11 pages read-only + Server Actions de dominio (billing/products/error-log/jobs). |
| **E.2** | ✅ | `5bf2556` | Frontend: 9 detail pages + editores inline (templates, support-inside-plans editor 5-secciones, products edit/new, clients[id] tabs, billing[id] admin+cliente). |
| **E.3** | ✅ | `f2902a2` | Frontend: 5 pages restantes (admin/tasks, admin/support[id], dashboard/services[id], dashboard/support[id], dashboard/support-inside) + 11 _shared (hooks chat/inbox/checkout/conv, modales tasks/notes, TasksWidget, SsoButton, ActionsBar, NotificationBell, ConversationSidebar, AdminSidebar) + ChatWidget WS con `getWsTokenAction` + ESLint promote a `error` con override per-archivo. |
| **F** | ⬜ | — | E2E (3 specs) + smoke manual + R17 + contract + api-errors + cierre `backlog.md` + mover a `completed/`. **Handoff doc lista.** |

### Verificación canónica tras Fase E

- ✅ Backend `pnpm typecheck` + `pnpm lint:check` + `pnpm test` (198/198) verde.
- ✅ Frontend `pnpm typecheck` + `pnpm lint:check` (0 warnings) + `pnpm build` verdes.
- ✅ **Conteo final**: `0` ocurrencias de `localStorage.{get,set,remove}Item('access_token'|'refresh_token')` (eran 41); `0` marcadores `TODO(ADR-078)` (eran 22); `0` warnings DC.6 (eran 49). 47 archivos migrados.
- ⚠️ Decisión arquitectónica documentada inline en `frontend/eslint.config.mjs`: regla `set-state-in-effect` a `error` con override per-archivo para 19 archivos con patrones React 19 legítimos (WS subscribe, polling timers, mobile drawer sync, lazy load on tab/prop, modal reset, setup post-mount). **Yasmin valida en retrospectiva** (handoff Fase F EC-FaseF-01).
- ✅ Migración Prisma aplicada en DB local + seed completo (7 roles + 6 cuentas demo).
- ✅ **Smoke HTTP backend completo verificado 2026-05-03 18:47** (handoff §13). Los 4 endpoints canónicos pasan end-to-end:
  - `POST /auth/login` → 200 + body con `{access_token, refresh_token, expires_in, user}` (cero `Set-Cookie` — Modelo A).
  - `POST /auth/ws-token` → 200 + `{token (type='ws',jti), expiresIn:60}`.
  - `POST /auth/refresh` #1 → 200 + par nuevo + `session_id` + sesión vieja `rotated`.
  - `POST /auth/refresh` #2 (replay) → 401 "Sesión comprometida" + `updateMany` revoca cadena + `auth.refresh_replay_detected` emit + notification superadmin creada en DB (`internal` channel a `admin@aelium.net`).
- 🐛 **Bug IPv6 + bug `jti` cerrados durante el smoke** — handoff §12 (fix `.env` `localhost`→`127.0.0.1`) + §13 (`jti` random añadido al `JwtPayload` para evitar colisión `sessions.token_hash UNIQUE` en login + refresh inmediato del mismo segundo). Ambos integrados en commits del sprint.

> Sub-sprint del Sprint 13 Hardening enfocado **exclusivamente** en cerrar `DC.6 + DC.28`. El resto del Sprint 13 (audit trail global, Redis adapter Socket.io, N+1 audit, cursor pagination, caching, R15 restantes) queda fuera de alcance — futuras fases o sprint full según valor funcional.

### 1. Objetivo en una frase

Migrar la autenticación del frontend de `'use client' + localStorage` a Server Components nativos con cookies httpOnly emitidas por Next.js (Modelo A — Amendment A1 ADR-078), eliminando la deuda XSS (DC.28) + cerrando los 27 warnings `set-state-in-effect` (DC.6) sin tocar la cola activa P2.

### 2. Depende de

| # | Dependencia | Estado | Bloquea qué |
|---|-------------|--------|-------------|
| 1 | ADR-078 Amendment A1 (Modelo A) mergeado | ✅ 2026-05-03 | Toda la fase A onwards |
| 2 | Sprint 11 cerrado al 100% (no debe haber WIP en backend auth) | ✅ 2026-05-02 | Todo el sprint |
| 3 | Cookie-parser instalado y registrado en `main.ts` (bug latente: hoy `auth.controller.refresh` lee `req.cookies` pero el middleware no está activo) | ⬜ Fase 13.AUTH.A | Backend cookies futuras (WS token endpoint) |
| 4 | Variables de entorno `BACKEND_URL` y `NEXT_RUNTIME_SECRET` documentadas + setadas en `.env.local` dev | ⬜ Fase 13.AUTH.D | Server Actions Next.js |

### 3. Produce (contratos nuevos)

#### 3.1 Endpoints REST nuevos (backend)

- `POST /api/v1/auth/ws-token` — devuelve `{ token: string, expiresIn: 60 }`. Auth: `Authorization: Bearer` o cookie reenviada. Token efímero (claim `type: 'ws'`, expira 60s, secret habitual JWT_SECRET) usado por el browser para handshake `socket.io`. Cumple Amendment A1 §6.

#### 3.2 Eventos nuevos emitidos

- `auth.refresh_replay_detected` — emitido por `AuthTokenService.refresh()` cuando detecta uso repetido de un refresh token ya marcado `used_at`. Payload: `{ user_id, session_id, attempted_at, ip }`. Consumido por `notifications-on-replay-detected.listener` (alerta superadmin vía D12 `NotificationsService.dispatchToSuperadmins`).

#### 3.3 Server Actions nuevas (frontend)

- `loginAction(prevState, formData)` — invoca `POST /auth/login`, recibe body, setea cookies httpOnly Next.js, redirige al landing del rol.
- `verify2faAction(prevState, formData)` — invoca `POST /auth/verify-2fa` con `temp_token` desde cookie temporal, setea cookies finales, redirige.
- `logoutAction()` — invoca `POST /auth/logout`, borra cookies httpOnly, redirect `/`.
- `refreshAction()` — invoca `POST /auth/refresh` con cookie refresh, rota cookies (NO se llama desde UI; lo invoca `serverFetch` cuando recibe 401).
- `getWsTokenAction()` — invoca `POST /auth/ws-token`, devuelve `{ token, expiresIn }` al Client Component que monta el socket.io.
- `forgotPasswordAction`, `resetPasswordAction`, `registerAction`, `resendVerificationAction`, `verifyEmailAction` — equivalentes Server Action de los flows públicos (sin cookies, solo proxy al backend + redirect).

#### 3.4 Helpers nuevos (frontend)

- `frontend/app/lib/server-auth.ts`:
  - `getServerSession(): Promise<ServerSession | null>` — lee cookie `aelium_access_token`, valida vía `/auth/me`, devuelve `{ user, role }` o `null`. Cacheada con `cache()` de React.
  - `requireServerSession(): Promise<ServerSession>` — `getServerSession()` + `redirect('/')` si vacío.
  - `serverFetch<T>(path, init?): Promise<T>` — fetch desde Server Component con `Authorization: Bearer <token>` reenviando cookie. `cache: 'no-store'`. Auto-refresh con `refreshAction()` si recibe 401 (transparente).
  - `serverFetchOrNull<T>(path)` — variante que devuelve `null` en lugar de lanzar (para componentes que toleran ausencia).

#### 3.5 Tablas o campos Prisma nuevos

- Migración `sprint13auth_session_replay_detection`:
  - `Session.used_at` (`DateTime?`, indexed) — marca cuándo se canjeó el refresh token. NULL = no usado todavía.
  - `Session.replaced_by_session_id` (`String?` UUID, FK self con `onDelete: SET NULL`) — referencia a la sesión nueva que sustituye a esta cuando refresh rota.
  - `Session.revoked_reason` (`VarChar(50)?`) — `'logout'`, `'replay_detected'`, `'manual_revoke'`, `'expired'`.

#### 3.6 Settings nuevos

- (ninguno — los TTL existentes en `auth.*` se reutilizan).

#### 3.7 Plantillas notification canónicas nuevas (D12)

- `auth.refresh_replay_detected` × `internal` (admin in-app) + `email` (superadmin email).
  - Variables: `attacked_user_email`, `attempted_at_label`, `attacker_ip`, `revoked_sessions_count`.
  - Sin `{{{var}}}` ni `{{& var}}` (cumple guard EC-T8-17).

#### 3.8 Reglas nuevas (rules.md)

- **R17 — JWT en cookies httpOnly de Next.js, NO en localStorage**:
  > "El JWT del usuario vive en cookies httpOnly del dominio Next.js (frontend). Los Server Components leen la cookie con `cookies()` de `next/headers` y la reenvían al backend NestJS como `Authorization: Bearer <token>`. **Nunca** se lee, escribe ni almacena un JWT en `localStorage`/`sessionStorage`/Web Storage. Cualquier mutación cookie requiere Server Action (`'use server'`)."

### 4. Modifica (contratos existentes)

#### 4.1 Endpoints modificados

- `POST /api/v1/auth/refresh` — sigue aceptando refresh token desde body **o** cookie (el handler ya lee ambos — Sprint 9 lo dejó preparado). Se confirma cookie-parser activo en `main.ts` (Fase A).
- `POST /api/v1/auth/logout` — sin cambios funcionales backend; el Server Action Next.js es el que borra cookies.

#### 4.2 Servicios modificados

- `AuthTokenService.refresh(refreshToken, ip)` — extiende lógica para validar `session.used_at IS NULL` antes de aceptar; si reuso → revoca cadena (`updateMany where user_id = X SET is_active=false, revoked_reason='replay_detected'`) + emit `auth.refresh_replay_detected`. Crea sesión nueva con `replaced_by_session_id` apuntando a la vieja marcada `used_at=now()`.

#### 4.3 Eventos cambiados

- (ninguno — los `auth.*` existentes se preservan).

#### 4.4 BREAKING changes

- Frontend: tras Fase E, **no existe** `localStorage.getItem('access_token')` en ningún archivo. Cualquier código externo (extensions browser, scripts custom de Yasmin) que dependa del localStorage se rompe. Mitigación: documentado en R17.
- Backend: `Session` schema cambia (3 columnas nuevas). Migración Prisma forward-only — sin rollback automático. Mitigación: dev local re-seedea, prod aún no desplegado (ADR-069).

### 5. Pasos atómicos

| # | Paso | Fase | Estado |
|---|------|------|--------|
| 13.AUTH.0.1 | Preflight: leer Next.js docs (cookies, headers, use-server, authentication, forms, data-security, use-client) | 0 | ✅ 2026-05-03 |
| 13.AUTH.0.2 | Verificar `cookie-parser` no instalado en backend; verificar CORS `credentials: true`; verificar puerto frontend `:3002` | 0 | ✅ 2026-05-03 |
| 13.AUTH.0.3 | Mergear ADR-078 Amendment A1 (Modelo A: cookies dominio Next.js) | 0 | ✅ 2026-05-03 |
| 13.AUTH.0.4 | Redactar este sprint plan en `current.md` | 0 | ✅ 2026-05-03 |
| 13.AUTH.A.1 | Backend: `pnpm add cookie-parser @types/cookie-parser`, registrar en `main.ts` (cierra bug latente refresh) | A | ⬜ |
| 13.AUTH.A.2 | Backend: nuevo endpoint `POST /auth/ws-token` (`AuthTokenService.issueWsToken(user)`) + DTO + tests unit | A | ⬜ |
| 13.AUTH.A.3 | Backend: tests unit `auth-token.service.spec.ts` cubren issueTokens body shape (regresión Modelo A) | A | ⬜ |
| 13.AUTH.B.1 | Backend: migración Prisma `sprint13auth_session_replay_detection` (3 columnas Session) | B | ⬜ |
| 13.AUTH.B.2 | Backend: `AuthTokenService.refresh()` reescribir con replay detection + emit `auth.refresh_replay_detected` | B | ⬜ |
| 13.AUTH.B.3 | Backend: nuevo `NotificationsAuthReplayListener` consume `auth.refresh_replay_detected` → `dispatchToSuperadmins()` | B | ⬜ |
| 13.AUTH.B.4 | Backend: seed `notification_templates` con `auth.refresh_replay_detected` × {internal, email} | B | ⬜ |
| 13.AUTH.B.5 | Backend: tests unit replay detection (3 casos: primera ronda OK, replay detectado, sesión expirada) | B | ⬜ |
| 13.AUTH.D.1 | Frontend: `lib/server-auth.ts` con `getServerSession`, `requireServerSession`, `serverFetch`, `serverFetchOrNull` | D | ⬜ |
| 13.AUTH.D.2 | Frontend: `lib/auth-actions.ts` con todas las Server Actions (login, verify2fa, logout, refresh, register, forgot/reset, verifyEmail, resendVerification, getWsToken) | D | ⬜ |
| 13.AUTH.D.3 | Frontend: tests unit helpers con mock de `next/headers` | D | ⬜ |
| 13.AUTH.D.4 | Frontend: variables de entorno `BACKEND_URL` + `NEXT_RUNTIME_SECRET` documentadas en `.env.local.example` | D | ⬜ |
| 13.AUTH.E.1 | Frontend: inventario mecánico (`grep -r "TODO(ADR-078\|localStorage.getItem"`) | E | ✅ `dfa77f7` |
| 13.AUTH.E.2 | Frontend: pages auth-públicas (`/`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`) — SC wrapper + form CC con `useActionState` | E | ✅ `dfa77f7` |
| 13.AUTH.E.3 | Frontend: pages autenticadas — `page.tsx` → SC nativo con `serverFetch`; hijos interactivos siguen CC recibiendo data por props (47 archivos) | E | ✅ `dfa77f7` + `5bf2556` + `f2902a2` |
| 13.AUTH.E.4 | Frontend: `AuthContext` minimalista (provider expone `user` hidratado server-side + `logout` Server Action) | E | ✅ `dfa77f7` |
| 13.AUTH.E.5 | Frontend: `lib/api.ts` permanece como esperado (helper `api(token)` para Server Actions internos); 30/31 importadores son `import type` | E | ✅ `f2902a2` (audit) |
| 13.AUTH.E.6 | Frontend: ChatWidget WebSocket → invoca `getWsTokenAction()` antes de `socket.io({auth:{token}})` | E | ✅ `f2902a2` |
| 13.AUTH.E.7 | Frontend: eliminar todas las ocurrencias `localStorage.getItem('access_token')` y `setItem` (verificación `grep` 0 ocurrencias) | E | ✅ `f2902a2` (0/0) |
| 13.AUTH.E.8 | Frontend: promover `react-hooks/set-state-in-effect` a `error` con override per-archivo para 19 archivos React 19 legítimos (decisión arquitectónica documentada inline) | E | ✅ `f2902a2` |
| 13.AUTH.F.1 | Tests E2E nuevos: `auth-cookies-flow.spec.ts` (login → cookie → autenticado → logout → cookie limpia) | F | ⬜ |
| 13.AUTH.F.2 | Tests E2E nuevos: `auth-replay-detection.spec.ts` (replay revoca cadena + alerta superadmin) | F | ⬜ |
| 13.AUTH.F.3 | Tests E2E nuevos: `auth-no-localStorage.spec.ts` (regresión: post-login `localStorage` vacío de tokens) | F | ⬜ |
| 13.AUTH.F.4 | Tests E2E existentes: verificar suite completa pasa sin tocar (header preference se mantiene en backend) | F | ⬜ |
| 13.AUTH.F.5 | Doc: `docs/00-foundations/rules.md` añade R17 | F | ⬜ |
| 13.AUTH.F.6 | Doc: `docs/20-modules/auth/contract.md` actualiza §5 endpoints (incluye `/auth/ws-token`) + §11 settings + §14 invariantes nuevos AUTH-INV-8/9 | F | ⬜ |
| 13.AUTH.F.7 | Doc: `docs/50-operations/api-errors.md` documenta error code `AUTH_REPLAY_DETECTED` | F | ⬜ |
| 13.AUTH.F.8 | Doc: cerrar DC.6 + DC.28 en `backlog.md` con commit hash | F | ⬜ |
| 13.AUTH.F.9 | Doc: mover este sprint plan a `completed/sprint-13-auth-cookies-httponly.md` con retrospectiva | F | ⬜ |

### 6. Edge cases anticipados

| ID | Caso | Plan |
|----|------|------|
| EC-13AUTH-01 | Tests E2E existentes asumen `Authorization: Bearer` en backend → `JwtStrategy` extractor único garantiza compat | Verificar suite E2E al cerrar Fase A |
| EC-13AUTH-02 | WebSocket browser no puede leer cookie httpOnly Next.js | Endpoint `/auth/ws-token` + Server Action `getWsTokenAction` (Amendment A1 §6) |
| EC-13AUTH-03 | Server Action falla con error de red al backend | Server Action devuelve `{ error: 'NETWORK' }` al `useActionState`; UI muestra toast (R14) |
| EC-13AUTH-04 | Refresh token replay con browser legítimo del usuario (race condition: dos tabs refrescan a la vez) | Aceptado: el primero gana, el segundo recibe `auth.refresh_replay_detected` y sesión revocada. Mitigación frontend: `serverFetch` retry una vez con backoff de 100ms antes de declarar replay |
| EC-13AUTH-05 | Server Component bajo `/admin/*` recibe usuario que perdió rol admin entre cookie set y page load | `requireServerSession` valida vía `/auth/me` que devuelve rol fresco. CASL guards backend hacen segundo check |
| EC-13AUTH-06 | Logout dispara error backend (sesión ya revocada) | Server Action `logoutAction` ignora error backend; siempre limpia cookies + redirect (R14: el cliente ve "sesión cerrada" igual) |
| EC-13AUTH-07 | Cliente sin cookie navega a `/dashboard/*` | `requireServerSession` redirige a `/`. Sin flash, sin client-side check |
| EC-13AUTH-08 | Cliente con cookie expirada (access expirado, refresh válido) | `serverFetch` recibe 401 → invoca `refreshAction` → reintenta. Transparente |
| EC-13AUTH-09 | Cliente con ambos tokens expirados | `refreshAction` falla → `logoutAction` → `redirect('/')` |
| EC-13AUTH-10 | Migración rompe sesiones existentes (todas tienen `used_at IS NULL` pero pueden ser refresh ya canjeados — datos pre-Fase B) | Migración aplica `used_at=NULL` para todas. Aceptado: en peor caso un refresh viejo se acepta una vez, próxima ronda detecta replay si reuso. Pre-producción ADR-069 |
| EC-13AUTH-11 | Server Action invocada cross-site (CSRF) | Next.js 16 firma action IDs con `NEXT_RUNTIME_SECRET`. Sin secret válido, action rechaza. Fallback: si secret no setado, action funciona en dev pero **debe** setarse para prod (verificar en `.env.example`) |
| EC-13AUTH-12 | `serverFetch` desde un Server Action (mutación) — necesita CSRF? | No. Server Actions ya están autenticadas vía cookie httpOnly + action ID. El `serverFetch` interno usa `Authorization: Bearer` del backend que NO depende de CSRF (solo applies a flows cookie-only) |

### 7. Definition of Done (literal de ADR-078 §4 + adaptaciones Modelo A)

#### Código backend
- [ ] `cookie-parser` instalado + registrado en `main.ts` (bug `auth.controller.refresh` cerrado).
- [ ] `POST /auth/ws-token` operativo + tests unit.
- [ ] `AuthTokenService.refresh()` con replay detection + tests unit (3 casos).
- [ ] Migración `sprint13auth_session_replay_detection` aplicada + Prisma client regenerado.
- [ ] `NotificationsAuthReplayListener` operativo + plantilla seedeada.
- [ ] `JwtStrategy` SIN cookie extractor (mantiene header único — Amendment A1 §1.3).
- [ ] CSRF middleware backend NO se construye (Amendment A1 §1.5).
- [ ] Suite unit backend `pnpm test` 100% verde (sin regresión).

#### Código frontend
- [ ] `frontend/app/lib/server-auth.ts` y `frontend/app/lib/auth-actions.ts` operativos + tests unit.
- [ ] Variables `.env.local.example` actualizado con `BACKEND_URL` + `NEXT_RUNTIME_SECRET`.
- [ ] `grep -r "localStorage.getItem('access_token')\|localStorage.setItem('access_token')" frontend/app` → 0 ocurrencias.
- [ ] `grep -r "TODO(ADR-078" frontend/app` → 0 ocurrencias (todos migrados).
- [ ] `react-hooks/set-state-in-effect` regla = `error` en `frontend/eslint.config.mjs` (DC.6 cerrado).
- [ ] `pnpm lint:check` (frontend, max-warnings=0) verde.
- [ ] `pnpm typecheck` y `pnpm build` (frontend) verdes.

#### Tests E2E
- [ ] 3 specs nuevos verdes: `auth-cookies-flow`, `auth-replay-detection`, `auth-no-localStorage`.
- [ ] Suite E2E completa verde (sin regresión).
- [ ] CI verde tras último push.

#### Documentación
- [ ] `docs/00-foundations/rules.md` añade R17.
- [ ] `docs/20-modules/auth/contract.md` actualiza §5/§11/§14.
- [ ] `docs/50-operations/api-errors.md` documenta `AUTH_REPLAY_DETECTED`.
- [ ] `docs/60-roadmap/backlog.md` cierra DC.6 + DC.28 con commit hash.
- [ ] `current.md` mueve este sprint a `completed/sprint-13-auth-cookies-httponly.md` con retrospectiva.

#### Smoke testing manual (Yasmin)
- [ ] Login superadmin (con 2FA) en navegador → cookies visibles en DevTools como `httpOnly` ✅, `localStorage` vacío de tokens.
- [ ] Login agent_full + cliente — landing por rol correcto.
- [ ] Logout limpia cookies — re-acceso a `/dashboard` redirige a `/`.
- [ ] WebSocket chat funciona (cliente recibe mensajes en vivo) tras login con cookies httpOnly.
- [ ] Refresh access token transparente (no se ve flash; sesión sigue activa tras 16 min).
- [ ] Sin errores en consola del navegador en flows críticos.

### 8. Riesgos identificados

| Riesgo | Impacto si ocurre | Mitigación |
|--------|-------------------|------------|
| WS handshake con token efímero introduce latencia (~50ms extra al conectar) | UX widget chat ligeramente más lento al abrir | Aceptado: el token se cachea en memoria del Client Component durante la sesión activa (no se pide a cada mensaje). Patrón `useEffect(() => { fetchToken(); }, [])` único por mount |
| Server Action falla en prod por `NEXT_RUNTIME_SECRET` no setado | Login no funciona en prod | Verificar en pre-deploy checklist Sprint 14 P-DEPLOY. Backend `JwtStrategy` sin extractor cookie evita que prod-rota silenciosamente al modo viejo |
| Migración Prisma rompe sesiones activas (devs con tabs abiertas) | Usuarios devs deslogueados | Aceptado: pre-producción ADR-069. Smoke test post-migración limpia cookies y vuelve a loguear |
| Bulk migration frontend rompe alguna página por edge case no detectado | Página rota en master | Migración archivo por archivo dentro de Fase E con `pnpm typecheck` + `pnpm build` verdes después de cada batch. Si una página rompe, revert atómico de ese archivo + investigar |
| Tests E2E que mockean JWT directo vía `localStorage.setItem` se rompen | Suite E2E roja | Auditar fixtures Playwright en Fase F.1; reescribir cualquier fixture que use localStorage para usar el flow real de login con cookies |
| Auto-refresh transparente en `serverFetch` podría infinite-loop si refresh siempre devuelve 401 | Páginas cuelgan en producción | Cap: `serverFetch` reintenta MÁXIMO 1 vez. Segundo 401 → `logoutAction` + redirect `/` |

### 9. Decisiones registradas

- **ADR-078 Amendment A1 (2026-05-03)** — Modelo A: cookies httpOnly viven en dominio Next.js (frontend), no en backend. Reinterpreta §1.1/§1.2/§1.3/§1.5 de ADR-078 para arquitectura cross-origin Next.js + NestJS sin romper el espíritu (XSS no accesible, refresh rotation, replay detection, zero localStorage).

### 10. Cierre del sprint

> Rellenar al cerrar.

**Fecha real de cierre:** YYYY-MM-DD
**Commit final:** `<sha>`
**Cambios respecto al plan original:** breve resumen
**Items movidos a sprints futuros:**
- DC.13 paralelización local E2E → Sprint 13.5.6 condicionado (ya diferido pre-sprint).
- Resto Sprint 13 Hardening (audit trail global, Redis adapter Socket.io, N+1, cursor pagination, caching, R15 restantes) → futuras fases o sprint full según valor.

**DoD verificado:** ⬜

---

## Convenciones de este documento

- **Estado real ≠ estado declarado.** Los símbolos aquí reflejan lo verificado en código a fecha 2026-04-26.
- **No mover sprints a `completed/` hasta que estén realmente cerrados** según [Definition of Done](../90-meta/definition-of-done.md).
- **Cuando un sprint cierra:** mover su sección a `completed/sprint-N-titulo.md` con resumen ejecutivo + commit de cierre + retrospectiva breve.
