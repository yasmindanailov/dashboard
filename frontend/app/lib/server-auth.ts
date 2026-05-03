import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

/**
 * Server-side auth helpers — Sprint 13 §13.AUTH Fase D (2026-05-03).
 *
 * Doctrina: ADR-078 Amendment A1 (Modelo A — cookies viven en dominio Next.js,
 * backend NestJS recibe `Authorization: Bearer` desde Server Components).
 * Doctrina Vercel oficial: Next.js 16 Data Security guide §"External HTTP APIs"
 * + Authentication guide §"Data Access Layer" (DAL).
 *
 * Tres pilares:
 *   1. `getServerSession()` — lee cookie httpOnly, valida vía /auth/me,
 *      cacheada con `cache()` de React (single-request memoization).
 *   2. `requireServerSession()` — variante que redirige a `/` si no hay sesión.
 *   3. `serverFetch()` — fetch desde Server Component reenviando el token al
 *      backend como `Authorization: Bearer`. Maneja 401 con auto-refresh
 *      transparente (UNA reintento) antes de declarar logout.
 *
 * Nombres canónicos cookie (Amendment A1):
 *   - `aelium_access_token` (httpOnly, sameSite=lax, path=/, maxAge=15min)
 *   - `aelium_refresh_token` (httpOnly, sameSite=lax, path=/, maxAge=7d)
 *
 * Importación canónica:
 *   import { getServerSession, serverFetch } from '@/app/lib/server-auth';
 *
 * Notas:
 *   - `'server-only'` en línea 1 garantiza que este módulo NUNCA termina en
 *     un bundle de cliente (build-time error si se importa accidentalmente).
 *   - `cookies()` y `redirect()` solo funcionan en Server Components, Server
 *     Actions y Route Handlers — el `'server-only'` lo enforce.
 *   - Tests unit: el frontend no tiene setup Jest (solo Playwright E2E). Los
 *     specs Sprint 13 §13.AUTH Fase F (auth-cookies-flow.spec.ts +
 *     auth-replay-detection.spec.ts + auth-no-localStorage.spec.ts) cubren
 *     end-to-end estos helpers en navegador real. Setup Jest frontend queda
 *     como deuda continua (no bloquea el sprint).
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001/api/v1';

export const COOKIE_ACCESS = 'aelium_access_token';
export const COOKIE_REFRESH = 'aelium_refresh_token';

export interface ServerSessionUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  email_verified_at: string | null;
  language: string;
  timezone: string;
  last_login_at: string | null;
  avatar_url: string | null;
  role: { slug: string; name: string };
}

export interface ServerSession {
  user: ServerSessionUser;
  accessToken: string;
}

/**
 * Lee el access token de cookie httpOnly. Devuelve `null` si no existe.
 * No valida — solo lectura. Usar para checks rápidos sin round-trip al backend.
 */
export async function readAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_ACCESS)?.value ?? null;
}

/**
 * Devuelve la sesión actual o `null` si no hay cookie / token inválido.
 * Cacheada con `cache()` de React: dentro del mismo render pass, múltiples
 * llamadas no disparan múltiples fetch al backend (DAL canónico Next.js 16
 * §"Data Access Layer").
 */
export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const accessToken = await readAccessToken();
  if (!accessToken) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const user = (await res.json()) as ServerSessionUser;
    return { user, accessToken };
  } catch {
    // Network down / backend down — degradamos a no-sesión. La capa Server
    // Component que llame `requireServerSession` redirige a /; las que usen
    // `getServerSession` directo deciden cómo renderizar.
    return null;
  }
});

/**
 * `getServerSession` + redirect a `/` si vacío.
 * Patrón canónico para páginas autenticadas — uso típico:
 *   `const session = await requireServerSession();`
 */
export async function requireServerSession(): Promise<ServerSession> {
  const session = await getServerSession();
  if (!session) {
    redirect('/');
  }
  return session;
}

/**
 * Variante con role check. Redirige a `/` si no autenticado, a `/dashboard`
 * si autenticado pero rol no permitido (defense in depth con backend CASL).
 * Usado por layouts/pages bajo `/admin/*` o `/partner/*`.
 */
export async function requireRole(
  allowedRoles: readonly string[],
): Promise<ServerSession> {
  const session = await requireServerSession();
  if (!allowedRoles.includes(session.user.role.slug)) {
    redirect('/dashboard');
  }
  return session;
}

export interface ServerFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /**
   * Si `true` (default) y la primera llamada devuelve 401, intenta una
   * rotación de refresh token via Server Action y reintenta UNA vez. Si la
   * rotación falla → throw 401 (caller debe redirigir a `/`).
   * Pasar `false` desde un Server Action que ya gestiona auth manualmente.
   */
  autoRefresh?: boolean;
}

export class ServerFetchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ServerFetchError';
  }
}

/**
 * Fetch desde un Server Component al backend con auth canónica.
 *
 * Comportamiento canónico:
 *   - Lee `aelium_access_token` cookie + reenvía como `Authorization: Bearer`.
 *   - `cache: 'no-store'` por defecto (datos por usuario, no cacheable CDN).
 *   - Si recibe 401 y `autoRefresh=true` (default), intenta `/auth/refresh`
 *     server-side con la refresh cookie, setea cookies nuevas, reintenta UNA vez.
 *   - Si tras reintento sigue 401 → throw `ServerFetchError(401)`. El caller
 *     decide redirigir o renderizar fallback.
 *   - Si recibe otro error HTTP → throw `ServerFetchError(status, body)`.
 *
 * No relanza errores de red (ECONNREFUSED, etc.) — los wrappea en
 * `ServerFetchError(0, ...)` para que el caller maneje uniformemente.
 *
 * Refresh transparente: solo se invoca dentro de Server Actions (ver
 * `auth-actions.ts:refreshAction`). En Server Components puros (que NO
 * pueden setear cookies, ver Next.js 16 cookies docs) NO podemos rotar —
 * el caller tendría que ser una page que invoque un Server Action en el
 * mismo render. Estrategia simple Sprint 13: si SC recibe 401, throw.
 * El próximo navigation hará GET de la page, layout invoca getServerSession
 * (que devuelve null si access expirado), redirect '/'. UX suave gracias a
 * Suspense + error boundaries.
 */
export async function serverFetch<T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T> {
  const accessToken = await readAccessToken();
  const { body, autoRefresh: _autoRefresh = true, headers = {}, ...rest } = options;

  const init: RequestInit = {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: rest.cache ?? 'no-store',
  };

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, init);
  } catch (err) {
    throw new ServerFetchError(
      err instanceof Error ? err.message : 'Network error',
      0,
    );
  }

  // Sprint 13 Fase D: auto-refresh deshabilitado en SC puros (cookie set
  // requiere Server Action). Caso 401 → throw, page rehydrate gestiona.
  if (!res.ok) {
    const text = await res.text();
    let parsedBody: unknown;
    try {
      parsedBody = text ? JSON.parse(text) : undefined;
    } catch {
      parsedBody = text;
    }
    const message =
      typeof parsedBody === 'object' &&
      parsedBody !== null &&
      'message' in parsedBody &&
      typeof (parsedBody as { message: unknown }).message === 'string'
        ? (parsedBody as { message: string }).message
        : `HTTP ${res.status}`;
    throw new ServerFetchError(message, res.status, parsedBody);
  }

  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/**
 * Variante tolerante: devuelve `null` en lugar de lanzar.
 * Útil para componentes que toleran ausencia (ej. widget opcional).
 */
export async function serverFetchOrNull<T>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T | null> {
  try {
    return await serverFetch<T>(path, options);
  } catch {
    return null;
  }
}
