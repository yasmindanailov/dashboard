'use client';

import { useMemo } from 'react';
import { Check, Info } from 'lucide-react';
import { fmtCurrency } from '../../../_shared/billing/invoice-status-map';
import type {
  SupportInsidePublicPlan,
  SupportInsideChannel,
} from '../../../lib/api';
import s from './PlanComparator.module.css';

/* ═══════════════════════════════════════
   PlanComparator — Rediseño UI F3·E8 (C2c)
   Comparador de planes SIEMPRE visible 1:1 con `SupportInside.dc.html`:
   toggle ciclo + cards (badge "Más elegido" + "Tu plan" en el actual +
   acción contextual Suscribirme / Cambiar a este plan). Tokens only.
   ═══════════════════════════════════════ */

const CHANNEL_LABELS: Record<SupportInsideChannel, string> = {
  webchat: 'Chat web',
  email: 'Email',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
};
const PRIORITY_LABELS: Record<string, string> = {
  standard: 'Estándar',
  high: 'Alta',
  max: 'Máxima',
};

function buildFeatures(plan: SupportInsidePublicPlan): string[] {
  const cfg = plan.config;
  if (!cfg) return [];
  const slots =
    cfg.slots_included === 0
      ? 'Sin slots de mantenimiento'
      : `${cfg.slots_included} slot${cfg.slots_included > 1 ? 's' : ''} de mantenimiento mensual`;
  return [
    slots,
    `Respuesta en menos de ${cfg.response_sla_hours} h`,
    `Canales: ${cfg.channels_active.map((c) => CHANNEL_LABELS[c]).join(', ')}`,
    `Prioridad ${PRIORITY_LABELS[cfg.priority_tier] ?? cfg.priority_tier}`,
  ];
}

export interface PlanComparatorProps {
  plans: SupportInsidePublicPlan[];
  cycle: 'monthly' | 'yearly';
  onCycleChange: (cycle: 'monthly' | 'yearly') => void;
  /** Producto SI actualmente contratado (para marcar "Tu plan"). */
  currentProductId: string | null;
  hasPlan: boolean;
  submitting: boolean;
  /** Suscribirse (sin plan) o cambiar (con plan) al plan elegido. */
  onSelectPlan: (plan: SupportInsidePublicPlan) => void;
  title: string;
  intro: string;
}

export function PlanComparator({
  plans,
  cycle,
  onCycleChange,
  currentProductId,
  hasPlan,
  submitting,
  onSelectPlan,
  title,
  intro,
}: PlanComparatorProps) {
  return (
    <section className={s.root}>
      <div className={s.head}>
        <div>
          <h2 className={s.title}>{title}</h2>
          <p className={s.intro}>{intro}</p>
        </div>
        <div className={s.toggle} role="tablist" aria-label="Ciclo de facturación">
          <button
            type="button"
            role="tab"
            aria-selected={cycle === 'monthly'}
            className={`${s.toggleBtn} ${cycle === 'monthly' ? s.toggleActive : ''}`}
            onClick={() => onCycleChange('monthly')}
          >
            Mensual
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cycle === 'yearly'}
            className={`${s.toggleBtn} ${cycle === 'yearly' ? s.toggleActive : ''}`}
            onClick={() => onCycleChange('yearly')}
          >
            Anual <span className={s.toggleSave}>−15%</span>
          </button>
        </div>
      </div>

      <div className={s.grid}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            isCurrent={plan.id === currentProductId}
            hasPlan={hasPlan}
            submitting={submitting}
            onSelect={() => onSelectPlan(plan)}
          />
        ))}
      </div>

      <div className={s.note}>
        <Info size={16} strokeWidth={2} aria-hidden />
        <span>
          Precio claro, sin letra pequeña. Support Inside es independiente de tu
          hosting — <strong>cancelarlo nunca afecta a tus servicios.</strong>
        </span>
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  cycle,
  isCurrent,
  hasPlan,
  submitting,
  onSelect,
}: {
  plan: SupportInsidePublicPlan;
  cycle: 'monthly' | 'yearly';
  isCurrent: boolean;
  hasPlan: boolean;
  submitting: boolean;
  onSelect: () => void;
}) {
  const features = useMemo(() => buildFeatures(plan), [plan]);
  const target = cycle === 'yearly' ? plan.pricing.yearly : plan.pricing.monthly;
  const featured = Boolean(plan.badge_text);

  const subPrice = !target
    ? 'Precio no disponible en este ciclo'
    : cycle === 'yearly'
      ? `Equivalente a ${fmtCurrency(Number(target.price) / 12, target.currency)}/mes`
      : 'Sin permanencia · cancela cuando quieras';

  const btnLabel = isCurrent
    ? 'Tu plan actual'
    : hasPlan
      ? 'Cambiar a este plan'
      : 'Suscribirme';

  return (
    <div
      className={`${s.card} ${featured ? s.cardFeatured : ''} ${isCurrent ? s.cardCurrent : ''}`}
    >
      {featured && !isCurrent && (
        <span className={s.badge}>{plan.badge_text}</span>
      )}
      <div className={s.cardHead}>
        <span className={s.planName}>{plan.name}</span>
        {isCurrent && (
          <span className={s.currentTag}>
            <span className={s.currentDot} />
            Tu plan
          </span>
        )}
      </div>

      <div className={s.priceRow}>
        <span className={s.price}>
          {target ? fmtCurrency(target.price, target.currency) : '—'}
        </span>
        <span className={s.priceUnit}>
          /{cycle === 'monthly' ? 'mes' : 'año'}
        </span>
      </div>
      <div className={s.subPrice}>{subPrice}</div>

      <div className={s.divider} />

      <ul className={s.features}>
        {features.map((f) => (
          <li key={f} className={s.feature}>
            <Check size={16} strokeWidth={2.4} aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`${s.action} ${featured && !isCurrent ? s.actionFeatured : ''}`}
        disabled={isCurrent || !target || submitting}
        onClick={onSelect}
      >
        {btnLabel}
      </button>
    </div>
  );
}
