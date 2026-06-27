'use client';

import { MessageSquare, MessageCircle } from 'lucide-react';

import styles from './SidebarConversationList.module.css';

export type ConversationChannel = 'chat' | 'whatsapp';
export type ConversationTone = 'brand' | 'success' | 'neutral';
export type ConversationStatus = 'open' | 'pending' | 'resolved';

export interface ConversationItem {
  id: string;
  title: string;
  preview: string;
  time: string;
  channel?: ConversationChannel;
  tone?: ConversationTone;
  status?: ConversationStatus;
  unread?: boolean;
  onClick?: () => void;
}

export interface SidebarConversationListProps {
  title?: string;
  items: ConversationItem[];
  /** Contador para el badge "{N} abierta(s)". */
  openCount?: number;
  /** CTA inferior (ej: "Escribir a Luis"). */
  cta?: { label: string; onClick?: () => void };
  className?: string;
}

/**
 * SidebarConversationList — widget "Tus conversaciones" del shell (spec del
 * mockup Shell.dc.html, cliente + admin): cabecera con contador + lista scrollable
 * de conversaciones (icon-well por canal + título + preview + estado + no-leído) +
 * CTA. Para F2 (shells).
 */
export function SidebarConversationList({
  title = 'Tus conversaciones',
  items,
  openCount = 0,
  cta,
  className = '',
}: SidebarConversationListProps) {
  return (
    <div className={`${styles.wrap} ${className}`}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{title}</span>
        {openCount > 0 && (
          <span className={styles.count}>
            {openCount} {openCount === 1 ? 'abierta' : 'abiertas'}
          </span>
        )}
      </div>

      <div className={styles.list}>
        {items.map((c) => {
          const Icon = c.channel === 'whatsapp' ? MessageCircle : MessageSquare;
          return (
            <button key={c.id} type="button" onClick={c.onClick} className={styles.row}>
              <span className={`${styles.iconWell} ${styles[c.tone ?? 'brand']}`} aria-hidden="true">
                <Icon size={14} strokeWidth={1.9} />
              </span>
              <span className={styles.body}>
                <span className={styles.titleRow}>
                  <span className={styles.title}>{c.title}</span>
                  <span className={styles.time}>{c.time}</span>
                </span>
                <span className={styles.previewRow}>
                  <span className={`${styles.statusDot} ${styles[`s_${c.status ?? 'open'}`]}`} aria-hidden="true" />
                  <span className={styles.preview}>{c.preview}</span>
                </span>
              </span>
              {c.unread && <span className={styles.unread} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {cta && (
        <button type="button" onClick={cta.onClick} className={styles.cta}>
          <MessageSquare size={15} strokeWidth={2} aria-hidden="true" />
          {cta.label}
        </button>
      )}
    </div>
  );
}
