/**
 * MetricsBar — Sprint 11 Fase 11.D (ADR-070 §"Patrón de página") +
 * Sprint 15C.II Fase B (ADR-083 Amendment A4.1 — botón ↻ Refrescar) +
 * Sprint 15C.II Fase C round 7 (smoke real Yasmin 2026-05-10):
 * discriminación cliente vs admin del refresh UX.
 *
 * Renderiza las métricas que el plugin expone vía
 * `ServiceInfo.metrics`. Soporta unidades canónicas (disk, bandwidth,
 * RAM, CPU, email accounts, databases) + campos `custom` libres.
 *
 * Refresh UX por rol (estándar industria — Stripe, Vercel, Datadog):
 *   - **Cliente**: SIN botón ↻ explícito. La info se muestra pasiva
 *     con timestamp relativo "Actualizado hace X" + tooltip con la
 *     fecha exacta. El cliente no necesita controlar manualmente la
 *     carga al proveedor (riesgo DoS + UX confusa "¿qué refresca el
 *     botón?"). El cache backend TTL=60s garantiza que al recargar la
 *     página (F5 universal) el cliente obtiene fresh state cuando
 *     pasaron >60s. Patrón canónico Stripe customer / Vercel viewer.
 *   - **Admin**: botón ↻ con cooldown visible 10s
 *     (`<MetricsRefreshButton>`). El admin SÍ necesita refresh manual
 *     ocasional para debugging / smoke; el cooldown previene
 *     rate-limit accidental. Patrón Stripe admin / Datadog.
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
  /** True si la página es admin (`/admin/services/[id]`). Default false.
   *  Sprint 15C.II Fase C round 7: cliente NO ve botón ↻ aunque
   *  serviceId esté presente (UX pasiva industry standard). */
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

/**
 * Sprint 15C.II Fase C round 7 — formato de tiempo relativo amigable
 * (Stripe / GitHub / Twitter style). Server-side render del valor
 * inicial; el cliente puede recargar para refresh. Es estable para
 * SSR (no usa Date.now() durante hidratación — usa el `fetchedAt` ISO
 * que viene del backend).
 *
 * Casos:
 *   - <1 minuto → "hace unos segundos"
 *   - <60 minutos → "hace N minuto(s)"
 *   - <24 horas → "hace N hora(s)"
 *   - >=24 horas → "hace N día(s)"
 */
function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return 'hace unos segundos';
  if (diffSec < 3600) {
    const m = Math.round(diffSec / 60);
    return `hace ${m} minuto${m === 1 ? '' : 's'}`;
  }
  if (diffSec < 86400) {
    const h = Math.round(diffSec / 3600);
    return `hace ${h} hora${h === 1 ? '' : 's'}`;
  }
  const d = Math.round(diffSec / 86400);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
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

  // Sprint 15C.II Fase B fix-up round 3 (2026-05-10): cuando no hay métricas
  // PERO sí tenemos serviceId, renderizamos la card con un mensaje
  // explicativo. Sin serviceId (legacy call-site sin refresh), mantenemos
  // el comportamiento original de retornar null.
  if (rows.length === 0 && !serviceId) return null;

  // Sprint 15C.II Fase C round 7: botón refresh SOLO admin (UX pasiva
  // estándar industria para cliente).
  const showRefreshButton = serviceId !== undefined && isAdmin;

  // Mensaje vacío contextual por rol — el cliente no debe ver
  // referencia a un botón que no tiene.
  const emptyMessage = isAdmin
    ? 'Métricas no disponibles ahora — el proveedor no las devuelve. Pulsa "↻ Refrescar" para reintentar.'
    : 'Métricas no disponibles ahora. Vuelve a esta página en unos minutos para ver datos actualizados.';

  const fetchedAtIso = metrics.fetchedAt;
  const relativeTime = formatRelativeTime(fetchedAtIso);
  const exactTime = new Date(fetchedAtIso).toLocaleString('es-ES');

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
        {showRefreshButton && (
          <MetricsRefreshButton serviceId={serviceId} isAdmin={isAdmin} />
        )}
      </div>
      {rows.length === 0 && (
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: 13,
            margin: 0,
            fontStyle: 'italic',
          }}
        >
          {emptyMessage}
        </p>
      )}
      {rows.length > 0 && (
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
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
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
      )}
      {/*
        Sprint 15C.II Fase C round 7: timestamp con formato relativo
        (Stripe / GitHub style — "hace 5 minutos") + tooltip con la
        fecha exacta. El cliente entiende que la info está fresca sin
        necesidad de un botón explícito; si quiere fresh urgente,
        recarga la página (F5 universal). El admin además tiene el
        botón ↻ con cooldown.
      */}
      <p
        style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}
        title={`Última lectura del proveedor: ${exactTime}`}
      >
        Actualizado {relativeTime}
        {!isAdmin && (
          <span style={{ marginLeft: 4 }}>
            · Recarga la página para ver los datos más recientes.
          </span>
        )}
      </p>
    </Card>
  );
}
