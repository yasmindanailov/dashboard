'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — /admin/products.
   Sprint 13 §13.AUTH Fase E (Modelo A).
   ═══════════════════════════════════════ */

export type ProductMutationResult = { ok: true } | { ok: false; error: string };

export async function toggleProductStatusAction(
  id: string,
): Promise<ProductMutationResult> {
  try {
    await serverFetch(`/admin/products/${id}/status`, { method: 'PATCH' });
    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${id}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cambiar el estado',
    };
  }
}
