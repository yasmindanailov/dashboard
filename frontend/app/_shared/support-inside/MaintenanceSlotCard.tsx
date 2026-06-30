import {
  Monitor,
  ShieldCheck,
  Clock,
  CalendarClock,
  AlertTriangle,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { IconWell, Button } from '../../components/ui';
import type {
  SupportInsideSlotPayload,
  SlotMaintenanceStatus,
} from '../../lib/api';
import s from './MaintenanceSlotCard.module.css';

/* ═══════════════════════════════════════
   MaintenanceSlotCard — Rediseño UI F3·E8
   Tarjeta de slot de mantenimiento 1:1 con `SupportInside.dc.html`:
   icon-well + servicio + badge de estado derivado + última/próxima
   revisión + acciones (Ver mantenimientos / Liberar). Tokens only.
   ═══════════════════════════════════════ */

type StatusTone = 'success' | 'info' | 'neutral' | 'warning';

const STATUS: Record<
  SlotMaintenanceStatus,
  { label: string; tone: StatusTone; Icon: LucideIcon }
> = {
  up_to_date: { label: 'Mantenido', tone: 'success', Icon: ShieldCheck },
  in_progress: { label: 'En curso', tone: 'info', Icon: LoaderCircle },
  due_soon: { label: 'Programado', tone: 'neutral', Icon: CalendarClock },
  overdue: { label: 'Pendiente', tone: 'warning', Icon: AlertTriangle },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export interface MaintenanceSlotCardProps {
  slot: SupportInsideSlotPayload;
  slotTypeLabel: string;
  submitting?: boolean;
  onViewHistory: () => void;
  onRelease: () => void;
}

export function MaintenanceSlotCard({
  slot,
  slotTypeLabel,
  submitting = false,
  onViewHistory,
  onRelease,
}: MaintenanceSlotCardProps) {
  const serviceName =
    slot.service?.label ||
    slot.service?.domain ||
    slot.service?.product.name ||
    'Servicio';
  const status = slot.maintenance_status
    ? STATUS[slot.maintenance_status]
    : null;
  const StatusIcon = status?.Icon;

  return (
    <div className={s.card}>
      <div className={s.head}>
        <IconWell icon={Monitor} tone="brand" size="md" />
        <div className={s.headBody}>
          <div className={s.service}>{serviceName}</div>
          <div className={s.sub}>
            {slotTypeLabel}
            {slot.is_extra ? ' · Extra' : ''}
          </div>
        </div>
        {status && StatusIcon && (
          <span className={`${s.status} ${s[`tone_${status.tone}`]}`}>
            <StatusIcon size={12} strokeWidth={2.2} aria-hidden />
            {status.label}
          </span>
        )}
      </div>

      <div className={s.dates}>
        <div>
          <div className={s.dateLabel}>Última revisión</div>
          <div className={s.dateValue}>{formatDate(slot.last_maintenance_at)}</div>
        </div>
        <div>
          <div className={s.dateLabel}>Próxima revisión</div>
          <div className={`${s.dateValue} ${s.dateNext}`}>
            <Clock size={13} strokeWidth={2} aria-hidden />
            {formatDate(slot.next_maintenance_at)}
          </div>
        </div>
      </div>

      <div className={s.actions}>
        <Button size="sm" variant="primary" onClick={onViewHistory}>
          Ver mantenimientos
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={s.release}
          disabled={submitting}
          onClick={onRelease}
        >
          Liberar slot
        </Button>
      </div>
    </div>
  );
}
