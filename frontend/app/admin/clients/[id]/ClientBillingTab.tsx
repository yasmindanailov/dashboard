'use client';

import Link from 'next/link';
import { Card, Badge } from '../../../components/ui';
import type { BillingProfile, ClientBillingStats, ClientDetail } from './types';

/* ═══════════════════════════════════════
   Client Billing Tab — §2.5 tab content
   Shows billing profiles + invoices summary (F4·U22).
   ═══════════════════════════════════════ */

interface Props {
  client: ClientDetail;
  billingStats: ClientBillingStats | null;
}

function ProfileCard({ bp, highlight }: { bp?: BillingProfile; highlight: boolean }) {
  return (
    <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)', background: 'var(--surface-secondary)', border: highlight ? '1px solid var(--brand)' : '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
        <span style={{ fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>{bp?.label || 'Perfil base'}</span>
        {bp && <Badge variant="brand">{bp.type}</Badge>}
        {(bp?.is_default || !bp) && <Badge variant="success">Predeterminado</Badge>}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {bp ? (
          <>
            {(bp.first_name || bp.company_name) && <p style={{ margin: 0 }}>{bp.company_name || `${bp.first_name} ${bp.last_name}`}</p>}
            {bp.nif_cif && <p style={{ margin: 0 }}>NIF/CIF: {bp.nif_cif}</p>}
            <p style={{ margin: 0 }}>{bp.address_line1}, {bp.postal_code} {bp.city}</p>
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>Factura simplificada (sin NIF)</p>
        )}
      </div>
    </div>
  );
}

export default function ClientBillingTab({ client, billingStats }: Props) {
  const total = billingStats?.total_invoices ?? 0;
  const pending = billingStats?.pending_count ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <Card>
        <h2 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Perfiles de facturación</h2>
        {/* Base profile (user data, no billing profile) */}
        {client.billing_profiles.length === 0 && <ProfileCard highlight />}
        {client.billing_profiles.map((bp) => (
          <ProfileCard key={bp.id} bp={bp} highlight={bp.is_default} />
        ))}
      </Card>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)' }}>Facturas</h2>
            <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-1_5)', color: 'var(--text-secondary)' }}>
              {total} factura{total === 1 ? '' : 's'}
              {pending > 0 && (
                <>
                  {' · '}
                  <span style={{ color: 'var(--warning-dark)', fontWeight: 'var(--font-weight-semibold)' }}>
                    {pending} pendiente{pending === 1 ? '' : 's'} de pago
                  </span>
                </>
              )}
            </p>
          </div>
          <Link href={`/dashboard/billing?userId=${client.id}`} style={{ padding: 'var(--space-2_5) var(--space-4)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', borderRadius: 'var(--radius-md)', background: 'var(--brand-subtle)', color: 'var(--brand)', textDecoration: 'none' }}>
            Ver facturas →
          </Link>
        </div>
      </Card>
    </div>
  );
}
