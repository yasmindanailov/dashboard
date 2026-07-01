'use client';

/**
 * ChangePlanModal — modal del cambio de plan con prorrateo (ADR-029), extraído
 * de `ChangePlanCard` (F4·U24) para poder lanzarse desde:
 *   - la card del detalle cliente (`<ChangePlanCard>`, self-service), y
 *   - el menú "Más acciones" del detalle admin (`<AdminServiceActionsMenu>`).
 *
 * Controlado por el caller (`open`/`onClose`). Al abrirse carga las opciones;
 * al elegir un ciclo pide el preview del prorrateo (R5: el usuario lo ve ANTES
 * de confirmar). Todo server-side vía Server Actions; el frontend solo muestra
 * y dispara. Feedback vía Toast (D9), DS only (R16).
 *
 * Alcance ADR-029: cambio de **ciclo en el mismo producto** (mensual ↔ anual…).
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  AlertBanner,
  Button,
  DescriptionList,
  Modal,
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

interface ChangePlanModalProps {
  serviceId: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Wrapper controlado: monta el contenido SOLO cuando `open` (lazy). Así el
 * estado nace fresco en cada apertura y la carga de opciones vive en un efecto
 * de montaje (sin resets síncronos en el efecto — cumple `react-hooks`).
 */
export function ChangePlanModal({
  serviceId,
  open,
  onClose,
}: ChangePlanModalProps) {
  if (!open) return null;
  return <ChangePlanModalInner serviceId={serviceId} onClose={onClose} />;
}

function ChangePlanModalInner({
  serviceId,
  onClose,
}: {
  serviceId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [options, setOptions] = useState<PlanChangeOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carga las opciones al montar (el wrapper monta solo al abrir). El cuerpo del
  // efecto solo dispara el async → sin setState síncrono.
  useEffect(() => {
    let cancelled = false;
    void planChangeOptionsAction(serviceId).then((res) => {
      if (cancelled) return;
      setLoadingOptions(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOptions(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

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
    onClose();
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
          value: <strong>{money(preview.amount_to_pay, preview.currency)}</strong>,
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
    <Modal
      open
      onClose={() => {
        if (!confirming) onClose();
      }}
      title="Cambiar de plan"
      size="md"
      footer={
        <div className={styles.footer}>
          <Button
            variant="secondary"
            onClick={onClose}
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
  );
}
