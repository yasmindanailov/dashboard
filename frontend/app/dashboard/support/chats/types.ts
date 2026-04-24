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

export const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  open:           { label: 'Nuevo',             color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
  waiting_client: { label: 'Esperando cliente', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
  waiting_agent:  { label: 'Tu turno',          color: '#EF4444', bg: 'rgba(239,68,68,0.08)' },
  resolved:       { label: 'Resuelto',          color: '#10B981', bg: 'rgba(16,185,129,0.08)' },
  closed:         { label: 'Cerrado',           color: '#6B7280', bg: 'rgba(107,114,128,0.08)' },
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
