'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal, Select, useToast } from '../../../components/ui';
import {
  checkoutForClientAction,
  listCheckoutProductsAction,
  type CheckoutProductOption,
} from './_actions';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   ClientContratarModal (F4·U22) — "Contratar servicio" para el cliente.
   Lista productos activos (con pricing) y hace el admin-checkout
   (`POST /billing/checkout?targetUserId=`). Modal DS (Nivel 3).
   ═══════════════════════════════════════ */

const CYCLE_LABELS: Record<string, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
  one_time: 'Pago único',
};

interface Props {
  clientId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
}

export default function ClientContratarModal({
  clientId,
  clientName,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<CheckoutProductOption[]>([]);
  const [productId, setProductId] = useState('');
  const [pricingId, setPricingId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga al abrir el modal
    setLoading(true);
    void (async () => {
      const res = await listCheckoutProductsAction();
      if (cancelled) return;
      if (res.ok) setProducts(res.products);
      else toast('error', res.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, toast]);

  const product = products.find((p) => p.id === productId);
  const productOptions = [
    { value: '', label: 'Selecciona un producto…' },
    ...products.map((p) => ({ value: p.id, label: p.name })),
  ];
  const pricingOptions = product
    ? [
        { value: '', label: 'Selecciona un ciclo…' },
        ...product.pricing.map((pr) => ({
          value: pr.id,
          label: `${CYCLE_LABELS[pr.billing_cycle] ?? pr.billing_cycle} · ${Number(pr.price).toFixed(2)} ${pr.currency}`,
        })),
      ]
    : [];

  async function handleCheckout() {
    if (!pricingId) return;
    setSubmitting(true);
    const res = await checkoutForClientAction(clientId, pricingId);
    setSubmitting(false);
    if (res.ok) {
      toast('success', `Servicio contratado para ${clientName}.`);
      onClose();
      if (res.invoiceId) router.push(`/dashboard/billing/${res.invoiceId}`);
    } else {
      toast('error', res.error);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => (submitting ? undefined : onClose())}
      title="Contratar servicio"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={() => void handleCheckout()}
            loading={submitting}
            disabled={!pricingId}
          >
            Contratar
          </Button>
        </>
      }
    >
      <p className={styles.modalIntro}>
        Se generará la factura y el servicio a nombre de{' '}
        <strong>{clientName}</strong>.
      </p>
      {loading ? (
        <p className={styles.emptyText}>Cargando productos…</p>
      ) : (
        <div className={styles.editGrid}>
          <label className={`${styles.editField} ${styles.editFull}`}>
            <span className={styles.editLabel}>Producto</span>
            <Select
              value={productId}
              onChange={(e) => {
                setProductId(e.target.value);
                setPricingId('');
              }}
              options={productOptions}
            />
          </label>
          {product && (
            <label className={`${styles.editField} ${styles.editFull}`}>
              <span className={styles.editLabel}>Ciclo de facturación</span>
              <Select
                value={pricingId}
                onChange={(e) => setPricingId(e.target.value)}
                options={pricingOptions}
              />
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}
