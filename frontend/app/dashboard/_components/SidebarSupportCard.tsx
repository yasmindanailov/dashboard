'use client';

import {
  SidebarConversationList,
  type ConversationItem,
} from '../../components/ui/SidebarConversationList/SidebarConversationList';

import styles from './SidebarSupportCard.module.css';

export interface SupportTechnician {
  initials: string;
  name: string;
  /** Línea secundaria, ej: "Tu técnico · responde en min." */
  subtitle: string;
  /** Punto verde de presencia. */
  present?: boolean;
}

export interface SidebarSupportCardProps {
  technician: SupportTechnician;
  conversations: ConversationItem[];
  openCount: number;
  onWrite: () => void;
  /** Etiqueta del CTA; por defecto "Escribir a {primer nombre}". */
  writeLabel?: string;
}

/**
 * SidebarSupportCard — tarjeta de soporte del footer del sidebar cliente
 * (mockup Shell.dc.html líneas 74-113): cabecera del técnico (avatar + presencia
 * + nombre + subtítulo) sobre el `SidebarConversationList` (F1, que ya renderiza
 * el eyebrow "Tus conversaciones" + contador + lista + CTA). Presentacional.
 *
 * TODO(F3/E8): técnico asignado + presencia reales (no hay endpoint hoy). En F2
 * llega por props con fallback genérico.
 */
export function SidebarSupportCard({
  technician,
  conversations,
  openCount,
  onWrite,
  writeLabel,
}: SidebarSupportCardProps) {
  const firstName = technician.name.split(' ')[0] || 'soporte';
  return (
    <div className={styles.card}>
      <div className={styles.tech}>
        <span className={styles.avatarWrap}>
          <span className={styles.avatar}>{technician.initials}</span>
          {technician.present && <span className={styles.presence} aria-hidden="true" />}
        </span>
        <span className={styles.techInfo}>
          <span className={styles.techName}>{technician.name}</span>
          <span className={styles.techSub}>{technician.subtitle}</span>
        </span>
      </div>

      <SidebarConversationList
        title="Tus conversaciones"
        items={conversations}
        openCount={openCount}
        cta={{ label: writeLabel ?? `Escribir a ${firstName}`, onClick: onWrite }}
      />
    </div>
  );
}

export interface SidebarSupportMiniProps {
  initials: string;
  openCount: number;
  present?: boolean;
  onClick: () => void;
  label?: string;
}

/**
 * SidebarSupportMini — FAB del soporte cuando el sidebar está contraído
 * (mockup Shell.dc.html líneas 115-119): avatar circular + badge de conversaciones
 * abiertas + punto de presencia.
 */
export function SidebarSupportMini({
  initials,
  openCount,
  present,
  onClick,
  label = 'Escribir a soporte',
}: SidebarSupportMiniProps) {
  return (
    <div className={styles.miniWrap}>
      <button type="button" className={styles.fab} onClick={onClick} title={label} aria-label={label}>
        {initials}
        {openCount > 0 && <span className={styles.fabBadge}>{openCount}</span>}
        {present && <span className={styles.fabPresence} aria-hidden="true" />}
      </button>
    </div>
  );
}
