/**
 * MetricsBar — Sprint 11 Fase 11.D (ADR-070 §"Patrón de página") +
 * Sprint 15C.II Fase B (ADR-083 Amendment A4.1 — botón ↻ Refrescar).
 *
 * Renderiza las métricas que el plugin expone vía
 * `ServiceInfo.metrics`. Soporta unidades canónicas (disk, bandwidth,
 * RAM, CPU, email accounts, databases) + campos `custom` libres.
 *
 * Componente presentacional principalmente — sigue siendo Server
 * Component. Embebe el subcomponente client `<MetricsRefreshButton>`
 * cuando se pasa `serviceId` (opcional, retro-compat). El botón ↻
 * dispara `refreshServiceInfoAction` que invalida el cache 60s del
 * wrapper backend + revalidatePath del SC padre.
 *
 * Heredable: cualquier service detail (cliente + admin) puede pasar
 * serviceId + isAdmin para activar refresh. Sin esos props, MetricsBar
 * queda como antes (no botón).
 */
import { Card } from '../../components/ui';
import type { ServiceMetrics } from '../../lib/api';

import { MetricsRefreshButton } from './MetricsRefreshButton';

interface MetricsBarProps {
  metrics: ServiceMetrics;
  /**
   * Sprint 15C.II Fase B: si se proporciona, MetricsBar renderiza el
   * subcomponente `<MetricsRefreshButton>` que invoca el endpoint
   * POST /services/:id/refresh (o admin). Sin este prop, el botón NO
   * se renderiza (retro-compat con call-sites Sprint 11/15A).
   */
  serviceId?: string;
  /** True si la página es admin (`/admin/services/[id]`). Default false. */
  isAdmin?: boolean;
}

interface MetricRow {
  label: string;
  used?: number;
  total?: number;
  unit: string;
  format?: (n: number) => string;
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function MetricsBar({
  metrics,
  serviceId,
  isAdmin = false,
}: MetricsBarProps) {
  const rows: MetricRow[] = [];

  if (metrics.diskUsedMb !== undefined || metrics.diskTotalMb !== undefined) {
    rows.push({
      label: 'Almacenamiento',
      used: metrics.diskUsedMb,
      total: metrics.diskTotalMb,
      unit: 'MB',
      format: formatMb,
    });
  }
  if (
    metrics.bandwidthUsedMb !== undefined ||
    metrics.bandwidthTotalMb !== undefined
  ) {
    rows.push({
      label: 'Ancho de banda',
      used: metrics.bandwidthUsedMb,
      total: metrics.bandwidthTotalMb,
      unit: 'MB',
      format: formatMb,
    });
  }
  if (metrics.ramUsedMb !== undefined || metrics.ramTotalMb !== undefined) {
    rows.push({
      label: 'Memoria RAM',
      used: metrics.ramUsedMb,
      total: metrics.ramTotalMb,
      unit: 'MB',
      format: formatMb,
    });
  }
  if (metrics.cpuUsagePercent !== undefined) {
    rows.push({
      label: 'Uso de CPU',
      used: metrics.cpuUsagePercent,
      unit: '%',
      format: formatPct,
    });
  }
  if (
    metrics.emailAccountsUsed !== undefined ||
    metrics.emailAccountsTotal !== undefined
  ) {
    rows.push({
      label: 'Cuentas de email',
      used: metrics.emailAccountsUsed,
      total: metrics.emailAccountsTotal,
      unit: '',
    });
  }
  if (
    metrics.databasesUsed !== undefined ||
    metrics.databasesTotal !== undefined
  ) {
    rows.push({
      label: 'Bases de datos',
      used: metrics.databasesUsed,
      total: metrics.databasesTotal,
      unit: '',
    });
  }
  if (metrics.custom) {
    for (const [key, value] of Object.entries(metrics.custom)) {
      rows.push({
        label: key,
        used: typeof value === 'number' ? value : undefined,
        unit: typeof value === 'string' ? value : '',
      });
    }
  }

  if (rows.length === 0) return null;

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Métricas</h2>
        {serviceId && (
          <MetricsRefreshButton serviceId={serviceId} isAdmin={isAdmin} />
        )}
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderBottom: '1px solid var(--border)',
              paddingBottom: 8,
            }}
          >
            <span
              style={{ color: 'var(--text-secondary)', fontSize: 13 }}
            >
              {row.label}
            </span>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {row.used !== undefined && row.format
                ? row.format(row.used)
                : row.used ?? '—'}
              {row.total !== undefined && (
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                  {' / '}
                  {row.format ? row.format(row.total) : row.total}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
        Última lectura: {new Date(metrics.fetchedAt).toLocaleString('es-ES')}
      </p>
    </Card>
  );
}
