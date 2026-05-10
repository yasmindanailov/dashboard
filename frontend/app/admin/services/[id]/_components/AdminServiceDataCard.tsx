/**
 * AdminServiceDataCard — Sprint 15C.II Fase C round 7 (smoke real
 * Yasmin 2026-05-10).
 *
 * Rediseño de la card "Datos del servicio (admin)" según estándar
 * industria Stripe / Vercel admin:
 *   - Información primaria visible (nombre cliente, email, domain,
 *     plan, badge estado).
 *   - IDs técnicos secundarios con click-to-copy (`<CopyableId>`).
 *   - Badges para estados en lugar de texto crudo.
 *   - Agrupación lógica en 3 sub-secciones: Cliente / Servicio / Fechas.
 *
 * Server Component (NO `'use client'`) — solo CopyableId child es CC.
 * Composición pura sin auth/fetch — el SC parent ya validó isAdmin via
 * route protection middleware (`/admin/*`).
 *
 * Heredable a futuros admin detail pages (clients, products, invoices)
 * — el patrón "Cliente / Servicio / Fechas" + CopyableId es reusable
 * por cualquier entity del admin con UUID + relaciones.
 */

import Link from 'next/link';

import { Badge, Card, CopyableId } from '../../../../components/ui';
import {
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_TONE,
  type StatusTone,
} from '../../../../_shared/services/service-status';
import type { ServiceDetailResponse, ServiceInfo } from '../../../../lib/api';

interface AdminServiceDataCardProps {
  data: ServiceDetailResponse;
}

/**
 * Mapea `service.status` (text libre del backend, incluye terminados
 * canonicos `cancelled` / `terminated` y posibles intermedios) al
 * Badge tone + label legibles. Si el status no está en el set canónico
 * de `ServiceInfo['status']`, se trata como `unknown` (neutral).
 */
function statusToBadge(rawStatus: string): { label: string; tone: StatusTone } {
  const known = SERVICE_STATUS_LABEL[rawStatus as ServiceInfo['status']];
  if (known) {
    return {
      label: known,
      tone: SERVICE_STATUS_TONE[rawStatus as ServiceInfo['status']],
    };
  }
  // service.status puede ser `terminated` (no en ServiceInfo['status']).
  if (rawStatus === 'terminated') {
    return { label: 'Terminado', tone: 'neutral' };
  }
  if (rawStatus === 'provisioning') {
    return { label: 'Aprovisionando', tone: 'info' };
  }
  // Fallback defensivo: capitaliza el status crudo.
  return {
    label:
      rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase(),
    tone: 'neutral',
  };
}

/**
 * Formato fecha amigable + tiempo relativo (Stripe / GitHub style).
 * SSR-stable (no usa Date.now() en hidratación; calcula relativo
 * server-side y el usuario puede recargar si está viendo la página
 * mucho rato).
 */
function formatDateWithRelative(iso: string): string {
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const timeStr = d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  let relative: string;
  if (diffSec < 60) relative = 'hace unos segundos';
  else if (diffSec < 3600) {
    const m = Math.round(diffSec / 60);
    relative = `hace ${m} minuto${m === 1 ? '' : 's'}`;
  } else if (diffSec < 86400) {
    const h = Math.round(diffSec / 3600);
    relative = `hace ${h} hora${h === 1 ? '' : 's'}`;
  } else if (diffSec < 30 * 86400) {
    const days = Math.round(diffSec / 86400);
    relative = `hace ${days} día${days === 1 ? '' : 's'}`;
  } else {
    const months = Math.round(diffSec / (30 * 86400));
    relative = `hace ${months} mes${months === 1 ? '' : 'es'}`;
  }
  return `${dateStr}, ${timeStr} · ${relative}`;
}

const SECTION_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  paddingBottom: 16,
  borderBottom: '1px solid var(--border)',
};

const SECTION_LAST_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const SECTION_TITLE_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: 0,
  marginBottom: 4,
};

const PRIMARY_VALUE_STYLE: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-primary)',
  margin: 0,
};

const SECONDARY_VALUE_STYLE: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-secondary)',
  margin: 0,
};

const ROW_INLINE_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
};

export function AdminServiceDataCard({ data }: AdminServiceDataCardProps) {
  const { service } = data;
  const badge = statusToBadge(service.status);
  const isFromProductPlugin = !service.provisioner_slug;
  const effectiveProvisioner =
    service.provisioner_slug ?? service.product_provisioner;

  return (
    <Card>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 600,
          margin: 0,
          marginBottom: 16,
        }}
      >
        Detalles operativos
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Cliente ─────────────────────────────────────────────── */}
        <section style={SECTION_STYLE} aria-label="Cliente">
          <h3 style={SECTION_TITLE_STYLE}>Cliente</h3>
          <p style={PRIMARY_VALUE_STYLE}>
            <Link
              href={`/admin/clients/${service.user_id}`}
              style={{ color: 'var(--brand-600)', textDecoration: 'none' }}
            >
              {service.client_name}
            </Link>
          </p>
          <p style={SECONDARY_VALUE_STYLE}>
            <a
              href={`mailto:${service.client_email}`}
              style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              {service.client_email}
            </a>
          </p>
          <div style={ROW_INLINE_STYLE}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              user_id
            </span>
            <CopyableId id={service.user_id} label="ID cliente" />
          </div>
        </section>

        {/* ── Servicio ────────────────────────────────────────────── */}
        <section style={SECTION_STYLE} aria-label="Servicio">
          <h3 style={SECTION_TITLE_STYLE}>Servicio</h3>
          {service.domain && (
            <p style={PRIMARY_VALUE_STYLE}>{service.domain}</p>
          )}
          <p style={SECONDARY_VALUE_STYLE}>
            {service.product_name}{' '}
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              ({service.product_slug} · {service.product_type})
            </span>
          </p>
          <div style={ROW_INLINE_STYLE}>
            <Badge variant={badge.tone}>{badge.label}</Badge>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
              }}
              title={
                isFromProductPlugin
                  ? `Plugin del producto (service.provisioner_slug=null — el pipeline provisioning aún no asignó el slug). Effective: ${effectiveProvisioner}`
                  : `Plugin: ${effectiveProvisioner}`
              }
            >
              {effectiveProvisioner}
              {isFromProductPlugin && (
                <span style={{ marginLeft: 4 }}>· desde producto</span>
              )}
            </span>
          </div>
          <div style={ROW_INLINE_STYLE}>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              service_id
            </span>
            <CopyableId id={service.id} label="ID servicio" />
          </div>
        </section>

        {/* ── Fechas ──────────────────────────────────────────────── */}
        <section style={SECTION_LAST_STYLE} aria-label="Fechas">
          <h3 style={SECTION_TITLE_STYLE}>Fechas</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content 1fr',
              gap: '6px 16px',
              fontSize: 13,
            }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>Creado</span>
            <span>{formatDateWithRelative(service.created_at)}</span>

            {service.cancelled_at && (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>Cancelado</span>
                <span>{formatDateWithRelative(service.cancelled_at)}</span>
              </>
            )}
          </div>
        </section>
      </div>
    </Card>
  );
}
