'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { Client, Pagination } from '../../lib/types';
import type { Ticket, TicketStats } from './types';

/* ═══════════════════════════════════════
   Server Actions — _shared/support (useTicketInbox + helpers).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).
   ═══════════════════════════════════════ */

export type ListTicketsResult =
  | { ok: true; tickets: Ticket[]; totalPages: number }
  | { ok: false; error: string };

export async function listTicketsAction(filters: {
  page: number;
  limit: number;
  status?: string;
  category?: string;
  search?: string;
}): Promise<ListTicketsResult> {
  const query = new URLSearchParams();
  query.set('type', 'ticket');
  query.set('page', String(filters.page));
  query.set('limit', String(filters.limit));
  if (filters.status) query.set('status', filters.status);
  if (filters.category) query.set('category', filters.category);
  if (filters.search) query.set('search', filters.search);

  try {
    const res = await serverFetch<Pagination<Ticket>>(
      `/support/tickets?${query.toString()}`,
    );
    return {
      ok: true,
      tickets: res.data,
      totalPages: res.meta?.total_pages ?? 1,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar los tickets',
    };
  }
}

export type TicketStatsResult =
  | { ok: true; stats: TicketStats }
  | { ok: false; error: string };

export async function getTicketStatsAction(): Promise<TicketStatsResult> {
  try {
    const stats = await serverFetch<TicketStats>(
      '/support/conversations/stats?type=ticket',
    );
    return { ok: true, stats };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar las estadísticas',
    };
  }
}

export type CreateTicketResult = { ok: true } | { ok: false; error: string };

export async function createTicketAction(
  data: { subject: string; body: string; category: string; priority?: string },
  targetUserId?: string,
): Promise<CreateTicketResult> {
  const qs = targetUserId ? `?targetUserId=${targetUserId}` : '';
  try {
    await serverFetch(`/support/tickets${qs}`, { method: 'POST', body: data });
    revalidatePath('/admin/support');
    revalidatePath('/dashboard/support');
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo crear el ticket',
    };
  }
}

export type SearchClientsResult =
  | { ok: true; clients: Client[] }
  | { ok: false; error: string };

export async function searchClientsAction(
  searchTerm: string,
): Promise<SearchClientsResult> {
  if (searchTerm.length < 2) return { ok: true, clients: [] };
  try {
    const res = await serverFetch<Pagination<Client>>(
      `/admin/clients?search=${encodeURIComponent(searchTerm)}&limit=10`,
    );
    return { ok: true, clients: res.data || [] };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron buscar clientes',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Conversation detail Server Actions (useConversationDetail).
// ─────────────────────────────────────────────────────────────────────────

import type { ConversationDetail } from './conversation/types';
import type { ClientNote, Service } from '../../lib/types';

export type GetConversationResult =
  | { ok: true; conversation: ConversationDetail }
  | { ok: false; error: string };

export async function getConversationAction(
  conversationId: string,
): Promise<GetConversationResult> {
  try {
    const conversation = await serverFetch<ConversationDetail>(
      `/support/conversations/${conversationId}`,
    );
    return { ok: true, conversation };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar la conversación',
    };
  }
}

export type ConversationMutationResult = { ok: true } | { ok: false; error: string };

export async function addMessageAction(
  conversationId: string,
  body: string,
  isInternal = false,
): Promise<ConversationMutationResult> {
  try {
    await serverFetch(
      `/support/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        body: { body, is_internal: isInternal },
      },
    );
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo enviar el mensaje',
    };
  }
}

export async function updateConversationAction(
  conversationId: string,
  patch: {
    status?: string;
    priority?: string;
    category?: string;
    assigned_agent_id?: string | null;
    resolution_note?: string;
    tags?: string[];
  },
): Promise<ConversationMutationResult> {
  try {
    await serverFetch(`/support/conversations/${conversationId}`, {
      method: 'PATCH',
      body: patch,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo actualizar la conversación',
    };
  }
}

export async function escalateChatToTicketAction(
  chatId: string,
  data: { category: string; agent_notes?: string; subject?: string; priority?: string },
): Promise<ConversationMutationResult> {
  try {
    await serverFetch(`/support/chats/${chatId}/escalate`, {
      method: 'POST',
      body: data,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo escalar el chat',
    };
  }
}

export interface ConversationClientContext {
  client: Client | null;
  notes: ClientNote[];
  services: Service[];
}

export type ClientContextResult =
  | { ok: true; context: ConversationClientContext }
  | { ok: false; error: string };

export async function getConversationClientContextAction(
  userId: string,
): Promise<ClientContextResult> {
  try {
    const [client, notesRes, servicesRes] = await Promise.all([
      serverFetch<Client>(`/admin/clients/${userId}`).catch(() => null),
      serverFetch<Pagination<ClientNote>>(
        `/admin/clients/${userId}/structured-notes?limit=5`,
      ).catch(() => ({ data: [] as ClientNote[] }) as Pagination<ClientNote>),
      serverFetch<Pagination<Service>>(
        `/services?user_id=${userId}&limit=5`,
      ).catch(() => ({ data: [] as Service[] }) as Pagination<Service>),
    ]);
    return {
      ok: true,
      context: {
        client,
        notes: notesRes?.data ?? [],
        services: servicesRes?.data ?? [],
      },
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar el contexto del cliente',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Chat panel Server Actions (admin/support/chats useChatPanel).
// ─────────────────────────────────────────────────────────────────────────

import type { Chat } from '../../admin/support/chats/types';

export type ListChatsResult =
  | { ok: true; chats: Chat[] }
  | { ok: false; error: string };

export async function listChatsAction(filters: {
  limit?: number;
  search?: string;
}): Promise<ListChatsResult> {
  const query = new URLSearchParams();
  query.set('type', 'chat');
  query.set('limit', String(filters.limit ?? 50));
  if (filters.search) query.set('search', filters.search);
  try {
    const res = await serverFetch<Pagination<Chat>>(
      `/support/chats?${query.toString()}`,
    );
    return { ok: true, chats: res.data || [] };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar los chats',
    };
  }
}

export type GetChatResult =
  | { ok: true; chat: Chat }
  | { ok: false; error: string };

export async function getChatAction(chatId: string): Promise<GetChatResult> {
  try {
    const chat = await serverFetch<Chat>(`/support/conversations/${chatId}`);
    return { ok: true, chat };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar el chat',
    };
  }
}

export async function linkGuestToClientAction(
  conversationId: string,
  userId: string,
): Promise<ConversationMutationResult> {
  try {
    await serverFetch(`/support/conversations/${conversationId}/link-client`, {
      method: 'PATCH',
      body: { user_id: userId },
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo vincular el cliente',
    };
  }
}

export type CreateChatResult =
  | { ok: true; chat: { id: string; subject: string; created_at: string } }
  | { ok: false; error: string };

export async function createChatAction(data: {
  subject: string;
  body: string;
  service_id?: string;
}): Promise<CreateChatResult> {
  try {
    const chat = await serverFetch<{
      id: string;
      subject: string;
      created_at: string;
    }>('/support/chats', { method: 'POST', body: data });
    revalidatePath('/dashboard/support');
    return { ok: true, chat };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo crear el chat',
    };
  }
}

export async function confirmResolutionAction(
  conversationId: string,
): Promise<ConversationMutationResult> {
  try {
    await serverFetch(
      `/support/conversations/${conversationId}/confirm-resolution`,
      { method: 'PATCH' },
    );
    revalidatePath('/dashboard/support');
    revalidatePath(`/dashboard/support/${conversationId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo confirmar la resolución',
    };
  }
}

/* ═══════════════════════════════════════
   IA copilot — sugerencia de respuesta (F3·E13 Fase F).

   Staff-only (el backend impone ADMIN_ROLES). Modelo A (ADR-078 A1): el token
   viaja en la cookie httpOnly vía `serverFetch`. NUNCA auto-envía: el componente
   inserta el borrador en el composer para que el agente lo revise antes de enviar.
   ═══════════════════════════════════════ */

export type AiSuggestionResult =
  | { ok: true; suggestion: string; model: string }
  | { ok: false; error: string };

export async function generateAiSuggestionAction(
  conversationId: string,
  instructions?: string,
): Promise<AiSuggestionResult> {
  try {
    const data = await serverFetch<{
      suggestion: string;
      model: string;
      truncated?: boolean;
    }>(`/support/conversations/${conversationId}/ai-suggestion`, {
      method: 'POST',
      body: instructions ? { instructions } : {},
    });
    return { ok: true, suggestion: data.suggestion, model: data.model };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo generar la sugerencia de IA.',
    };
  }
}

/**
 * ¿Hay un proveedor IA activo? Gatea el botón del composer. Ante cualquier
 * error (no-staff, red, IA desactivada) devuelve `false` — el botón no aparece
 * (fail-safe; nunca rompe el composer).
 */
export async function getAiSuggestionEnabledAction(): Promise<boolean> {
  try {
    const data = await serverFetch<{ enabled: boolean }>(
      '/support/ai-suggestion/enabled',
    );
    return data.enabled === true;
  } catch {
    return false;
  }
}
