import {
  Avatar,
  Badge,
  Meter,
  SectionCard,
} from '../../../../components/ui';
import type {
  PresenceStatus,
  SupportInsideManagedBlock,
} from '../../../../lib/api';
import { PresenceDot } from '../../../../_shared/support-inside/PresenceDot';
import s from './SupportInsidePlanCard.module.css';

/* ═══════════════════════════════════════
   SupportInsidePlanCard — Rediseño UI F3·E8 (Support Inside gestionado).

   Sección "Plan de soporte" del detalle de servicio admin (mockup
   `SupportInsideDetalleAdmin`): progreso de mantenimiento del periodo, SLA de
   respuesta y técnico asignado (con presencia). Capability-driven: el wrapper
   admin solo la inyecta cuando el servicio es una suscripción SI. La acción de
   reasignar técnico vive en el menú "Más acciones" del header (D2/D5), no aquí.

   Presentacional puro (SC-compatible): el estado/derivaciones (mantenimiento,
   presencia) los calcula el backend; el front solo presenta (R5).
   ═══════════════════════════════════════ */

const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  online: 'En línea',
  away: 'Ausente',
  offline: 'Desconectado',
};

export interface SupportInsidePlanCardProps {
  managed: SupportInsideManagedBlock;
}

export function SupportInsidePlanCard({ managed }: SupportInsidePlanCardProps) {
  const { plan, maintenance, technician } = managed;
  const { period_done, period_total, overdue_count } = maintenance;

  return (
    <SectionCard
      title="Plan de soporte"
      subtitle={`Support Inside · ${plan.name}`}
    >
      <Meter
        label="Mantenimientos este mes"
        used={period_done}
        total={period_total}
        valueText={`${period_done} / ${period_total}`}
        advisory={
          overdue_count > 0
            ? `${overdue_count} ${overdue_count === 1 ? 'pendiente vencido' : 'pendientes vencidos'}`
            : undefined
        }
        thresholdPct={overdue_count > 0 ? 0 : undefined}
      />

      <div className={s.metaRow}>
        <div className={s.metaItem}>
          <span className={s.metaLabel}>SLA de respuesta</span>
          <span className={s.metaValue}>
            Menos de {plan.response_sla_hours} h
          </span>
        </div>
        <div className={s.metaItem}>
          <span className={s.metaLabel}>Técnico asignado</span>
          {technician ? (
            <div className={s.tech}>
              <Avatar
                name={`${technician.first_name} ${technician.last_name}`}
                src={technician.avatar_url ?? undefined}
                size="sm"
              />
              <div className={s.techBody}>
                <span className={s.techName}>
                  {technician.first_name} {technician.last_name}
                </span>
                <span className={s.techPresence}>
                  <PresenceDot status={technician.presence} size="sm" />
                  {PRESENCE_LABELS[technician.presence]}
                </span>
              </div>
            </div>
          ) : (
            <Badge variant="warning">Sin asignar</Badge>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
