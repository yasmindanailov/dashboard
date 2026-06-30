/* ═══════════════════════════════════════
   Ticket Inbox — Shared types & constants
   Ref: DECISIONS.md §43, §46
   ═══════════════════════════════════════ */

export interface TicketMessage {
  id: string;
  body: string;
  sender_type: string;
  created_at: string;
}

/* ── SLA de 1ª respuesta (Rediseño UI F3·E9) ──
   Calculado server-side por `SupportQueryService` (autoridad de tiempo
   única). El front solo presenta el snapshot. Mapea los campos del scope
   E9: `sla_due_at`→`due_at`, `sla_remaining_pct`→`remaining_pct`,
   `first_response_pending`. */
export type ConversationSlaState =
  | 'running'
  | 'breached'
  | 'paused'
  | 'met'
  | 'none';

export interface ConversationSla {
  state: ConversationSlaState;
  due_at: string | null;
  response_sla_hours: number;
  first_response_pending: boolean;
  remaining_ms: number | null;
  remaining_pct: number | null;
  responded_in_ms: number | null;
  responded_within_sla: boolean | null;
}

export interface Ticket {
  id: string;
  sequence_number: number | null;
  subject: string;
  status: string;
  priority: string;
  type: string;
  category: string | null;
  channel: string;
  user_id: string | null;
  assigned_agent_id: string | null;
  escalated_from_id: string | null;
  guest_name?: string | null;
  created_at: string;
  updated_at: string;
  messages: TicketMessage[];
  user?: { first_name: string; last_name: string } | null;
  // Rediseño UI F3·E9 — SLA de 1ª respuesta (solo bandeja admin lo pinta).
  sla?: ConversationSla | null;
}

export interface TicketStats {
  total_conversations: number;
  open_count: number;
  waiting_agent_count: number;
  unassigned_count: number;
  avg_first_response_minutes: number | null;
  /* Per-status counts (UI_SPEC §3.2) */
  waiting_client_count: number;
  resolved_count: number;
  closed_count: number;
}

export const STATUS_CONFIG: Record<string, { label: string; variant: 'info' | 'warning' | 'danger' | 'success' | 'neutral' }> = {
  open:           { label: 'Abierta',           variant: 'info' },
  waiting_client: { label: 'Esperando cliente', variant: 'warning' },
  waiting_agent:  { label: 'Esperando agente',  variant: 'danger' },
  resolved:       { label: 'Resuelta',          variant: 'success' },
  closed:         { label: 'Cerrada',           variant: 'neutral' },
};

export const PRIORITY_CONFIG: Record<string, { label: string; variant: 'neutral' | 'warning' | 'danger' }> = {
  low:    { label: 'Baja',    variant: 'neutral' },
  normal: { label: 'Normal',  variant: 'neutral' },
  high:   { label: 'Alta',    variant: 'warning' },
  urgent: { label: 'Urgente', variant: 'danger' },
};

export const CATEGORY_CONFIG: Record<string, { label: string }> = {
  support_general:   { label: 'Soporte general' },
  support_billing:   { label: 'Facturación' },
  support_technical: { label: 'Soporte técnico' },
  escalated_chat:    { label: 'Escalado desde chat' },
};

export const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_support'];

/** Relative time: "Ahora", "5m", "2h", "3d" */
export const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

/** Format number with locale */
export const fmt = (n: number) => new Intl.NumberFormat('es-ES').format(n);

/** Short date: "23 abr" */
const shortDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

/** Generic subjects that should be replaced with richer display titles */
const GENERIC_SUBJECTS = [
  'chat en vivo', 'consulta', 'nueva consulta',
  'soporte general', 'nuevo chat',
];

/**
 * Get a meaningful display title for a conversation.
 * - Tickets: "TK-00042 · Subject"
 * - Chats with generic subject: "{ClientName} · 23 abr"
 * - Chats with specific subject: "{ClientName} · Subject"
 */
export function getDisplayTitle(conv: Ticket): string {
  const isChat = conv.type === 'chat';
  const isGeneric = GENERIC_SUBJECTS.includes(conv.subject.toLowerCase().trim());

  if (!isChat) {
    // Ticket: TK-00042 · Subject
    const prefix = conv.sequence_number
      ? `TK-${String(conv.sequence_number).padStart(5, '0')}`
      : `#${conv.id.substring(0, 6)}`;
    return `${prefix} · ${conv.subject}`;
  }

  // Chat: ClientName · date or subject
  const clientName = conv.user
    ? conv.user.first_name
    : conv.user_id
    ? 'Cliente'
    : (conv.guest_name || 'Visitante');

  if (isGeneric) {
    return `${clientName} · ${shortDate(conv.created_at)}`;
  }
  return `${clientName} · ${conv.subject}`;
}
