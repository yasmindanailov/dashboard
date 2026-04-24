/* ═══════════════════════════════════════
   ChatWidget — Shared types & constants
   Ref: DECISIONS.md §9, ROADMAP.md 7.4.5
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

export interface Conversation {
  id: string;
  subject: string;
  status: string;
  last_agent_response_at: string | null;
  messages: Message[];
}

export const STATUS_LABEL: Record<string, string> = {
  open: 'Abierta',
  waiting_client: 'Esperando tu respuesta',
  waiting_agent: 'En revisión',
  resolved: 'Resuelta',
  closed: 'Cerrada',
};

export const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_support'];

/** Format time as HH:MM */
export const formatTime = (dateStr: string) =>
  new Date(dateStr).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

/** 7.H14: format "last agent response" time */
export const agentLastSeen = (dateStr: string | null): string | null => {
  if (!dateStr) return null;
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'Agente respondió hace un momento';
  if (mins < 60) return `Agente respondió hace ${mins}m`;
  if (mins < 1440) return `Agente respondió hace ${Math.floor(mins / 60)}h`;
  return `Agente respondió hace ${Math.floor(mins / 1440)}d`;
};
