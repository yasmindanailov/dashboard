# Sprint 13 §13.AUTH — Handoff Fase E (frontend bulk migration)

> **Documento de transferencia entre agentes/sesiones.** Quien retome este sprint encuentra aquí el contexto operativo completo: qué está hecho, qué queda, qué archivos tocar, qué comandos correr, qué validar.
>
> **Punto de partida:** rama `sprint13-auth-cookies-httponly`, commit `3851e7a` (HEAD tras Fase D).
> **Cerrado:** 2026-05-03 — Fases 0 / A / B / D. **Pendiente:** Fases E + F (~2 sesiones intensas).

---

## 1. Lectura mínima obligatoria antes de tocar código

| # | Documento | Por qué |
|---|-----------|---------|
| 1 | [`docs/10-decisions/adr-078-auth-server-side-cookies-httponly.md`](../10-decisions/adr-078-auth-server-side-cookies-httponly.md) | Plan canónico completo. **Leer Amendment A1** (sec final) — congela Modelo A: cookies httpOnly viven en dominio Next.js, NO en backend. |
| 2 | [`docs/60-roadmap/current.md` §Sprint 13 §13.AUTH](./current.md) | Sprint plan completo (10 secciones). DoD literal por fase. |
| 3 | [`frontend/AGENTS.md`](../../frontend/AGENTS.md) | "This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing code." Honrar antes de tocar SC / Server Actions. |
| 4 | [`frontend/app/lib/server-auth.ts`](../../frontend/app/lib/server-auth.ts) | Helpers DAL canónicos cerrados Fase D. Su shape es la API que el migration bulk Fase E debe consumir. |
| 5 | [`frontend/app/lib/auth-actions.ts`](../../frontend/app/lib/auth-actions.ts) | 10 Server Actions cerradas Fase D. Las pages auth-públicas las invocan con `useActionState`. |
| 6 | [`backend/src/modules/auth/auth-token.service.ts`](../../backend/src/modules/auth/auth-token.service.ts) | Cómo emite tokens (issueTokens) + cómo rota con replay detection (refresh). El frontend NO toca este flow — solo lo invoca via Server Action. |

---

## 2. Estado canónico verificado

### Backend (verde)

- **Migración `sprint13auth_session_replay_detection`** creada en
  [`backend/prisma/migrations/20260503180000_sprint13auth_session_replay_detection/migration.sql`](../../backend/prisma/migrations/20260503180000_sprint13auth_session_replay_detection/migration.sql).
  ⚠️ **NO aplicada a la DB local** porque cuando intenté `pnpm prisma migrate dev`, Prisma detectó drift del Sprint 16 previo y exigía `prisma migrate reset` (destructivo, no autorizado). El primer paso de Fase E es:
  ```bash
  cd backend && pnpm prisma migrate dev   # Yasmin acepta el reset si procede
  pnpm seed                                 # re-seed canónico
  ```
- **`cookie-parser`** activo en `main.ts`. Cierra bug latente del flow `/auth/refresh` que leía `req.cookies` sin middleware.
- **Endpoint nuevo** `POST /api/v1/auth/ws-token` operativo (tests unit verde, smoke test pendiente con backend up).
- **`AuthTokenService.refresh()`** rota par completo + detecta replay. Si replay → revoca toda la cadena del user + emite `auth.refresh_replay_detected`.
- **`NotificationsAuthReplayListener`** alerta superadmin via D12 + 2 plantillas (`internal` + `email`) seedeadas.
- **`SupportGatewayAuth`** ahora rechaza tokens `type !== 'access' && !== 'ws'` (cierra bug latente: hasta hoy aceptaba refresh/temp_2fa por no narrowing).
- **Tests:** 198/198 verde (188 base + 10 nuevos: 6 refresh + 4 replay listener + ya antes 5 ws-token).
- **Lint + typecheck:** verdes.

### Frontend (helpers listos, bulk pendiente)

- `frontend/app/lib/server-auth.ts` — DAL canónico Next.js 16 con `cache()` + helpers SC.
- `frontend/app/lib/auth-actions.ts` — 10 Server Actions canónicas.
- **Cero archivo existente del frontend tocado todavía** — la deuda DC.6 + DC.28 sigue intacta hasta que Fase E corra.
- `pnpm typecheck` verde.
- `pnpm lint:check` con **49 warnings preexistentes DC.6** (que Fase E cerrará promoviendo la regla a `error`).

### Variables de entorno requeridas (Yasmin debe replicar en `.env.local`)

```bash
# frontend/.env.local
BACKEND_URL=http://localhost:3001/api/v1     # server-side, distinto de NEXT_PUBLIC_API_URL
NEXT_RUNTIME_SECRET=<openssl rand -base64 32>  # Server Action ID signing — sin él en prod, login no funciona
```

`frontend/.env.example` está en `.gitignore` — yo lo actualicé localmente pero **no lo commiteé**. La doc canónica de las vars está en este handoff + en el sprint plan `current.md`.

---

## 3. Inventario mecánico Fase E (auditoría 2026-05-03)

### 3.1 — Archivos con `localStorage.getItem('access_token')` o `localStorage.setItem('access_token')` (41 archivos)

```
frontend/app/admin/AdminSidebar.tsx
frontend/app/_shared/support/conversation/useConversationDetail.ts
frontend/app/dashboard/support/[id]/page.tsx
frontend/app/components/ChatWidget/useChatWidget.ts
frontend/app/admin/tasks/page.tsx
frontend/app/admin/support/chats/useChatPanel.ts
frontend/app/admin/support/[id]/page.tsx
frontend/app/admin/clients/[id]/page.tsx
frontend/app/admin/clients/[id]/ClientNotesTab.tsx
frontend/app/_shared/widgets/TasksWidget.tsx
frontend/app/_shared/tasks/TaskCard.tsx
frontend/app/_shared/tasks/ReassignTaskModal.tsx
frontend/app/_shared/tasks/MaintenanceLogModal.tsx
frontend/app/_shared/notes/ExceptionalNoteModal.tsx
frontend/app/dashboard/services/page.tsx
frontend/app/dashboard/services/[id]/page.tsx
frontend/app/admin/services/page.tsx
frontend/app/_shared/services/SsoButton.tsx
frontend/app/_shared/services/ActionsBar.tsx
frontend/app/dashboard/support-inside/page.tsx
frontend/app/admin/support-inside-plans/page.tsx
frontend/app/admin/support-inside-plans/[slug]/page.tsx
frontend/app/admin/products/page.tsx
frontend/app/admin/products/[id]/page.tsx
frontend/app/_shared/billing/checkout/useCheckout.ts
frontend/app/_shared/support/conversation/ConversationSidebar.tsx
frontend/app/dashboard/billing/page.tsx
frontend/app/dashboard/billing/[id]/page.tsx
frontend/app/admin/products/new/page.tsx
frontend/app/admin/products/[id]/edit/page.tsx
frontend/app/admin/clients/page.tsx
frontend/app/admin/billing/page.tsx
frontend/app/admin/billing/[id]/page.tsx
frontend/app/_shared/support/useTicketInbox.ts
frontend/app/_shared/shell/NotificationBell.tsx
frontend/app/admin/notifications/templates/page.tsx
frontend/app/dashboard/transparency/page.tsx
frontend/app/admin/jobs/failed/page.tsx
frontend/app/admin/error-log/page.tsx
frontend/app/lib/auth-context.tsx
frontend/app/dashboard/page.tsx
```

Comando para regenerar la lista: `grep -rln "localStorage\.\(get\|set\|remove\)Item('access_token'\|'refresh_token')" frontend/app`.

### 3.2 — Archivos con marker `TODO(ADR-078)` (22 archivos)

```
frontend/app/admin/layout.tsx
frontend/app/admin/AdminSidebar.tsx
frontend/app/_shared/support/chat/ChatThreadView.tsx
frontend/app/dashboard/support/[id]/page.tsx
frontend/app/admin/tasks/page.tsx
frontend/app/admin/page.tsx
frontend/app/admin/clients/[id]/page.tsx
frontend/app/admin/clients/[id]/ClientNotesTab.tsx
frontend/app/_shared/widgets/TasksWidget.tsx
frontend/app/_shared/tasks/TaskCard.tsx
frontend/app/_shared/tasks/ReassignTaskModal.tsx
frontend/app/_shared/tasks/MaintenanceLogModal.tsx
frontend/app/_shared/tasks/CompleteTaskModal.tsx
frontend/app/_shared/notes/ExceptionalNoteModal.tsx
frontend/app/dashboard/services/page.tsx
frontend/app/dashboard/services/[id]/page.tsx
frontend/app/admin/services/page.tsx
frontend/app/_shared/services/index.ts
frontend/app/_shared/services/service-status.ts
frontend/app/_shared/services/SsoButton.tsx
frontend/app/_shared/services/ServiceHeader.tsx
frontend/app/_shared/services/ActionsBar.tsx
```

Comando: `grep -rln "TODO(ADR-078" frontend/app`.

### 3.3 — Conjunto único a migrar

Los 41 + 22 se solapan. **Conjunto único ≈ 47 archivos**. Comando para listar:

```bash
{ grep -rln "localStorage\.\(get\|set\|remove\)Item('access_token'\|'refresh_token')" frontend/app; \
  grep -rln "TODO(ADR-078" frontend/app; } | sort -u
```

---

## 4. Patrón canónico de migración archivo por archivo

### 4.1 — Page autenticada (`page.tsx` que hoy es `'use client'` + `localStorage`)

**Antes (patrón viejo):**
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { servicesApi } from '@/lib/api';

export default function ServicesPage() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    servicesApi.list(token!).then(r => setServices(r.data));
  }, []);
  return <ServicesList services={services} />;
}
```

**Después (canónico Modelo A):**
```tsx
// Sin 'use client' — Server Component nativo.
import { requireServerSession, serverFetch } from '@/app/lib/server-auth';
import { ServicesList } from './_components/services-list'; // Client Component si necesita interactividad

export default async function ServicesPage() {
  await requireServerSession(); // redirige a / si no auth
  const data = await serverFetch<{ data: ServiceListItem[]; meta: PaginationMeta }>(
    '/services'
  );
  return <ServicesList services={data.data} />;
}
```

**Notas críticas:**
- El Server Component es `async`. Funciona con `await`.
- `ServicesList` puede seguir siendo `'use client'` si tiene interactividad (modales, dropdowns) — recibe `services` por props ya hidratados.
- **Cero `useState + useEffect + fetch + setLoading`.** Cero loading flash. Si el componente hijo es interactivo y necesita refetch, usa Server Action que invoque `revalidatePath`.

### 4.2 — Page auth-pública (formulario login/register/etc)

**Antes:**
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await authApi.login(email, password);
    localStorage.setItem('access_token', res.access_token!);
    router.push('/dashboard');
  };
  return <form onSubmit={handleSubmit}>...</form>;
}
```

**Después (canónico):**
```tsx
'use client';
import { useActionState } from 'react';
import { loginAction } from '@/app/lib/auth-actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);

  // Si requires_2fa, navegar a /verify-2fa con temp_token (state.requires2fa).
  // Si error, mostrar state.error.
  return (
    <form action={action}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      <button disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button>
      {state?.error && <p>{state.error}</p>}
    </form>
  );
}
```

### 4.3 — Client Component que hoy recibe `token` por prop

Hoy, muchas pages SC las hijos `'use client'` recibían `token` para invocar API. **En Modelo A, el componente hijo NO recibe token** — recibe los datos ya hidratados, y para mutaciones invoca un Server Action.

```tsx
// Page Server Component padre
export default async function Page() {
  await requireServerSession();
  const tasks = await serverFetch<TaskListResponse>('/tasks');
  return <TasksClientView tasks={tasks.data} />;
}

// TasksClientView (Client Component hijo)
'use client';
import { reassignTaskAction } from '@/app/lib/task-actions'; // Server Action específica de tasks
export function TasksClientView({ tasks }: { tasks: Task[] }) {
  // Mutaciones via Server Actions — cero token, cero localStorage, cero fetch raw.
  return <button onClick={() => reassignTaskAction(taskId, agentId)}>Reasignar</button>;
}
```

**Decisión Fase E:** crear Server Actions específicas por dominio (`task-actions.ts`, `service-actions.ts`, `billing-actions.ts`, etc.) o usar `serverFetch` directo desde un Server Action puntual. Decidir por archivo según frecuencia de mutación.

### 4.4 — ChatWidget WebSocket

```tsx
'use client';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { getWsTokenAction } from '@/app/lib/auth-actions';

export function ChatWidget() {
  useEffect(() => {
    let socket: ReturnType<typeof io> | undefined;
    void (async () => {
      const tokenResp = await getWsTokenAction();
      if (!tokenResp) return; // sin sesión válida
      socket = io('/support', {
        auth: { token: tokenResp.token },
        transports: ['websocket'],
      });
      // ... resto del setup socket
    })();
    return () => socket?.disconnect();
  }, []);
  // ...
}
```

### 4.5 — `AuthContext` reescritura minimalista

Hoy `AuthContext` gestiona tokens + refresh + scheduling. En Modelo A todo eso lo hace el servidor (Server Actions + cookies). El nuevo `AuthContext` es solo:

```tsx
'use client';
import { createContext, useContext } from 'react';
import { logoutAction } from '@/app/lib/auth-actions';

interface AuthContextValue {
  user: ServerSessionUser | null;  // hidratado server-side por layout
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: ServerSessionUser | null;
  children: React.ReactNode;
}) {
  return (
    <AuthContext.Provider value={{ user, logout: logoutAction }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

El `AuthProvider` se monta en `app/layout.tsx` (Server Component) que invoca `getServerSession()` y pasa el `user` por props.

---

## 5. Orden recomendado de migración (priorización por riesgo)

1. **Pages auth-públicas** (`/`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`) — **primero**, son las que usan los Server Actions más simples (`loginAction`, `registerAction`, etc.). Validan el flow cookies httpOnly extremo a extremo.
2. **`AuthContext` reescribir + `app/layout.tsx` integrar `AuthProvider` con user hidratado SC** — desbloquea todo lo demás (los componentes que llaman `useAuth().user` siguen funcionando).
3. **Pages autenticadas read-only** (sin mutaciones complejas) — `/dashboard/transparency`, `/dashboard/services`, `/admin/services`, `/admin/billing`, `/admin/clients`, `/admin/error-log`, `/admin/jobs/failed`, `/admin/notifications/templates`. Usar `serverFetch` puro.
4. **Pages autenticadas con mutaciones** — `/admin/products/[id]/edit`, `/admin/clients/[id]`, `/admin/tasks`, `/admin/support/[id]`, `/admin/support/chats`. Crear Server Actions específicas por dominio.
5. **Componentes `_shared/` con interactividad** — `TasksWidget`, `TaskCard`, `MaintenanceLogModal`, `ReassignTaskModal`, `ExceptionalNoteModal`, `SsoButton`, `ActionsBar`, `useConversationDetail`, `useChatPanel`, `useChatWidget`, `useTicketInbox`, `useCheckout`, `NotificationBell`, etc. Refactor para recibir data por props + mutar via Server Actions.
6. **ChatWidget WS** — invocar `getWsTokenAction()` antes de socket.io handshake.
7. **Eliminar todo `localStorage.getItem/setItem('access_token'|'refresh_token')`** — verificación final con `grep` debe devolver 0 ocurrencias.
8. **`lib/api.ts`** — el helper `api(token)` actual sigue siendo válido para callers que pasan token explícito desde un Server Component (`serverFetch` lo wrappea). El cliente JS NUNCA debe importar `lib/api.ts` con `Authorization: Bearer` después de la migración.
9. **Promover ESLint regla** `react-hooks/set-state-in-effect` de `warn` → `error` en `frontend/eslint.config.mjs`. Verificar `pnpm lint:check` da 0 warnings.

Después de cada batch de 5-10 archivos: `pnpm typecheck && pnpm build && pnpm lint:check` verdes + smoke manual en navegador (login + navegación + logout).

---

## 6. Comandos canónicos del flow Fase E

### Antes de empezar

```bash
# 1. Aplicar migración Prisma (Fase B la dejó pendiente).
cd backend
pnpm prisma migrate dev    # Yasmin acepta reset si procede
pnpm seed                   # re-seed canónico

# 2. Levantar backend + frontend en terminales separadas.
pnpm dev                    # backend :3001
cd ../frontend && pnpm dev  # frontend :3002

# 3. Verificar variables .env.local frontend:
#    BACKEND_URL=http://localhost:3001/api/v1
#    NEXT_RUNTIME_SECRET=<openssl rand -base64 32>
```

### Smoke tests post-aplicar migración

```bash
# Login flow (debe devolver body JSON con tokens, NO Set-Cookie):
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cliente@aelium.test","password":"Cliente2026!"}'

# WS token (con Authorization):
TOKEN=<copy access_token de la respuesta anterior>
curl -X POST http://localhost:3001/api/v1/auth/ws-token \
  -H "Authorization: Bearer $TOKEN"
# Esperado: {"token":"...","expiresIn":60}

# Replay detection (refresh dos veces seguidas):
REFRESH=<copy refresh_token>
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}"
# Esperado primera vez: {access_token, refresh_token, expires_in, session_id}.
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}"
# Esperado segunda vez: 401 "Sesión comprometida — todas las sesiones revocadas".
# Verificar: GET /api/v1/notifications/unread (con un superadmin) tiene
# entrada con event_type=auth.refresh_replay_detected.
```

### Inventario actualizado (correr antes y después de cada batch)

```bash
echo "Pendientes localStorage:" && \
  grep -rln "localStorage\.\(get\|set\|remove\)Item('access_token'\|'refresh_token')" frontend/app | wc -l
echo "Pendientes TODO(ADR-078):" && \
  grep -rln "TODO(ADR-078" frontend/app | wc -l
```

Objetivo final: 0 / 0.

---

## 7. Edge cases pendientes y decisiones a tomar en Fase E

| ID | Caso | Decisión sugerida |
|----|------|-------------------|
| **EC-FaseE-01** | `lib/api.ts` exporta múltiples APIs (`clientsApi`, `productsApi`, `billingApi`, etc.) que reciben `token` por argumento. Mantener compat? | **Sí** — el helper sigue válido para Server Components (Server Component lee cookie + pasa al `api(token)`). Lo que se elimina es el patrón `'use client' + useEffect + api(localStorage.getItem(...))`. |
| **EC-FaseE-02** | `lib/auth-context.tsx` actual tiene `scheduleRefresh` con setTimeout. ¿Mantener? | **Eliminar.** En Modelo A, el refresh transparente lo gestiona el SC vía `serverFetch` (cuando recibe 401, invoca `refreshAction`). Cliente JS no programa nada. |
| **EC-FaseE-03** | Pages que mezclan SC (data fetch) + Client Component (interactividad) — ¿cómo pasar `accessToken` para futuros fetch interactivos? | **NO pasar token al cliente.** Server Action específica por mutación. Si un Client Component necesita refrescar datos, usar `useTransition` + Server Action que invoque `revalidatePath`. |
| **EC-FaseE-04** | El `AuthContext` actual expone `isLoading`. ¿Cómo replicarlo en SC? | **Eliminado** — en SC no hay loading flash (datos hidratados). Los Client Components hijos pueden mostrar `<Skeleton>` durante mutaciones (Server Actions con `useFormStatus().pending`). |
| **EC-FaseE-05** | Pages bajo `/admin/*` que requieren rol staff | Usar `requireRole(['superadmin', 'agent_full', 'agent_billing', 'agent_support'])` en `app/admin/layout.tsx`. CASL backend sigue siendo defensa en profundidad. |
| **EC-FaseE-06** | `auth-components.tsx` — ¿qué contiene? Verificar antes de Fase E | Leer y decidir si parte queda como Client (formularios) y parte como Server (validación). |

---

## 8. Definition of Done Fase E + F (literal)

### Fase E (frontend bulk + cierre DC.6)

- [ ] `pnpm prisma migrate dev` aplicado + `pnpm seed` re-ejecutado.
- [ ] `frontend/.env.local` con `BACKEND_URL` + `NEXT_RUNTIME_SECRET` setados.
- [ ] `grep -rln "localStorage\.\(get\|set\|remove\)Item('access_token'\|'refresh_token')" frontend/app` devuelve 0.
- [ ] `grep -rln "TODO(ADR-078" frontend/app` devuelve 0.
- [ ] ESLint regla `react-hooks/set-state-in-effect` promovida a `error` en `frontend/eslint.config.mjs`.
- [ ] `pnpm lint:check` (frontend, max-warnings=0) verde.
- [ ] `pnpm typecheck` + `pnpm build` (frontend) verdes.
- [ ] Smoke manual completo en navegador:
  - [ ] Login cliente (sin 2FA) → cookies httpOnly visibles en DevTools, localStorage vacío.
  - [ ] Login superadmin (con 2FA) → flow paso 1 + paso 2 → cookies setadas.
  - [ ] Logout → cookies borradas, navegación a `/` redirige.
  - [ ] WebSocket chat funciona (cliente recibe mensajes en vivo) tras login con cookies.
  - [ ] Refresh transparente (esperar >15min o forzar invalidación access_token).
  - [ ] Replay detection (con curl en paralelo a la sesión activa) → toda la cadena revocada + alerta superadmin.

### Fase F (tests E2E + cierre documental)

- [ ] `tests/e2e/auth-cookies-flow.spec.ts` (login → cookie set → autenticado → logout → cookie limpia).
- [ ] `tests/e2e/auth-replay-detection.spec.ts` (replay revoca cadena + alerta superadmin).
- [ ] `tests/e2e/auth-no-localStorage.spec.ts` (regresión: post-login `localStorage` vacío).
- [ ] Suite E2E completa verde (sin regresión en specs existentes).
- [ ] CI verde tras último push.
- [ ] `docs/00-foundations/rules.md` añade **R17** ("JWT en cookies httpOnly de Next.js, NO en localStorage").
- [ ] `docs/20-modules/auth/contract.md` actualiza §5 (incluye `/auth/ws-token`) + §11 (settings) + §14 (invariantes nuevos).
- [ ] `docs/50-operations/api-errors.md` documenta error code `AUTH_REPLAY_DETECTED`.
- [ ] `docs/60-roadmap/backlog.md` cierra **DC.6** + **DC.28** con commit hash.
- [ ] `docs/60-roadmap/current.md` mueve Sprint 13 §13.AUTH a `completed/sprint-13-auth-cookies-httponly.md` con retrospectiva.

---

## 9. Riesgos del Fase E (no detectados en plan original)

| # | Riesgo | Mitigación |
|---|--------|-----------|
| **R-FaseE-1** | El bulk migration toca 47 archivos. Cualquier error sutil en `serverFetch` o `getServerSession` se propaga a 47 pages. | Migrar archivo por archivo + `pnpm typecheck` verde después de cada batch de 5-10. Si algo rompe, revert atómico de ese archivo + investigar. |
| **R-FaseE-2** | Tests E2E que mockean JWT vía `localStorage.setItem` en fixtures Playwright se rompen | Auditar `tests/e2e/fixtures/*` antes de Fase F. Reescribir fixtures que usen localStorage para usar el flow real de login con Server Actions. |
| **R-FaseE-3** | `lib/auth-context.tsx` está importado en muchos sitios. Reescritura puede romper UX si no se hace bien | Hacer la reescritura de `auth-context.tsx` **inmediatamente después** de las pages auth-públicas + `app/layout.tsx`. Validar smoke (login + ver user.first_name en Topbar) antes de seguir. |
| **R-FaseE-4** | NEXT_RUNTIME_SECRET no setado → Server Actions pueden fallar silenciosamente o usar default inseguro en dev | Verificar variable al inicio de Fase E. Documentar en sprint plan §3.4 que es REQUIRED en prod. |
| **R-FaseE-5** | Frontend dev (`:3002`) hace `serverFetch` a backend (`:3001`) — cross-origin server-side. ¿`fetch` server-side respeta CORS? | **No** — server-side fetch ignora CORS (CORS es protección browser-to-server, no server-to-server). `serverFetch` funciona sin problemas cross-origin. Verificar en smoke. |

---

## 10. Resumen de commits ya hechos

| Commit | Fase | Resumen |
|--------|------|---------|
| `19796aa` | 0 | ADR-078 Amendment A1 Modelo A + sprint plan en `current.md`. Doc-only. |
| `0521c71` | A | `cookie-parser` + `/auth/ws-token` + JWT type narrowing + 5 tests unit. |
| `6e913b5` | B | Migración `Session.used_at` + refresh rotation con replay detection + listener + 2 plantillas + 10 tests unit. |
| `3851e7a` | D | `lib/server-auth.ts` + `lib/auth-actions.ts`. Cero archivo existente tocado. |
| (este) | 0 (handoff) | Doc handoff + actualización sprint plan. Doc-only. |

**Cobertura backend:** 198/198 unit verde. **Lint backend + frontend:** verdes (frontend 49 warnings preexistentes DC.6 que Fase E cierra).

---

## 11. Pregunta abierta para Yasmin (Fase E primera sesión)

Antes del primer commit de Fase E, validar smoke test backend (sección 6.3 arriba) con backend up. Si los 3 curl funcionan como esperado:
- Login devuelve `{access_token, refresh_token, expires_in, user, session_id?}`.
- WS token devuelve `{token, expiresIn:60}`.
- Replay detection: primer refresh OK, segundo 401.

Si **alguno falla**, NO empezar Fase E hasta resolver. Causa más probable: bug IPv6 documentado en sección 12.

---

## 12. Bug crítico descubierto durante el smoke test (2026-05-03 18:30)

### Síntoma
- `pnpm seed` falla con `Server has closed the connection` / `ConnectionClosed` en la primera query Prisma.
- `pnpm dev` (backend) falla en `OutboxWorker.onModuleInit` con el mismo error.
- Ambos errores se atribuían inicialmente al adapter `@prisma/adapter-pg@7.7.0` (Prisma 7 cambió bastante el connector pg).

### Causa raíz real (descubierta tras ECONNRESET en `node + pg` puro)
- **Resolución `localhost` → IPv6 en Windows.** `localhost` en Windows resuelve preferentemente a `::1` (IPv6).
- Docker Desktop publica el puerto postgres en `0.0.0.0:5432` Y `[::]:5432`, pero algún componente intermedio (Windows Defender Firewall, WSL2 NAT shim, o el propio docker-compose v2 en Windows) **corta la conexión IPv6 → contenedor postgres** antes de que postgres registre nada en sus logs.
- TCP conecta (raw socket OK), pero el handshake postgres recibe `ECONNRESET` inmediato.
- **Verificado:** `node -e "Client({host:'127.0.0.1'...})"` conecta perfectamente. `node -e "Client({host:'localhost'...})"` falla con ECONNRESET.

### Fix de 1 línea en `.env`

```diff
- DATABASE_URL=postgresql://aelium:aelium_dev_2026@localhost:5432/aelium_dashboard?schema=public
+ DATABASE_URL=postgresql://aelium:aelium_dev_2026@127.0.0.1:5432/aelium_dashboard?schema=public
```

**Aplicar también a:** `REDIS_HOST=localhost` → `REDIS_HOST=127.0.0.1` por consistencia (no se ha verificado si el cliente ioredis tiene el mismo síntoma, pero IPv4 explícito es defensa preventiva).

### Smoke test verificado tras el fix
- `pnpm seed` con `DATABASE_URL` IPv4 override → 7 roles + 6 cuentas demo + datos sample sembrados sin errores.
- DB tras reset + seed contiene los 6 usuarios canónicos (`cliente@aelium.test`, `agent.full@aelium.test`, etc. con passwords `Cliente2026!`, `AgentFull2026!`, etc.).
- Migración `sprint13auth_session_replay_detection` aplicada — schema `sessions` tiene `used_at`, `replaced_by_session_id`, `revoked_reason`, `sessions_used_at_idx` verificado vía `\d sessions`.

### Smoke HTTP del Sprint (pendiente de Yasmin tras aplicar fix `.env`)
Una vez con `.env` actualizado + backend levantado (`pnpm dev`):

```bash
# 1. Login flow (debe devolver body JSON con tokens, NO Set-Cookie):
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"cliente@aelium.test","password":"Cliente2026!"}'

# 2. WS token (con Authorization extraído del paso 1):
TOKEN=<copy access_token>
curl -X POST http://localhost:3001/api/v1/auth/ws-token \
  -H "Authorization: Bearer $TOKEN"
# Esperado: {"token":"...","expiresIn":60}

# 3. Replay detection (refresh dos veces seguidas):
REFRESH=<copy refresh_token>
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}"
# Esperado primera vez: par nuevo + session_id.
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH\"}"
# Esperado segunda vez: HTTP 401 + body con "Sesión comprometida" + alerta superadmin.
```

### Estado actual de la DB local (post-handoff)
- Schema completo y al día con la migración Sprint 13 §13.AUTH.B aplicada.
- 7 roles + 6 cuentas demo + 1 cliente + 2 productos + 2 facturas + 2 conversaciones + 1 suscripción Support Inside + 2 notas demo.
- `pnpm seed` futuro funciona si `.env` apunta a `127.0.0.1`.

### Recomendación profesional para registrar este hallazgo
Añadir al backlog (`backlog.md`) como **DC nueva** (DC.39 o siguiente número libre) titulada *"Migrar `localhost` → `127.0.0.1` en `.env` por IPv6 connection refusal en Windows + Docker Desktop"*. Trigger: aplicar fix de 1 línea en `.env`. NO ADR (es config local de devs Windows; en Linux/Mac/CI el bug no aplica).

---

> **Cierre canónico:** este documento es la fuente de verdad para el siguiente agente. Junto con `current.md §Sprint 13 §13.AUTH`, `ADR-078 Amendment A1`, los 4 commits ya en rama, este handoff y la sección 12 de bug + fix, no debería necesitar reexplorar nada del backend ni redescubrir el alcance del frontend.
