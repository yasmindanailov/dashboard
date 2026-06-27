'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { listChatsAction } from '../../_shared/support/_actions';

import { AdminLiveChatCard, AdminLiveChatMini, type LiveChat } from './AdminLiveChatCard';

/* Estados que NO se muestran (cerrados). El resto = "abiertos". */
const RESOLVED_STATUSES = new Set(['resolved', 'closed']);
const POLL_INTERVAL_MS = 30_000;

/** El subject suele venir como "{Nombre} · …"; sacamos el nombre para avatar/título. */
function parseName(subject: string): string {
  const name = subject.split('·')[0]?.trim();
  return name || subject || 'Chat';
}

function initialsOf(name: string): string {
  // Solo letras (evita que un subject tipo "[SEED] …" produzca iniciales raras).
  const parts = name
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relTime(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

export interface AdminLiveChatSlotProps {
  collapsed: boolean;
  onMobileClose: () => void;
}

/**
 * AdminLiveChatSlot — datos de la tarjeta "Chat en vivo" del sidebar admin.
 * Trae los chats reales (`listChatsAction`), muestra los **no resueltos**
 * (abiertos), marca los `waiting_agent` como "en espera" (sin contestar, tiempo
 * en ámbar) y los ordena primero. Cada fila hace deep-link a la conversación
 * concreta (`/admin/support/chats?open=<id>`, que el workspace ya resuelve).
 */
export function AdminLiveChatSlot({ collapsed, onMobileClose }: AdminLiveChatSlotProps) {
  const router = useRouter();
  const [chats, setChats] = useState<LiveChat[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);

  const openWorkspace = useCallback(() => {
    onMobileClose();
    router.push('/admin/support/chats');
  }, [router, onMobileClose]);

  const openChat = useCallback(
    (id: string) => {
      onMobileClose();
      router.push(`/admin/support/chats?open=${id}`);
    },
    [router, onMobileClose],
  );

  const load = useCallback(async () => {
    const res = await listChatsAction({ limit: 50 });
    if (!res.ok) return;
    const open = res.chats.filter((c) => !RESOLVED_STATUSES.has(c.status));
    setWaitingCount(open.filter((c) => c.status === 'waiting_agent').length);
    const mapped: LiveChat[] = open
      .map((c) => {
        const name = parseName(c.subject);
        return {
          id: c.id,
          name,
          initials: initialsOf(name),
          wait: relTime(c.updated_at || c.created_at),
          waiting: c.status === 'waiting_agent',
          msg: c.messages?.[0]?.body ?? '',
          onClick: () => openChat(c.id),
        };
      })
      // Los que esperan respuesta (sin contestar) primero.
      .sort((a, b) => Number(b.waiting) - Number(a.waiting));
    setChats(mapped);
  }, [openChat]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- polling canónico (igual que NotificationBell/TasksPill).
    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (collapsed) {
    return <AdminLiveChatMini waitingCount={waitingCount} onOpenChats={openWorkspace} />;
  }
  return <AdminLiveChatCard waitingCount={waitingCount} chats={chats} onOpenChats={openWorkspace} />;
}
