import type { CSSProperties } from 'react';

import Link from 'next/link';

import type {
  ServiceTimelineEntry,
  ServiceTimelinePage,
} from '../../../lib/api';
import { t } from '../../i18n';

/**
 * ServiceAuditTimeline — Sprint 15C.II Fase F.3 (GAP-15CII-M).
 *
 * Server Component **reusable** que renderiza el timeline de auditoría de un
 * servicio (`GET /admin/services/:id/audit` admin · `GET /services/:id/audit`
 * cliente). Sin estado: la paginación es por URL (`?cursor=…`) — cada
 * "Cargar más" es una navegación; SSR-friendly, sin client bundle, OK para
 * un log de auditoría/transparencia.
 *
 * Discrimina por `isAdmin`:
 *   - admin: muestra el actor (nombre+rol o "Sistema"), la IP del staff en
 *     filas de acceso, y un `<details>` con `changes_before`/`changes_after`
 *     crudos en filas de cambio.
 *   - cliente: solo acción + actor + fecha + un detalle cliente-seguro
 *     (impersonación → "Panel: …"; drift → "Tipo: …"). El backend ya recorta
 *     `changes_*`/`correlation_id`/IP y aplica la whitelist GDPR.
 *
 * Etiqueta de acción: `t('service.audit.action.<action>')` con fallback a la
 * acción cruda (los slugs `service.action_executed:<x>` caen al fallback,
 * suficiente en v1).
 */
interface Props {
  page: ServiceTimelinePage;
  isAdmin: boolean;
  /** Construye el href de "Cargar más" para un cursor dado (URL-based). */
  loadMoreHref: (cursor: string) => string;
}

export function ServiceAuditTimeline({ page, isAdmin, loadMoreHref }: Props) {
  if (page.items.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        {t('service.audit.empty')}
      </p>
    );
  }
  return (
    <div>
      <ol style={listStyle}>
        {page.items.map((entry) => (
          <TimelineRow key={`${entry.source}-${entry.id}`} entry={entry} isAdmin={isAdmin} />
        ))}
      </ol>
      {page.next_cursor && (
        <div style={{ marginTop: 16 }}>
          <Link
            href={loadMoreHref(page.next_cursor)}
            style={{ fontSize: 13, color: 'var(--brand, #2563eb)' }}
          >
            {t('service.audit.load_more')}
          </Link>
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  entry,
  isAdmin,
}: {
  entry: ServiceTimelineEntry;
  isAdmin: boolean;
}) {
  const actionLabel = t(`service.audit.action.${entry.action}`, entry.action);
  const actorLabel = entry.actor
    ? entry.actor.role
      ? `${entry.actor.name ?? entry.actor.user_id ?? '—'} (${t(`role.${entry.actor.role}`, entry.actor.role)})`
      : (entry.actor.name ?? entry.actor.user_id ?? '—')
    : t('service.audit.system');
  const when = new Date(entry.created_at);

  return (
    <li style={rowStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{actionLabel}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          · {actorLabel}
        </span>
        <span
          style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}
          title={when.toISOString()}
        >
          {when.toLocaleString('es-ES')}
        </span>
      </div>

      {/* Detalle cliente-seguro / admin extra */}
      <TimelineRowDetail entry={entry} isAdmin={isAdmin} />
    </li>
  );
}

function TimelineRowDetail({
  entry,
  isAdmin,
}: {
  entry: ServiceTimelineEntry;
  isAdmin: boolean;
}) {
  const bits: string[] = [];
  if (entry.action === 'admin_sso_impersonation') {
    const panel = entry.metadata?.panel_label;
    if (typeof panel === 'string') {
      bits.push(`${t('service.audit.detail.panel')}: ${panel}`);
    }
  }
  if (entry.action === 'reconciled_external_change') {
    const ct = entry.metadata?.change_type;
    if (typeof ct === 'string') {
      bits.push(
        `${t('service.audit.detail.change_type')}: ${t(`service.audit.change_type.${ct}`, ct)}`,
      );
    }
  }
  if (isAdmin && typeof entry.ip_address === 'string' && entry.ip_address.length > 0) {
    bits.push(`IP: ${entry.ip_address}`);
  }

  const hasChanges =
    isAdmin &&
    entry.source === 'change' &&
    (entry.changes_before != null || entry.changes_after != null);

  if (bits.length === 0 && !hasChanges) return null;

  return (
    <div style={{ marginTop: 4 }}>
      {bits.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {bits.join(' · ')}
        </div>
      )}
      {hasChanges && (
        <details style={{ marginTop: 4, fontSize: 12 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
            {t('service.audit.detail.changes')}
          </summary>
          <pre style={preStyle}>
            {JSON.stringify(
              {
                before: entry.changes_before ?? null,
                after: entry.changes_after ?? null,
                ...(entry.correlation_id
                  ? { correlation_id: entry.correlation_id }
                  : {}),
              },
              null,
              2,
            )}
          </pre>
        </details>
      )}
    </div>
  );
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
};

const rowStyle: CSSProperties = {
  borderTop: '1px solid var(--border)',
  padding: '10px 0',
};

const preStyle: CSSProperties = {
  margin: '4px 0 0',
  padding: 8,
  background: 'var(--surface-2, var(--surface))',
  border: '1px solid var(--border)',
  borderRadius: 6,
  overflowX: 'auto',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: 11,
};
