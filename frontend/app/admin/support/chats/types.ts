/* ═══════════════════════════════════════
   Shared types for Agent Chat Panel
   Ref: DECISIONS.md §43, ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

export interface Message {
  id: string;
  sender_type: string;
  sender_id: string | null;
  sender_name?: string;
  body: string;
  is_internal: boolean;
  read_at: string | null;
  created_at: string;
}

export interface Chat {
  id: string;
  subject: string;
  status: string;
  priority: string;
  user_id: string | null;
  assigned_agent_id: string | null;
  created_at: string;
  updated_at: string;
  messages: Message[];
  /* Sprint 16 (ADR-079 amendment A3): si el chat fue escalado a ticket,
     enriquecido por SupportQueryService.findOne con el ticket destino. */
  escalated_to?: {
    id: string;
    sequence_number: number | null;
    subject: string;
  } | null;
}

export interface ClientProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  client_profile?: {
    company_name?: string;
    phone?: string;
  };
}

export interface ResolutionModalState {
  type: 'resolve' | 'close' | 'escalate';
}

export const STATUS_BADGE: Record<string, { label: string; variant: 'info' | 'warning' | 'danger' | 'success' | 'neutral' }> = {
  open:           { label: 'Nuevo',             variant: 'info' },
  waiting_client: { label: 'Esperando cliente', variant: 'warning' },
  waiting_agent:  { label: 'Tu turno',          variant: 'danger' },
  resolved:       { label: 'Resuelto',          variant: 'success' },
  closed:         { label: 'Cerrado',           variant: 'neutral' },
};

/** Format time as HH:MM */
export const formatTime = (d: string) =>
  new Date(d).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** Relative time: "Ahora", "5m", "2h", "3d" */
export const timeAgo = (d: string) => {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
};
