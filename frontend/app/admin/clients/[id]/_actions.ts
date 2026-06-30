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

/* ── F4·U22 — acciones del header (kebab + Editar) ── */

export type ClientMutationResult = { ok: true } | { ok: false; error: string };

/** Suspende (`suspend=true`) o reactiva la CUENTA del cliente (bloquea login). */
export async function setClientSuspendedAction(
  clientId: string,
  suspend: boolean,
): Promise<ClientMutationResult> {
  try {
    await serverFetch(
      `/admin/clients/${clientId}/${suspend ? 'suspend' : 'unsuspend'}`,
      { method: 'POST' },
    );
    revalidatePath(`/admin/clients/${clientId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cambiar el estado de la cuenta',
    };
  }
}

/** Edita el perfil de cliente (`PATCH /admin/clients/:id`). */
export async function updateClientProfileAction(
  clientId: string,
  data: Record<string, string>,
): Promise<ClientMutationResult> {
  try {
    await serverFetch(`/admin/clients/${clientId}`, {
      method: 'PATCH',
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
          : 'No se pudo guardar el perfil',
    };
  }
}

export interface CheckoutProductOption {
  id: string;
  name: string;
  type: string;
  pricing: {
    id: string;
    billing_cycle: string;
    price: string;
    currency: string;
  }[];
}

export type ListCheckoutProductsResult =
  | { ok: true; products: CheckoutProductOption[] }
  | { ok: false; error: string };

/** Productos contratables (activos, con pricing) para el modal "Contratar". */
export async function listCheckoutProductsAction(): Promise<ListCheckoutProductsResult> {
  try {
    const res = await serverFetch<{ data: CheckoutProductOption[] }>(
      '/admin/products?status=active&limit=100',
    );
    const products = (res.data || []).filter((p) => p.pricing?.length > 0);
    return { ok: true, products };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar los productos',
    };
  }
}

/** Contrata un producto para el cliente (admin checkout `?targetUserId=`). */
export async function checkoutForClientAction(
  clientId: string,
  productPricingId: string,
): Promise<{ ok: true; invoiceId: string | null } | { ok: false; error: string }> {
  try {
    const res = await serverFetch<{ invoice_id?: string }>(
      `/billing/checkout?targetUserId=${clientId}`,
      { method: 'POST', body: { product_pricing_id: productPricingId } },
    );
    revalidatePath(`/admin/clients/${clientId}`);
    return { ok: true, invoiceId: res.invoice_id ?? null };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo contratar el servicio',
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
