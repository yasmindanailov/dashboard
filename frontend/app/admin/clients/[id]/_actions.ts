'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../../lib/server-auth';
import type {
  ClientNote,
  Conversation,
  NoteCategory,
  NoteSourceSystem,
  Pagination,
} from '../../../lib/types';

/* ═══════════════════════════════════════
   Server Actions — /admin/clients/[id].
   Sprint 13 §13.AUTH Fase E (Modelo A).
   ═══════════════════════════════════════ */

export type ListSupportResult =
  | { ok: true; chats: Conversation[]; tickets: Conversation[] }
  | { ok: false; error: string };

export async function listClientSupportAction(
  userId: string,
): Promise<ListSupportResult> {
  try {
    const [chats, tickets] = await Promise.all([
      serverFetch<Pagination<Conversation>>(
        `/support/chats?type=chat&user_id=${userId}&limit=50`,
      ),
      serverFetch<Pagination<Conversation>>(
        `/support/tickets?type=ticket&user_id=${userId}&limit=50`,
      ),
    ]);
    return {
      ok: true,
      chats: chats.data || [],
      tickets: tickets.data || [],
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar el historial de soporte',
    };
  }
}

export type ListNotesResult =
  | { ok: true; notes: ClientNote[] }
  | { ok: false; error: string };

export async function listClientNotesAction(
  userId: string,
  filters: {
    category?: NoteCategory | '';
    sourceSystem?: NoteSourceSystem | '';
    pinnedOnly?: boolean;
  },
): Promise<ListNotesResult> {
  const query = new URLSearchParams();
  query.set('limit', '100');
  if (filters.category) query.set('category', filters.category);
  if (filters.sourceSystem) query.set('source_system', filters.sourceSystem);
  if (filters.pinnedOnly) query.set('pinned_only', 'true');
  try {
    const res = await serverFetch<Pagination<ClientNote>>(
      `/admin/clients/${userId}/structured-notes?${query.toString()}`,
    );
    return { ok: true, notes: res.data || [] };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar las notas',
    };
  }
}

export type NoteMutationResult = { ok: true } | { ok: false; error: string };

export async function toggleNotePinAction(
  noteId: string,
  clientId: string,
): Promise<NoteMutationResult> {
  try {
    await serverFetch(`/admin/clients/notes/${noteId}/pin`, {
      method: 'PATCH',
    });
    revalidatePath(`/admin/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cambiar el pin de la nota',
    };
  }
}

export type CreateNoteResult =
  | { ok: true }
  | { ok: false; error: string };

export async function createExceptionalNoteAction(
  clientId: string,
  data: { body: string; is_pinned?: boolean },
): Promise<CreateNoteResult> {
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
