'use client';

import { Card } from '../../../components/ui';
import type { ClientDetail } from './types';

/* ═══════════════════════════════════════
   Client Resume Tab — §2.5 tab content
   Account + Profile info in two-column grid.
   ═══════════════════════════════════════ */

interface Props { client: ClientDetail; }

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export default function ClientResumeTab({ client }: Props) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
      <Card>
        <h2 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Cuenta</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
          <InfoRow label="Email" value={client.email} />
          <InfoRow label="Verificado" value={client.email_verified_at ? new Date(client.email_verified_at).toLocaleDateString('es-ES') : 'No'} />
          <InfoRow label="2FA" value={client.two_factor_enabled ? 'Activado' : 'Desactivado'} />
          <InfoRow label="Último acceso" value={client.last_login_at ? new Date(client.last_login_at).toLocaleString('es-ES') : 'Nunca'} />
          <InfoRow label="IP último login" value={client.last_login_ip || '—'} />
          <InfoRow label="Registrado" value={new Date(client.created_at).toLocaleDateString('es-ES')} />
        </div>
      </Card>
      <Card>
        <h2 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--text-primary)', marginBottom: 'var(--space-4)' }}>Perfil</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
          <InfoRow label="Tipo" value={client.client_profile?.client_type === 'company' ? 'Empresa' : 'Particular'} />
          <InfoRow label="Teléfono" value={client.client_profile?.phone || '—'} />
          <InfoRow label="NIF/CIF" value={client.client_profile?.tax_id || '—'} />
          <InfoRow label="Dirección" value={client.client_profile?.address_line1 || '—'} />
          <InfoRow label="Ciudad" value={client.client_profile?.city || '—'} />
          <InfoRow label="CP" value={client.client_profile?.postal_code || '—'} />
          <InfoRow label="País" value={client.client_profile?.country || 'ES'} />
          <InfoRow label="Saldo" value={`${client.client_profile?.credit_balance || '0.00'} €`} />
        </div>
      </Card>
    </div>
  );
}
