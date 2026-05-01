'use client';

import Link from 'next/link';
import { Avatar, Badge, Tooltip } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import type { ClientDetail } from './types';

/* ═══════════════════════════════════════
   Client Detail Header — §2.5
   Avatar + Name + Status badge + Support Inside tier badge (8.D.12.5) + Metadata
   Renders inside DetailPage.headerCard slot.
   ═══════════════════════════════════════ */

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  active:               { label: 'Activo',     variant: 'success' },
  pending_verification: { label: 'Pendiente',  variant: 'warning' },
  blocked:              { label: 'Bloqueado',  variant: 'danger' },
  inactive:             { label: 'Inactivo',   variant: 'neutral' },
};

const PRIORITY_LABEL: Record<string, string> = {
  standard: 'Estándar',
  high: 'Alta',
  max: 'Máxima',
};

const CHANNEL_LABEL: Record<string, string> = {
  webchat: 'Chat web',
  email: 'Email',
  phone: 'Teléfono',
  whatsapp: 'WhatsApp',
};

interface Props { client: ClientDetail; }

export default function ClientDetailHeader({ client }: Props) {
  const s = STATUS_MAP[client.status] || STATUS_MAP.inactive;
  const si = client.support_inside_subscription;
  const siActive = si && si.status === 'active';
  const cfg = si?.product.support_inside_config;
  const tooltipText =
    siActive && cfg
      ? `SLA respuesta ${cfg.response_sla_hours}h · Prioridad ${PRIORITY_LABEL[cfg.priority_tier] ?? cfg.priority_tier} · Canales: ${cfg.channels_active.map((c) => CHANNEL_LABEL[c] ?? c).join(', ')}`
      : null;

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
          {siActive && cfg && tooltipText && (
            <Tooltip content={tooltipText}>
              <Link
                href={`/admin/support-inside-plans/${si.product.slug}`}
                style={{ textDecoration: 'none' }}
                aria-label={`Plan Support Inside del cliente: ${si.product.name}`}
              >
                <Badge variant="brand">{si.product.name}</Badge>
              </Link>
            </Tooltip>
          )}
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
