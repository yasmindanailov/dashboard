'use client';

import Link from 'next/link';
import type { BillingProfile, ClientBillingStats, ClientDetail } from './types';
import styles from './clientDetail.module.css';

/* ═══════════════════════════════════════
   Client Billing Tab (F4·U22) — perfiles de facturación + resumen de facturas,
   1:1 con el mockup `ClienteDetalle` (tab Facturación).
   ═══════════════════════════════════════ */

interface Props {
  client: ClientDetail;
  billingStats: ClientBillingStats | null;
}

const TYPE_LABEL: Record<string, string> = {
  personal: 'Particular',
  individual: 'Particular',
  autonomo: 'Autónomo',
  empresa: 'Empresa',
  company: 'Empresa',
};
const TYPE_VARIANT: Record<string, 'company' | 'particular'> = {
  personal: 'particular',
  individual: 'particular',
  autonomo: 'company',
  empresa: 'company',
  company: 'company',
};

function ProfileCard({ bp, isDefault }: { bp?: BillingProfile; isDefault: boolean }) {
  const typeKey = bp?.type ?? '';
  const typeLabel = TYPE_LABEL[typeKey] ?? bp?.type ?? 'Particular';
  const isCompany = TYPE_VARIANT[typeKey] === 'company';
  const name = bp
    ? bp.company_name || `${bp.first_name ?? ''} ${bp.last_name ?? ''}`.trim() || bp.label
    : 'Perfil base';
  const hasNif = !!bp?.nif_cif;

  return (
    <div
      className={`${styles.bpCard} ${isDefault ? styles.bpCardDefault : ''}`}
    >
      <div className={styles.bpHead}>
        <span className={styles.bpName}>{name}</span>
        <span
          className={`${styles.bpTypeBadge} ${isCompany ? styles.bpTypeCompany : styles.bpTypeParticular}`}
        >
          {typeLabel}
        </span>
        {isDefault && (
          <span className={styles.bpDefaultBadge}>Predeterminado</span>
        )}
      </div>
      <div className={styles.bpDetails}>
        {hasNif ? (
          <div>NIF/CIF: {bp?.nif_cif}</div>
        ) : (
          <div className={styles.bpSimplified}>
            Factura simplificada (sin NIF)
          </div>
        )}
        {bp && (
          <div>
            {bp.address_line1}
            {bp.postal_code || bp.city
              ? `, ${[bp.postal_code, bp.city].filter(Boolean).join(' ')}`
              : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientBillingTab({ client, billingStats }: Props) {
  const total = billingStats?.total_invoices ?? 0;
  const pending = billingStats?.pending_count ?? 0;
  const profiles = client.billing_profiles;

  return (
    <div className={styles.stack}>
      <div className={styles.infoCard}>
        <h2 className={styles.infoCardTitle}>Perfiles de facturación</h2>
        <div className={styles.bpList}>
          {profiles.length === 0 && <ProfileCard isDefault />}
          {profiles.map((bp) => (
            <ProfileCard key={bp.id} bp={bp} isDefault={bp.is_default} />
          ))}
        </div>
      </div>

      <div className={`${styles.infoCard} ${styles.billingSummary}`}>
        <div>
          <h2 className={styles.infoCardTitle} style={{ marginBottom: 'var(--space-1_5)' }}>
            Facturas
          </h2>
          <p className={styles.billingSummaryText}>
            {total} factura{total === 1 ? '' : 's'}
            {pending > 0 && (
              <>
                {' · '}
                <span className={styles.billingPending}>
                  {pending} pendiente{pending === 1 ? '' : 's'} de pago
                </span>
              </>
            )}
          </p>
        </div>
        <Link href={`/dashboard/billing?userId=${client.id}`} className={styles.billingLink}>
          Ver facturas →
        </Link>
      </div>
    </div>
  );
}
