'use server';

import { revalidatePath } from 'next/cache';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { TaskListResponse } from './types';
import type { TaskNotePayload, TaskTicketAction } from '../../lib/api';
import type { Pagination } from '../../lib/types';

/* ═══════════════════════════════════════
   Server Actions — _shared/tasks.
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).
   ═══════════════════════════════════════ */

export type TaskMutationResult = { ok: true } | { ok: false; error: string };

function wrap(err: unknown, fallback: string): TaskMutationResult {
  return {
    ok: false,
    error: err instanceof ServerFetchError ? err.message : fallback,
  };
}

export async function completeTaskAction(
  taskId: string,
  note: string,
): Promise<TaskMutationResult> {
  try {
    await serverFetch(`/tasks/${taskId}/complete`, {
      method: 'PATCH',
      body: { note },
    });
    revalidatePath('/admin/tasks');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return wrap(err, 'No se pudo completar la tarea');
  }
}

export async function completeTicketBridgeTaskAction(
  taskId: string,
  data: { ticket_action: TaskTicketAction; resolution_note: string },
): Promise<TaskMutationResult> {
  try {
    await serverFetch(`/tasks/${taskId}/complete-ticket-bridge`, {
      method: 'PATCH',
      body: data,
    });
    revalidatePath('/admin/tasks');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return wrap(err, 'No se pudo completar la tarea');
  }
}

export async function assignTaskAction(
  taskId: string,
  assignedTo: string | null,
): Promise<TaskMutationResult> {
  try {
    await serverFetch(`/tasks/${taskId}/assign`, {
      method: 'PATCH',
      body: { assigned_to: assignedTo },
    });
    revalidatePath('/admin/tasks');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return wrap(err, 'No se pudo asignar la tarea');
  }
}

export async function recordMaintenanceLogAction(
  taskId: string,
  data: {
    client_facing_notes: string;
    internal_notes?: string;
    month_year?: string;
    checklist_completions?: {
      item_id: string;
      item_kind: 'service' | 'product';
      notes?: string;
    }[];
  },
): Promise<TaskMutationResult> {
  try {
    await serverFetch(`/tasks/${taskId}/maintenance/log`, {
      method: 'POST',
      body: data,
    });
    revalidatePath('/admin/tasks');
    revalidatePath('/admin');
    return { ok: true };
  } catch (err) {
    return wrap(err, 'No se pudo registrar el log de mantenimiento');
  }
}

export type TaskNotesResult =
  | { ok: true; notes: TaskNotePayload[] }
  | { ok: false; error: string };

export async function listTaskNotesAction(
  taskId: string,
): Promise<TaskNotesResult> {
  try {
    const notes = await serverFetch<TaskNotePayload[]>(`/tasks/${taskId}/notes`);
    return { ok: true, notes };
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

export interface ChecklistItemPayload {
  id: string;
  label: string;
  is_required: boolean;
  order_index: number;
  kind: 'service' | 'product';
}

export interface ChecklistCompletionPayload {
  id: string;
  task_id: string;
  item_id: string;
  item_kind: 'service' | 'product';
  completed_by: string;
  completed_at: string;
  notes: string | null;
}

export type TaskChecklistResult =
  | {
      ok: true;
      items: ChecklistItemPayload[];
      completions: ChecklistCompletionPayload[];
    }
  | { ok: false; error: string };

export async function getTaskChecklistAction(
  taskId: string,
): Promise<TaskChecklistResult> {
  try {
    const res = await serverFetch<{
      items: ChecklistItemPayload[];
      completions: ChecklistCompletionPayload[];
    }>(`/tasks/${taskId}/checklist`);
    return { ok: true, items: res.items, completions: res.completions };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudo cargar el checklist',
    };
  }
}

export async function completeChecklistItemAction(
  taskId: string,
  data: { item_id: string; item_kind: 'service' | 'product'; notes?: string },
): Promise<TaskMutationResult> {
  try {
    await serverFetch(`/tasks/${taskId}/checklist/complete`, {
      method: 'POST',
      body: data,
    });
    return { ok: true };
  } catch (err) {
    return wrap(err, 'No se pudo marcar el item del checklist');
  }
}

/**
 * Lista de agentes asignables (superadmin + 3 agentes). Filtrada
 * server-side por `ASSIGNABLE_ROLE_SLUGS` en backend.
 *
 * Shape canónico del backend `GET /admin/users` (Sprint 8 Fase A.3 —
 * `UsersService.findAgents`): `role` es el slug directo (string), NO
 * un objeto `{ slug, name }`. La etiqueta humana se resuelve client-side
 * con `ROLE_LABELS[slug]` cuando hace falta.
 */
export interface AssignableAgent {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  role: string;
}

export type ListAgentsResult =
  | { ok: true; agents: AssignableAgent[] }
  | { ok: false; error: string };

export async function listAssignableAgentsAction(
  params: { search?: string; role?: string | string[] } = {},
): Promise<ListAgentsResult> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.role) {
    const roles = Array.isArray(params.role) ? params.role : [params.role];
    roles.forEach((r) => query.append('role', r));
  }
  query.set('limit', '50');
  try {
    const res = await serverFetch<Pagination<AssignableAgent>>(
      `/admin/users?${query.toString()}`,
    );
    return { ok: true, agents: res.data || [] };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar los agentes',
    };
  }
}

export type ListTasksResult =
  | { ok: true; tasks: TaskListResponse }
  | { ok: false; error: string };

export async function listTasksAction(filters: {
  page?: number;
  limit?: number;
  scope?: 'mine' | 'unassigned' | 'all';
  status?: string;
  source_system?: string;
}): Promise<ListTasksResult> {
  const query = new URLSearchParams();
  if (filters.page) query.set('page', String(filters.page));
  if (filters.limit) query.set('limit', String(filters.limit));
  if (filters.scope) query.set('scope', filters.scope);
  if (filters.status) query.set('status', filters.status);
  if (filters.source_system) query.set('source_system', filters.source_system);
  try {
    const tasks = await serverFetch<TaskListResponse>(
      `/tasks?${query.toString()}`,
    );
    return { ok: true, tasks };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof ServerFetchError
          ? err.message
          : 'No se pudieron cargar las tareas',
    };
  }
}
