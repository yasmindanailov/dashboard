import { UserRound } from 'lucide-react';
import type { SupportInsideTechnician } from '../../lib/api';
import { PresenceDot } from './PresenceDot';
import s from './TechnicianCard.module.css';

/* ═══════════════════════════════════════
   TechnicianCard — Rediseño UI F3·E8
   "Tu técnico" (cuidador estable) con avatar + presencia + tagline.
   `onBrand` = sobre el hero azul del cliente (texto claro);
   `default` = sobre superficie blanca (admin / E7).
   1:1 con `SupportInside.dc.html` (hero) y `SupportInsideDetalleAdmin`.
   ═══════════════════════════════════════ */

export interface TechnicianCardProps {
  technician: SupportInsideTechnician | null | undefined;
  variant?: 'onBrand' | 'default';
  /** Texto bajo el nombre. Por defecto el del mockup. */
  tagline?: string;
}

function initials(t: SupportInsideTechnician): string {
  return `${t.first_name[0] ?? ''}${t.last_name[0] ?? ''}`.toUpperCase();
}

export function TechnicianCard({
  technician,
  variant = 'default',
  tagline = 'Ya conoce tu negocio · responde en persona',
}: TechnicianCardProps) {
  if (!technician) {
    return (
      <div className={`${s.card} ${s[variant]}`}>
        <span className={`${s.avatar} ${s.avatarEmpty}`} aria-hidden>
          <UserRound size={20} strokeWidth={1.8} />
        </span>
        <div className={s.body}>
          <div className={s.name}>Sin técnico asignado</div>
          <div className={s.tagline}>Lo asignaremos en breve</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${s.card} ${s[variant]}`}>
      <span className={s.avatarWrap}>
        <span className={s.avatar} aria-hidden>
          {initials(technician)}
        </span>
        <span className={s.presence}>
          <PresenceDot
            status={technician.presence}
            size="md"
            ringColor={variant === 'onBrand' ? 'var(--brand)' : 'var(--surface-primary)'}
          />
        </span>
      </span>
      <div className={s.body}>
        <div className={s.name}>
          {technician.first_name} {technician.last_name}
          <span className={s.role}> · tu técnico</span>
        </div>
        <div className={s.tagline}>{tagline}</div>
      </div>
    </div>
  );
}
