import type { CSSProperties } from 'react';

import Link from 'next/link';

import type {
  PluginCircuitState,
  PluginHealthStatus,
  PluginOperationalOverview as PluginOperationalOverviewData,
  PluginReconcileChangeType,
} from '../../lib/api';
import { serverFetch } from '../../lib/server-auth';
import { t } from '../i18n';
import { Badge, type BadgeVariant } from '../../components/ui';
import { DriftRowReconcileButton } from './DriftRowReconcileButton';

/**
 * PluginOperationalOverview — Sprint 15C.II Fase F.2 (ADR-083 Amendment A4.4).
 *
 * Server Component **reusable** en `_shared/plugins/` (heredable a 15D RC /
 * 15E Docker / 15G Plesk — cualquier plugin con `supports_reconciliation`
 * lo monta sin cambios) que renderiza el resumen operativo de un plugin en
 * `/admin/settings/plugins/[slug]`:
 *   - Badge de salud top-line (Operativo / Degradado / Caído / Deshabilitado)
 *     derivado en el backend de circuit breakers + secrets requeridos +
 *     última reconciliación.
 *   - Stats grid 4 cards (servicios activos / suspendidos / drifts 24 h /
 *     estado de los circuit breakers).
 *   - "Última reconciliación hace Xh · próxima programada en Yh" (solo si el
 *     plugin soporta reconciliación con cron).
 *   - Tabla de drifts recientes (24 h) — cada fila enlaza al detalle del
 *     servicio (`/admin/services/[id]`; en F.3 repuntará a `…/audit`).
 *
 * Doctrina:
 *   - Server Component que hace su propio `serverFetch` (autocontenido) y
 *     degrada con un aviso inline si la llamada falla — no rompe el resto de
 *     la página del plugin (config form, reconcile-all, test conexión).
 *   - Los estados de circuit breaker son **in-process**: la sección los
 *     etiqueta como "estado en esta instancia".
 *   - Cero conocimiento de plugins concretos — todo viene del shape genérico
 *     `PluginOperationalOverview` del backend
 *     (`GET /admin/plugins/:slug/operational-overview`).
 */
interface Props {
  /** Slug del plugin (ej. `enhance_cp`). */
  slug: string;
}

export async function PluginOperationalOverview({ slug }: Props) {
  let overview: PluginOperationalOverviewData;
  try {
    overview = await serverFetch<PluginOperationalOverviewData>(
      `/admin/plugins/${slug}/operational-overview`,
    );
  } catch {
    return (
      <section style={sectionStyle}>
        <h2 style={h2Style}>{t('admin.plugins.overview.section_title')}</h2>
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            margin: '8px 0 0',
          }}
        >
          {t('admin.plugins.overview.load_error')}
        </p>
      </section>
    );
  }

  const health = resolveHealth(overview.health.status);

  return (
    <section style={sectionStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={h2Style}>{t('admin.plugins.overview.section_title')}</h2>
          <p
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              margin: '4px 0 0',
              maxWidth: 560,
            }}
          >
            {t('admin.plugins.overview.section_description')}
          </p>
        </div>
        <Badge variant={health.variant}>{health.label}</Badge>
      </div>

      {/* Razones de la salud (claves i18n del backend). */}
      <ul
        style={{
          margin: '12px 0 0',
          padding: 0,
          listStyle: 'none',
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        {overview.health.reasons.map((reasonKey) => (
          <li key={reasonKey}>· {t(reasonKey)}</li>
        ))}
      </ul>

      {/* Stats grid — 4 cards. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        <StatCard
          label={t('admin.plugins.overview.stat.services_active')}
          value={String(overview.services.active)}
        />
        <StatCard
          label={t('admin.plugins.overview.stat.services_suspended')}
          value={String(overview.services.suspended)}
          tone={overview.services.suspended > 0 ? 'warning' : undefined}
        />
        <StatCard
          label={t('admin.plugins.overview.stat.drifts_24h')}
          value={String(overview.reconciliation.drifts_24h)}
          tone={overview.reconciliation.drifts_24h > 0 ? 'warning' : undefined}
        />
        <StatCard
          label={t('admin.plugins.overview.stat.circuit')}
          value={circuitSummaryLabel(overview.circuit)}
          tone={circuitSummaryTone(overview.circuit)}
        />
      </div>

      {/* Reconciliación — solo si el plugin la soporta. */}
      <div style={{ marginTop: 16, fontSize: 13 }}>
        {overview.reconciliation.supported ? (
          <>
            <div>
              <strong>{t('admin.plugins.overview.reconcile.last')}:</strong>{' '}
              {overview.reconciliation.last ? (
                <>
                  {relativeFromNow(overview.reconciliation.last.completed_at)} (
                  {t(
                    `admin.plugins.overview.reconcile.trigger.${overview.reconciliation.last.trigger}`,
                  )}
                  ) — {overview.reconciliation.last.services_processed}{' '}
                  {t('admin.plugins.overview.reconcile.services')},{' '}
                  {overview.reconciliation.last.drifts_detected}{' '}
                  {t('admin.plugins.overview.reconcile.drifts')}
                  {overview.reconciliation.last.errors > 0 && (
                    <>
                      ,{' '}
                      <span style={{ color: 'var(--danger, #c0392b)' }}>
                        {overview.reconciliation.last.errors}{' '}
                        {t('admin.plugins.overview.reconcile.errors')}
                      </span>
                    </>
                  )}
                </>
              ) : (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {t('admin.plugins.overview.reconcile.never')}
                </span>
              )}
            </div>
            {overview.reconciliation.next_scheduled_at && (
              <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                {t('admin.plugins.overview.reconcile.next')}:{' '}
                {relativeFromNow(overview.reconciliation.next_scheduled_at)}
              </div>
            )}
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>
            {t('admin.plugins.overview.reconcile.not_supported')}
          </span>
        )}
      </div>

      {/* Tabla de drifts recientes (24 h). */}
      {overview.reconciliation.supported && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>
            {t('admin.plugins.overview.drifts.title')}
          </h3>
          {overview.recent_drifts.length === 0 ? (
            <p
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                margin: 0,
              }}
            >
              {t('admin.plugins.overview.drifts.empty')}
            </p>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: 12,
              }}
            >
              <thead>
                <tr
                  style={{ textAlign: 'left', color: 'var(--text-secondary)' }}
                >
                  <th style={thStyle}>
                    {t('admin.plugins.overview.drifts.col.service')}
                  </th>
                  <th style={thStyle}>
                    {t('admin.plugins.overview.drifts.col.type')}
                  </th>
                  <th style={thStyle}>
                    {t('admin.plugins.overview.drifts.col.detected')}
                  </th>
                  {/* Sprint 15C.II F.9 (R9): columna acción inline reconcile-single.
                      Solo se renderiza si el plugin soporta reconcileOne. */}
                  {overview.reconciliation.supports_reconcile_one && (
                    <th style={thStyle}>
                      {t('plugin.overview.recent_drifts.action_column')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {overview.recent_drifts.map((drift) => (
                  <tr
                    key={`${drift.service_id}-${drift.detected_at}`}
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <td style={tdStyle}>
                      <Link
                        href={serviceDetailHref(drift.service_id)}
                        style={{ color: 'var(--brand, #2563eb)' }}
                      >
                        {drift.service_id}
                      </Link>
                    </td>
                    <td style={tdStyle}>{driftTypeLabel(drift.change_type)}</td>
                    <td style={tdStyle}>
                      {new Date(drift.detected_at).toLocaleString('es-ES')}
                    </td>
                    {overview.reconciliation.supports_reconcile_one && (
                      <td style={tdStyle}>
                        <DriftRowReconcileButton
                          serviceId={drift.service_id}
                          supportsReconcileOne={
                            overview.reconciliation.supports_reconcile_one
                          }
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-componentes + helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Ruta desde una fila de drift del overview al timeline de auditoría de ese
 * servicio. Fase F.3 (GAP-15CII-M) ya entregó `/admin/services/[id]/audit`:
 * el admin llega al timeline filtrado por el servicio donde verá el
 * `reconciled_external_change` que generó la fila.
 */
function serviceDetailHref(serviceId: string): string {
  return `/admin/services/${serviceId}/audit`;
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'danger';
}) {
  const color =
    tone === 'danger'
      ? 'var(--danger, #c0392b)'
      : tone === 'warning'
        ? 'var(--warning, #b7791f)'
        : 'var(--text-primary)';
  return (
    <div
      style={{
        background: 'var(--surface-2, var(--surface))',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function resolveHealth(status: PluginHealthStatus): {
  variant: BadgeVariant;
  label: string;
} {
  switch (status) {
    case 'operational':
      return {
        variant: 'success',
        label: t('admin.plugins.overview.health.operational'),
      };
    case 'degraded':
      return {
        variant: 'warning',
        label: t('admin.plugins.overview.health.degraded'),
      };
    case 'down':
      return {
        variant: 'danger',
        label: t('admin.plugins.overview.health.down'),
      };
    case 'disabled':
      return {
        variant: 'neutral',
        label: t('admin.plugins.overview.health.disabled'),
      };
  }
}

function circuitSummaryLabel(circuit: {
  getServiceInfo: PluginCircuitState | null;
  executeAction: PluginCircuitState | null;
}): string {
  const states = [circuit.getServiceInfo, circuit.executeAction];
  if (states.includes('open')) {
    return t('admin.plugins.overview.circuit.state.open');
  }
  if (states.includes('half-open')) {
    return t('admin.plugins.overview.circuit.state.half_open');
  }
  if (states.every((s) => s === null)) {
    return t('admin.plugins.overview.circuit.state.idle');
  }
  return t('admin.plugins.overview.circuit.state.closed');
}

function circuitSummaryTone(circuit: {
  getServiceInfo: PluginCircuitState | null;
  executeAction: PluginCircuitState | null;
}): 'warning' | 'danger' | undefined {
  const states = [circuit.getServiceInfo, circuit.executeAction];
  if (states.includes('open')) return 'danger';
  if (states.includes('half-open')) return 'warning';
  return undefined;
}

function driftTypeLabel(changeType: PluginReconcileChangeType): string {
  return t(`admin.plugins.overview.drift.${changeType}`);
}

/**
 * Formato relativo ES sencillo ("hace 3 h", "en 2 h", "hace 12 min",
 * "ahora mismo"). El translator local no soporta ICU/plural — inline ES
 * (app es-only). Para timestamps lejanos (>48 h) cae a fecha absoluta.
 */
function relativeFromNow(iso: string): string {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return iso;
  const deltaMs = target - Date.now();
  const past = deltaMs < 0;
  const absMs = Math.abs(deltaMs);
  const minutes = Math.round(absMs / 60_000);
  const hours = Math.round(absMs / 3_600_000);

  if (minutes < 1) return 'ahora mismo';
  if (absMs > 48 * 3_600_000) return new Date(iso).toLocaleString('es-ES');

  const unit = hours >= 1 ? `${hours} h` : `${minutes} min`;
  return past ? `hace ${unit}` : `en ${unit}`;
}

const sectionStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 16,
  marginBottom: 16,
};

const h2Style: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: 0,
};

const thStyle: CSSProperties = {
  padding: '6px 8px',
  fontWeight: 600,
};

const tdStyle: CSSProperties = {
  padding: '6px 8px',
};
