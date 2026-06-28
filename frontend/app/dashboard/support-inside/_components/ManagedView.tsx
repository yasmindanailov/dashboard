'use client';

import { Plus, Wrench, Clock, MessageSquare, Mail, Phone, ShieldCheck, CreditCard, type LucideIcon } from 'lucide-react';
import { Button, IconWell } from '../../../components/ui';
import { TechnicianCard } from '../../../_shared/support-inside/TechnicianCard';
import { MaintenanceSlotCard } from '../../../_shared/support-inside/MaintenanceSlotCard';
import type {
  SupportInsideSubscriptionPayload,
  SupportInsideChannel,
} from '../../../lib/api';
import s from './ManagedView.module.css';

/* ═══════════════════════════════════════
   ManagedView — Rediseño UI F3·E8 (vista cliente con plan activo)
   1:1 con `SupportInside.dc.html`: hero "Tu plan de cuidado" (plan +
   técnico + presencia + stats) · slots de mantenimiento · canales ·
   "El valor que te aporta" (stats reales + timeline). Tokens only.
   ═══════════════════════════════════════ */

const SLOT_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Mantenimiento',
  maintenance_management: 'Mantenimiento + gestión',
};

const CHANNEL_META: Record<
  SupportInsideChannel,
  { label: string; icon: LucideIcon }
> = {
  webchat: { label: 'Chat web', icon: MessageSquare },
  email: { label: 'Email', icon: Mail },
  phone: { label: 'Teléfono', icon: Phone },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMonth(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m) return monthYear;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Minutos → "1 h 20 m" / "45 min". */
function formatMinutes(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h} h ${m} m` : `${h} h`;
}

export interface ManagedViewProps {
  subscription: SupportInsideSubscriptionPayload;
  submitting: boolean;
  onReleaseSlot: (slotId: string) => void;
  onAssignSlot: () => void;
  onViewHistory: (slotId: string, serviceName: string) => void;
  onGoBilling: () => void;
}

export function ManagedView({
  subscription,
  submitting,
  onReleaseSlot,
  onAssignSlot,
  onViewHistory,
  onGoBilling,
}: ManagedViewProps) {
  const cfg = subscription.product.support_inside_config;
  const activeSlots = subscription.slots.filter((sl) => !sl.released_at);
  const includedTotal = cfg?.slots_included ?? 0;
  const slotsUsed = activeSlots.length;
  const hasFreeSlot = slotsUsed < includedTotal;
  const channels = cfg?.channels_active ?? [];
  const recent = subscription.recent_maintenances ?? [];

  return (
    <div className={s.root}>
      {/* ── Hero: Tu plan de cuidado ── */}
      <section className={s.hero}>
        <div className={s.heroLeft}>
          <div className={s.heroLabel}>
            <ShieldCheck size={15} strokeWidth={2.1} aria-hidden />
            Tu plan de cuidado
          </div>
          <div className={s.heroPlanRow}>
            <span className={s.heroPlan}>Plan {subscription.product.name}</span>
            <span className={s.heroActive}>
              <span className={s.heroActiveDot} />
              Activo
            </span>
          </div>
          <p className={s.heroTagline}>
            {subscription.product.short_description}
          </p>
          <TechnicianCard technician={subscription.technician} variant="onBrand" />
        </div>

        <div className={s.heroRight}>
          <div className={s.statsGrid}>
            <Stat
              label="SLA de respuesta"
              value={cfg ? `Menos de ${cfg.response_sla_hours} h` : '—'}
            />
            <Stat
              label="Slots de mantenimiento"
              value={`${slotsUsed} / ${includedTotal} usados`}
            />
            <Stat
              label="Mantenimientos hechos"
              value={String(subscription.maintenance_count ?? 0)}
            />
            <Stat
              label="Renueva el"
              value={formatDate(subscription.service.next_due_date)}
            />
          </div>
          <div className={s.heroFooter}>
            <Button size="sm" variant="secondary" onClick={onGoBilling}>
              <CreditCard size={14} strokeWidth={2} aria-hidden /> Ver
              facturación
            </Button>
          </div>
        </div>
      </section>

      {/* ── Slots / Mantenimiento ── */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2 className={s.sectionTitle}>Mantenimiento de tus servicios</h2>
          <span className={s.sectionCounter}>
            {slotsUsed} de {includedTotal} slots en uso
          </span>
        </div>
        <p className={s.sectionDesc}>
          Cada slot cubre el mantenimiento mensual de un servicio técnico:
          actualizaciones, copias, SSL y revisión de rendimiento. Cada mes te
          enviamos un resumen de lo que hicimos.
        </p>

        <div className={s.slotsGrid}>
          {activeSlots.map((slot) => {
            const name =
              slot.service?.label ||
              slot.service?.domain ||
              slot.service?.product.name ||
              'Servicio';
            return (
              <MaintenanceSlotCard
                key={slot.id}
                slot={slot}
                slotTypeLabel={SLOT_TYPE_LABELS[slot.slot_type] ?? slot.slot_type}
                submitting={submitting}
                onViewHistory={() => onViewHistory(slot.id, name)}
                onRelease={() => onReleaseSlot(slot.id)}
              />
            );
          })}

          {hasFreeSlot ? (
            <button
              type="button"
              className={s.emptySlot}
              onClick={onAssignSlot}
              disabled={submitting}
            >
              <span className={s.emptySlotIcon}>
                <Plus size={22} strokeWidth={2} aria-hidden />
              </span>
              <span>
                <span className={s.emptySlotTitle}>Asignar un slot</span>
                <span className={s.emptySlotSub}>
                  Te quedan {includedTotal - slotsUsed} slot
                  {includedTotal - slotsUsed !== 1 ? 's' : ''} por usar
                </span>
              </span>
            </button>
          ) : (
            includedTotal > 0 && (
              <div className={s.slotsFull}>
                <IconWell icon={Wrench} tone="warning" size="md" />
                <div className={s.slotsFullTitle}>Has usado todos tus slots</div>
                <div className={s.slotsFullText}>
                  El plan {subscription.product.name} incluye {includedTotal}{' '}
                  slot{includedTotal !== 1 ? 's' : ''}. Sube de plan para cubrir
                  más servicios cada mes.
                </div>
              </div>
            )
          )}
        </div>
      </section>

      {/* ── Canales ── */}
      {channels.length > 0 && (
        <section className={s.section}>
          <h2 className={s.sectionTitle}>Tus canales de contacto</h2>
          <p className={s.sectionDesc}>
            Elige el canal que prefieras. Siempre te responde una persona real
            que ya conoce tu negocio — nunca un bot.
          </p>
          <div className={s.channelsGrid}>
            {channels.map((ch) => {
              const meta = CHANNEL_META[ch];
              return (
                <div key={ch} className={s.channelCard}>
                  <IconWell icon={meta.icon} tone="brand" size="md" />
                  <span className={s.channelName}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── El valor que te aporta ── */}
      <section className={s.section}>
        <h2 className={s.sectionTitle}>El valor que te aporta</h2>
        <p className={s.sectionDesc}>
          Lo que hemos hecho por tu negocio desde que confías en nosotros.
        </p>
        <div className={s.valueGrid}>
          <ValueStat
            icon={Clock}
            value={formatMinutes(subscription.avg_first_response_minutes)}
            label="Tiempo medio de respuesta"
          />
          <ValueStat
            icon={Wrench}
            value={String(subscription.maintenance_count ?? 0)}
            label="Mantenimientos realizados"
          />
          <ValueStat
            icon={ShieldCheck}
            value={String(slotsUsed)}
            label="Servicios cuidados cada mes"
          />
        </div>

        {recent.length > 0 && (
          <div className={s.timeline}>
            {recent.map((m, i) => (
              <div key={m.id} className={s.timelineRow}>
                <div className={s.timelineMarker}>
                  <span className={s.timelineDot}>
                    <ShieldCheck size={15} strokeWidth={2.4} aria-hidden />
                  </span>
                  {i < recent.length - 1 && <span className={s.timelineLine} />}
                </div>
                <div className={s.timelineBody}>
                  <div className={s.timelineHead}>
                    <span className={s.timelineTitle}>
                      {m.service_name} · {formatMonth(m.month_year)}
                    </span>
                    <span className={s.timelineDate}>
                      {formatDate(m.performed_at)}
                    </span>
                  </div>
                  <p className={s.timelineDetail}>{m.summary}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.statItem}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue}>{value}</div>
    </div>
  );
}

function ValueStat({
  icon: Icon,
  value,
  label,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
}) {
  return (
    <div className={s.valueCard}>
      <IconWell icon={Icon} tone="brand" size="md" />
      <div className={s.valueNum}>{value}</div>
      <div className={s.valueLabel}>{label}</div>
    </div>
  );
}
