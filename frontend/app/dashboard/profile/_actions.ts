'use server';

import { revalidatePath } from 'next/cache';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════════════════════════════════════════
   Server Actions — cuenta self-service (ADR-085, Modelo A).
   Todo self-scoped por el JWT (cookie httpOnly); el backend deriva el userId.
   Backend: /account/* (auth) + /auth/sessions + /account/billing-profiles.
   ═══════════════════════════════════════════════════════════════════════════ */

const PROFILE_PATH = '/dashboard/profile';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  return {
    ok: false,
    error: err instanceof ServerFetchError ? err.message : fallback,
  };
}

/* ── Tipos ── */

export interface AccountMe {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  status: string;
  email_verified_at: string | null;
  avatar_url: string | null;
  language: string;
  timezone: string;
  two_factor_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  role: { slug: string; name: string };
}

export interface AccountSession {
  id: string;
  ip_address: string | null;
  device_label: string | null;
  user_agent: string | null;
  last_used_at: string | null;
  created_at: string;
}

export type BillingProfileType = 'personal' | 'autonomo' | 'empresa';

export interface BillingProfile {
  id: string;
  type: BillingProfileType;
  label: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  nif_cif: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

export interface BillingProfileInput {
  type: BillingProfileType;
  label: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  nif_cif?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  postal_code: string;
  country?: string;
  is_default?: boolean;
}

/* ── Cuenta (identidad) ── */

export type UpdateAccountInput = Partial<
  Pick<AccountMe, 'first_name' | 'last_name' | 'language' | 'timezone'>
>;

export async function updateAccountProfileAction(
  input: UpdateAccountInput,
): Promise<ActionResult<AccountMe>> {
  try {
    const data = await serverFetch<AccountMe>('/account/profile', {
      method: 'PATCH',
      body: input,
    });
    revalidatePath(PROFILE_PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo guardar tu perfil.');
  }
}

/* ── Seguridad ── */

export async function changePasswordAction(input: {
  current_password: string;
  new_password: string;
}): Promise<ActionResult<{ message: string }>> {
  try {
    const data = await serverFetch<{ message: string }>(
      '/account/change-password',
      { method: 'POST', body: input },
    );
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo cambiar la contraseña.');
  }
}

export async function set2faAction(
  enable: boolean,
  password: string,
): Promise<ActionResult<{ two_factor_enabled: boolean; message: string }>> {
  try {
    const data = await serverFetch<{
      two_factor_enabled: boolean;
      message: string;
    }>(`/account/2fa/${enable ? 'enable' : 'disable'}`, {
      method: 'POST',
      body: { password },
    });
    revalidatePath(PROFILE_PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo actualizar la verificación en dos pasos.');
  }
}

export async function revokeSessionAction(
  id: string,
): Promise<ActionResult<{ message: string }>> {
  try {
    const data = await serverFetch<{ message: string }>(
      `/auth/sessions/${id}`,
      { method: 'DELETE' },
    );
    revalidatePath(PROFILE_PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo cerrar la sesión.');
  }
}

export async function logoutAllAction(): Promise<
  ActionResult<{ revoked: number; message: string }>
> {
  try {
    const data = await serverFetch<{ revoked: number; message: string }>(
      '/account/logout-all',
      { method: 'POST' },
    );
    revalidatePath(PROFILE_PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudieron cerrar las sesiones.');
  }
}

/* ── Facturación (perfiles) ── */

export async function createBillingProfileAction(
  input: BillingProfileInput,
): Promise<ActionResult<BillingProfile>> {
  try {
    const data = await serverFetch<BillingProfile>('/account/billing-profiles', {
      method: 'POST',
      body: input,
    });
    revalidatePath(PROFILE_PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo crear el perfil de facturación.');
  }
}

export async function updateBillingProfileAction(
  id: string,
  input: Partial<BillingProfileInput>,
): Promise<ActionResult<BillingProfile>> {
  try {
    const data = await serverFetch<BillingProfile>(
      `/account/billing-profiles/${id}`,
      { method: 'PATCH', body: input },
    );
    revalidatePath(PROFILE_PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo actualizar el perfil de facturación.');
  }
}

export async function deleteBillingProfileAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    await serverFetch<unknown>(`/account/billing-profiles/${id}`, {
      method: 'DELETE',
    });
    revalidatePath(PROFILE_PATH);
    return { ok: true, data: { id } };
  } catch (err) {
    return fail(err, 'No se pudo eliminar el perfil de facturación.');
  }
}

export async function setDefaultBillingProfileAction(
  id: string,
): Promise<ActionResult<BillingProfile>> {
  try {
    const data = await serverFetch<BillingProfile>(
      `/account/billing-profiles/${id}/default`,
      { method: 'PATCH' },
    );
    revalidatePath(PROFILE_PATH);
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo marcar como predeterminado.');
  }
}
