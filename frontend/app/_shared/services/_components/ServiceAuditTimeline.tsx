import Link from 'next/link';
import {
  Activity,
  Box,
  CheckCircle2,
  Eye,
  GitCompareArrows,
  Lock,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { IconWell, type IconWellTone } from '../../../components/ui';
import type {
  ServiceTimelineEntry,
  ServiceTimelinePage,
} from '../../../lib/api';
import { t } from '../../i18n';
import styles from './ServiceAuditTimeline.module.css';

/**
 * ServiceAuditTimeline — Sprint 15C.II Fase F.3 (GAP-15CII-M) · reskin DS
 * F4·U24.
 *
 * Server Component **reusable** que renderiza el timeline de auditoría de un
 * servicio (`GET /admin/services/:id/audit` admin · `GET /services/:id/audit`
 * cliente). Sin estado: la paginación es por URL (`?cursor=…`) — cada
 * "Cargar más" es una navegación; SSR-friendly, sin client bundle, OK para
 * un log de auditoría/transparencia.
 *
 * F4·U24 — reskin 1:1 con el mockup (`admin/ServicioDetalleAdmin.dc.html`
 * §Auditoría): cada evento es una fila con `IconWell` (tono/icono por tipo de
 * acción) + una línea conectora vertical hacia la fila siguiente. Se compone
 * `IconWell` (primitiva DS) en vez de `ActivityRow` porque el timeline admin
 * conserva **detalle rico** — actor+rol, IP del staff, `changes_*` crudos en
 * un `<details>` — que `ActivityRow` no soporta.
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

/** Icono + tono del `IconWell` por tipo de acción (semántico, no por slug). */
interface ActionVisual {
  icon: LucideIcon;
  tone: IconWellTone;
}

const ACTION_VISUALS: Record<string, ActionVisual> = {
  read: { icon: Eye, tone: 'neutral' },
  // 1:1 con el mockup: SSO/impersonación → candado morado (security);
  // aprovisionado → caja verde (success).
  admin_sso_impersonation: { icon: Lock, tone: 'security' },
  'service.provisioned': { icon: Box, tone: 'success' },
  'service.activated': { icon: CheckCircle2, tone: 'success' },
  'service.suspended': { icon: PauseCircle, tone: 'warning' },
  'service.unsuspended': { icon: PlayCircle, tone: 'success' },
  'service.deprovisioned_admin': { icon: XCircle, tone: 'danger' },
  'service.reprovision_requested': { icon: RefreshCw, tone: 'brand' },
  reconciled_external_change: { icon: GitCompareArrows, tone: 'warning' },
};

const DEFAULT_VISUAL: ActionVisual = { icon: Activity, tone: 'neutral' };

function visualForAction(action: string): ActionVisual {
  if (ACTION_VISUALS[action]) return ACTION_VISUALS[action];
  // Acciones curadas del plugin (`service.action_executed:<x>`) → tono brand.
  if (action.startsWith('service.action_executed')) {
    return { icon: Activity, tone: 'brand' };
  }
  return DEFAULT_VISUAL;
}

export function ServiceAuditTimeline({ page, isAdmin, loadMoreHref }: Props) {
  if (page.items.length === 0) {
    return <p className={styles.empty}>{t('service.audit.empty')}</p>;
  }
  const lastIndex = page.items.length - 1;
  return (
    <div>
      <ol className={styles.list}>
        {page.items.map((entry, index) => (
          <TimelineRow
            key={`${entry.source}-${entry.id}`}
            entry={entry}
            isAdmin={isAdmin}
            isLast={index === lastIndex}
          />
        ))}
      </ol>
      {page.next_cursor && (
        <div className={styles.loadMore}>
          <Link
            href={loadMoreHref(page.next_cursor)}
            className={styles.loadMoreLink}
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
  isLast,
}: {
  entry: ServiceTimelineEntry;
  isAdmin: boolean;
  /** Última fila del set actual → sin línea conectora (1:1 mockup). */
  isLast: boolean;
}) {
  const actionLabel = t(`service.audit.action.${entry.action}`, entry.action);
  const actorLabel = entry.actor
    ? entry.actor.role
      ? `${entry.actor.name ?? entry.actor.user_id ?? '—'} (${t(`role.${entry.actor.role}`, entry.actor.role)})`
      : (entry.actor.name ?? entry.actor.user_id ?? '—')
    : t('service.audit.system');
  const when = new Date(entry.created_at);
  const { icon, tone } = visualForAction(entry.action);

  return (
    <li className={styles.row}>
      <div className={styles.rail}>
        <IconWell icon={icon} tone={tone} size="sm" />
        {!isLast && <span className={styles.connector} aria-hidden="true" />}
      </div>

      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.title}>{actionLabel}</span>
          <span className={styles.time} title={when.toISOString()}>
            {when.toLocaleString('es-ES')}
          </span>
        </div>
        <div className={styles.actor}>{actorLabel}</div>

        {/* Detalle cliente-seguro / admin extra */}
        <TimelineRowDetail entry={entry} isAdmin={isAdmin} />
      </div>
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
    <div className={styles.detail}>
      {bits.length > 0 && <div className={styles.bits}>{bits.join(' · ')}</div>}
      {hasChanges && (
        <details className={styles.changes}>
          <summary className={styles.changesSummary}>
            {t('service.audit.detail.changes')}
          </summary>
          <pre className={styles.pre}>
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
