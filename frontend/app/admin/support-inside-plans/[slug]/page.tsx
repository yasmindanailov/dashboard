'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  supportInsideApi,
  type SupportInsideAdminPlanDetail,
  type SupportInsideChannel,
  type SupportInsideCtaVisibility,
  type SupportInsidePlanPatch,
  type SupportInsidePriorityTier,
  type SupportInsideSlotType,
  type ProductStatus,
  type ProductTypeSlug,
} from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';
import {
  Breadcrumb,
  EditorSectionCard,
  Input,
  Select,
  Textarea,
  useToast,
} from '../../../components/ui';
import s from './page.module.css';

/* ═══════════════════════════════════════
   /admin/support-inside-plans/[slug] — editor (Sprint 8 Fase D · 8.D.6b)
   ADR-075 §B.2: 5 secciones card extensibles. Cada card guarda su subset.
   Patrón canónico para crecimiento sin redesign:
     - Cada sprint añade UNA card nueva al final.
     - NO redistribuye campos entre cards existentes (rompe muscle memory).
   ═══════════════════════════════════════ */

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'deprecated', label: 'Obsoleto' },
];

const PRIORITY_OPTIONS = [
  { value: 'standard', label: 'Estándar' },
  { value: 'high', label: 'Alta' },
  { value: 'max', label: 'Máxima' },
];

const CTA_OPTIONS = [
  { value: 'hidden', label: 'Oculto' },
  { value: 'catalog_banner', label: 'Banner en catálogo' },
  { value: 'landing_cta', label: 'CTA en landing' },
];

const SLOT_TYPE_DEFS: { value: SupportInsideSlotType; label: string }[] = [
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'maintenance_management', label: 'Mantenimiento + gestión' },
];

// Sub-fase 8.D.12 (2026-05-01): productos a los que el admin puede
// permitir asignar slots SI. Excluye `support_inside` (auto-asignación
// absurda — el plan SI vive en `services` solo como vehículo de billing,
// no es mantenible) y filtra el dropdown del editor.
const APPLICABLE_PRODUCT_TYPE_DEFS: { value: ProductTypeSlug; label: string }[] = [
  { value: 'hosting_web', label: 'Hosting web' },
  { value: 'docker_service', label: 'Docker service' },
  { value: 'domain', label: 'Dominio' },
  { value: 'we_do_it', label: 'We Do It (addon)' },
  { value: 'custom_service', label: 'Proyecto custom' },
];

const CHANNEL_DEFS: { value: SupportInsideChannel; label: string }[] = [
  { value: 'webchat', label: 'Chat web' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

type SectionKey = 'identity' | 'pricing' | 'slots' | 'support' | 'advanced';

interface Snapshot {
  identity: {
    name: string;
    short_description: string;
    description: string;
    status: ProductStatus;
  };
  pricing: {
    monthly: { price: string; currency: string };
    yearly: { price: string; currency: string; discount_percentage: string };
  };
  slots: {
    slots_included: number;
    slot_types_allowed: SupportInsideSlotType[];
    applicable_product_types: ProductTypeSlug[];
    extra_slot_price: string;
  };
  support: {
    channels_active: SupportInsideChannel[];
    priority_tier: SupportInsidePriorityTier;
    response_sla_hours: number;
  };
  advanced: {
    partner_commission_pct: string;
    cta_visibility: SupportInsideCtaVisibility;
  };
}

function snapshotFromDetail(detail: SupportInsideAdminPlanDetail): Snapshot {
  const cfg = detail.support_inside_config;
  const monthly = detail.pricing.find((p) => p.billing_cycle === 'monthly');
  const yearly = detail.pricing.find((p) => p.billing_cycle === 'annual');
  return {
    identity: {
      name: detail.name,
      short_description: detail.short_description ?? '',
      description: detail.description ?? '',
      status: detail.status,
    },
    pricing: {
      monthly: {
        price: monthly?.price ?? '0.00',
        currency: monthly?.currency ?? 'EUR',
      },
      yearly: {
        price: yearly?.price ?? '0.00',
        currency: yearly?.currency ?? 'EUR',
        discount_percentage: yearly?.discount_percentage ?? '',
      },
    },
    slots: {
      slots_included: cfg?.slots_included ?? 0,
      slot_types_allowed: cfg?.slot_types_allowed ?? [],
      applicable_product_types: cfg?.applicable_product_types ?? [],
      extra_slot_price: cfg?.extra_slot_price ?? '0.00',
    },
    support: {
      channels_active: cfg?.channels_active ?? [],
      priority_tier: cfg?.priority_tier ?? 'standard',
      response_sla_hours: cfg?.response_sla_hours ?? 24,
    },
    advanced: {
      partner_commission_pct: detail.partner_commission_pct ?? '',
      cta_visibility: cfg?.cta_visibility ?? 'hidden',
    },
  };
}

export default function SupportInsidePlanEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [detail, setDetail] = useState<SupportInsideAdminPlanDetail | null>(
    null,
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Snapshot | null>(null);
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [loading, setLoading] = useState(true);

  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('access_token') || ''
      : '';

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const d = await supportInsideApi.adminGet(token, slug);
      const snap = snapshotFromDetail(d);
      setDetail(d);
      setSnapshot(snap);
      setDraft(snap);
    } catch (err) {
      toast('error', getErrorMessage(err) || 'No se pudo cargar el plan.');
      router.push('/admin/support-inside-plans');
    } finally {
      setLoading(false);
    }
  }, [router, slug, toast, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dirty = useMemo<Record<SectionKey, boolean>>(() => {
    if (!snapshot || !draft) {
      return {
        identity: false,
        pricing: false,
        slots: false,
        support: false,
        advanced: false,
      };
    }
    return {
      identity: !shallowEqual(snapshot.identity, draft.identity),
      pricing:
        !shallowEqual(snapshot.pricing.monthly, draft.pricing.monthly) ||
        !shallowEqual(snapshot.pricing.yearly, draft.pricing.yearly),
      slots:
        snapshot.slots.slots_included !== draft.slots.slots_included ||
        snapshot.slots.extra_slot_price !== draft.slots.extra_slot_price ||
        !arrayEqualUnordered(
          snapshot.slots.slot_types_allowed,
          draft.slots.slot_types_allowed,
        ) ||
        !arrayEqualUnordered(
          snapshot.slots.applicable_product_types,
          draft.slots.applicable_product_types,
        ),
      support:
        snapshot.support.priority_tier !== draft.support.priority_tier ||
        snapshot.support.response_sla_hours !==
          draft.support.response_sla_hours ||
        !arrayEqualUnordered(
          snapshot.support.channels_active,
          draft.support.channels_active,
        ),
      advanced:
        snapshot.advanced.partner_commission_pct !==
          draft.advanced.partner_commission_pct ||
        snapshot.advanced.cta_visibility !== draft.advanced.cta_visibility,
    };
  }, [snapshot, draft]);

  /* ── Warning al navegar con cambios sin guardar ── */
  useEffect(() => {
    const anyDirty = Object.values(dirty).some(Boolean);
    if (!anyDirty) return undefined;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const saveSection = useCallback(
    async (section: SectionKey) => {
      if (!draft || !snapshot) return;
      const patch: SupportInsidePlanPatch = {};
      if (section === 'identity') {
        if (draft.identity.name !== snapshot.identity.name) {
          patch.name = draft.identity.name;
        }
        if (
          draft.identity.short_description !==
          snapshot.identity.short_description
        ) {
          patch.short_description =
            draft.identity.short_description.trim() === ''
              ? null
              : draft.identity.short_description;
        }
        if (draft.identity.description !== snapshot.identity.description) {
          patch.description =
            draft.identity.description.trim() === ''
              ? null
              : draft.identity.description;
        }
        if (draft.identity.status !== snapshot.identity.status) {
          patch.status = draft.identity.status;
        }
      } else if (section === 'pricing') {
        const pricing: NonNullable<SupportInsidePlanPatch['pricing']> = {};
        if (
          draft.pricing.monthly.price !== snapshot.pricing.monthly.price ||
          draft.pricing.monthly.currency !== snapshot.pricing.monthly.currency
        ) {
          pricing.monthly = {
            price: Number(draft.pricing.monthly.price),
            currency: draft.pricing.monthly.currency,
          };
        }
        if (
          draft.pricing.yearly.price !== snapshot.pricing.yearly.price ||
          draft.pricing.yearly.currency !== snapshot.pricing.yearly.currency ||
          draft.pricing.yearly.discount_percentage !==
            snapshot.pricing.yearly.discount_percentage
        ) {
          pricing.annual = {
            price: Number(draft.pricing.yearly.price),
            currency: draft.pricing.yearly.currency,
            discount_percentage:
              draft.pricing.yearly.discount_percentage.trim() === ''
                ? null
                : Number(draft.pricing.yearly.discount_percentage),
          };
        }
        if (Object.keys(pricing).length > 0) patch.pricing = pricing;
      } else if (section === 'slots') {
        if (
          draft.slots.slots_included !== snapshot.slots.slots_included
        ) {
          patch.slots_included = draft.slots.slots_included;
        }
        if (
          !arrayEqualUnordered(
            draft.slots.slot_types_allowed,
            snapshot.slots.slot_types_allowed,
          )
        ) {
          patch.slot_types_allowed = [...draft.slots.slot_types_allowed];
        }
        if (
          !arrayEqualUnordered(
            draft.slots.applicable_product_types,
            snapshot.slots.applicable_product_types,
          )
        ) {
          patch.applicable_product_types = [
            ...draft.slots.applicable_product_types,
          ];
        }
        if (
          draft.slots.extra_slot_price !== snapshot.slots.extra_slot_price
        ) {
          patch.extra_slot_price = Number(draft.slots.extra_slot_price);
        }
      } else if (section === 'support') {
        if (
          !arrayEqualUnordered(
            draft.support.channels_active,
            snapshot.support.channels_active,
          )
        ) {
          patch.channels_active = [...draft.support.channels_active];
        }
        if (draft.support.priority_tier !== snapshot.support.priority_tier) {
          patch.priority_tier = draft.support.priority_tier;
        }
        if (
          draft.support.response_sla_hours !==
          snapshot.support.response_sla_hours
        ) {
          patch.response_sla_hours = draft.support.response_sla_hours;
        }
      } else if (section === 'advanced') {
        if (
          draft.advanced.partner_commission_pct !==
          snapshot.advanced.partner_commission_pct
        ) {
          patch.partner_commission_pct =
            draft.advanced.partner_commission_pct.trim() === ''
              ? 0
              : Number(draft.advanced.partner_commission_pct);
        }
        if (draft.advanced.cta_visibility !== snapshot.advanced.cta_visibility) {
          patch.cta_visibility = draft.advanced.cta_visibility;
        }
      }

      if (Object.keys(patch).length === 0) return;

      setSavingSection(section);
      try {
        const updated = await supportInsideApi.adminUpdate(token, slug, patch);
        const newSnap = snapshotFromDetail(updated);
        setDetail(updated);
        setSnapshot(newSnap);
        setDraft((prev) =>
          prev
            ? { ...prev, [section]: newSnap[section] }
            : newSnap,
        );
        toast('success', `Sección "${SECTION_LABELS[section]}" guardada.`);
      } catch (err) {
        toast('error', getErrorMessage(err) || 'No se pudieron guardar los cambios.');
      } finally {
        setSavingSection(null);
      }
    },
    [draft, slug, snapshot, toast, token],
  );

  const resetSection = useCallback(
    (section: SectionKey) => {
      if (!snapshot || !draft) return;
      setDraft({ ...draft, [section]: snapshot[section] });
    },
    [draft, snapshot],
  );

  if (loading || !draft || !detail) {
    return (
      <div className={s.page}>
        <p className={s.loading}>Cargando plan…</p>
      </div>
    );
  }

  return (
    <div className={s.page}>
      <Breadcrumb
        items={[
          { label: 'Support Inside', href: '/admin/support-inside-plans' },
          { label: detail.name },
        ]}
      />
      <header className={s.header}>
        <h1 className={s.title}>{detail.name}</h1>
        <p className={s.subtitle}>
          Slug: <code>{detail.slug}</code>. Cada sección se guarda por separado
          para evitar afectar suscripciones activas a mitad de edición.
        </p>
      </header>

      {/* 1. Identidad ─────────────────────────── */}
      <EditorSectionCard
        title="Identidad"
        description="Nombre visible al cliente, descripción corta del comparador, descripción larga y estado activo."
        dirty={dirty.identity}
        saving={savingSection === 'identity'}
        onSave={() => saveSection('identity')}
        onReset={() => resetSection('identity')}
      >
        <Input
          label="Nombre del plan"
          value={draft.identity.name}
          onChange={(e) =>
            setDraft({
              ...draft,
              identity: { ...draft.identity, name: e.target.value },
            })
          }
        />
        <Input
          label="Descripción corta"
          helperText="Aparece como subtítulo de la card en el comparador cliente."
          value={draft.identity.short_description}
          onChange={(e) =>
            setDraft({
              ...draft,
              identity: {
                ...draft.identity,
                short_description: e.target.value,
              },
            })
          }
        />
        <Textarea
          label="Descripción extendida"
          helperText="Texto largo del plan (ficha cliente, landing futura)."
          rows={4}
          value={draft.identity.description}
          onChange={(e) =>
            setDraft({
              ...draft,
              identity: { ...draft.identity, description: e.target.value },
            })
          }
        />
        <Select
          label="Estado"
          value={draft.identity.status}
          options={STATUS_OPTIONS}
          onChange={(e) =>
            setDraft({
              ...draft,
              identity: {
                ...draft.identity,
                status: e.target.value as ProductStatus,
              },
            })
          }
          helperText="`Inactivo` oculta el plan en el comparador cliente; suscripciones existentes no se ven afectadas."
        />
      </EditorSectionCard>

      {/* 2. Precios ────────────────────────────── */}
      <EditorSectionCard
        title="Precios"
        description="Pricing mensual y anual. Los cambios afectan a clientes nuevos; las suscripciones activas mantienen su precio contratado."
        dirty={dirty.pricing}
        saving={savingSection === 'pricing'}
        onSave={() => saveSection('pricing')}
        onReset={() => resetSection('pricing')}
        hint="Las suscripciones activas no se renegocian al cambiar el precio aquí."
      >
        <div className={s.row2}>
          <Input
            label="Precio mensual"
            type="number"
            min="0"
            step="0.01"
            value={draft.pricing.monthly.price}
            onChange={(e) =>
              setDraft({
                ...draft,
                pricing: {
                  ...draft.pricing,
                  monthly: {
                    ...draft.pricing.monthly,
                    price: e.target.value,
                  },
                },
              })
            }
          />
          <Input
            label="Moneda mensual"
            value={draft.pricing.monthly.currency}
            maxLength={3}
            onChange={(e) =>
              setDraft({
                ...draft,
                pricing: {
                  ...draft.pricing,
                  monthly: {
                    ...draft.pricing.monthly,
                    currency: e.target.value.toUpperCase(),
                  },
                },
              })
            }
          />
        </div>
        <div className={s.row2}>
          <Input
            label="Precio anual"
            type="number"
            min="0"
            step="0.01"
            value={draft.pricing.yearly.price}
            onChange={(e) =>
              setDraft({
                ...draft,
                pricing: {
                  ...draft.pricing,
                  yearly: {
                    ...draft.pricing.yearly,
                    price: e.target.value,
                  },
                },
              })
            }
          />
          <Input
            label="Descuento anual (%)"
            type="number"
            min="0"
            max="100"
            step="0.01"
            helperText="Mostrado al cliente como ahorro vs mensual×12."
            value={draft.pricing.yearly.discount_percentage}
            onChange={(e) =>
              setDraft({
                ...draft,
                pricing: {
                  ...draft.pricing,
                  yearly: {
                    ...draft.pricing.yearly,
                    discount_percentage: e.target.value,
                  },
                },
              })
            }
          />
        </div>
      </EditorSectionCard>

      {/* 3. Slots y capacidades ──────────────────── */}
      <EditorSectionCard
        title="Slots y capacidades"
        description="Slots de mantenimiento incluidos en el plan, tipos permitidos y precio del slot adicional."
        dirty={dirty.slots}
        saving={savingSection === 'slots'}
        onSave={() => saveSection('slots')}
        onReset={() => resetSection('slots')}
      >
        <div className={s.row2}>
          <Input
            label="Slots incluidos"
            type="number"
            min="0"
            max="100"
            value={String(draft.slots.slots_included)}
            onChange={(e) =>
              setDraft({
                ...draft,
                slots: {
                  ...draft.slots,
                  slots_included: Number(e.target.value),
                },
              })
            }
          />
          <Input
            label="Precio slot adicional (€)"
            type="number"
            min="0"
            step="0.01"
            value={draft.slots.extra_slot_price}
            onChange={(e) =>
              setDraft({
                ...draft,
                slots: { ...draft.slots, extra_slot_price: e.target.value },
              })
            }
          />
        </div>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Tipos de slot permitidos</span>
          <div className={s.checkboxList}>
            {SLOT_TYPE_DEFS.map((def) => {
              const active = draft.slots.slot_types_allowed.includes(def.value);
              return (
                <button
                  key={def.value}
                  type="button"
                  className={`${s.chipBtn} ${active ? s.chipBtnActive : ''}`}
                  aria-pressed={active}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      slots: {
                        ...draft.slots,
                        slot_types_allowed: active
                          ? draft.slots.slot_types_allowed.filter(
                              (t) => t !== def.value,
                            )
                          : [...draft.slots.slot_types_allowed, def.value],
                      },
                    })
                  }
                >
                  {def.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Productos elegibles para mantenimiento</span>
          <p className={s.fieldHint} style={{ marginBottom: 'var(--space-2)' }}>
            Productos del catálogo a los que el cliente puede asignar el slot.
            Si no marcas ninguno, no podrá asignar slots (deshabilita el plan
            funcionalmente). El plan Support Inside nunca aparece como
            elegible — los planes SI no se mantienen a sí mismos.
          </p>
          <div className={s.checkboxList}>
            {APPLICABLE_PRODUCT_TYPE_DEFS.map((def) => {
              const active = draft.slots.applicable_product_types.includes(
                def.value,
              );
              return (
                <button
                  key={def.value}
                  type="button"
                  className={`${s.chipBtn} ${active ? s.chipBtnActive : ''}`}
                  aria-pressed={active}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      slots: {
                        ...draft.slots,
                        applicable_product_types: active
                          ? draft.slots.applicable_product_types.filter(
                              (t) => t !== def.value,
                            )
                          : [...draft.slots.applicable_product_types, def.value],
                      },
                    })
                  }
                >
                  {def.label}
                </button>
              );
            })}
          </div>
        </div>
      </EditorSectionCard>

      {/* 4. Soporte y canales ──────────────────── */}
      <EditorSectionCard
        title="Soporte y canales"
        description="Canales activos para los clientes del plan, prioridad relativa en la cola del agente y SLA de respuesta."
        dirty={dirty.support}
        saving={savingSection === 'support'}
        onSave={() => saveSection('support')}
        onReset={() => resetSection('support')}
      >
        <div className={s.fieldGroup}>
          <span className={s.fieldLabel}>Canales activos</span>
          <div className={s.checkboxList}>
            {CHANNEL_DEFS.map((def) => {
              const active = draft.support.channels_active.includes(def.value);
              return (
                <button
                  key={def.value}
                  type="button"
                  className={`${s.chipBtn} ${active ? s.chipBtnActive : ''}`}
                  aria-pressed={active}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      support: {
                        ...draft.support,
                        channels_active: active
                          ? draft.support.channels_active.filter(
                              (c) => c !== def.value,
                            )
                          : [...draft.support.channels_active, def.value],
                      },
                    })
                  }
                >
                  {def.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className={s.row2}>
          <Select
            label="Prioridad relativa"
            value={draft.support.priority_tier}
            options={PRIORITY_OPTIONS}
            onChange={(e) =>
              setDraft({
                ...draft,
                support: {
                  ...draft.support,
                  priority_tier: e.target.value as SupportInsidePriorityTier,
                },
              })
            }
          />
          <Input
            label="SLA respuesta (horas)"
            type="number"
            min="1"
            max="720"
            value={String(draft.support.response_sla_hours)}
            onChange={(e) =>
              setDraft({
                ...draft,
                support: {
                  ...draft.support,
                  response_sla_hours: Number(e.target.value),
                },
              })
            }
          />
        </div>
      </EditorSectionCard>

      {/* 5. Configuración avanzada ──────────────── */}
      <EditorSectionCard
        title="Configuración avanzada"
        description="Comisión a partner por venta del plan y dónde mostrar el CTA en el catálogo."
        dirty={dirty.advanced}
        saving={savingSection === 'advanced'}
        onSave={() => saveSection('advanced')}
        onReset={() => resetSection('advanced')}
      >
        <div className={s.row2}>
          <Input
            label="Comisión partner (%)"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={draft.advanced.partner_commission_pct}
            onChange={(e) =>
              setDraft({
                ...draft,
                advanced: {
                  ...draft.advanced,
                  partner_commission_pct: e.target.value,
                },
              })
            }
            helperText="0% si el plan no participa en el programa partner."
          />
          <Select
            label="Visibilidad CTA"
            value={draft.advanced.cta_visibility}
            options={CTA_OPTIONS}
            onChange={(e) =>
              setDraft({
                ...draft,
                advanced: {
                  ...draft.advanced,
                  cta_visibility: e.target.value as SupportInsideCtaVisibility,
                },
              })
            }
          />
        </div>
      </EditorSectionCard>
    </div>
  );
}

const SECTION_LABELS: Record<SectionKey, string> = {
  identity: 'Identidad',
  pricing: 'Precios',
  slots: 'Slots y capacidades',
  support: 'Soporte y canales',
  advanced: 'Configuración avanzada',
};

function shallowEqual<T extends Record<string, unknown>>(a: T, b: T): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function arrayEqualUnordered<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  for (const item of a) {
    if (!setB.has(item)) return false;
  }
  return true;
}
