'use client';

/**
 * ChangePlanCard — UI cliente del cambio de plan con prorrateo (ADR-029).
 *
 * Card en el detalle de servicio (aside) con CTA "Cambiar de plan" → modal con
 * picker de ciclos + **desglose del prorrateo (R5: transparencia obligatoria — el
 * cliente lo ve ANTES de confirmar)** + confirm. Todo server-side: las opciones,
 * el preview y el cobro los resuelve el backend (`/subscriptions/:id/change-plan/*`);
 * el frontend solo muestra y dispara (R5). Feedback vía Toast (D9), sin emojis (D1),
 * componentes del Design System (R16). El importe de renovación NO se repite aquí
 * (lo muestra la card de facturación contigua, D4).
 *
 * Alcance ADR-029: cambio de **ciclo en el mismo producto** (mensual ↔ anual…).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  AlertBanner,
  Button,
  DescriptionList,
  Modal,
  SectionCard,
  Select,
  useToast,
  type DescriptionItem,
  type SelectOption,
} from '../../../components/ui';
import type { PlanChangeOptions, PlanChangePreview } from '../../../lib/api';
import {
  confirmPlanChangeAction,
  planChangeOptionsAction,
  planChangePreviewAction,
} from '../_actions';
import styles from './ChangePlanCard.module.css';

const CYCLE_LABEL: Record<string, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  one_time: 'Pago único',
};
const cycleLabel = (c: string): string => CYCLE_LABEL[c] ?? c;
const money = (n: number, currency: string): string =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(n);
const day = (iso: string): string =>
  new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(
    new Date(iso),
  );

export function ChangePlanCard({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PlanChangeOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openModal = async (): Promise<void> => {
    setOpen(true);
    setSelected('');
    setPreview(null);
    setError(null);
    setOptions(null);
    setLoadingOptions(true);
    const res = await planChangeOptionsAction(serviceId);
    setLoadingOptions(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setOptions(res.data);
  };

  const onSelect = async (pricingId: string): Promise<void> => {
    setSelected(pricingId);
    setPreview(null);
    setError(null);
    if (!pricingId) return;
    setLoadingPreview(true);
    const res = await planChangePreviewAction(serviceId, pricingId);
    setLoadingPreview(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPreview(res.data);
  };

  const onConfirm = async (): Promise<void> => {
    if (!selected || !preview) return;
    setConfirming(true);
    const res = await confirmPlanChangeAction(serviceId, selected);
    setConfirming(false);
    if (!res.ok) {
      toast('error', res.error);
      return;
    }
    toast(
      'success',
      preview.amount_to_pay > 0
        ? 'Plan cambiado. Te hemos generado la factura del prorrateo.'
        : 'Plan cambiado. El crédito cubre el cambio; el sobrante queda a tu favor.',
    );
    setOpen(false);
    router.refresh();
  };

  const selectOptions: SelectOption[] = (options?.options ?? []).map((o) => ({
    value: o.id,
    label: `${cycleLabel(o.billing_cycle)} — ${money(o.price, o.currency)}`,
  }));

  const breakdown: DescriptionItem[] = preview
    ? [
        {
          term: 'Plan actual',
          value: `${cycleLabel(preview.current_plan.billing_cycle)} · ${money(preview.current_plan.amount, preview.currency)}`,
        },
        {
          term: 'Nuevo plan',
          value: `${cycleLabel(preview.new_plan.billing_cycle)} · ${money(preview.new_plan.amount, preview.currency)}`,
        },
        {
          term: 'Días consumidos',
          value: `${preview.days_consumed} de ${preview.days_consumed + preview.days_remaining}`,
        },
        {
          term: 'Crédito por días no usados',
          value: `− ${money(preview.credit_eur, preview.currency)}`,
        },
        {
          term: 'A pagar ahora',
          value: (
            <strong>{money(preview.amount_to_pay, preview.currency)}</strong>
          ),
        },
        ...(preview.credit_remaining_eur > 0
          ? [
              {
                term: 'Crédito a tu favor (próxima factura)',
                value: money(preview.credit_remaining_eur, preview.currency),
              },
            ]
          : []),
        {
          term: 'Nuevo período',
          value: `${day(preview.new_period_start)} → ${day(preview.new_period_end)}`,
        },
      ]
    : [];

  return (
    <SectionCard
      title="Cambiar de plan"
      actions={
        <Button variant="secondary" onClick={() => void openModal()}>
          Cambiar de plan
        </Button>
      }
    >
      <p className={styles.hint}>
        Cambia entre mensual y anual. Verás el prorrateo (lo que ya pagaste se
        descuenta) antes de confirmar.
      </p>

      {open && (
        <Modal
          open
          onClose={() => {
            if (!confirming) setOpen(false);
          }}
          title="Cambiar de plan"
          size="md"
          footer={
            <div className={styles.footer}>
              <Button
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={confirming}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => void onConfirm()}
                disabled={!preview || confirming}
              >
                {confirming ? 'Aplicando…' : 'Confirmar cambio'}
              </Button>
            </div>
          }
        >
          {loadingOptions ? (
            <p className={styles.muted}>Cargando planes…</p>
          ) : error && !options ? (
            <AlertBanner variant="danger">{error}</AlertBanner>
          ) : options && options.options.length === 0 ? (
            <p className={styles.muted}>
              Este servicio no tiene otros ciclos de facturación disponibles.
            </p>
          ) : options ? (
            <div className={styles.stack}>
              <p className={styles.muted}>
                Plan actual:{' '}
                <strong>{cycleLabel(options.current.billing_cycle)}</strong> ·{' '}
                {money(options.current.amount, options.current.currency)}
              </p>
              <Select
                label="Nuevo ciclo de facturación"
                placeholder="Elige un ciclo…"
                value={selected}
                options={selectOptions}
                onChange={(e) => void onSelect(e.target.value)}
              />
              {loadingPreview && (
                <p className={styles.muted}>Calculando el prorrateo…</p>
              )}
              {error && <AlertBanner variant="danger">{error}</AlertBanner>}
              {preview && <DescriptionList items={breakdown} />}
            </div>
          ) : null}
        </Modal>
      )}
    </SectionCard>
  );
}
