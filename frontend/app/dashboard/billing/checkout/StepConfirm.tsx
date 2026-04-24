'use client';

import type { Product, ProductPricing, BillingProfile, ClientOption } from './types';
import { CYCLE_LABELS, fmt } from './types';
import { Card, Button, AlertBanner } from '../../../components/ui';
import styles from './checkout.module.css';

/* ═══════════════════════════════════════
   StepConfirm — Order confirmation step
   DS components: Card, Button, AlertBanner
   Ref: UI_SPEC.md §2.6, ROADMAP.md D23
   ═══════════════════════════════════════ */

interface StepConfirmProps {
  isAdmin: boolean;
  selectedProduct: Product;
  selectedPricing: ProductPricing;
  selectedProfile: BillingProfile | null;
  selectedClient: ClientOption | null;
  targetUserName: string;
  label: string;
  domain: string;
  submitting: boolean;
  error: string;
  onBack: () => void;
  onCheckout: () => void;
}

export default function StepConfirm({
  isAdmin, selectedProduct, selectedPricing, selectedProfile,
  selectedClient, targetUserName, label, domain,
  submitting, error, onBack, onCheckout,
}: StepConfirmProps) {
  return (
    <div>
      <h2 className={styles.stepTitle}>Confirmar pedido</h2>

      <Card>
        {/* Summary header */}
        <div className={styles.confirmHeader}>
          <div>
            <h3 className={styles.confirmProductName}>{selectedProduct.name}</h3>
            <span className={styles.confirmCycleLabel}>
              {CYCLE_LABELS[selectedPricing.billing_cycle]} · {selectedPricing.currency}
            </span>
          </div>
          <div className={styles.confirmPriceBlock}>
            <div className={styles.confirmPrice}>{fmt(selectedPricing.price, selectedPricing.currency)}</div>
            {Number(selectedPricing.setup_fee) > 0 && (
              <div className={styles.confirmSetup}>+ {fmt(selectedPricing.setup_fee, selectedPricing.currency)} setup</div>
            )}
          </div>
        </div>

        {/* Details table */}
        <div className={styles.confirmDetails}>
          <table className={styles.confirmTable}>
            <tbody>
              {[
                ...(isAdmin && selectedClient ? [{ label: 'Cliente', value: `${selectedClient.first_name} ${selectedClient.last_name} (${selectedClient.email})` }] : []),
                { label: 'Producto', value: selectedProduct.name },
                { label: 'Ciclo', value: CYCLE_LABELS[selectedPricing.billing_cycle] },
                { label: 'Facturación', value: selectedProfile
                  ? `${selectedProfile.label} (${selectedProfile.nif_cif ? 'completa' : 'simplificada'})`
                  : `${targetUserName} — Factura simplificada` },
                ...(label ? [{ label: 'Etiqueta', value: label }] : []),
                ...(domain ? [{ label: 'Dominio', value: domain }] : []),
              ].map((row, i) => (
                <tr key={i} className={styles.confirmRow}>
                  <td className={styles.confirmRowLabel}>{row.label}</td>
                  <td className={styles.confirmRowValue}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className={styles.confirmTotal}>
          <span className={styles.confirmTotalLabel}>Total a pagar</span>
          <span className={styles.confirmTotalValue}>
            {fmt(Number(selectedPricing.price) + Number(selectedPricing.setup_fee), selectedPricing.currency)}
          </span>
        </div>
      </Card>

      {/* Info callout */}
      <div className={styles.navStart}>
        <AlertBanner variant="info">
          Al confirmar se creará un servicio en estado <strong>pendiente</strong> y una factura en <strong>borrador</strong>.
          El servicio se activará cuando la factura esté pagada.
        </AlertBanner>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.navStart}>
          <AlertBanner variant="danger">{error}</AlertBanner>
        </div>
      )}

      {/* Actions */}
      <div className={styles.confirmActions}>
        <Button variant="ghost" onClick={onBack}>← Atrás</Button>
        <Button onClick={onCheckout} loading={submitting}>
          {submitting ? 'Procesando...' : 'Confirmar pedido'}
        </Button>
      </div>
    </div>
  );
}
