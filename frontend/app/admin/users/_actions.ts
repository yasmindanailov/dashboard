'use server';

import { revalidatePath } from 'next/cache';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { StaffRole } from './types';

/* ═══════════════════════════════════════
   Server Actions — /admin/users (Modelo A).
   Gestión de cuentas de staff (GL-21). Solo superadmin (CASL `Manage.Agent`);
   el backend reaplica la autorización y las invariantes de seguridad.
   ═══════════════════════════════════════ */

export type StaffMutationResult = { ok: true } | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  return {
    ok: false,
    error: err instanceof ServerFetchError ? err.message : fallback,
  };
}

export async function createStaffAction(input: {
  email: string;
  first_name: string;
  last_name: string;
  role: StaffRole;
  password: string;
}): Promise<StaffMutationResult> {
  try {
    await serverFetch('/admin/users/staff', { method: 'POST', body: input });
    revalidatePath('/admin/users');
    return { ok: true };
  } catch (err) {
    return fail(err, 'No se pudo crear la cuenta');
  }
}

export async function updateStaffRoleAction(
  id: string,
  role: StaffRole,
): Promise<StaffMutationResult> {
  try {
    await serverFetch(`/admin/users/staff/${id}`, {
      method: 'PATCH',
      body: { role },
    });
    revalidatePath('/admin/users');
    return { ok: true };
  } catch (err) {
    return fail(err, 'No se pudo actualizar el rol');
  }
}

export async function setStaffStatusAction(
  id: string,
  status: 'active' | 'inactive',
): Promise<StaffMutationResult> {
  try {
    await serverFetch(`/admin/users/staff/${id}/status`, {
      method: 'PATCH',
      body: { status },
    });
    revalidatePath('/admin/users');
    return { ok: true };
  } catch (err) {
    return fail(err, 'No se pudo cambiar el estado');
  }
}
