'use server';

import { revalidatePath } from 'next/cache';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/account-deletion (Modelo A).
   Revisión/ejecución de solicitudes de borrado (GL-5 / H3b.2). Superadmin.
   ═══════════════════════════════════════ */

export type AdminDeletionResult = { ok: true } | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  return {
    ok: false,
    error: err instanceof ServerFetchError ? err.message : fallback,
  };
}

/** Rechaza una solicitud pendiente con una nota. */
export async function rejectDeletionAction(
  id: string,
  note: string,
): Promise<AdminDeletionResult> {
  try {
    await serverFetch(`/admin/account-deletion-requests/${id}/reject`, {
      method: 'POST',
      body: { note },
    });
    revalidatePath('/admin/account-deletion');
    return { ok: true };
  } catch (err) {
    return fail(err, 'No se pudo rechazar la solicitud');
  }
}

/** Ejecuta el borrado (anonimización) de una solicitud pendiente. */
export async function executeDeletionAction(
  id: string,
): Promise<AdminDeletionResult> {
  try {
    await serverFetch(`/admin/account-deletion-requests/${id}/execute`, {
      method: 'POST',
    });
    revalidatePath('/admin/account-deletion');
    return { ok: true };
  } catch (err) {
    return fail(err, 'No se pudo ejecutar el borrado');
  }
}
