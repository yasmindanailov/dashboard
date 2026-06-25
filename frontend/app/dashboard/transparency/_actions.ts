'use server';

import { revalidatePath } from 'next/cache';

import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /dashboard/transparency (Modelo A).
   audit 2026-06-25 GL-5 / H3b.1 — portabilidad RGPD.
   ═══════════════════════════════════════ */

export type ExportMyDataResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export type DeletionStatus =
  | 'pending'
  | 'rejected'
  | 'completed'
  | 'cancelled';

export interface MyDeletionRequest {
  id: string;
  status: DeletionStatus;
  reason: string | null;
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
  completed_at: string | null;
}

export type DeletionActionResult =
  | { ok: true }
  | { ok: false; error: string };

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  return {
    ok: false,
    error: err instanceof ServerFetchError ? err.message : fallback,
  };
}

/**
 * Pide al backend el export JSON de TODOS los datos del usuario (self-scoped
 * por la sesión httpOnly; el backend deriva el userId del JWT). Devuelve el
 * objeto al cliente, que lo materializa como descarga (Blob) — así el token
 * nunca toca el navegador (Modelo A, R17).
 */
export async function exportMyDataAction(): Promise<ExportMyDataResult> {
  try {
    const data = await serverFetch<unknown>('/account/data-export');
    return { ok: true, data };
  } catch (err) {
    return fail(err, 'No se pudo generar la exportación de datos');
  }
}

/** Solicita el borrado de la cuenta (lo revisa y ejecuta un admin). */
export async function requestAccountDeletionAction(
  reason: string,
): Promise<DeletionActionResult> {
  try {
    await serverFetch('/account/deletion-request', {
      method: 'POST',
      body: { reason: reason.trim() || undefined },
    });
    revalidatePath('/dashboard/transparency');
    return { ok: true };
  } catch (err) {
    return fail(err, 'No se pudo registrar la solicitud de borrado');
  }
}

/** Cancela la solicitud de borrado pendiente. */
export async function cancelAccountDeletionAction(): Promise<DeletionActionResult> {
  try {
    await serverFetch('/account/deletion-request', { method: 'DELETE' });
    revalidatePath('/dashboard/transparency');
    return { ok: true };
  } catch (err) {
    return fail(err, 'No se pudo cancelar la solicitud');
  }
}
