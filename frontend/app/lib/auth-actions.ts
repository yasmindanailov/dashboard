'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import {
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  readAccessToken,
} from './server-auth';

/**
 * Server Actions de autenticación — Sprint 13 §13.AUTH Fase D (2026-05-03).
 *
 * Doctrina Modelo A (ADR-078 Amendment A1):
 *   - Estas actions corren server-side (Next.js).
 *   - Llaman al backend NestJS via fetch (body JSON).
 *   - Reciben el par de tokens en el body de respuesta.
 *   - Setean cookies httpOnly del dominio Next.js (cookie nunca llega al
 *     cliente JS — XSS no las puede leer).
 *   - El backend NO setea cookies (preserva stateless body JSON).
 *
 * CSRF: las Server Actions de Next.js firman cada action ID con un secret
 * derivado de NEXT_RUNTIME_SECRET; un atacante cross-origin no puede invocar
 * estas funciones aunque conozca su existencia. Cero middleware CSRF backend
 * necesario (Amendment A1 §1.5).
 *
 * Patrón canónico de uso desde Client Component:
 *   ```tsx
 *   'use client';
 *   import { useActionState } from 'react';
 *   import { loginAction } from '@/app/lib/auth-actions';
 *
 *   export function LoginForm() {
 *     const [state, action, pending] = useActionState(loginAction, null);
 *     return <form action={action}>...</form>;
 *   }
 *   ```
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001/api/v1';

const ACCESS_MAX_AGE = 60 * 15; // 15 min — alineado con auth.access_token_expires_minutes default
const REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7 días — alineado con auth.refresh_token_expires_days default
const COOKIE_OPTS_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

/**
 * Forma del response de `/auth/login` y `/auth/verify-2fa` cuando completan
 * (devuelve par de tokens). Cuando login pide 2FA, devuelve la otra variante.
 */
interface AuthCompleteResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    first_name: string;
    role: { slug: string };
  };
}

interface Login2faPendingResponse {
  requires_2fa: true;
  temp_token: string;
  message: string;
}

type LoginResponseBody = AuthCompleteResponse | Login2faPendingResponse;

export interface LoginActionState {
  ok?: false;
  error?: string;
  /** Si el login devolvió temp_token (2FA), lo expone para que la UI navegue al paso 2. */
  requires2fa?: { temp_token: string };
}

interface BackendErrorBody {
  message?: string;
  statusCode?: number;
}

async function backendCall<T>(
  path: string,
  body: unknown,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      ...init,
    });
  } catch {
    return { ok: false, status: 0, error: 'Error de conexión con el servidor.' };
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!res.ok) {
    const message =
      (parsed as BackendErrorBody | undefined)?.message ?? `Error ${res.status}`;
    return { ok: false, status: res.status, error: message };
  }
  return { ok: true, data: parsed as T };
}

/**
 * Setea las cookies httpOnly tras un login/verify-2fa/refresh exitoso.
 * Centralizado para evitar drift entre actions.
 */
async function setAuthCookies(tokens: {
  access_token: string;
  refresh_token: string;
}): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_ACCESS, tokens.access_token, {
    ...COOKIE_OPTS_BASE,
    maxAge: ACCESS_MAX_AGE,
  });
  store.set(COOKIE_REFRESH, tokens.refresh_token, {
    ...COOKIE_OPTS_BASE,
    maxAge: REFRESH_MAX_AGE,
  });
}

async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_ACCESS);
  store.delete(COOKIE_REFRESH);
}

/**
 * loginAction — flow completo de login (paso 1: email + password).
 *
 * Si el rol no requiere 2FA → setea cookies + redirect al landing.
 * Si requiere 2FA → expone `temp_token` en el state para que la UI navegue a
 * la página de 2FA (que usa `verify2faAction`).
 */
export async function loginAction(
  _prevState: LoginActionState | null,
  formData: FormData,
): Promise<LoginActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { ok: false, error: 'Email y contraseña son obligatorios.' };
  }

  const result = await backendCall<LoginResponseBody>('/auth/login', {
    email,
    password,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  if ('requires_2fa' in result.data) {
    return { requires2fa: { temp_token: result.data.temp_token } };
  }

  // Modelo A: fijamos las cookies httpOnly server-side y redirigimos a `/welcome`
  // (pantalla de bienvenida autenticada que saluda por nombre y auto-navega al
  // panel). NO redirigimos directo al landing para que el saludo del mockup se
  // vea; `/welcome` lee el nombre de la sesión (sin exponer tokens al cliente).
  await setAuthCookies(result.data);
  redirect('/welcome');
}

export interface Verify2faActionState {
  ok?: false;
  error?: string;
}

/**
 * verify2faAction — flow paso 2 del 2FA. Recibe `code` + `temp_token` por
 * formData (el componente UI guarda el `temp_token` del state previo en un
 * `<input type="hidden">`).
 */
export async function verify2faAction(
  _prevState: Verify2faActionState | null,
  formData: FormData,
): Promise<Verify2faActionState> {
  const code = String(formData.get('code') ?? '').trim();
  const tempToken = String(formData.get('temp_token') ?? '');

  if (!code || !tempToken) {
    return { ok: false, error: 'Código y token temporal obligatorios.' };
  }

  const result = await backendCall<AuthCompleteResponse>('/auth/verify-2fa', {
    code,
    temp_token: tempToken,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  await setAuthCookies(result.data);
  redirect('/welcome');
}

export interface Resend2faActionState {
  ok?: boolean;
  error?: string;
  /** Nuevo `temp_token` (ventana 2FA renovada) para usar en el verify siguiente. */
  tempToken?: string;
}

/**
 * resend2faAction — reenvía el código 2FA. El backend regenera el código, lo
 * reenvía por email y devuelve un `temp_token` fresco. El form debe adoptar ese
 * token nuevo para el verify posterior.
 */
export async function resend2faAction(
  _prevState: Resend2faActionState | null,
  formData: FormData,
): Promise<Resend2faActionState> {
  const tempToken = String(formData.get('temp_token') ?? '');
  if (!tempToken) {
    return { ok: false, error: 'Falta el token temporal. Inicia sesión de nuevo.' };
  }
  const result = await backendCall<Login2faPendingResponse>('/auth/resend-2fa', {
    temp_token: tempToken,
  });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { ok: true, tempToken: result.data.temp_token };
}

/**
 * logoutAction — invalida sesión backend + limpia cookies + redirect a `/`.
 * Idempotente: si el backend rechaza (sesión ya cerrada), igualmente limpia
 * cookies (UX consistente — cliente ve "sesión cerrada" sin importar cuál).
 */
export async function logoutAction(): Promise<void> {
  const accessToken = await readAccessToken();
  if (accessToken) {
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
    } catch {
      // Network down. Aceptado: igualmente limpiamos cookies.
    }
  }
  await clearAuthCookies();
  redirect('/');
}

export interface RefreshActionResult {
  ok: boolean;
}

/**
 * refreshAction — rota el par de tokens. Llama POST /auth/refresh con el
 * refresh token desde cookie en body. Si éxito → setea cookies nuevas y
 * devuelve `{ ok: true }`. Si falla → limpia cookies (sesión muerta).
 *
 * NO redirige (devuelve result al caller, que decide). Usado por
 * Client Components que detectan 401 en una request en curso y quieren
 * intentar rotación antes de cerrar sesión.
 */
export async function refreshAction(): Promise<RefreshActionResult> {
  const store = await cookies();
  const refreshToken = store.get(COOKIE_REFRESH)?.value;
  if (!refreshToken) {
    await clearAuthCookies();
    return { ok: false };
  }

  const result = await backendCall<AuthCompleteResponse>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  if (!result.ok) {
    await clearAuthCookies();
    return { ok: false };
  }

  await setAuthCookies(result.data);
  return { ok: true };
}

/**
 * getWsTokenAction — token efímero (60s) para handshake socket.io.
 *
 * Llamada por el Client Component que monta el socket (ChatWidget,
 * SupportPanel, etc.) ANTES de invocar `io({ auth: { token } })`. La cookie
 * httpOnly Next.js no es accesible al socket.io-client del cliente JS, por
 * eso este Server Action es la única vía canónica (Amendment A1 §6).
 */
export async function getWsTokenAction(): Promise<{ token: string; expiresIn: number } | null> {
  const accessToken = await readAccessToken();
  if (!accessToken) return null;

  try {
    const res = await fetch(`${BACKEND_URL}/auth/ws-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as { token: string; expiresIn: number };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Public flows (no auth required) — register, forgot, reset, verifyEmail
// ─────────────────────────────────────────────────────────────────────────

export type RegisterFieldError =
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'password'
  | 'company_name'
  | 'nif_cif'
  | 'address_line1'
  | 'city'
  | 'postal_code'
  | 'terms';

export interface RegisterActionState {
  ok?: false;
  error?: string;
  fieldErrors?: Partial<Record<RegisterFieldError, string>>;
  success?: { user_id: string; message: string };
}

export async function registerAction(
  _prevState: RegisterActionState | null,
  formData: FormData,
): Promise<RegisterActionState> {
  const first_name = String(formData.get('first_name') ?? '').trim();
  const last_name = String(formData.get('last_name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const phone = String(formData.get('phone') ?? '').trim();
  const account_type = String(formData.get('account_type') ?? 'personal');
  const company_name = String(formData.get('company_name') ?? '').trim();
  const nif_cif = String(formData.get('nif_cif') ?? '').trim();
  const address_line1 = String(formData.get('address_line1') ?? '').trim();
  const city = String(formData.get('city') ?? '').trim();
  const postal_code = String(formData.get('postal_code') ?? '').trim();
  const country = String(formData.get('country') ?? 'ES');
  const terms_accepted = formData.get('terms_accepted') === 'true';

  const isFiscal = account_type === 'autonomo' || account_type === 'empresa';

  const fieldErrors: RegisterActionState['fieldErrors'] = {};
  if (first_name.length < 2) fieldErrors.first_name = 'Mínimo 2 caracteres.';
  if (last_name.length < 2) fieldErrors.last_name = 'Mínimo 2 caracteres.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fieldErrors.email = 'Email inválido.';
  if (
    password.length < 8 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    fieldErrors.password =
      'Mínimo 8 caracteres con mayúscula, minúscula y número.';
  }
  // Validación fiscal condicional (espejo del RegisterDto del backend).
  if (account_type === 'empresa' && !company_name)
    fieldErrors.company_name = 'La razón social es obligatoria para empresas.';
  if (isFiscal && !nif_cif)
    fieldErrors.nif_cif = 'El NIF/CIF es obligatorio.';
  if (isFiscal && !address_line1)
    fieldErrors.address_line1 = 'La dirección fiscal es obligatoria.';
  if (isFiscal && !city) fieldErrors.city = 'La ciudad es obligatoria.';
  if (isFiscal && !postal_code)
    fieldErrors.postal_code = 'El código postal es obligatorio.';
  if (!terms_accepted)
    fieldErrors.terms =
      'Acepta los términos del servicio y la política de privacidad.';

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const result = await backendCall<{ user_id: string; message: string }>(
    '/auth/register',
    {
      first_name,
      last_name,
      email,
      password,
      phone: phone || undefined,
      account_type,
      company_name: company_name || undefined,
      nif_cif: nif_cif || undefined,
      address_line1: address_line1 || undefined,
      city: city || undefined,
      postal_code: postal_code || undefined,
      country,
      terms_accepted,
    },
  );
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  return { success: result.data };
}

export interface SimpleAuthActionState {
  ok?: false;
  error?: string;
  success?: { message: string };
}

export async function forgotPasswordAction(
  _prevState: SimpleAuthActionState | null,
  formData: FormData,
): Promise<SimpleAuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email obligatorio.' };

  const result = await backendCall<{ message: string }>(
    '/auth/forgot-password',
    { email },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { success: result.data };
}

export async function resetPasswordAction(
  _prevState: SimpleAuthActionState | null,
  formData: FormData,
): Promise<SimpleAuthActionState> {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!token || !password)
    return { ok: false, error: 'Token y contraseña obligatorios.' };

  const result = await backendCall<{ message: string }>(
    '/auth/reset-password',
    { token, password },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { success: result.data };
}

export async function verifyEmailAction(
  token: string,
): Promise<SimpleAuthActionState> {
  if (!token) return { ok: false, error: 'Token obligatorio.' };
  const result = await backendCall<{ message: string }>(
    '/auth/verify-email',
    { token },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { success: result.data };
}

export async function resendVerificationAction(
  _prevState: SimpleAuthActionState | null,
  formData: FormData,
): Promise<SimpleAuthActionState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'Email obligatorio.' };

  const result = await backendCall<{ message: string }>(
    '/auth/resend-verification',
    { email },
  );
  if (!result.ok) return { ok: false, error: result.error };
  return { success: result.data };
}
