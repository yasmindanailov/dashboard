'use client';

import { useCallback, useEffect, useState } from 'react';

import { listChatsAction } from '../../_shared/support/_actions';
import type { ConversationItem, ConversationStatus } from '../../components/ui/SidebarConversationList/SidebarConversationList';

import { SidebarSupportCard, SidebarSupportMini, type SupportTechnician } from './SidebarSupportCard';

/**
 * Técnico de fallback. TODO(F3/E8): cuando exista el técnico asignado + presencia
 * (Support Inside gestionado) se sustituye por el real. En F2 mostramos un
 * remitente genérico honesto (no inventamos una persona).
 */
const FALLBACK_TECH: SupportTechnician = {
  initials: 'SA',
  name: 'Soporte Aelium',
  subtitle: 'Estamos para ayudarte',
  present: true,
};

function mapStatus(s: string): ConversationStatus {
  if (s === 'resolved' || s === 'closed') return 'resolved';
  if (s === 'waiting_agent' || s === 'pending') return 'pending';
  return 'open';
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es-ES');
}

export interface SidebarSupportSlotProps {
  collapsed: boolean;
  /** Abre el panel de soporte (SupportPanel) — wired desde el shell. */
  onOpenSupport: () => void;
}

/**
 * SidebarSupportSlot — datos de la tarjeta de soporte del sidebar cliente.
 * Trae las conversaciones reales del cliente (`listChatsAction`, scoped por JWT)
 * y delega el render en `SidebarSupportCard` (expandido) o `SidebarSupportMini`
 * (contraído). Fail-soft: si la carga falla, muestra la tarjeta sin lista.
 */
export function SidebarSupportSlot({ collapsed, onOpenSupport }: SidebarSupportSlotProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [openCount, setOpenCount] = useState(0);

  const load = useCallback(async () => {
    const res = await listChatsAction({ limit: 20 });
    if (!res.ok) return;
    const open = res.chats
      .map((c) => ({ chat: c, status: mapStatus(c.status) }))
      .filter((x) => x.status !== 'resolved');
    setOpenCount(open.length);
    setConversations(
      open.slice(0, 6).map(({ chat, status }) => {
        const last = chat.messages?.[chat.messages.length - 1];
        return {
          id: chat.id,
          title: chat.subject,
          preview: last?.body ?? '',
          time: relTime(chat.updated_at || chat.created_at),
          channel: 'chat' as const,
          status,
          onClick: onOpenSupport,
        };
      }),
    );
  }, [onOpenSupport]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial async; el panel de soporte mantiene el estado vivo.
    void load();
  }, [load]);

  if (collapsed) {
    return <SidebarSupportMini initials={FALLBACK_TECH.initials} openCount={openCount} present onClick={onOpenSupport} />;
  }

  return (
    <SidebarSupportCard
      technician={FALLBACK_TECH}
      conversations={conversations}
      openCount={openCount}
      onWrite={onOpenSupport}
    />
  );
}
