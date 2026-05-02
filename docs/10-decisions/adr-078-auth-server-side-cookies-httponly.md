# ADR-078 — Autenticación server-side con cookies httpOnly para Server Components nativos

> **Status:** Active
> **Date:** 2026-05-02
> **Domain:** auth, frontend, security, cross-cutting
> **Sprint:** Decisión arquitectónica que **bloquea** Sprint 13 Hardening (DC.28 + DC.6) y **gobierna** la migración del frontend de Client Components (`'use client'` + `localStorage`) a Server Components (lectura server-side autenticada).

---

## Contexto

El frontend del Aelium Dashboard (Next.js 16 App Router) está hoy escrito **íntegramente con `'use client'` Components** que leen el JWT desde `localStorage.getItem('access_token')` y atacan la API REST del backend con `Authorization: Bearer <token>`. Verificación al cierre de Sprint 11 Fase 11.C (2026-05-02): **0 Server Components nativos** en `frontend/app/`. Patrón canónico actual:

```tsx
// frontend/app/dashboard/transparency/page.tsx (extracto)
'use client';
import { useState, useEffect } from 'react';

export default function TransparencyPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  useEffect(() => { /* fetch + setState */ }, [token]);
  // ...
}
```

Este patrón conlleva dos deudas técnicas conocidas:

- **DC.6** (registrada en `backlog.md`): 27 warnings ESLint `set-state-in-effect` por todo el frontend. La regla nueva de `eslint-plugin-react-hooks` 7.x para React 19 los detecta. Se bajó de `error` a `warn` con justificación; no bloquea CI. **Plan original**: migrar fetching a Server Components + `use()`/Suspense en Sprint 7.5 Fase 2 o Sprint 13 Hardening.
- **DC.28** (registrada en `backlog.md`): JWT en `localStorage` es vulnerable a XSS — el navegador expone el token a cualquier script en la misma origin. La doctrina industrial (OWASP Cheat Sheet, Auth0 best practices, Vercel App Router docs) exige **cookies httpOnly + Secure + SameSite=Strict** para tokens persistentes. Hoy el sistema funciona con localStorage por **decisión consciente diferida** a Sprint 13 / P-DEPLOY (sin clientes reales, exposición XSS no es crítica).

Sprint 11 Fase 11.D (Frontend `/dashboard/services` + `/admin/services` + página detalle) debe decidir cómo encaja con esta deuda. El plan canónico de Fase 11.D (`current.md` §Sprint 11) dice literalmente:

> "**Doctrina anti-DC.6**: Server Components nativos, NO `useEffect+fetch+setState`."

Pero un Server Component nativo requiere leer el JWT **server-side** (`cookies()` de Next.js, `headers()` o equivalente), lo que no funciona con localStorage. La doctrina del plan choca con la realidad técnica actual.

> **¿Qué pasaría si NO tomáramos esta decisión?** Cada nuevo módulo del frontend (Sprint 11.D, Sprint 12 Settings/KB, Sprint 12.5 RGPD portal, Sprint 13 Hardening) decidiría ad-hoc qué patrón usar. Resultado: el repo acumula tres patrones simultáneos (`'use client'` clásico, Server Components con auth opcional, Server Components con cookies). Cuando llegue Sprint 13 a "cerrar DC.6/DC.28", la migración será inabarcable porque no hay un punto canónico de qué cambiar ni cómo. Es exactamente el antipatrón "interface emerges from implementation" que ADR-077 §Cuándo revisar advierte. Yasmin lo formuló sin tecnicismos: "no quiero que se nos olvide y tener que pagar haciendo unas páginas mal y otras bien".

---

## Opciones consideradas

### A. Status quo — `localStorage` + `'use client'` indefinidamente

- **Pros**: cero cambio de auth.
- **Contras**:
  - Imposible escribir Server Components autenticados.
  - DC.6 + DC.28 quedan abiertos sin plan canónico — riesgo de olvido.
  - Patrón divergente cuando Sprint 13 llegue: el equipo decidirá ad-hoc qué migrar.
  - **Antipatrón B** (ADR-070): "interfaz emerge de la implementación".
- **Descartado.**

### B. Migrar TODO el frontend a Server Components antes de Fase 11.D

- Cerrar DC.28 (cookies httpOnly + refresh rotation) + DC.6 (migrar 27 warnings) **antes** de codear Fase 11.D.
- **Pros**: arquitectónicamente puro. Fase 11.D nace SC nativo desde el inicio.
- **Contras**:
  - **Bloquea Fase 11.D detrás de un sprint completo de auth** (~3-5 sesiones intensas: tocar `auth-login.service.ts` para emitir cookies, JWT strategy para leerlas, frontend para no leer localStorage, todos los tests E2E que asumen `Authorization: Bearer`, refresh rotation, audit trail global).
  - Sprint 13 Hardening en `current.md` posición 9 P2 está **emparejado** con otros temas (httpOnly cookies, refresh rotation, audit trail global, Redis adapter Socket.io, N+1 audit, cursor pagination, R15 restantes, DC.28/14/15) — no es un sprint pequeño.
  - Sprint 11 (cabeza de cola P2) **dejaría de avanzar** durante el sprint dedicado de auth.
- **Descartado** (no elegido) por bloqueo de cola.

### C. (elegida) Migración gobernada por ADR + marker mecánico + sprint dedicado

Tres mecanismos coordinados:

1. **Este ADR-078** congela el plan de migración: cómo se hará server-side auth, qué cambia en backend, qué cambia en frontend, política de coexistencia mientras la migración no esté completa.
2. **Marker mecánico `TODO(ADR-078)`** en cada nuevo Client Component que se cree mientras la migración no esté completa. Trazabilidad por `grep TODO(ADR-078)` — cero olvido posible.
3. **Sprint 13 Hardening reformulado** en `current.md` con el alcance DC.28 + DC.6 explícito: lista de archivos a migrar, criterio de DoD, edge cases. Bloqueante para cualquier página nueva creada después del cierre de Sprint 11.

- **Pros**:
  - **No bloquea** Sprint 11 Fase 11.D (cabeza de cola P2).
  - **Documentación canónica** desde el ADR — no notas dispersas.
  - **Trazabilidad mecánica** — un `grep` cierra el círculo en Sprint 13.
  - **Coherente con la doctrina del proyecto** (ADR antes de código — ADR-075/077/078).
  - **Cierra el debate** "qué hacemos con DC.6/DC.28" de una vez.
- **Contras**:
  - Acepta una **fase de coexistencia** entre cierre de Sprint 11 y cierre de Sprint 13 con dos patrones (Client Components con `localStorage` + Server Components con cookies). Mitigación: §"Política de coexistencia" abajo.
  - Fase 11.D queda como **última excepción permitida** del patrón viejo. Sprint 12 (Settings + KB) ya no podrá usarlo — fuerza el cierre.

- **Elegida.**

---

## Decisión

Se elige **Opción C**. A continuación se especifica el plan exhaustivo: backend (cómo se emiten/leen las cookies), frontend (cómo lo consume cada portal), política de coexistencia, criterio para nuevas páginas, y DoD de la migración Sprint 13.

---

### 1. Backend — emisión y verificación de cookies httpOnly

#### 1.1 Endpoint de login (`POST /api/v1/auth/login` y `POST /api/v1/auth/verify-2fa`)

Hoy el backend devuelve `{ access_token, refresh_token }` en el body JSON. **Cambio canónico**: además del body (mantenido por compatibilidad con clientes API + tests E2E), establecer cookies:

```typescript
// auth-login.service.ts (Sprint 13 — pseudo-código orientativo)
res.cookie('aelium_access_token', accessToken, {
  httpOnly: true,
  secure: NODE_ENV === 'production',  // en dev http://localhost requiere false
  sameSite: 'lax',                     // 'strict' rompe redirects post-login; 'lax' es el balance correcto
  path: '/',
  maxAge: 15 * 60 * 1000,              // 15 min — ADR-067 vigencia access token
});
res.cookie('aelium_refresh_token', refreshToken, {
  httpOnly: true,
  secure: NODE_ENV === 'production',
  sameSite: 'strict',                  // refresh sólo en navegación misma origin
  path: '/api/v1/auth/refresh',        // sólo el endpoint de refresh la recibe
  maxAge: 7 * 24 * 60 * 60 * 1000,     // 7 días — ADR-067 vigencia refresh token
});
```

#### 1.2 Endpoint de logout (`POST /api/v1/auth/logout`)

Limpia ambas cookies con `res.clearCookie(...)` + invalida el refresh token en BD (anti replay).

#### 1.3 JWT Strategy (Passport)

`JwtStrategy.fromExtractors` se extiende para aceptar **ambos** orígenes:

1. `Authorization: Bearer <token>` (compatibilidad con tests E2E + clientes API directos).
2. `cookies['aelium_access_token']` (Server Components frontend).

Orden de prioridad: **header primero, cookie como fallback**. Esto asegura que los E2E E2E que ya pasan token vía header no se rompan durante la migración.

#### 1.4 Refresh rotation

`POST /api/v1/auth/refresh` lee `aelium_refresh_token` de cookies, verifica que NO ha sido usado antes (campo `used_at` en BD), genera par nuevo (access + refresh), invalida el refresh viejo, devuelve par nuevo (cookies + body). Estado del refresh token en BD permite detectar replay → revoca toda la cadena del cliente + emite `auth.refresh_replay_detected` (alerta superadmin).

#### 1.5 CSRF protection

Cookies httpOnly mitigan XSS pero **abren CSRF** si el atacante puede inducir al navegador a llamar al backend con la cookie automáticamente. Mitigación canónica:

- `sameSite: 'lax'` corta la mayoría de CSRF cross-site (navegación POST cross-origin no envía cookies lax).
- **Doble submit cookie pattern** para mutaciones (`POST/PATCH/DELETE`):
  - Backend setea cookie no-httpOnly `aelium_csrf_token` (random uuid v4) al login.
  - Frontend la lee con `document.cookie` y la incluye como header `X-CSRF-Token` en cada mutación.
  - Backend valida que `cookies.aelium_csrf_token === headers['X-CSRF-Token']`.
- **Excepción canónica**: endpoints API directos (sin cookies, sólo `Authorization: Bearer`) NO requieren CSRF — el atacante no puede generar el header sin el JWT.

#### 1.6 Cambios en la lista de endpoints existentes

Cero. Los 7 endpoints REST nuevos del Sprint 11 Fase 11.D (`GET /services`, `GET /services/:id`, `POST /services/:id/sso`, `POST /services/:id/actions/:slug`, `GET /admin/services`, `POST /admin/services/:id/reprovision`, `POST /admin/services/:id/deprovision`) reciben `JwtAuthGuard` igual que cualquier otro endpoint hoy — el guard lo gobierna §1.3.

---

### 2. Frontend — patrón canónico Server Component autenticado

#### 2.1 Helper `getServerSession()` en `frontend/app/lib/server-auth.ts`

```tsx
// frontend/app/lib/server-auth.ts (Sprint 13 — pseudo-código orientativo)
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function getServerSession(): Promise<ServerSession> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('aelium_access_token')?.value;

  if (!accessToken) {
    redirect('/login');
  }

  // Validar contra backend (caching evita llamada por cada SC).
  const session = await validateAccessToken(accessToken);
  return session;
}

// helper para fetch autenticado server-side
export async function serverFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('aelium_access_token')?.value;
  return fetch(`${process.env.BACKEND_URL}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${accessToken}`,
      // Server Component fetch no necesita CSRF (no es mutación cross-site).
    },
    cache: 'no-store',  // datos del cliente NO se cachean en el CDN
  }).then(r => r.json() as Promise<T>);
}
```

#### 2.2 Patrón canónico de página

```tsx
// frontend/app/dashboard/services/page.tsx (Server Component canónico post-ADR-078)
import { serverFetch } from '@/app/lib/server-auth';
import { ServicesList } from './_components/services-list';

export default async function ServicesPage() {
  const services = await serverFetch<ServiceSummary[]>('/api/v1/services');
  return <ServicesList services={services} />;
}
```

`ServicesList` puede ser **Server Component** (presentacional puro) o **Client Component** si necesita interactividad (ej. modal). En ambos casos los datos vienen pre-cargados — cero `useEffect+fetch+setState`.

#### 2.3 Mutaciones — Server Actions o Client Components con CSRF

Las mutaciones (POST/PATCH/DELETE) tienen 2 caminos:

- **Server Actions** (Next.js 16 nativo): `'use server'` function que llama al backend con cookies + CSRF transparente. Patrón preferido cuando aplique.
- **Client Component** que recibe la session token vía contexto + lee cookie CSRF + llama al backend con `Authorization: Bearer` + `X-CSRF-Token`.

#### 2.4 Suspense + `<Loading />` + `error.tsx`

Cada ruta nueva expone `loading.tsx` (skeleton del Design System) + `error.tsx` (boundary de errores). Server Components hacen await directo del fetch — Next.js gestiona el skeleton automáticamente.

---

### 3. Política de coexistencia (Sprint 11 → Sprint 13)

Durante la fase de coexistencia entre cierre Sprint 11 Fase 11.D (último uso permitido del patrón viejo) y cierre Sprint 13 (migración completa), conviven dos patrones. Reglas duras:

#### 3.1 Páginas existentes con `'use client'` + `localStorage`

- **Permanecen intactas** hasta Sprint 13. NO se migran a Server Components piezas sueltas — la migración es **bulk**, en una sola PR Sprint 13, para evitar drift parcial.
- Cada `'use client'` existente lleva o llevará un comentario `// TODO(ADR-078, Sprint 13): migrar a Server Component cuando cookies httpOnly estén activas.` Si el archivo aún no lo tiene, **se añade en el primer toque** que haga.

#### 3.2 Páginas nuevas creadas durante coexistencia

- **Sprint 11 Fase 11.D es la ÚLTIMA excepción permitida** del patrón `'use client'` + `localStorage`. Por la cabeza de cola P2 + para no bloquear ese sprint.
- **A partir de Sprint 12 (Settings + KB)** queda **prohibido** crear `'use client'` + `localStorage` nuevo. Cualquier página nueva debe esperar a Sprint 13 (no se permite empezar Sprint 12 sin DC.28 cerrada) **O** debe hacerse como Server Component nativo si ya hay infra de cookies disponible.
- **Excepción justificada**: `'use client'` para componentes puramente interactivos (modales, dropdowns, formularios sin auth) sin `localStorage` está siempre permitido — es el uso canónico de React.

#### 3.3 Archivos nuevos del Sprint 11 Fase 11.D

Cada Client Component nuevo lleva en su docstring:

```tsx
/**
 * <Componente>
 *
 * TODO(ADR-078, Sprint 13): migrar a Server Component cuando cookies httpOnly
 * estén activas. Ref DC.28. Este archivo es la última excepción permitida
 * del patrón 'use client' + localStorage según ADR-078 §3.2.
 */
'use client';
// ...
```

Trazabilidad mecánica: `grep -r "TODO(ADR-078" frontend/app` en Sprint 13 da la lista exacta de archivos a migrar.

---

### 4. Sprint 13 — DoD canónico de la migración

Sprint 13 Hardening dedica una fase específica `13.AUTH` a cerrar DC.28 + DC.6. Plan congelado por este ADR (sub-tareas pueden refinarse cuando se redacte el sprint plan formal):

#### 4.1 Backend

- [ ] `auth-login.service.ts` emite cookies httpOnly además del body JSON (compat con tests).
- [ ] `auth-logout.controller.ts` (nuevo endpoint `POST /api/v1/auth/logout`) limpia cookies + invalida refresh.
- [ ] `auth-token.service.ts` rota refresh tokens con detección de replay.
- [ ] `JwtStrategy` lee de `Authorization` header **o** de cookies (header preference).
- [ ] CSRF middleware — valida `X-CSRF-Token` en mutaciones cookie-authenticated.
- [ ] Tests unit del flujo cookies + replay detection.

#### 4.2 Frontend

- [ ] `frontend/app/lib/server-auth.ts` con `getServerSession()` + `serverFetch()`.
- [ ] Migrar todas las páginas con `TODO(ADR-078)` a Server Components nativos (lista mecánica vía grep).
- [ ] Eliminar todos los `localStorage.getItem('access_token')` del codebase (verificable: 0 ocurrencias post-migración).
- [ ] Eliminar `lib/auth-context.tsx` o reescribirlo para que el provider lea cookies en lugar de localStorage (decisión final en Sprint 13 — depende del scope real de `auth-context`).
- [ ] DC.6: 27 warnings `set-state-in-effect` → 0 (regla `error` re-promovida en `eslint.config.mjs`).

#### 4.3 Tests

- [ ] Tests E2E que hoy hacen `Authorization: Bearer` siguen pasando (header preference).
- [ ] Tests E2E nuevos que verifican el flujo cookies httpOnly + CSRF (login → cookie → request autenticada → logout → cookie limpia).
- [ ] Test E2E que verifica que `localStorage` NO contiene tokens tras login (regresión del antipatrón).

#### 4.4 Documentación

- [ ] `docs/00-foundations/rules.md` añade R17 (o equivalente) — "JWT en cookies httpOnly, NO en localStorage".
- [ ] `docs/20-modules/auth/contract.md` actualiza la sección de tokens.
- [ ] `docs/50-operations/api-errors.md` documenta CSRF errors.
- [ ] `current.md` mueve Sprint 13 entero a `completed/sprint-13-hardening.md`.

---

### 5. Bloqueante para Sprints futuros

Este ADR establece dos invariantes duros:

- **Sprint 12 (Settings + KB) NO arranca hasta que Sprint 13 §13.AUTH esté cerrado** — no permitimos otra ronda de páginas con `'use client'` + `localStorage` después de Sprint 11. Si Sprint 12 es prioritario, primero se hace Sprint 13.
- **Cualquier PR que cree un archivo `'use client'` con `localStorage.getItem('access_token')` después del cierre de Sprint 11 (excepto si es bugfix puntual de archivos existentes) requiere ADR específico que justifique por qué no se hace SC**. No se mergea sin ADR.

---

## Consecuencias

- ✅ **Ganamos:**
  - **Cero olvido posible**: marker `TODO(ADR-078)` + grep mecánico cierra el círculo.
  - **Sprint 11 no se bloquea** detrás de sprint completo de auth.
  - **Doctrina anti-DC.6 cumplida desde Sprint 13** sin penalizar la cola activa.
  - **Seguridad mejorada** post-Sprint 13: XSS pierde acceso a tokens (httpOnly), CSRF mitigado (sameSite + double-submit).
  - **Refresh rotation con detección de replay** cierra la deuda de Sprint 13 sobre rotación.
  - **Coherencia futuras Sprints**: Sprint 12+ nacen como Server Components nativos sin debate.
- ⚠️ **Aceptamos:**
  - **Coexistencia controlada** entre cierre Sprint 11 y cierre Sprint 13 (~2-4 semanas en cola activa). Mitigación §3 con reglas duras.
  - **Sprint 13 §13.AUTH es trabajo grande** (~3-5 sesiones intensas). Aceptable porque cierra **todo** de una vez.
  - **Tests E2E mantienen `Authorization: Bearer`** post-migración por compatibilidad. NO probamos solo el camino cookies — añadimos un test específico de cookies, los demás siguen vía header. Ratio cobertura razonable.
- 🚪 **Cierra:**
  - **No `'use client'` + `localStorage` nuevos** en Sprint 12+ sin ADR específico.
  - **No drift entre módulos**: el patrón canónico es uno y está documentado aquí.
  - **No olvido de DC.28**: Sprint 13 lo absorbe con scope explícito.

---

## Cuándo revisar

- **Si Next.js 17+ cambia la API de `cookies()`/`headers()`**: revisar §2.1 helpers.
- **Si el equipo decide adoptar un sistema de auth federado** (OAuth2 + cliente OIDC vía Auth.js u otro): revisar §1 — el flujo de login/refresh cambia drásticamente.
- **Si surge una vulnerabilidad CSRF no cubierta por sameSite + double-submit**: revisar §1.5 (ej. añadir CSP frame-ancestors si aplica).
- **Si Sprint 13 §13.AUTH se demora >2 sprints respecto a su slot**: revisar §5 (relajar el bloqueo Sprint 12 con ADR específico que documente la excepción).
- **Si un partner externo necesita acceso programático masivo** sin browser: el header `Authorization: Bearer` permanece como camino válido, pero podría requerir API keys propias (Sprint 19 Partner Module).

---

## Referencias

- **Módulos afectados:**
  - `auth` — emisor de cookies + CSRF middleware. Sprint 13 §13.AUTH.
  - **Todo el frontend** (`frontend/app/`) — migración bulk. Sprint 13 §13.AUTH.
  - `provisioning` (Sprint 11 Fase 11.D) — primer caso de uso del helper `serverFetch` + última excepción permitida del patrón viejo.
- **Reglas relacionadas:**
  - [R12](../00-foundations/rules.md) — credenciales encriptadas. JWT en cookies httpOnly cumple R12.
  - [R14](../00-foundations/rules.md) — manejo de errores frontend. SC + Suspense gestiona errores con `error.tsx` boundary.
  - **R17 (futuro, redactado en Sprint 13)** — "JWT en cookies httpOnly, nunca en localStorage. Acceso server-side vía `getServerSession()` o header explícito en clientes API directos."
- **ADRs relacionados:**
  - [ADR-066](./adr-066-tres-portales-raiz-portalbadge.md) — los 3 portales (`/admin`, `/dashboard`, `/partner`) heredan este patrón canónico de auth uniformemente.
  - [ADR-067](./adr-067-permisos-granulares-staff.md) — duración tokens (access 15m, refresh 7d) inalterada.
  - [ADR-070](./adr-070-service-info-sso-acciones-curadas.md) — la página `/dashboard/services/[id]` es el primer caso de uso del helper `serverFetch` post-Sprint 13.
  - [ADR-077](./adr-077-contrato-provisioner-plugin-v2.md) — patrón "ADR antes de código" replicado aquí.
- **Backlog:**
  - DC.6 (frontend `set-state-in-effect`) — cerrada por Sprint 13 §13.AUTH.
  - DC.28 (cookies httpOnly + refresh rotation + audit trail global) — cerrada por Sprint 13 §13.AUTH.
- **Doctrina industrial:**
  - OWASP Cheat Sheet — JWT in cookies httpOnly + sameSite vs localStorage.
  - Vercel App Router docs — `cookies()` server-side helper canónico.
  - Auth0 best practices — refresh rotation + replay detection.
- **Sprint:** Decisión arquitectónica que **bloquea** Sprint 13 §13.AUTH (DC.28 + DC.6). Fase 11.D del Sprint 11 es la **última excepción permitida** del patrón viejo — todas las páginas nuevas creadas después de Sprint 11 deben cumplir este ADR.

---

## Amendments

> Reservado para cambios compatibles hacia atrás post-cierre del ADR.

(ninguno todavía)
