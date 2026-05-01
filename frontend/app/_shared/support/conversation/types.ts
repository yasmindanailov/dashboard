/* ═══════════════════════════════════════
   Conversation Detail — Shared types & constants
   Ref: DECISIONS.md §43, §46
   ═══════════════════════════════════════ */

export interface DetailMessage {
  id: string;
  sender_type: string;
  sender_id: string | null;
  body: string;
  is_internal: boolean;
  read_at: string | null;
  created_at: string;
}

export interface ConversationDetail {
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
  created_at: string;
  updated_at: string;
  first_response_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  messages: DetailMessage[];
  client_name?: string | null;
  client_email?: string | null;
  resolved_by_name?: string | null;
  resolution_note?: string | null;
  assigned_agent_name?: string | null;
  // Sub-fase 8.D.12.6 — visibilidad transversal Support Inside.
  // Enriquecido por `SupportQueryService.findOne` con la subscription
  // activa del owner. `null` si el cliente no tiene plan o es chat guest.
  client_support_inside?: ConversationSupportInside | null;
}

export interface ConversationSupportInside {
  product_slug: string;
  product_name: string;
  priority_tier: 'standard' | 'high' | 'max';
  response_sla_hours: number;
  channels_active: ('webchat' | 'email' | 'phone' | 'whatsapp')[];
}

export type ResolutionType = 'resolve' | 'close' | 'escalate' | 'reopen';

export const STATUS_CONFIG: Record<string, { label: string; variant: 'info' | 'warning' | 'danger' | 'success' | 'neutral' }> = {
  open:           { label: 'Abierta',           variant: 'info' },
  waiting_client: { label: 'Esperando cliente', variant: 'warning' },
  waiting_agent:  { label: 'Esperando agente',  variant: 'danger' },
  resolved:       { label: 'Resuelta',          variant: 'success' },
  closed:         { label: 'Cerrada',           variant: 'neutral' },
};

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_support'];

export const CATEGORY_LABELS: Record<string, string> = {
  support_general:   'Soporte general',
  support_billing:   'Facturación',
  support_technical: 'Soporte técnico',
  escalated_chat:    'Escalado desde chat',
};

/** Full date-time: "22 abr 2026, 10:30" */
export const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
