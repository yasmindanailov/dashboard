import type { PresenceStatus } from '../../lib/api';
import s from './PresenceDot.module.css';

/* ═══════════════════════════════════════
   PresenceDot — Rediseño UI F3·E8
   Punto de presencia del staff (online/away/offline). Reutilizable:
   tarjeta "tu técnico" (cliente) + avatares de agente (admin / E7).
   `ring` añade un borde (para superponerlo sobre un avatar de color).
   ═══════════════════════════════════════ */

const LABELS: Record<PresenceStatus, string> = {
  online: 'En línea',
  away: 'Ausente',
  offline: 'Desconectado',
};

export interface PresenceDotProps {
  status: PresenceStatus;
  size?: 'sm' | 'md';
  /** Color del borde cuando se superpone a un avatar (p. ej. el azul del hero). */
  ringColor?: string;
}

export function PresenceDot({
  status,
  size = 'sm',
  ringColor,
}: PresenceDotProps) {
  return (
    <span
      className={`${s.dot} ${s[`size_${size}`]} ${s[`tone_${status}`]}`}
      style={ringColor ? { borderColor: ringColor } : undefined}
      role="img"
      aria-label={LABELS[status]}
      title={LABELS[status]}
    />
  );
}
