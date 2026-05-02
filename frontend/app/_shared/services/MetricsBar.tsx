/**
 * MetricsBar — Sprint 11 Fase 11.D (ADR-070 §"Patrón de página").
 *
 * Renderiza las métricas que el plugin expone vía
 * `ServiceInfo.metrics`. Soporta unidades canónicas (disk, bandwidth,
 * RAM, CPU, email accounts, databases) + campos `custom` libres.
 *
 * Componente presentacional puro. NO `'use client'` — reusable post
 * Sprint 13 §13.AUTH.
 */
import { Card } from '../../components/ui';
import type { ServiceMetrics } from '../../lib/api';

interface MetricsBarProps {
  metrics: ServiceMetrics;
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

export function MetricsBar({ metrics }: MetricsBarProps) {
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
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>
        Métricas
      </h2>
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
