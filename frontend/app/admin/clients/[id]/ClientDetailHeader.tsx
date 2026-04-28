'use client';

import { Avatar, Badge } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import type { ClientDetail } from './types';

/* ═══════════════════════════════════════
   Client Detail Header — §2.5
   Avatar + Name + Status badge + Metadata
   Renders inside DetailPage.headerCard slot.
   ═══════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active:               { label: 'Activo',     variant: 'success' },
  pending_verification: { label: 'Pendiente',  variant: 'warning' },
  blocked:              { label: 'Bloqueado',  variant: 'danger' },
  inactive:             { label: 'Inactivo',   variant: 'neutral' },
};

interface Props { client: ClientDetail; }

export default function ClientDetailHeader({ client }: Props) {
  const s = STATUS_MAP[client.status] || STATUS_MAP.inactive;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
      <Avatar name={`${client.first_name} ${client.last_name}`} size="lg" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <h1 style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            {client.first_name} {client.last_name}
          </h1>
          <Badge variant={s.variant}>{s.label}</Badge>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
          marginTop: 'var(--space-1_5)',
          fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)',
          flexWrap: 'wrap',
        }}>
          <span>{client.email}</span>
          {client.client_profile?.phone && <span>{client.client_profile.phone}</span>}
          {client.client_profile?.company_name && <span>{client.client_profile.company_name}</span>}
        </div>
      </div>
    </div>
  );
}
