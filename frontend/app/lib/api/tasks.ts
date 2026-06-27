import { api } from './client';

// ── Tasks API ──

/* ═══════════════════════════════════════
   tasksApi — contrato canónico Sprint 16 / ADR-079.
   Bridge unidireccional read-only. Endpoints disponibles:
     GET    /tasks
     GET    /tasks/stats
     GET    /tasks/:id
     PATCH  /tasks/:id/assign
     PATCH  /tasks/:id/complete                 (no-bridge: nota obligatoria)
     PATCH  /tasks/:id/complete-ticket-bridge   (bridge ticket↔task)
     PATCH  /tasks/:id/cancel
     GET    /tasks/:id/checklist
     POST   /tasks/:id/checklist/complete
     POST   /tasks/:id/maintenance/log
     GET    /tasks/:id/notes
   No existe POST /tasks ni PATCH /tasks/:id libre. Doctrina §1 ADR-079.
   ═══════════════════════════════════════ */

export type TaskScope = 'mine' | 'unassigned' | 'all';
export type TaskTicketAction = 'resolve' | 'close';

export const tasksApi = {
  list: (token: string, params?: {
    page?: number;
    limit?: number;
    scope?: TaskScope;
    status?: string;
    /** Filtra por sistema vinculado. Sustituye al legacy `type`. */
    source_system?: string;
    priority?: string;
    assigned_to?: string;
    client_id?: string;
    /** Filtra por origen vinculado (conversation_id|slot_id|service_id|...). */
    source_id?: string;
    time_range?: 'today' | 'week' | 'all';
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.scope) query.set('scope', params.scope);
    if (params?.status) query.set('status', params.status);
    if (params?.source_system) query.set('source_system', params.source_system);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.assigned_to) query.set('assigned_to', params.assigned_to);
    if (params?.client_id) query.set('client_id', params.client_id);
    if (params?.source_id) query.set('source_id', params.source_id);
    if (params?.time_range) query.set('time_range', params.time_range);
    const qs = query.toString();
    return api(`/tasks${qs ? `?${qs}` : ''}`, { token });
  },

  get: (token: string, id: string) =>
    api(`/tasks/${id}`, { token }),

  getStats: (token: string, scope?: TaskScope) => {
    const qs = scope ? `?scope=${scope}` : '';
    return api(`/tasks/stats${qs}`, { token });
  },

  /** Asignar / reasignar / liberar a cola pública. ADR-079 §3.10. */
  assign: (token: string, id: string, assigned_to: string | null) =>
    api(`/tasks/${id}/assign`, {
      method: 'PATCH',
      token,
      body: { assigned_to },
    }),

  /** Completar task no-bridge. Nota obligatoria — persiste en
      `client_notes` con `source_system='task_completion'`. */
  complete: (token: string, id: string, note: string) =>
    api(`/tasks/${id}/complete`, {
      method: 'PATCH',
      token,
      body: { note },
    }),

  /** Completar bridge ticket↔task. Delega en module support para resolver/
      cerrar el ticket vinculado y notificar al cliente. */
  completeTicketBridge: (
    token: string,
    id: string,
    data: { ticket_action: TaskTicketAction; resolution_note: string },
  ) =>
    api(`/tasks/${id}/complete-ticket-bridge`, {
      method: 'PATCH',
      token,
      body: data,
    }),

  /* Sprint 16 / ADR-079 amendment A2: la cancelación humana de tasks queda
     eliminada de la UI. La cancelación canónica la disparan los listeners
     cross-sistema del backend (slot liberado, servicio cancelado, ticket
     desasignado, item del checklist eliminado). El método `tasksApi.cancel`
     legacy quedó retirado del cliente; el endpoint `PATCH /tasks/:id/cancel`
     sigue existiendo en backend marcado @deprecated solo para superadmin
     debug. Vía canónica de "cambiar de manos": `tasksApi.assign`. */

  /** Checklist + maintenance log (preservado de Sprint 8 Fase B.5). */
  getChecklist: (token: string, taskId: string) =>
    api(`/tasks/${taskId}/checklist`, { token }),

  completeChecklistItem: (
    token: string,
    taskId: string,
    data: {
      item_id: string;
      item_kind: 'service' | 'product';
      notes?: string;
    },
  ) =>
    api(`/tasks/${taskId}/checklist/complete`, {
      method: 'POST',
      token,
      body: data,
    }),

  /** Cierra task de mantenimiento (`source_system='support_inside_slot'`).
      `client_facing_notes` = email al cliente; `internal_notes` opcional →
      `client_notes` con `source_system='maintenance_log'`. ADR-079 §3.8. */
  recordMaintenanceLog: (
    token: string,
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
  ) =>
    api(`/tasks/${taskId}/maintenance/log`, {
      method: 'POST',
      token,
      body: data,
    }),

  /** Notas vinculadas a la task (`source_system='task_completion'`). */
  listNotes: (token: string, taskId: string) =>
    api<TaskNotePayload[]>(`/tasks/${taskId}/notes`, { token }),
};

export interface TaskNotePayload {
  id: string;
  body: string;
  created_at: string;
  category?: string;
  source_system?: string;
  triggered_by_action?: string | null;
  author: {
    id: string;
    first_name: string;
    last_name: string;
  };
}

