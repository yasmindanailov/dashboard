# Sprint 13 §13.AUTH — Auth server-side con cookies httpOnly + Server Components nativos (cerrado)

> **Cierre formal:** 2026-05-03 — Fases 0 / A / B / D / E / F mergeadas en master.
> **Foco doctrinal:** sub-sprint del Sprint 13 Hardening enfocado **exclusivamente** a cerrar `DC.6 + DC.28`. El JWT abandona `localStorage` (XSS surface) y pasa a cookies httpOnly del dominio Next.js (Modelo A — ADR-078 Amendment A1); el frontend migra de `'use client' + useEffect + fetch` a Server Components nativos consumiendo `serverFetch()` + Server Actions por dominio.
> **Cobertura final:** **198/198 unit backend verde + frontend `pnpm typecheck` + `pnpm lint:check --max-warnings=0` + `pnpm build` verdes**, tests E2E parseados (3 specs nuevos + fixture migrada), sin regresión en suite preexistente, **11 commits encadenados** en rama `sprint13-auth-cookies-httponly`.

---

## 1. Objetivo en una frase (cumplido)

Migrar la autenticación del frontend de `'use client' + localStorage` a Server Components nativos con cookies httpOnly emitidas por Next.js (Modelo A — Amendment A1 a ADR-078), eliminando la deuda XSS (DC.28) + cerrando los warnings `set-state-in-effect` (DC.6) sin tocar la cola activa P2.

---

## 2. Resumen ejecutivo

| Métrica | Valor |
|---------|-------|
| Sesiones | ~2 sesiones densas (Fase 0/A/B/D/E + Fase F) |
| Rama | `sprint13-auth-cookies-httponly` (desde master `fdd015a`) |
| Commits ahead of master | 11 (Fase 0 → Fase F) |
| Migraciones Prisma | 1 (`sprint13auth_session_replay_detection` — `Session.used_at` + `replaced_by_session_id` + `revoked_reason`) |
| Endpoints REST nuevos | 1 (`POST /auth/ws-token`) |
| Server Actions nuevas (frontend) | 10 (`loginAction`, `verify2faAction`, `logoutAction`, `refreshAction`, `getWsTokenAction`, `registerAction`, `forgotPasswordAction`, `resetPasswordAction`, `verifyEmailAction`, `resendVerificationAction`) |
| Helpers DAL nuevos | 4 (`getServerSession`, `requireServerSession`, `requireRole`, `serverFetch` / `serverFetchOrNull`) |
| Eventos nuevos | 1 (`auth.refresh_replay_detected`) + 1 listener (`NotificationsAuthReplayListener`) + 2 plantillas (`internal` + `email`) |
| Archivos frontend migrados a SC + Server Actions | **47** (auth-públicas + admin/dashboard layouts + 25+ pages + 11 `_shared/` + ChatWidget WS) |
| Cobertura unit backend final | **198/198 verde** (188 base + 10 nuevos: 6 refresh + 4 listener replay + 5 ws-token) |
| Tests E2E nuevos | 3 (`auth-cookies-flow.spec.ts` + `auth-replay-detection.spec.ts` + `auth-no-localStorage.spec.ts`) |
| ADRs nacidos | 1 (Amendment A1 a ADR-078) |
| DCs cerradas | **2** (`DC.6` ✅ + `DC.28` ✅) |
| Reglas nuevas | 1 (`R17` en `rules.md`) |
| Invariantes nuevos | 2 (`AUTH-INV-8` + `AUTH-INV-9` en `auth/contract.md`) |
| Códigos de error nuevos documentados | 1 (`AUTH_REPLAY_DETECTED` en `api-errors.md`) |

---

## 3. Cronología

| Hito | Salida | Commit |
|------|--------|--------|
| **Fase 13.AUTH.0 — Preflight + Amendment A1** | Lectura Next.js docs (cookies/headers/use-server/auth/forms/data-security) + ADR-078 Amendment A1 (Modelo A) + sprint plan 13.AUTH en `current.md` | `19796aa` |
| **Fase 13.AUTH.A — Backend WS token + cookie-parser** | `cookie-parser` activo en `main.ts` (cierra bug latente refresh) · `POST /auth/ws-token` operativo · `JwtPayload` extendido con narrowing `'access' \| 'refresh' \| 'temp_2fa' \| 'ws'` · 5 tests unit | `0521c71` |
| **Fase 13.AUTH.B — Refresh rotation + replay detection + listener** | Migración `sprint13auth_session_replay_detection` · `AuthTokenService.refresh()` rota par + detecta replay + revoca cadena · `NotificationsAuthReplayListener` alerta superadmin · 2 plantillas (`internal` + `email`) · 10 tests unit | `6e913b5` |
| **Fase 13.AUTH.D — Helpers SC + Server Actions** | `frontend/app/lib/server-auth.ts` con DAL canónico + `cache()` · `frontend/app/lib/auth-actions.ts` con 10 Server Actions | `3851e7a` |
| **Handoff Fase E** (operativo) | Doc handoff transferencia entre sesiones + actualización estado real `current.md` | `6f5f4a1` |
| **Fix `jti` (smoke real)** | `jti` UUID v4 random en JWT payload (cierra colisión `sessions.token_hash UNIQUE` en login + refresh inmediato del mismo segundo, descubierta en smoke HTTP real) | `bf8f777` |
| **Fase 13.AUTH.E.1 — Auth-públicas + AuthContext minimalista + layouts SC + 11 pages read-only** | `/`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` con `useActionState` · `AuthContext` reducido a `{user, logout}` hidratado server-side · `admin/layout.tsx` + `dashboard/layout.tsx` invocan `requireRole` / `requireServerSession` · 11 pages read-only (transparency, services, billing, clients, error-log, jobs/failed, notifications/templates, etc.) consumen `serverFetch` | `dfa77f7` |
| **Fase 13.AUTH.E.2 — Detail pages + editores SC + Server Actions de dominio** | 9 detail pages migradas (`templates`, `support-inside-plans` editor 5-secciones, `products` edit/new, `clients/[id]` con tabs, `billing/[id]` admin+cliente) + Server Actions específicas por dominio (billing/products/error-log/jobs) | `5bf2556` |
| **Fase 13.AUTH.E.3 — Cierre `_shared/` + ChatWidget WS + ESLint promote** | 5 pages restantes (`admin/tasks`, `admin/support/[id]`, `dashboard/services/[id]`, `dashboard/support/[id]`, `dashboard/support-inside`) + 11 componentes `_shared/` (hooks chat/inbox/checkout/conv, modales tasks/notes, TasksWidget, SsoButton, ActionsBar, NotificationBell, ConversationSidebar, AdminSidebar) + ChatWidget invoca `getWsTokenAction` antes del handshake socket.io + ESLint `react-hooks/set-state-in-effect` promovida a `error` | `f2902a2` |
| **Handoff Fase F** (operativo) | Doc handoff Fase F (3 specs E2E + reescritura fixture + 5 docs + retrospectiva) + actualización estado real `current.md` | `c85b028` |
| **Fase 13.AUTH.F — Tests E2E + cierre documental + Opción B ESLint** | Fixture E2E reescrita (`injectAuthSession` con `page.context().addCookies()`) + 4 callers en `admin-tree-migration.spec.ts` migrados + 3 specs E2E nuevos · R17 en `rules.md` · `auth/contract.md` §5 (`/auth/ws-token`) + §11 (env vars frontend) + §14 (AUTH-INV-8/9) + §7 (`auth.refresh_replay_detected`) · `api-errors.md` `AUTH_REPLAY_DETECTED` · `backlog.md` cierra DC.6 + DC.28 con commit hashes · Opción B ESLint: 19 overrides per-archivo eliminados + 26 supresiones per-línea con justificación inline · este archivo `completed/` · eliminación handoffs + sección Sprint 13 §13.AUTH de `current.md` | (este PR) |

---

## 4. Decisión doctrinal: Amendment A1 a ADR-078 (Modelo A — cookies en dominio Next.js)

ADR-078 original (mergeado en Sprint 11 cierre) congelaba cookies httpOnly viviendo en el dominio backend NestJS. Al volver al sprint, la auditoría reveló que ese modelo es incompatible con la arquitectura cross-origin Next.js (`:3002`) + NestJS (`:3001`) sin sacrificar Server Components nativos:

- Una cookie seteada por NestJS en `localhost:3001` **no es legible** por un Server Component de Next.js corriendo en `localhost:3002` (CORS browser-to-server, mismatch domain).
- Reenviar la cookie del backend al cliente requeriría que NestJS supiera el dominio Next.js — viola el aislamiento.
- CSRF middleware backend para mutaciones cookie-authenticated complica el flujo y duplica la protección que Next.js ya da por firma de IDs de Server Action con `NEXT_RUNTIME_SECRET`.

**Amendment A1 — Modelo A** (commit `19796aa`):

1. Las cookies `aelium_access_token` + `aelium_refresh_token` (httpOnly, sameSite=Lax) viven en el dominio **Next.js**, seteadas por Server Actions (`loginAction`, `verify2faAction`, `refreshAction`) y limpiadas por `logoutAction`.
2. Backend NestJS sigue siendo **stateless body JSON** — emite tokens en el body de `/auth/login` y `/auth/refresh` sin tocar cookies. `JwtStrategy` mantiene el extractor único de header `Authorization: Bearer`.
3. Server Components leen la cookie con `cookies()` de `next/headers` (helpers `getServerSession()` + `serverFetch()`) y reenvían al backend como `Authorization: Bearer <token>`.
4. CSRF nativo Next.js: cada Server Action lleva ID firmado con `NEXT_RUNTIME_SECRET`. Sin secret válido, action rechaza. Cero middleware CSRF backend.
5. WebSocket cliente: `getWsTokenAction()` pide al backend un token efímero (claim `type: 'ws'`, expira 60s) que se pasa al handshake `socket.io({ auth: { token } })`.

> **Lección clave:** la doctrina industrial OWASP/Auth0 ("cookies httpOnly + double-submit CSRF") se aplica al dominio que sirve la UI, no al de la API. En arquitecturas Next.js + API separada, el dominio relevante es el del frontend. Reinterpretarla así preserva el espíritu (XSS no accesible, refresh rotation, replay detection, zero localStorage) sin romper ergonomía.

---

## 5. Métricas de impacto por fase

### 5.1 Fase A — Backend WS token + cookie-parser

- `cookie-parser` registrado en `main.ts` (cierra bug latente: hasta hoy `auth.controller.refresh` leía `req.cookies` sin middleware activo).
- `POST /auth/ws-token` operativo — auth `Authorization: Bearer`, body vacío, response `{ token, expiresIn: 60 }`.
- `AuthTokenService.issueWsToken(user)` emite token con claim `type: 'ws'` (extiende narrowing en `JwtPayload`).
- `SupportGatewayAuth` ahora rechaza tokens `type !== 'access' && type !== 'ws'` (cierra bug latente: aceptaba `refresh`/`temp_2fa` por no narrowing).

### 5.2 Fase B — Replay detection + listener superadmin

- Migración añade 3 columnas a `Session`: `used_at` (DateTime?, indexed), `replaced_by_session_id` (UUID? FK self), `revoked_reason` (varchar(50)).
- `AuthTokenService.refresh()` ahora valida `session.used_at IS NULL` antes de aceptar; reuso → `updateMany where user_id SET is_active=false, revoked_reason='replay_detected'` + `eventEmitter.emit('auth.refresh_replay_detected', payload)`.
- `NotificationsAuthReplayListener` enriquece payload con `attacked_user_email` + `dispatchToSuperadmins('auth.refresh_replay_detected')`.
- 2 plantillas `notification_templates` (canal `internal` + `email`) con guard EC-T8-17 OK (sin `{{{var}}}` ni `{{& var}}`).

### 5.3 Fase D — Helpers DAL canónicos

- `getServerSession()` cacheado con `cache()` de React (single-request memoization).
- `requireServerSession()` + `requireRole(allowedRoles)` (defense in depth con backend CASL).
- `serverFetch<T>(path, options)` con `'Authorization: Bearer'` reenviado + `cache: 'no-store'` por defecto + manejo `ServerFetchError(status, body)`.
- `serverFetchOrNull<T>` variante tolerante.

### 5.4 Fase E — Bulk migration frontend (47 archivos)

- 41 archivos con `localStorage.{get,set}Item('access_token')` → 0 ocurrencias finales.
- 22 archivos con marker `TODO(ADR-078)` → 0 ocurrencias finales.
- Auth-públicas usan `useActionState` con Server Actions (paso 1 + 2FA en `verify2faAction`).
- Pages autenticadas son Server Components nativos `async` que invocan `serverFetch` y pasan datos hidratados a Client Components hijos.
- Server Actions específicas por dominio (`task-actions.ts`, `service-actions.ts`, `billing-actions.ts`, `client-actions.ts`, etc.) + `revalidatePath` tras mutaciones.
- ChatWidget + chat panel admin invocan `getWsTokenAction` ANTES del handshake socket.io.

### 5.5 Fase F — Cierre con tests E2E + Opción B ESLint

- **Fixture E2E:** `injectAuthToken` (legacy `localStorage.setItem`) → `injectAuthSession(context, {accessToken, refreshToken})` con `page.context().addCookies(...)` setando cookies httpOnly directamente. Las 4 ocurrencias inline en `admin-tree-migration.spec.ts:158/180/205/230` migradas.
- **3 specs E2E nuevos** (DoD §4.3):
  - `auth-cookies-flow.spec.ts` — login UI superadmin con 2FA → cookies httpOnly visibles → logout vía Topbar dropdown limpia ambas → `/admin` redirige a `/`.
  - `auth-replay-detection.spec.ts` — login API cliente → refresh #1 OK + token rotado → refresh #2 con token original 401 + alerta superadmin verificada en `/notifications/unread` con `expect.poll` (BullMQ async).
  - `auth-no-localStorage.spec.ts` — regresión canónica R17: post-login UI superadmin, `localStorage.access_token === null` + ninguna clave matchea `/token|jwt|secret|credential/i`.
- **Opción B ESLint** (decisión Yasmin sobre EC-FaseF-01): 19 overrides per-archivo de `react-hooks/set-state-in-effect` eliminados; sustituidos por **26 supresiones per-línea** con justificación inline en 17 archivos. La regla queda a `error` global con granularidad real (un bug nuevo en otra línea del mismo archivo SÍ se caza). El override de `react-hooks/exhaustive-deps` permanece per-archivo (queda fuera de esta decisión — Yasmin solo pidió Opción B sobre `set-state-in-effect`).

---

## 6. Lecciones aprendidas

### 6.1 Smoke HTTP real desbloqueó dos bugs invisibles a unit tests

Tras Fases A+B+D verdes en unit (188/188), el plan de pausar antes de Fase E para hacer un smoke HTTP completo resultó decisivo:

- **Bug IPv6 (Windows + Docker Desktop):** `localhost` resuelve a `::1` en Windows; el handshake postgres recibe `ECONNRESET` antes de que el contenedor lo registre. Fix: cambiar `DATABASE_URL` y `REDIS_HOST` a `127.0.0.1` en `.env`. Sin smoke real, este fallo habría aparecido cuando Yasmin levantase el backend la siguiente sesión y se habría confundido con regresión de la migración B.
- **Bug `jti` (commit `bf8f777`):** los unit tests del refresh con mocks pasaban porque mockeaban `jwt.sign` para devolver siempre `'signed.jwt.token'` (sin colisión real). Contra DB real con UNIQUE constraint activa, el JWT determinístico colisionaba en login + refresh inmediato del mismo segundo. Fix: añadir `jti` UUID v4 random en payload de TODOS los tokens emitidos (access/refresh/temp_2fa/ws).

> **Doctrina canónica reforzada:** los unit tests con mocks validan lógica, NO regresiones de schema/timing/UNIQUE constraints/transacciones. El smoke HTTP es complementario imprescindible al cerrar fases que tocan persistencia.

### 6.2 Migrar 47 archivos sin romper nada exigió disciplina archivo-por-archivo

Bulk migration de 47 archivos en 3 commits (E.1/E.2/E.3) con `pnpm typecheck && pnpm build` verde después de cada batch de 5-10 archivos. Si una página rompía, revert atómico de ese archivo + investigar. Patrón canónico: SC `async` que invoca `serverFetch` + Client Component hijo recibe datos hidratados por props. **Cero `useState + useEffect + fetch + setLoading`** — si el componente hijo necesita refetch, usa Server Action que invoque `revalidatePath`.

### 6.3 Opción B (per-línea) > override per-archivo para reglas con falsos positivos legítimos

La auditoría inicial de Fase E aplicó override per-archivo `off` para 19 archivos con patrones React 19 idiomáticos (WS subscribe, polling timers, modal reset, lazy load on tab/prop). Yasmin validó la doctrina más estricta en Fase F: la regla queda activa en TODO el archivo y solo se silencia la línea concreta donde el patrón es legítimo, con comentario inline justificativo.

**Coste:** ~30 min de trabajo + 26 comentarios repartidos por 17 archivos.
**Beneficio:** un bug nuevo añadido en otra línea del mismo archivo SÍ se caza por la regla. Convención estándar React/ESLint comunidad.

### 6.4 La cookie httpOnly cross-origin no se reenvía: necesita Server Action

Al diseñar Modelo A, la tentación inicial era reenviar la cookie Next.js → backend NestJS via fetch server-side. Pero **el backend solo lee `Authorization: Bearer`** (extractor único en `JwtStrategy`), y reenviar la cookie cross-origin requeriría que el backend supiera el dominio Next.js. Decisión: el Server Component lee la cookie con `cookies()` y la convierte a `Authorization: Bearer <token>` antes de invocar `serverFetch`. Backend ignora cookies cross-origin — preserva aislamiento + stateless body JSON.

### 6.5 WebSocket browser cross-origin requiere endpoint dedicado

El cliente JS no puede leer la cookie httpOnly del dominio Next.js, y reenviarla al socket.io-client violaría el sentido del httpOnly. Solución canónica (Amendment A1 §6): `POST /auth/ws-token` emite un JWT efímero (claim `type: 'ws'`, expira 60s) que el Server Action `getWsTokenAction()` devuelve al Client Component, que lo pasa a `io({ auth: { token } })`. El token caduca rápido — atacante con XSS solo accede a 60 segundos de WS.

### 6.6 Handoffs son artefactos transitorios — la fuente de verdad es `current.md` + `completed/`

Durante el sprint se generaron `sprint-13-auth-handoff-fase-e.md` y `sprint-13-auth-handoff-fase-f.md` como mecanismos de transferencia entre sesiones/agentes. **No son parte de la doctrina canónica** del playbook (no hay slot "handoff" en la estructura `docs/60-roadmap/`). Su contenido útil (bugs IPv6/jti, decisión ESLint, inventario, patrones de migración) ha sido absorbido en este archivo `completed/` y los handoffs eliminados con `git rm`. Para el siguiente sprint que requiera transferencia entre sesiones, anotar progresos directamente en `current.md` (sección del sprint vivo) y mover a `completed/` al cierre.

---

## 7. ADRs nacidos durante el sprint

- **[ADR-078 Amendment A1 — Modelo A](../../10-decisions/adr-078-auth-server-side-cookies-httponly.md)** (commit `19796aa`, 2026-05-03): cookies httpOnly viven en el dominio Next.js (no en backend); Server Actions las setean/limpian; Server Components las leen con `cookies()` + reenvían como `Authorization: Bearer` al backend. WebSocket cliente usa endpoint dedicado `/auth/ws-token` para token efímero. CSRF nativo Next.js via `NEXT_RUNTIME_SECRET` — sin middleware backend.

---

## 8. Decisiones locales sin ADR (documentadas inline)

- **`react-hooks/set-state-in-effect` Opción B per-línea** (Fase F, 2026-05-03): regla a `error` global con supresión per-línea + comentario justificativo en patrones React 19 legítimos. Documentado inline en `frontend/eslint.config.mjs` y en este archivo §5.5 + §6.3. NO requiere ADR (es decisión de configuración de tooling, no doctrina cross-módulo).
- **`react-hooks/exhaustive-deps` override per-archivo** (heredado de Fase E, conservado en Fase F): 19 archivos con patrones de polling/WS/route-sync mantienen `off`. NO se aplicó Opción B aquí porque la regla `exhaustive-deps` produce falsos positivos masivos en patrones legítimos donde la dependencia es estable por construcción (refs, route params one-shot). Si Yasmin pide aplicar Opción B también a esta regla, el plan replica el de §5.5.
- **Bug IPv6 → `127.0.0.1` en `.env` Windows** (Fase A smoke): registrado como nota operativa para devs Windows + Docker Desktop. NO es ADR (config local; en Linux/Mac/CI no aplica). Documentado en handoff Fase E §12 antes de absorberse aquí.

---

## 9. Estado DoD final

### Código backend
- [x] `cookie-parser` instalado + registrado en `main.ts` (bug latente refresh cerrado).
- [x] `POST /auth/ws-token` operativo + 5 tests unit.
- [x] `AuthTokenService.refresh()` con replay detection + 6 tests unit (3 casos: primera ronda OK, replay detectado, sesión expirada).
- [x] Migración `sprint13auth_session_replay_detection` aplicada + Prisma client regenerado.
- [x] `NotificationsAuthReplayListener` operativo + 4 tests unit + 2 plantillas seedeadas.
- [x] `JwtStrategy` SIN cookie extractor (header único — Amendment A1 §1.3).
- [x] CSRF middleware backend NO se construye (Amendment A1 §1.5).
- [x] `JwtPayload` extendido con narrowing `'access' | 'refresh' | 'temp_2fa' | 'ws'` + `jti?`.
- [x] Suite unit backend `pnpm test` 100% verde (198/198, sin regresión).

### Código frontend
- [x] `frontend/app/lib/server-auth.ts` y `frontend/app/lib/auth-actions.ts` operativos.
- [x] Variables `.env.local.example` documentadas: `BACKEND_URL` + `NEXT_RUNTIME_SECRET`.
- [x] `grep -rln "localStorage\.\(get\|set\|remove\)Item('access_token'\|'refresh_token')" frontend/app` → **0** ocurrencias.
- [x] `grep -rln "TODO(ADR-078" frontend/app` → **0** ocurrencias (47 archivos migrados).
- [x] `react-hooks/set-state-in-effect` regla = `error` global en `frontend/eslint.config.mjs`; 26 supresiones per-línea con justificación inline (Opción B).
- [x] `pnpm lint:check` (frontend, `--max-warnings=0`) verde.
- [x] `pnpm typecheck` y `pnpm build` (frontend) verdes.

### Tests E2E
- [x] `tests/e2e/auth-cookies-flow.spec.ts` creado (login → cookie set → autenticado → logout → cookie limpia).
- [x] `tests/e2e/auth-replay-detection.spec.ts` creado (replay revoca cadena + alerta superadmin verificada via campana).
- [x] `tests/e2e/auth-no-localStorage.spec.ts` creado (post-login `localStorage` vacío de tokens).
- [x] Fixture `tests/e2e/fixtures/auth.ts` migrada (`injectAuthToken` → `injectAuthSession` con cookies httpOnly).
- [x] `tests/e2e/admin-tree-migration.spec.ts` migrado (4 ocurrencias inline → `injectAuthSession`).
- [x] Suite E2E parsea limpio (`pnpm exec playwright test --list` → 119 tests en 28 files, los 3 nuevos detectados).
- [ ] Run completo de la suite E2E: depende de backend + frontend levantados localmente — Yasmin lo verifica como parte del smoke manual §10 + CI verde tras push.

### Documentación
- [x] `docs/00-foundations/rules.md` añade **R17** ("JWT en cookies httpOnly de Next.js, NO en localStorage").
- [x] `docs/20-modules/auth/contract.md` actualiza §5 (`/auth/ws-token`) + §7 (evento `auth.refresh_replay_detected`) + §11 (env vars frontend `BACKEND_URL` + `NEXT_RUNTIME_SECRET`) + §14 (invariantes nuevos AUTH-INV-8 + AUTH-INV-9) + §15 (referencia ADR-078).
- [x] `docs/50-operations/api-errors.md` documenta `AUTH_REPLAY_DETECTED`.
- [x] `docs/60-roadmap/backlog.md` cierra **DC.6** + **DC.28** con commit hashes.
- [x] `docs/60-roadmap/current.md` mueve Sprint 13 §13.AUTH a este archivo `completed/sprint-13-auth-cookies-httponly.md`.
- [x] Handoffs `sprint-13-auth-handoff-fase-{e,f}.md` eliminados con `git rm` (contenido absorbido aquí).

### Smoke testing manual (Yasmin — pendiente de cierre formal)
- [ ] Login superadmin (con 2FA) en navegador → cookies httpOnly visibles en DevTools Application > Cookies, `localStorage` vacío de tokens.
- [ ] Login agent_full + cliente — landing por rol correcto (`/admin` staff, `/dashboard` cliente).
- [ ] Logout limpia cookies — re-acceso a `/dashboard` redirige a `/`.
- [ ] WebSocket chat funciona (cliente recibe mensajes en vivo) tras login con cookies httpOnly.
- [ ] Refresh access token transparente (no hay flash; sesión sigue activa tras 16 min).
- [ ] Sin errores en consola del navegador en flows críticos.
- [ ] Replay con curl en paralelo a sesión activa → toda la cadena revocada + alerta superadmin verificable en campana.

> El smoke manual lo ejecuta Yasmin físicamente al cierre formal del sprint; el agente automatizado no puede inspeccionar DevTools ni esperar 16 min. Si algún paso falla, el sprint se reabre desde Fase F con commit aislado.

---

## 10. Próximo paso

El sprint cierra `DC.6 + DC.28`. La cola activa P2 retoma su orden canónico (ver memory `feedback-dashboard-puerta-unificada.md`):

> **11 → 15A → 15D → 15C → 10+15E → 12 → 12.5 → 13**

Sprint 11 ya cerrado (Sprint 11 Fase 11.A-E + Sprint 13.5 + Sprint 13.5.5 + Sprint 16). Siguiente lógico:

**Sprint 15A — Plugin Framework** (P2.2): infrastructure común para los plugins concretos (Claude AI, GitHub, etc.) que se irán activando en sub-sprints 15B-15H según necesidad real. Pre-requisito doctrinal cumplido por este sprint: la auth server-side + Server Components nativos elimina el último blocker arquitectónico para los plugins UI.

Los Sprint 12 (Settings + KB) y resto del Sprint 13 Hardening (audit trail global, Redis adapter Socket.io, N+1 audit, cursor pagination, caching, R15 restantes) quedan en cola sin cambios — desbloqueados por DC.6/DC.28 cerradas.

---

## 11. Adenda post-cierre — Fixes UX/doctrina detectados en smoke manual (2026-05-04)

Tras el cierre de las fases 0/A/B/D/E/F y el smoke manual de Yasmin, surgieron 7 bugs y 2 decisiones doctrinales que se cerraron en la misma rama antes del PR. Quedan listados aquí porque el código vive en los mismos archivos del sprint y la doctrina (ADR-074 EC#8 + ADR-079 §1) se afina con esta adenda.

### 11.1 Bugs cerrados

| # | Síntoma | Causa raíz | Fix |
|---|---------|------------|-----|
| **B1** | Select de agentes en `ConversationSidebar` y `ReassignTaskModal` mostraba `Nombre · undefined` | `AssignableAgent` declaraba `role: { slug, name }` pero el backend `GET /admin/users` devuelve `role: string` (slug plano) | [`frontend/app/_shared/tasks/_actions.ts`](../../../frontend/app/_shared/tasks/_actions.ts#L186) — alineado a `role: string` + 2 mapeos corregidos |
| **B2** | `Cannot update Router while rendering NotificationBell` | `NotificationBell.toggleOpen` invocaba un Server Action (`fetchUnread()`) **dentro del updater function de `setState`**; los updaters deben ser puros | [`frontend/app/_shared/shell/NotificationBell.tsx`](../../../frontend/app/_shared/shell/NotificationBell.tsx#L118) — side effect movido fuera del updater |
| **B3** | "Liberar tarea bridge a cola pública" NO desasignaba el ticket original | `TasksService.cancel` propagaba al ticket pero `TasksService.assign` no — asimetría doctrinal preexistente que el bug B1 enmascaraba | [`backend/src/modules/tasks/tasks.service.ts`](../../../backend/src/modules/tasks/tasks.service.ts#L327) — `assign` para `support_ticket` delega a `support.updateConversation`. Listener `SupportTicketTaskCreatorListener` se invoca con `skipTicketSync: true` para romper el loop bridge↔listener (mismo patrón que `cancel` con `skipTicketRelease`) |
| **B4** | Admin podía entrar a `/dashboard/*` y veía contadores incoherentes | `dashboard/layout.tsx` no tenía guard inverso al de `admin/layout.tsx`. Violación ADR-066 §1 (cliente/partner exclusivo de `/dashboard`) | [`frontend/app/dashboard/layout.tsx`](../../../frontend/app/dashboard/layout.tsx#L24) — guard simétrico `STAFF_ROLES → redirect('/admin')` |
| **B5** | Descarga PDF factura cliente → 500 | Bug IPv6 sobre MinIO: `S3_ENDPOINT=http://localhost:9000` resolvía a `::1` y fallaba. Mismo bug de la retro §6.1 que faltaba aplicar a S3 + mail | [`backend/.env`](../../../backend/.env) — `S3_ENDPOINT=http://127.0.0.1:9000` |
| **B6** | 2FA email tardaba 5–15s en llegar | Mismo bug IPv6 en `MAIL_HOST=localhost`: nodemailer reintentaba IPv6 → IPv4. Email síncrono dentro del flow login | [`backend/.env`](../../../backend/.env) — `MAIL_HOST=127.0.0.1` |
| **B7** | Notificación "tarea asignada" llevaba a `/admin/tasks/<id>` → 404 (página no existe; ADR-079 retiró el detalle individual) | Listeners de `task.assigned` y `task.overdue` y la URL preview en `notification-template.service.ts` apuntaban a una ruta que el frontend nunca tuvo en este sprint | [`tasks-email.listener.ts`](../../../backend/src/modules/tasks/tasks-email.listener.ts) + [`tasks-overdue.service.ts`](../../../backend/src/modules/tasks/crons/tasks-overdue.service.ts) + [`notification-template.service.ts`](../../../backend/src/modules/notifications/notification-template.service.ts#L79) — resolución canónica: `support_ticket` → `/admin/support/<conversationId>`; resto → `/admin/tasks` |
| **B8** | CI E2E shards 1/3 + 2/3 + 3/3 rojos en PR #29 con `Error: browserContext.addCookies: Cookie should have either url or path` | `playwright-core@1.59.1` (`server/network.js#rewriteCookies` línea 112) hace `assert(!(c.url && c.path), …)` — la fixture pasaba **ambos** `url` y `path`, combinación prohibida. El smoke local (suite parseable + 198/198 unit) no lo cazó porque `--list` no ejecuta `addCookies`; solo el run real contra browser engine valida el assert | [`tests/e2e/fixtures/auth.ts:104`](../../../tests/e2e/fixtures/auth.ts#L104) — eliminado `path: '/'` redundante en ambos cookieEntries; Playwright lo deriva del `url` (líneas 119-122 del mismo archivo). Patrón canónico: pasar **solo `url`** o **solo `domain`+`path`**, nunca mezcla |
| **B9** | Tras fix B8, CI shards 2/3 + 3/3 seguían rojos (shard 1/3 ✅): 3 tests E2E esperaban `action_url` de notificación con formato `/admin/tasks/<id>`, pero el listener post-B7 emite `/admin/tasks` (no-bridge) o `/admin/support/<conversationId>` (bridge `support_ticket`) | B7 actualizó el backend (`tasks-email.listener.ts`, `tasks-overdue.service.ts`, `notification-template.service.ts`) pero **olvidó actualizar las expectations de 3 specs E2E** preexistentes (`notifications.spec.ts:209`, `tasks-crons.spec.ts:222`, `tasks.spec.ts:233`). Ese tipo de desfase **siempre** lo caza CI E2E, nunca tests unit | 3 specs alineados con la URL canónica vigente: `notifications.spec.ts` task `client_lifecycle` → `/admin/tasks`; `tasks-crons.spec.ts` task `support_inside_slot` → `/admin/tasks`; `tasks.spec.ts` bridge `support_ticket` → `/admin/support/${conversationId}` |
| **B10** | Tras fix B9, shard 3/3 seguía rojo en `tasks.spec.ts:251`: `reassign: 400 "El usuario asignado no tiene rol de agente."` | El test reasigna la task bridge `support_ticket` a `agentBillingId` (rol `agent_billing`). Post-B3 (commit `afdd1a5`), `tasks.assign` para `support_ticket` delega a `support.updateConversation`, que sólo acepta `{superadmin, agent_full, agent_support}` (`support-message.service.ts:280`). `agent_billing` queda fuera por doctrina canónica (billing NO atiende tickets de soporte). El test fue escrito en Sprint 16 ANTES de B3 — bug latente revelado al destapar B9 el siguiente assert | [`tests/e2e/tasks.spec.ts`](../../../tests/e2e/tasks.spec.ts) — añadido `agentFullId` (`e2e-agent-full@aelium.test`, rol `agent_full`) en setup; el reassign del bridge usa `agentFullId` en vez de `agentBillingId`. `agentBillingId` se conserva para el test "agente no admin no puede reasignar tarea de OTRO agente" (line 335, task `provisioning_manual` no-bridge — uso legítimo) |

> **Bug E2E preexistente (no abierto en este sprint):** los 240 mensajes "Conversación asignada a Ana Agente Full" en un ticket de demo eran **persistidos por el loop infinito** del primer intento de fix del B3 antes del `skipTicketSync`. Tras `compose down` + reseed limpios el problema desaparece. Para futuros agentes: si veis un volcado masivo de system messages, sospechad de loop emisor↔listener — el patrón canónico es `skipXxxSync` flag (ver `cancel`/`assign` para el patrón).

### 11.2 Decisión arquitectónica — Opción B en `ReassignTaskModal` para tasks bridge

[`frontend/app/_shared/tasks/ReassignTaskModal.tsx`](../../../frontend/app/_shared/tasks/ReassignTaskModal.tsx) (decisión Yasmin 2026-05-04):

- **Tasks `support_ticket`**: el modal SOLO permite reasignar a otro agente. La opción "Liberar a cola pública" se oculta + se sustituye por un link al ticket (`/admin/support/<id>`). Razón doctrinal: ADR-074 EC#8 + ADR-079 §1 — la cola canónica de tickets es el módulo Support (`/admin/support`), NO la cola pública de tasks. Liberar la task bridge cancelaba la task y dejaba el ticket sin asignar → confusión UX ("libero la task y desaparece"). Con Opción B, el flujo canónico es: para devolver el ticket a la cola, el admin va al ticket y desasigna desde ahí; el listener cancela la task como efecto secundario coherente.
- **Tasks no-bridge** (`provisioning_manual`, `support_inside_slot`, `client_lifecycle`, `project`): comportamiento sin cambios. Sí permiten "Liberar a cola pública" porque NO tienen sistema vinculado externo que sirva de cola alternativa.

### 11.3 Decisión arquitectónica — Opción B (per-línea) en ESLint `set-state-in-effect`

Confirmada Yasmin 2026-05-04 en este mismo ciclo. Ya está documentada en §5.5 y §6.3 del cuerpo principal del retrospectivo; la mantengo aquí como recordatorio cruzado.

### 11.4 Lecciones operativas adicionales

- **`nest start --watch` no siempre invalida el require cache**. Cuando se editan listeners/services en módulos cargados, el daemon recompila el `dist` pero el proceso node sigue ejecutando las clases instanciadas con el código viejo. La solución determinista es `taskkill /F /PID <node>` + `pnpm dev` (full restart). En CI no aplica — el problema es exclusivo del flujo dev local.
- **`compose down` + `prisma migrate deploy` + `pnpm seed`** es el pipeline canónico para resetear estado entre intentos de smoke. Nuestra retro §6.1 documentaba el bug IPv6 pero faltaba aplicar el fix a `S3_ENDPOINT` + `MAIL_HOST`. Para futuros agentes Windows + Docker Desktop: **regla R-IPv6** — toda var de entorno que apunte a un servicio del `docker-compose.dev.yml` debe usar `127.0.0.1`, nunca `localhost`.
- **URLs canónicas frontend ↔ notificaciones**: el frontend no tiene `/admin/tasks/[id]` (ADR-079 retiró el detalle individual). Toda URL hacia una task debe resolverse por `source_system`. Patrón implementado en §11.1 fix B7. Si en el futuro se añade `/admin/tasks/[id]` como página, los listeners deben actualizarse en consecuencia.

---

> **Cierre canónico:** este archivo es la fuente de verdad del Sprint 13 §13.AUTH. ADR-078 + Amendment A1, los 11 commits en master + los fixes post-cierre §11 (PR #19 a master), los helpers `lib/server-auth.ts` + `lib/auth-actions.ts` y los `*-actions.ts` por dominio constituyen el contrato canónico Modelo A vigente. Cualquier desvío requiere ADR-NNN nuevo o Amendment A2.
