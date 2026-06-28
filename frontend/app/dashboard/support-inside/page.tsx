'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  SupportInsidePublicPlan,
  SupportInsideSubscriptionPayload,
  SupportInsideChannel,
  SupportInsideEligibleService,
  SupportInsideSlotType,
  PlanChangePreview,
} from '../../lib/api';
import { fmtCurrency } from '../../_shared/billing/invoice-status-map';
import { Button, Modal, Select, Skeleton, useToast } from '../../components/ui';
import {
  addSlotAction,
  cancelSupportInsideAction,
  listEligibleServicesAction,
  loadSupportInsideAction,
  previewUpgradeAction,
  releaseSlotAction,
  upgradeSupportInsideAction,
} from './_actions';
import { ManagedView } from './_components/ManagedView';
import MaintenanceHistoryModal from './_components/MaintenanceHistoryModal';
import s from './page.module.css';

/* ═══════════════════════════════════════
   /dashboard/support-inside — Sprint 8 Fase D (8.D.5)
   Cliente. Vista comparador (3 cards) si NO tiene plan;
   vista de gestión si tiene subscription activa.
   Refs: ADR-061, ADR-075 §B.1, ADR-034
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

const SLOT_TYPE_LABELS: Record<string, string> = {
  maintenance: 'Mantenimiento',
  maintenance_management: 'Mantenimiento + gestión',
};

const CheckIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={s.featureCheck}
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

function buildPlanFeatures(plan: SupportInsidePublicPlan): string[] {
  const cfg = plan.config;
  if (!cfg) return [];
  const slots =
    cfg.slots_included === 0
      ? 'Sin slots de mantenimiento incluidos'
      : `${cfg.slots_included} slot${cfg.slots_included > 1 ? 's' : ''} de mantenimiento incluido${cfg.slots_included > 1 ? 's' : ''}`;
  const slotTypes = cfg.slot_types_allowed
    .map((t) => SLOT_TYPE_LABELS[t] ?? t)
    .join(' / ');
  const channels = cfg.channels_active
    .map((c) => CHANNEL_LABELS[c])
    .join(', ');
  return [
    slots,
    `Tipos disponibles: ${slotTypes}`,
    `Canales: ${channels}`,
    `Prioridad: ${PRIORITY_LABELS[cfg.priority_tier] ?? cfg.priority_tier}`,
    `Respuesta SLA: ${cfg.response_sla_hours}h`,
    cfg.slots_included > 0 || cfg.extra_slot_price !== '0.00'
      ? `Slot adicional: ${fmtCurrency(cfg.extra_slot_price)}/mes`
      : null,
  ].filter(Boolean) as string[];
}

export default function SupportInsidePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [plans, setPlans] = useState<SupportInsidePublicPlan[]>([]);
  const [subscription, setSubscription] =
    useState<SupportInsideSubscriptionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Sub-fase 8.D.12.8 — modal asignar slot.
  const [assignSlotOpen, setAssignSlotOpen] = useState(false);
  const [eligibleServices, setEligibleServices] = useState<
    SupportInsideEligibleService[]
  >([]);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedSlotType, setSelectedSlotType] =
    useState<SupportInsideSlotType>('maintenance');
  // GL-23 — cambio de plan (upgrade/downgrade con prorrateo, ADR-029 A1).
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [targetPricingId, setTargetPricingId] = useState('');
  const [planPreview, setPlanPreview] = useState<PlanChangePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [changing, setChanging] = useState(false);
  // F3·E8 — modal "Ver mantenimientos" (histórico por slot).
  const [historySlot, setHistorySlot] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await loadSupportInsideAction();
    if (!result.ok) {
      toast('error', result.error || 'No se pudo cargar Support Inside.');
    } else {
      setPlans(result.plans);
      setSubscription(result.subscription);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial planes + suscripción (one-shot post-mount); prop-driven via useCallback identity.
    void reload();
  }, [reload]);

  // Sub-fase 8.D.12.9 (ADR-076): el subscribe ya NO crea la subscription
  // directo desde aquí. Redirige a `/dashboard/billing/checkout?product_pricing_id=X`
  // — el flujo canónico de checkout (selector billing_profile, prorrateo
  // futuro, integración Stripe en una sola puerta). Tras éxito,
  // `useCheckout.handleCheckout` redirige a `/dashboard/support-inside`
  // (vista de gestión, ya con subscription creada por el listener
  // `support-inside-on-service-provisioned`).
  const goToCheckout = useCallback(
    (plan: SupportInsidePublicPlan) => {
      const target =
        cycle === 'yearly' ? plan.pricing.yearly : plan.pricing.monthly;
      if (!target) {
        toast('error', 'Este plan no tiene un precio activo en ese ciclo.');
        return;
      }
      router.push(
        `/dashboard/billing/checkout?product_pricing_id=${target.product_pricing_id}`,
      );
    },
    [cycle, router, toast],
  );

  const cancel = useCallback(async () => {
    setSubmitting(true);
    const result = await cancelSupportInsideAction();
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error || 'No se pudo cancelar.');
      return;
    }
    toast(
      'success',
      `Plan cancelado. ${result.releasedSlots} slot${
        result.releasedSlots !== 1 ? 's' : ''
      } liberado${result.releasedSlots !== 1 ? 's' : ''}.`,
    );
    setConfirmCancel(false);
    await reload();
  }, [reload, toast]);

  const releaseSlot = useCallback(
    async (slotId: string) => {
      setSubmitting(true);
      const result = await releaseSlotAction(slotId);
      setSubmitting(false);
      if (!result.ok) {
        toast('error', result.error || 'No se pudo liberar el slot.');
        return;
      }
      toast('success', 'Slot liberado.');
      await reload();
    },
    [reload, toast],
  );

  /*
   * Sub-fase 8.D.12.8 — abrir modal asignar slot: carga lista elegibles
   * y pre-selecciona el primer slot_type permitido por el plan.
   */
  const openAssignSlot = useCallback(async () => {
    if (!subscription) return;
    setAssignSlotOpen(true);
    setSelectedServiceId('');
    const allowed =
      subscription.product.support_inside_config?.slot_types_allowed ?? [];
    setSelectedSlotType(allowed[0] ?? 'maintenance');
    const result = await listEligibleServicesAction();
    if (!result.ok) {
      toast('error', result.error || 'No se pudieron cargar tus servicios.');
      return;
    }
    setEligibleServices(result.services);
    if (result.services.length > 0) setSelectedServiceId(result.services[0].id);
  }, [subscription, toast]);

  const confirmAssignSlot = useCallback(async () => {
    if (!selectedServiceId || !selectedSlotType) return;
    setSubmitting(true);
    const result = await addSlotAction({
      service_id: selectedServiceId,
      slot_type: selectedSlotType,
    });
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error || 'No se pudo asignar el slot.');
      return;
    }
    toast('success', 'Slot asignado al servicio.');
    setAssignSlotOpen(false);
    await reload();
  }, [reload, selectedServiceId, selectedSlotType, toast]);

  /* ── GL-23 — cambio de plan ── */
  const openChangePlan = useCallback(() => {
    setChangePlanOpen(true);
    setTargetPricingId('');
    setPlanPreview(null);
  }, []);

  const onSelectTargetPlan = useCallback(
    async (pricingId: string) => {
      setTargetPricingId(pricingId);
      setPlanPreview(null);
      if (!pricingId) return;
      setPreviewing(true);
      const r = await previewUpgradeAction(pricingId);
      setPreviewing(false);
      if (r.ok) setPlanPreview(r.preview);
      else toast('error', r.error);
    },
    [toast],
  );

  const confirmChangePlan = useCallback(async () => {
    if (!targetPricingId) return;
    setChanging(true);
    const r = await upgradeSupportInsideAction(targetPricingId);
    setChanging(false);
    if (!r.ok) {
      toast('error', r.error);
      return;
    }
    toast('success', 'Plan cambiado. Aplicamos el prorrateo como crédito.');
    setChangePlanOpen(false);
    await reload();
  }, [targetPricingId, toast, reload]);

  const planOptions = useMemo(
    () =>
      plans.flatMap((p) => {
        const opts: { value: string; label: string }[] = [];
        if (p.pricing.monthly)
          opts.push({
            value: p.pricing.monthly.product_pricing_id,
            label: `${p.name} — mensual (${fmtCurrency(p.pricing.monthly.price, p.pricing.monthly.currency)})`,
          });
        if (p.pricing.yearly)
          opts.push({
            value: p.pricing.yearly.product_pricing_id,
            label: `${p.name} — anual (${fmtCurrency(p.pricing.yearly.price, p.pricing.yearly.currency)})`,
          });
        return opts;
      }),
    [plans],
  );

  /* ── Loading ── */
  if (loading) {
    return (
      <div className={s.page}>
        <header className={s.header}>
          <h1 className={s.title}>Support Inside</h1>
          <p className={s.subtitle}>Cargando…</p>
        </header>
        <div className={s.compare}>
          <Skeleton height={420} />
          <Skeleton height={420} />
          <Skeleton height={420} />
        </div>
      </div>
    );
  }

  /* ── Vista de gestión (cliente con subscription activa) ── */
  if (subscription) {
    return (
      <div className={s.page}>
        <header className={s.header}>
          <h1 className={s.title}>Support Inside</h1>
          <p className={s.subtitle}>
            Tienes contratado {subscription.product.name}. Aquí ves tus slots
            asignados y los canales activos de tu plan.
          </p>
        </header>

        <ManagedView
          subscription={subscription}
          submitting={submitting}
          onReleaseSlot={releaseSlot}
          onAssignSlot={openAssignSlot}
          onViewHistory={(id, name) => setHistorySlot({ id, name })}
          onGoBilling={() => router.push('/dashboard/billing')}
        />

        {/* Acciones de plan — C2c lo reskineará al comparador siempre-visible
            + danger zone del mockup. De momento preserva la funcionalidad. */}
        <div className={s.planActions}>
          <Button variant="secondary" size="sm" onClick={openChangePlan}>
            Cambiar de plan
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmCancel(true)}
            disabled={submitting}
          >
            Cancelar plan
          </Button>
        </div>

        <MaintenanceHistoryModal
          slotId={historySlot?.id ?? null}
          serviceName={historySlot?.name}
          onClose={() => setHistorySlot(null)}
        />

        <Modal
          open={confirmCancel}
          onClose={() => (submitting ? undefined : setConfirmCancel(false))}
          title="Cancelar Support Inside"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setConfirmCancel(false)}
                disabled={submitting}
              >
                Volver
              </Button>
              <Button variant="danger" onClick={cancel} loading={submitting}>
                Cancelar plan
              </Button>
            </>
          }
        >
          <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
            Cancelar liberará todos tus slots asignados. Tus servicios técnicos
            (hosting, dominio, etc.) seguirán activos — sólo se desactiva el
            mantenimiento Support Inside. Podrás contratar de nuevo en
            cualquier momento.
          </p>
        </Modal>

        {/* Sub-fase 8.D.12.8 — asignar slot a un servicio */}
        <Modal
          open={assignSlotOpen}
          onClose={() => (submitting ? undefined : setAssignSlotOpen(false))}
          title="Asignar slot Support Inside a un servicio"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setAssignSlotOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmAssignSlot}
                loading={submitting}
                disabled={!selectedServiceId || eligibleServices.length === 0}
              >
                Asignar slot
              </Button>
            </>
          }
        >
          <AssignSlotForm
            subscription={subscription}
            services={eligibleServices}
            selectedServiceId={selectedServiceId}
            selectedSlotType={selectedSlotType}
            onSelectService={setSelectedServiceId}
            onSelectSlotType={setSelectedSlotType}
          />
        </Modal>

        {/* GL-23 — cambiar de plan con prorrateo (ADR-029 A1) */}
        <Modal
          open={changePlanOpen}
          onClose={() => (changing ? undefined : setChangePlanOpen(false))}
          title="Cambiar de plan"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setChangePlanOpen(false)}
                disabled={changing}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmChangePlan}
                loading={changing}
                disabled={!planPreview || previewing}
              >
                Confirmar cambio
              </Button>
            </>
          }
        >
          <ChangePlanForm
            options={planOptions}
            targetPricingId={targetPricingId}
            preview={planPreview}
            previewing={previewing}
            onSelect={onSelectTargetPlan}
          />
        </Modal>
      </div>
    );
  }

  /* ── Vista comparador (cliente sin subscription) ── */
  if (plans.length === 0) {
    return (
      <div className={s.page}>
        <header className={s.header}>
          <h1 className={s.title}>Support Inside</h1>
          <p className={s.subtitle}>
            No hay planes disponibles ahora mismo. Si necesitas soporte
            inmediato, contáctanos desde la sección de Soporte.
          </p>
        </header>
      </div>
    );
  }

  const featuredSlug = plans.length >= 3 ? plans[1].slug : plans[0].slug;

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h1 className={s.title}>Support Inside</h1>
        <p className={s.subtitle}>
          Tier de cuenta para cliente con soporte humano, mantenimiento mensual
          y canales prioritarios. Elige el plan que mejor encaja contigo.
        </p>
      </header>

      <div
        className={s.cycleToggle}
        role="tablist"
        aria-label="Ciclo de facturación"
      >
        <button
          type="button"
          role="tab"
          aria-selected={cycle === 'monthly'}
          className={`${s.cycleBtn} ${cycle === 'monthly' ? s.cycleBtnActive : ''}`}
          onClick={() => setCycle('monthly')}
        >
          Mensual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={cycle === 'yearly'}
          className={`${s.cycleBtn} ${cycle === 'yearly' ? s.cycleBtnActive : ''}`}
          onClick={() => setCycle('yearly')}
        >
          Anual <span className={s.savingsBadge}>−15%</span>
        </button>
      </div>

      <div className={s.compare}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            cycle={cycle}
            featured={plan.slug === featuredSlug}
            disabled={submitting}
            onSelect={() => goToCheckout(plan)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Subcomponentes ── */

function PlanCard({
  plan,
  cycle,
  featured,
  disabled,
  onSelect,
}: {
  plan: SupportInsidePublicPlan;
  cycle: 'monthly' | 'yearly';
  featured: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const features = useMemo(() => buildPlanFeatures(plan), [plan]);
  const target = cycle === 'yearly' ? plan.pricing.yearly : plan.pricing.monthly;

  return (
    <div className={`${s.planCard} ${featured ? s.planCardFeatured : ''}`}>
      {plan.badge_text && (
        <span className={s.planBadge}>{plan.badge_text}</span>
      )}
      <h2 className={s.planName}>{plan.name}</h2>
      <p className={s.planTagline}>{plan.short_description}</p>

      {target ? (
        <>
          <div className={s.priceBlock}>
            <span className={s.priceAmount}>
              {fmtCurrency(target.price, target.currency)}
            </span>
            <span className={s.priceCycle}>
              /{cycle === 'monthly' ? 'mes' : 'año'}
            </span>
          </div>
          {cycle === 'yearly' && (
            <p className={s.yearlyHint}>
              Equivalente a {fmtCurrency(Number(target.price) / 12, target.currency)}/mes
            </p>
          )}
          {cycle === 'monthly' && (
            <p className={s.yearlyHint}>Sin permanencia. Cancela cuando quieras.</p>
          )}
        </>
      ) : (
        <p className={s.yearlyHint}>Precio no disponible en este ciclo.</p>
      )}

      <ul className={s.featureList}>
        {features.map((f) => (
          <li key={f} className={s.featureItem}>
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className={s.planFooter}>
        <Button
          fullWidth
          variant={featured ? 'primary' : 'secondary'}
          disabled={!target || disabled}
          onClick={onSelect}
        >
          Suscribirme
        </Button>
      </div>
    </div>
  );
}

/**
 * AssignSlotForm — Sub-fase 8.D.12.8
 *
 * Formulario del modal "Asignar slot" en `/dashboard/support-inside` (vista
 * de gestión). Renderiza dos selects:
 *   1. Servicio del cliente sin slot SI activo (lista cargada por el padre).
 *   2. Tipo de slot — limitado a los `slot_types_allowed` del plan
 *      contratado (Básico/Medium: solo `maintenance` · Pro: ambos).
 *
 * Si el cliente no tiene servicios elegibles, muestra empty state con CTA
 * para crear/contratar un servicio (`/dashboard/billing/checkout`).
 */
function AssignSlotForm({
  subscription,
  services,
  selectedServiceId,
  selectedSlotType,
  onSelectService,
  onSelectSlotType,
}: {
  subscription: SupportInsideSubscriptionPayload;
  services: SupportInsideEligibleService[];
  selectedServiceId: string;
  selectedSlotType: SupportInsideSlotType;
  onSelectService: (id: string) => void;
  onSelectSlotType: (t: SupportInsideSlotType) => void;
}) {
  const allowed =
    subscription.product.support_inside_config?.slot_types_allowed ?? [
      'maintenance',
    ];
  const slotTypeOptions = allowed.map((t) => ({
    value: t,
    label: SLOT_TYPE_LABELS[t] ?? t,
  }));

  if (services.length === 0) {
    // Sub-fase 8.D.12 (2026-05-01): el backend filtra por
    // `applicable_product_types` del plan + servicios sin slot activo.
    // Si el plan tiene tipos declarados, mencionamos cuáles aceptaba para
    // que el cliente entienda por qué su servicio (ej. dominio) no aparece.
    const cfg = subscription.product.support_inside_config;
    const types = cfg?.applicable_product_types ?? [];
    const PRODUCT_TYPE_LABELS: Record<string, string> = {
      hosting_web: 'Hosting web',
      docker_service: 'Docker service',
      domain: 'Dominios',
      we_do_it: 'We Do It',
      custom_service: 'Proyectos custom',
      support_inside: '',
    };
    const typesLabel = types
      .map((t) => PRODUCT_TYPE_LABELS[t] || t)
      .filter(Boolean)
      .join(', ');
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          No tienes servicios elegibles para este plan. Necesitas un servicio
          activo del tipo correcto que aún no tenga un slot Support Inside.
        </p>
        {types.length > 0 && (
          <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
            Tu plan {subscription.product.name} cubre: <strong>{typesLabel}</strong>.
          </p>
        )}
        <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
          Contrata un servicio compatible desde &laquo;Mis facturas → Contratar servicio&raquo;
          y vuelve a esta página para asignar el slot.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Select
        label="Servicio a cubrir"
        value={selectedServiceId}
        onChange={(e) => onSelectService(e.target.value)}
        options={services.map((sv) => ({
          value: sv.id,
          label:
            (sv.label || sv.domain || sv.product_name) +
            (sv.domain && sv.label ? ` · ${sv.domain}` : ''),
        }))}
        helperText="Solo aparecen tus servicios activos sin slot Support Inside ya asignado."
      />
      <Select
        label="Tipo de slot"
        value={selectedSlotType}
        onChange={(e) =>
          onSelectSlotType(e.target.value as SupportInsideSlotType)
        }
        options={slotTypeOptions}
        helperText={
          allowed.length === 1
            ? `Tu plan ${subscription.product.name} solo permite slots de tipo ${SLOT_TYPE_LABELS[allowed[0]]}.`
            : 'Tu plan Pro permite ambos tipos. Mantenimiento + gestión incluye acompañamiento proactivo.'
        }
      />
    </div>
  );
}

/**
 * ChangePlanForm — GL-23 / ADR-029 A1.
 *
 * Selector del nuevo plan/ciclo + desglose del prorrateo (R5: el cliente ve el
 * importe a pagar y el crédito aplicado ANTES de confirmar). El backend
 * recalcula server-side al confirmar (el importe nunca viene del cliente).
 */
function ChangePlanForm({
  options,
  targetPricingId,
  preview,
  previewing,
  onSelect,
}: {
  options: { value: string; label: string }[];
  targetPricingId: string;
  preview: PlanChangePreview | null;
  previewing: boolean;
  onSelect: (pricingId: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Select
        label="Nuevo plan / ciclo"
        value={targetPricingId}
        onChange={(e) => onSelect(e.target.value)}
        options={options}
        placeholder="Elige un plan"
        helperText="Aplicamos el prorrateo de los días no usados como crédito (sin devolución de dinero)."
      />

      {previewing && (
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
          Calculando el prorrateo…
        </p>
      )}

      {preview && (
        <>
          <div className={s.statRow}>
            <div className={s.stat}>
              <span className={s.statLabel}>Pagas ahora</span>
              <span className={s.statValue}>
                {fmtCurrency(preview.amount_to_pay, preview.currency)}
              </span>
            </div>
            {preview.credit_eur > 0 && (
              <div className={s.stat}>
                <span className={s.statLabel}>Crédito aplicado</span>
                <span className={s.statValue}>
                  {fmtCurrency(preview.credit_eur, preview.currency)}
                </span>
              </div>
            )}
            {preview.credit_remaining_eur > 0 && (
              <div className={s.stat}>
                <span className={s.statLabel}>Crédito sobrante</span>
                <span className={s.statValue}>
                  {fmtCurrency(preview.credit_remaining_eur, preview.currency)}
                </span>
              </div>
            )}
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
            }}
          >
            Nuevo plan: {preview.new_plan.billing_cycle} ·{' '}
            {fmtCurrency(preview.new_plan.amount, preview.currency)}. El próximo
            período va hasta el{' '}
            {new Intl.DateTimeFormat('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }).format(new Date(preview.new_period_end))}
            .
          </p>
        </>
      )}
    </div>
  );
}
