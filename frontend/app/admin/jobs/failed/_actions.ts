'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/jobs/failed.
   Sprint 13 §13.AUTH Fase E (Modelo A).
   ═══════════════════════════════════════ */

export interface RetryJobActionResult {
  ok: boolean;
  error?: string;
}

export async function retryJobAction(
  id: string,
): Promise<RetryJobActionResult> {
  try {
    await serverFetch<{ retried: true }>(
      `/admin/jobs/${id}/retry`,
      { method: 'POST' },
    );
    revalidatePath('/admin/jobs/failed');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo reintentar el job',
    };
  }
}
