'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';

/* ═══════════════════════════════════════
   Server Actions — _shared/notes (ExceptionalNoteModal).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).
   ═══════════════════════════════════════ */

export type CreateExceptionalNoteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createExceptionalNoteAction(
  clientId: string,
  data: { body: string; is_pinned?: boolean },
): Promise<CreateExceptionalNoteResult> {
  try {
    await serverFetch(`/admin/clients/${clientId}/structured-notes`, {
      method: 'POST',
      body: data,
    });
    revalidatePath(`/admin/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo crear la nota',
    };
  }
}
