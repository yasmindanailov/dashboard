'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/error-log.
   Sprint 13 §13.AUTH Fase E (Modelo A).
   ═══════════════════════════════════════ */

export interface ResolveErrorActionResult {
  ok: boolean;
  error?: string;
}

export async function resolveErrorAction(
  id: string,
): Promise<ResolveErrorActionResult> {
  try {
    await serverFetch<{ resolved: true }>(
      `/admin/error-log/${id}/resolve`,
      { method: 'PATCH' },
    );
    revalidatePath('/admin/error-log');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo marcar como resuelto',
    };
  }
}
