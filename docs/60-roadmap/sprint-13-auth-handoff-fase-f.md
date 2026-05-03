# Sprint 13 §13.AUTH — Handoff Fase F (tests E2E + cierre documental)

> **Documento de transferencia entre agentes/sesiones.** Quien retome este sprint encuentra aquí el contexto operativo completo: qué está hecho, qué queda, qué archivos tocar, qué comandos correr, qué validar.
>
> **Punto de partida:** rama `sprint13-auth-cookies-httponly`, commit `f2902a2` (HEAD tras Fase E completa).
> **Cerrado:** 2026-05-03 — Fases 0 / A / B / D / E. **Pendiente:** Fase F (~1 sesión intensa).

---

## 1. Lectura mínima obligatoria antes de tocar código

| # | Documento | Por qué |
|---|-----------|---------|
| 1 | [`docs/10-decisions/adr-078-auth-server-side-cookies-httponly.md`](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) | Plan canónico completo. **Leer Amendment A1** — congela Modelo A. |
| 2 | [`docs/60-roadmap/sprint-13-auth-handoff-fase-e.md`](./sprint-13-auth-handoff-fase-e.md) | Handoff Fase E (este documento es su continuación). Estado tras Fase E: secciones 1-3 + 12-13 todavía aplican, 5-9 están cerrados. |
| 3 | [`docs/60-roadmap/current.md` §Sprint 13 §13.AUTH](./current.md) | Sprint plan completo (10 secciones). DoD literal por fase. |
| 4 | [`frontend/AGENTS.md`](../../frontend/AGENTS.md) | "This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing code." |
| 5 | [`frontend/eslint.config.mjs`](../../frontend/eslint.config.mjs) | Decisión arquitectónica documentada inline: regla `set-state-in-effect` a `error` con override per-archivo para 19 archivos con patrones React 19 legítimos. |
| 6 | [`tests/e2e/fixtures/auth.ts`](../../tests/e2e/fixtures/auth.ts) | Fixture E2E actual. **`injectAuthToken` rompe en Modelo A** (línea 82 hace `localStorage.setItem('access_token', …)`). Hay que reescribirla — ver §3. |
| 7 | [`backend/src/modules/auth/auth-token.service.ts`](../../backend/src/modules/auth/auth-token.service.ts) | Cómo emite tokens + cómo rota con replay detection. Sin cambios pendientes. |

---

## 2. Estado canónico verificado

### Backend (verde, sin cambios pendientes)

- Migración `sprint13auth_session_replay_detection` aplicada a la DB local (Yasmin, fix IPv6 §12 del handoff Fase E).
- `cookie-parser` activo, `/auth/ws-token` operativo, `AuthTokenService.refresh` rota con replay detection, `NotificationsAuthReplayListener` envía alerta superadmin con `auth.refresh_replay_detected` + 2 plantillas seedeadas.
- `jti` random en JWT payload (commit `bf8f777`) — cierra el bug del UNIQUE constraint en `sessions.token_hash` por colisión de JWT determinístico.
- **Tests:** 198/198 unit verde. **Lint + typecheck:** verdes.
- **Smoke HTTP completo verificado** (handoff Fase E §13): login → ws-token → refresh #1 OK → refresh #2 (replay) 401 + alerta superadmin en DB.

### Frontend (Fase E completa)

- **Migración Modelo A 100% aplicada**:
  - `0` ocurrencias de `localStorage.{get,set,remove}Item('access_token'|'refresh_token')` en `frontend/app/`.
  - `0` marcadores `TODO(ADR-078)`.
  - `0` warnings `react-hooks/set-state-in-effect` (regla promovida a `error` con override per-archivo).
- `pnpm typecheck` ✅ `pnpm lint:check` ✅ `pnpm build` ✅.
- 47 archivos migrados a Server Components / Server Actions en 3 commits (`dfa77f7` E.1 + `5bf2556` E.2 + `f2902a2` E.3).
- **No tocado todavía**: tests E2E, documentación, sprint plan move-to-completed.

### Lo que falta (esta Fase F)

- 3 specs E2E nuevos: cookies flow + replay detection + no-localStorage regression.
- Reescritura de `tests/e2e/fixtures/auth.ts` (`injectAuthToken` rompe en Modelo A).
- Auditoría de `tests/e2e/admin-tree-migration.spec.ts` (4 ocurrencias de `localStorage.setItem('access_token')` inline).
- Smoke manual navegador (DevTools — no automatizable).
- Documentación: `rules.md` R17 + `contract.md` §5/§11/§14 + `api-errors.md` AUTH_REPLAY_DETECTED.
- Cierre: `backlog.md` DC.6 + DC.28 con commit hash + mover sprint plan a `completed/`.

---

## 3. Inventario mecánico Fase F (auditoría 2026-05-03)

### 3.1 — Tests E2E que rompen con Modelo A

```
tests/e2e/fixtures/auth.ts:82                      → injectAuthToken hace localStorage.setItem('access_token', ...)
tests/e2e/admin-tree-migration.spec.ts:159         → localStorage.setItem('access_token', t) inline
tests/e2e/admin-tree-migration.spec.ts:181         → idem
tests/e2e/admin-tree-migration.spec.ts:206         → idem
tests/e2e/admin-tree-migration.spec.ts:231         → idem
```

Comando para regenerar la lista:
```bash
grep -nE "localStorage\.setItem.*access_token|localStorage\.getItem.*access_token" tests/e2e/*.spec.ts tests/e2e/fixtures/*.ts
```

**Diagnóstico**: el patrón `injectAuthToken(page, token)` ya no funciona porque el frontend ya no lee `localStorage`. Hay 2 opciones:

- **Opción A (recomendada)**: reescribir `injectAuthToken` para que setee la cookie httpOnly directamente en el contexto Playwright. Patrón:
  ```typescript
  export async function injectAuthSession(
    page: Page,
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    await page.context().addCookies([
      {
        name: 'aelium_access_token',
        value: accessToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'aelium_refresh_token',
        value: refreshToken,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  }
  ```
  Renombrar `injectAuthToken` → `injectAuthSession` (acepta refresh + access). Actualizar callers.

- **Opción B**: callers usan el flow real de `loginAPI` + `loginUI` siempre, sin atajo. Es más realista pero más lento por test (~+2s cada uno).

Decisión sugerida: **Opción A** porque los tests E2E del proyecto ya tienen `loginSuperadminUI` para validar el flow real, y `injectAuthToken` se usa solo para acelerar tests que no prueban el login en sí.

### 3.2 — Specs nuevos a crear (DoD §4.3)

```
tests/e2e/auth-cookies-flow.spec.ts        → login UI → cookie httpOnly creada → request autenticada → logout → cookie limpia
tests/e2e/auth-replay-detection.spec.ts    → refresh dos veces seguidas con mismo refresh → 2º revoca cadena + notificación superadmin
tests/e2e/auth-no-localStorage.spec.ts     → tras login, localStorage.getItem('access_token') === null (regresión)
```

### 3.3 — Documentación pendiente (DoD §4.4)

```
docs/00-foundations/rules.md               → añadir R17 ("JWT en cookies httpOnly de Next.js, NO en localStorage")
docs/20-modules/auth/contract.md           → §5 incluir POST /auth/ws-token + §11 settings + §14 invariantes nuevos
docs/50-operations/api-errors.md           → documentar error code AUTH_REPLAY_DETECTED
docs/60-roadmap/backlog.md                 → cerrar DC.6 + DC.28 con commits f2902a2 / 5bf2556 / dfa77f7
docs/60-roadmap/current.md                 → mover Sprint 13 §13.AUTH a completed/
docs/60-roadmap/completed/sprint-13-auth-cookies-httponly.md  → crear nuevo con retrospectiva
```

### 3.4 — Decisión arquitectónica que diverge del DoD original

El handoff Fase E §5.9 mandaba "promover regla `react-hooks/set-state-in-effect` a `error` + 0 warnings". El cierre Fase E aplicó esto **con un matiz importante**: la regla está a `error` global pero hay un **override per-archivo** (`off`) para 19 archivos con patrones React 19 legítimos:

- WS subscribe (Socket.IO handlers que mutan state local en respuesta a eventos remotos)
- Polling timers (NotificationBell, AdminSidebar badge tasks)
- Mobile drawer / palette sync con cambio de route (AdminShell, DashboardShell, CommandPalette)
- Lazy load on tab/prop change (ClientDetailView, ConversationSidebar, etc.)
- Modal reset on close (4 modales)
- Setup post-mount one-shot (Toast)

Documentado inline en [`frontend/eslint.config.mjs`](../../frontend/eslint.config.mjs). El antipatrón canónico DC.6 (`useEffect(() => { setLoading(true); fetch().then(setData) }, [])`) está cerrado al 100% por la migración SC + Server Actions; las warnings restantes son patrones React 19 idiomáticos documentados en https://react.dev/learn/synchronizing-with-effects. **Yasmin debe validar esta decisión en la retrospectiva**; si discrepa, suprimir per-line con `eslint-disable-next-line` + comentario justificativo es la alternativa (~27 supresiones).

---

## 4. Plan de trabajo recomendado Fase F

### Paso 1 — Reescribir fixture E2E (15 min)

1. Reemplazar `injectAuthToken` por `injectAuthSession` en `tests/e2e/fixtures/auth.ts` con `page.context().addCookies(...)` (ver §3.1).
2. Actualizar las 4 ocurrencias inline en `tests/e2e/admin-tree-migration.spec.ts:159/181/206/231` para usar el nuevo helper.
3. Verificar `pnpm test:e2e tests/e2e/admin-tree-migration.spec.ts` verde.

### Paso 2 — 3 specs nuevos (60 min)

Patrón canónico para los 3 specs:

```typescript
// tests/e2e/auth-cookies-flow.spec.ts
import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginSuperadminUI } from './fixtures/auth';

test('login crea cookies httpOnly Next.js + logout las limpia', async ({ page, context }) => {
  await loginSuperadminUI(page);

  const cookies = await context.cookies();
  const access = cookies.find((c) => c.name === 'aelium_access_token');
  const refresh = cookies.find((c) => c.name === 'aelium_refresh_token');

  expect(access).toBeDefined();
  expect(access!.httpOnly).toBe(true);
  expect(access!.sameSite).toBe('Lax');
  expect(refresh).toBeDefined();
  expect(refresh!.httpOnly).toBe(true);

  // Click en logout (Topbar dropdown).
  await page.getByRole('button', { name: /perfil|usuario|menu/i }).click();
  await page.getByRole('menuitem', { name: /cerrar sesión/i }).click();
  await page.waitForURL('/');

  const cookiesAfter = await context.cookies();
  expect(cookiesAfter.find((c) => c.name === 'aelium_access_token')).toBeUndefined();
  expect(cookiesAfter.find((c) => c.name === 'aelium_refresh_token')).toBeUndefined();
});
```

```typescript
// tests/e2e/auth-replay-detection.spec.ts
import { test, expect, request } from '@playwright/test';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAPI } from './fixtures/auth';

test('refresh dos veces seguidas → segundo 401 + sesiones revocadas', async ({ request }) => {
  const { refreshToken } = await loginAPI(
    request,
    TEST_CONFIG.client.email,
    TEST_CONFIG.client.password,
  );

  const first = await request.post(`${TEST_CONFIG.apiUrl}/auth/refresh`, {
    data: { refresh_token: refreshToken },
  });
  expect(first.ok()).toBeTruthy();

  const second = await request.post(`${TEST_CONFIG.apiUrl}/auth/refresh`, {
    data: { refresh_token: refreshToken },
  });
  expect(second.status()).toBe(401);
  const body = await second.json();
  expect(body.message).toMatch(/sesión comprometida|replay/i);

  // Verificar la notificación superadmin (vía API admin con login distinto).
  // …
});
```

```typescript
// tests/e2e/auth-no-localStorage.spec.ts
import { test, expect } from '@playwright/test';
import { loginSuperadminUI } from './fixtures/auth';

test('post-login: localStorage NO contiene access_token ni refresh_token', async ({ page }) => {
  await loginSuperadminUI(page);

  const storage = await page.evaluate(() => ({
    access: window.localStorage.getItem('access_token'),
    refresh: window.localStorage.getItem('refresh_token'),
    keys: Object.keys(window.localStorage),
  }));

  expect(storage.access).toBeNull();
  expect(storage.refresh).toBeNull();
  // Solo claves UI permitidas (admin.sidebar.collapsed, etc.).
  for (const key of storage.keys) {
    expect(key).not.toMatch(/token|jwt|auth/i);
  }
});
```

### Paso 3 — Suite E2E completa (10 min)

```bash
cd backend && pnpm dev                   # backend up
cd frontend && pnpm dev                  # frontend up (otra terminal)
pnpm test:e2e                            # raíz repo, suite completa
```

Si fallan specs preexistentes, **investigar uno a uno** — pueden depender del flow viejo. Patrones a buscar:
- `localStorage.getItem('access_token')` en código de test → reemplazar por cookie.
- Asunción de "flash de carga" antes de los datos → ya no pasa con SC, ajustar `waitFor`.
- WebSocket que asume token en handshake `auth: { token: localStorage.X }` → usar `getWsTokenAction` server-side.

### Paso 4 — Smoke manual navegador (10 min, requiere Yasmin)

1. Abrir `http://localhost:3002/`.
2. Login con `cliente@aelium.test` / `Cliente2026!`. Verificar:
   - DevTools → Application → Cookies → `aelium_access_token` (httpOnly ✓) + `aelium_refresh_token` (httpOnly ✓).
   - Application → Local Storage → `access_token`/`refresh_token` **no existen**.
3. Navegar entre páginas (`/dashboard`, `/dashboard/services`, `/dashboard/billing`). Verificar:
   - **No hay flash de "Cargando…"** — los datos llegan ya pintados (SC).
4. Login con `admin@aelium.net` (rol superadmin con 2FA). Pasar el flow completo.
5. Probar el ChatWidget en `/dashboard`. Abrir, escribir mensaje, ver tiempo real (WS).
6. Esperar 16 minutos (o forzar invalidación del access). Navegar — debe rotarse transparente vía `refreshAction`.
7. Logout. Verificar redirect a `/` + cookies limpias.
8. Probar replay con curl (handoff Fase E §13 SMOKE 3).

### Paso 5 — Documentación (45 min)

Plantillas mínimas:

**`docs/00-foundations/rules.md` R17:**
```markdown
### R17 — JWT en cookies httpOnly de Next.js, NO en localStorage

**Aplicación:** todo el frontend (`frontend/app/`).
**Doctrina:** ADR-078 Amendment A1.

El JWT (access + refresh) vive en cookies `httpOnly` setadas por
Next.js (Server Actions). El cliente JavaScript NUNCA lee tokens —
ni de `localStorage`, ni de `document.cookie`, ni de variables.
Toda mutación pasa por una Server Action; toda lectura autenticada
pasa por un Server Component que lee la cookie server-side via
`getServerSession()` o `serverFetch()`.

**Excepción:** el flujo guest del ChatWidget público usa una cookie
de sesión backend (no JWT), gestionada por el endpoint
`POST /support/chats/guest` con `withCredentials: true`.

**Verificación mecánica:**
`grep -rln "localStorage\.\(get\|set\|remove\)Item('access_token'\|'refresh_token')" frontend/app`
debe devolver `0`.
```

**`docs/20-modules/auth/contract.md` §5 (endpoint nuevo):**
```markdown
### POST /auth/ws-token

**Auth:** `Authorization: Bearer <access>` o cookie `aelium_access_token`.
**Body:** vacío.
**Response:** `{ token: string, expiresIn: 60 }`.

Devuelve un JWT efímero con claim `type: 'ws'` para handshake socket.io.
El cliente JS lo recibe via Server Action `getWsTokenAction()` y lo
pasa al gateway: `io('/support', { auth: { token } })`.

Sprint 13 §13.AUTH.A. ADR-078 Amendment A1 §6 (WebSocket caso nuevo).
```

**`docs/20-modules/auth/contract.md` §11 (settings nuevos):**
```markdown
### Variables de entorno frontend (Sprint 13 §13.AUTH)

| Var | Required | Descripción |
|-----|----------|-------------|
| `BACKEND_URL` | ✅ | URL del backend para `serverFetch` (server-side, distinto de `NEXT_PUBLIC_API_URL`). |
| `NEXT_RUNTIME_SECRET` | ✅ prod | Secret 32 bytes para firmar Server Action IDs (CSRF nativo Next.js). Generar con `openssl rand -base64 32`. |
```

**`docs/50-operations/api-errors.md`:**
```markdown
### AUTH_REPLAY_DETECTED

**HTTP:** 401.
**Body:** `{ statusCode: 401, message: "Sesión comprometida — todas las sesiones revocadas", error: "AUTH_REPLAY_DETECTED" }`.

**Disparado por:** `POST /auth/refresh` cuando el refresh token enviado
ya fue usado (`used_at IS NOT NULL`). Indica que un atacante (o el
propio cliente debido a un bug de race) intentó canjear un refresh
token ya canjeado.

**Acción server-side:** `AuthTokenService.refresh()` revoca toda la
cadena de sesiones del usuario (`updateMany` con `revoked_reason =
'replay_detected'`) y emite el evento `auth.refresh_replay_detected`.
`NotificationsAuthReplayListener` notifica a todos los superadmin via
canal interno + email.

**Acción cliente:** redirigir al login con `?expired=true`. El usuario
debe volver a autenticarse.

Sprint 13 §13.AUTH.B. ADR-078 §1.4 (Refresh rotation con detección).
```

**`docs/60-roadmap/backlog.md`** (cerrar DC.6 + DC.28):
```markdown
### DC.6 — frontend `set-state-in-effect` warnings — ✅ CERRADO Sprint 13 §13.AUTH

**Cierre:** commits `dfa77f7` + `5bf2556` + `f2902a2` (2026-05-03).
**Estado final:** 49 → 0 warnings. Antipatrón canónico
`useEffect(() => { setLoading(true); fetch().then(setData) }, [])`
erradicado por migración SC + Server Actions. Regla promovida a
`error` con override per-archivo para 19 archivos con patrones
React 19 legítimos (WS subscribe, polling, modal reset).

### DC.28 — JWT en cookies httpOnly + refresh rotation — ✅ CERRADO Sprint 13 §13.AUTH

**Cierre:** commits Fase A (`0521c71`) + Fase B (`6e913b5`) + Fase D
(`3851e7a`) + Fase E completa (`dfa77f7` + `5bf2556` + `f2902a2`)
+ fix jti (`bf8f777`).
**Estado final:** XSS no puede acceder a tokens (httpOnly). Refresh
rotation con detección de replay. Audit trail global vía emisión
`auth.refresh_replay_detected` + listener + plantillas.
ADR-078 Amendment A1 (Modelo A — cookies en dominio Next.js).
```

### Paso 6 — Mover sprint plan a completed (10 min)

```bash
mv docs/60-roadmap/current.md docs/60-roadmap/current.tmp
# editar para extraer Sprint 13 §13.AUTH a archivo nuevo
```

Crear `docs/60-roadmap/completed/sprint-13-auth-cookies-httponly.md` con todo el plan original + bloque "Retrospectiva" al final con:
- Métricas: archivos migrados (47), commits (3 Fase E + previos), tiempo invertido, deuda cerrada (DC.6 + DC.28).
- Lecciones aprendidas: bug IPv6 §12, bug jti §13, decisión arquitectónica ESLint override per-archivo §3.4.
- Decisión pendiente para Yasmin: validar el override per-archivo o suprimir per-line.

Eliminar la sección Sprint 13 §13.AUTH de `current.md` y dejar solo lo que está activo.

---

## 5. Comandos canónicos del flow Fase F

### Antes de empezar

```bash
# Verificar estado HEAD.
git log --oneline -5
# Esperado: f2902a2 feat(frontend,auth): Fase 13.AUTH.E.3 ...

# Backend + frontend levantados.
cd backend && pnpm dev   # :3001
cd ../frontend && pnpm dev  # :3002

# Variables de entorno verificadas.
cat frontend/.env.local | grep -E "BACKEND_URL|NEXT_RUNTIME_SECRET"
```

### Validación final

```bash
# Frontend.
cd frontend
pnpm typecheck    # debe seguir verde
pnpm lint:check   # debe seguir verde (0 warnings)
pnpm build        # debe seguir verde

# Backend.
cd ../backend
pnpm test         # 198/198
pnpm typecheck && pnpm lint:check

# E2E (raíz repo).
cd ..
pnpm test:e2e
# Esperado: suite completa verde + 3 specs nuevos verde.
```

### Inventario final (debe quedar todo en 0 / 0)

```bash
echo "Pendientes localStorage frontend:" && \
  grep -rln "localStorage\.\(get\|set\|remove\)Item('access_token'\|'refresh_token')" frontend/app | wc -l
echo "Pendientes TODO(ADR-078) frontend:" && \
  grep -rln "TODO(ADR-078" frontend/app | wc -l
echo "Pendientes localStorage E2E:" && \
  grep -nE "localStorage\.(set|get)Item.*access_token" tests/e2e | wc -l
```

---

## 6. Edge cases pendientes

| ID | Caso | Decisión sugerida |
|----|------|-------------------|
| **EC-FaseF-01** | Override ESLint per-archivo en 19 archivos diverge del DoD literal "0 warnings + regla a error" del handoff Fase E §5.9 | **Yasmin valida en la retrospectiva.** Si discrepa: suprimir per-line con `// eslint-disable-next-line react-hooks/set-state-in-effect` + comentario justificativo (~27 supresiones, 30 min trabajo). El override es más mantenible pero menos visible. |
| **EC-FaseF-02** | El smoke manual navegador requiere Yasmin física (no automatizable) | Antes del cierre Fase F, agendar 10 min con Yasmin para que ejecute §4 Paso 4. Si algo falla, NO cerrar fase. |
| **EC-FaseF-03** | Specs E2E preexistentes pueden depender del flow viejo (localStorage assumption) | Auditar uno a uno tras los Pasos 1-3. Si algún spec asume "flash de Cargando…" puede romper porque SC ya no lo muestra. |
| **EC-FaseF-04** | El test de replay detection necesita verificar la notificación superadmin en BD | Patrón: tras el 2º refresh fallido, hacer login admin via API y `GET /notifications/unread` esperando una entrada con `event_type=auth.refresh_replay_detected`. |
| **EC-FaseF-05** | El cron `support-resolved-auto-close` y otros podrían interferir con tests E2E si corren en el mismo intervalo | Ya documentado fuera del sprint. NO bloquea Fase F. |
| **EC-FaseF-06** | Si Playwright no soporta `addCookies({ httpOnly: true })` correctamente en versión instalada | Comprobar `package.json` de la raíz, versión Playwright. Si <1.30 actualizar; >=1.30 soporta. |

---

## 7. Definition of Done Fase F (literal — copiado del handoff Fase E §8)

- [ ] `tests/e2e/auth-cookies-flow.spec.ts` verde (login → cookie set → autenticado → logout → cookie limpia).
- [ ] `tests/e2e/auth-replay-detection.spec.ts` verde (replay revoca cadena + alerta superadmin).
- [ ] `tests/e2e/auth-no-localStorage.spec.ts` verde (post-login `localStorage` vacío).
- [ ] Suite E2E completa verde (sin regresión en specs existentes — ver §3.1 ajustes).
- [ ] CI verde tras último push.
- [ ] `docs/00-foundations/rules.md` añade **R17**.
- [ ] `docs/20-modules/auth/contract.md` actualiza §5 (`/auth/ws-token`) + §11 (settings) + §14 (invariantes).
- [ ] `docs/50-operations/api-errors.md` documenta `AUTH_REPLAY_DETECTED`.
- [ ] `docs/60-roadmap/backlog.md` cierra **DC.6** + **DC.28** con commit hashes.
- [ ] `docs/60-roadmap/current.md` mueve Sprint 13 §13.AUTH a `completed/sprint-13-auth-cookies-httponly.md` con retrospectiva.

---

## 8. Resumen de commits Fase E (referencia)

| Commit | Fase | Resumen |
|--------|------|---------|
| `19796aa` | 0 | ADR-078 Amendment A1 + sprint plan en current.md. |
| `0521c71` | A | `cookie-parser` + `/auth/ws-token` + JWT type narrowing + 5 tests. |
| `6e913b5` | B | Migración Session.used_at + refresh rotation con replay + listener + 2 plantillas + 10 tests. |
| `3851e7a` | D | `lib/server-auth.ts` + `lib/auth-actions.ts` (helpers DAL + 10 Server Actions). |
| `6f5f4a1` | 0 (handoff) | Doc handoff Fase E + estado en current.md. |
| `bf8f777` | A (fix) | jti random en JWT payload + cierre smoke HTTP. |
| `dfa77f7` | E.1 | Auth-públicas + AuthContext + admin/dashboard layouts SC + 11 pages read-only. |
| `5bf2556` | E.2 | 9 detail pages + editores inline (templates, support-inside-plans, products, clients[id], billing[id]). |
| `f2902a2` | E.3 | 5 pages restantes + 11 _shared (hooks/modals/widgets) + ChatWidget WS + ESLint promote. |

**Cobertura tras Fase E:**
- Backend: 198/198 unit verde.
- Frontend: typecheck + lint + build verdes.
- 47 archivos migrados; 0 / 0 conteo final localStorage / TODO.

---

## 9. Pregunta abierta para Yasmin (Fase F)

1. **Override ESLint** (EC-FaseF-01): ¿aceptas el override per-archivo o prefieres supresiones inline? **Bloquea cierre Fase F** porque cambia la doctrina del proyecto.

2. **Smoke manual** (Paso 4): cuándo agendamos los 10 minutos en el navegador.

3. **Sprint 14 vs Sprint 12 next**: el handoff Fase E menciona que Sprint 12 (Settings + KB) estaba bloqueado por DC.28 (cerrada ahora). ¿Ese es el siguiente sprint o vamos por la cola P2 estándar?

---

> **Cierre canónico:** este documento es la fuente de verdad para el siguiente agente. Junto con el handoff Fase E (`sprint-13-auth-handoff-fase-e.md`), `ADR-078 Amendment A1`, los 9 commits de Fase E, y los archivos `lib/server-auth.ts` + `lib/auth-actions.ts` + los `_actions.ts` por dominio, no debería necesitar reexplorar nada del backend ni redescubrir el alcance del frontend. Todo el código de Fase F (3 specs + reescritura fixture + 5 docs) está acotado y descrito en §3-§5.
