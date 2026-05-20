/**
 * MetricsBar — "Recursos" del detalle de servicio.
 *
 * Sprint 11 11.D (ADR-070) → 15C.II F.B (botón ↻) → F.C round 7 (refresh UX por
 * rol) → F.8 (alertas de cuota) → **F.12.5 (Amendment V — densidad profesional)**:
 * rediseño a medidores `<Meter>` dentro de un `<SectionCard>` "Recursos". Lidera
 * el overview (patrón #1 del sector: Hostinger/cPanel/DigitalOcean). Sustituye
 * las barras improvisadas inline por la primitiva DS `<Meter>` (tokens + i18n).
 *
 * Refresh UX por rol (heredado F.C round 7 — estándar Stripe/Vercel/Datadog):
 *   - **Cliente**: SIN botón ↻; timestamp relativo + tooltip. UX pasiva (el
 *     cache backend TTL=60s da fresh al recargar; evita DoS y UX confusa).
 *   - **Admin**: botón ↻ con cooldown en el slot `actions` del SectionCard.
 *
 * Coloreo de cuota (heredado F.8): SOLO la fila de disco recibe `thresholdPct`
 * (del manifest del plugin vía el orquestador) → barra ámbar ≥ umbral, roja
 * ≥95% + texto advisory. El resto de filas son informativas (barra neutra). El
 * umbral crítico 95% no es configurable (manifest `maximum: 95` lo garantiza).
 *
 * Provisioner-agnóstico: las filas se construyen por presencia de campos en
 * `ServiceInfo.metrics` (capability-driven, ADR-077) — cero `if (provisioner)`.
 *
 * Server-component compatible (el botón ↻ es un CC island).
 */
import { HelpTip, Meter, SectionCard } from '../../components/ui';
import { t } from '../../_shared/i18n';
import type { ServiceMetrics } from '../../lib/api';

import { MetricsRecalculateButton } from './MetricsRecalculateButton';
import { MetricsRefreshButton } from './MetricsRefreshButton';
import styles from './service-detail.module.css';

interface MetricsBarProps {
  metrics: ServiceMetrics;
  /**
   * Sprint 15C.II Fase B: si se proporciona, se renderiza el
   * `<MetricsRefreshButton>` (admin) que invoca POST /services/:id/refresh. Sin
   * este prop, el botón NO se renderiza (retro-compat call-sites Sprint 11/15A).
   */
  serviceId?: string;
  /** True si la página es admin (`/admin/services/[id]`). Default false. F.C
   *  round 7: cliente NO ve botón ↻ aunque haya serviceId (UX pasiva). */
  isAdmin?: boolean;
  /**
   * Sprint 15C.II Fase F.8 — umbral de alerta de cuota de disco (manifest del
   * plugin, `[50, 95]`, default 85; expuesto por el orquestador en el summary).
   * Si `undefined`/`null`, sin coloreo (comportamiento legacy). SOLO afecta la
   * fila "Almacenamiento" (R3 — bandwidth fuera de scope por el reset mensual).
   */
  quotaAlertThresholdPct?: number | null;
  /**
   * Sprint 15C.II Fase F.12.5 (punto 2): si el plugin declara la action
   * `recalculate_provider_metrics` Y la página es admin, se muestra el botón
   * "Recalcular" junto a "Refrescar" (cada uno con su ⓘ). El caller (adapter)
   * resuelve la presencia de la action; aquí solo se combina con `isAdmin`.
   */
  canRecalculate?: boolean;
}

// Sprint 15C.II Fase F.8 — umbral crítico hardcoded (rojo). No configurable
// (L18 + YAGNI). El manifest `maximum: 95` impide que el admin lo pise.
const QUOTA_CRITICAL_PCT = 95;

type DiskQuotaSeverity = 'ok' | 'warning' | 'critical';

function deriveDiskSeverity(
  pct: number,
  thresholdPct: number,
): DiskQuotaSeverity {
  if (pct >= QUOTA_CRITICAL_PCT) return 'critical';
  if (pct >= thresholdPct) return 'warning';
  return 'ok';
}

interface MetricRow {
  key: string;
  label: string;
  used?: number;
  total?: number;
  unit?: string;
  percent?: number;
  /** Texto de valor pre-formateado para el `<Meter>`. */
  valueText: string;
  /** Umbral de cuota (solo disco). */
  thresholdPct?: number;
  /** Advisory de cuota (solo disco, cuando severity ≠ ok). */
  advisory?: string;
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatPct(n: number): string {
  return `${n.toFixed(1)} %`;
}

/** "X / Y unidad" robusto a campos ausentes (— para el lado que falta). */
function pairText(
  used: number | undefined,
  total: number | undefined,
  format: (n: number) => string = (n) => String(n),
): string {
  const u = used !== undefined ? format(used) : '—';
  if (total === undefined) return u;
  return `${u} / ${format(total)}`;
}

/**
 * Sprint 15C.II Fase C round 7 — tiempo relativo amigable (Stripe/GitHub).
 * SSR-stable: usa `fetchedAt` del backend, no `Date.now()` en hidratación
 * (el valor se calcula una vez en el render del servidor).
 */
function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return t('service.resources.relative.just_now');
  if (diffSec < 3600) {
    const m = Math.round(diffSec / 60);
    return `${t('service.resources.relative.ago')} ${m} ${m === 1 ? t('service.resources.relative.minute') : t('service.resources.relative.minutes')}`;
  }
  if (diffSec < 86400) {
    const h = Math.round(diffSec / 3600);
    return `${t('service.resources.relative.ago')} ${h} ${h === 1 ? t('service.resources.relative.hour') : t('service.resources.relative.hours')}`;
  }
  const d = Math.round(diffSec / 86400);
  return `${t('service.resources.relative.ago')} ${d} ${d === 1 ? t('service.resources.relative.day') : t('service.resources.relative.days')}`;
}

function buildDiskAdvisory(
  pct: number,
  severity: DiskQuotaSeverity,
): string | undefined {
  if (severity === 'ok') return undefined;
  const pctRounded = Math.round(pct * 10) / 10;
  const tail =
    severity === 'critical'
      ? t('service.resources.quota_advisory.critical')
      : t('service.resources.quota_advisory.warning');
  return `${t('service.resources.quota_advisory.at')} ${pctRounded}% ${tail}`;
}

export function MetricsBar({
  metrics,
  serviceId,
  isAdmin = false,
  quotaAlertThresholdPct,
  canRecalculate = false,
}: MetricsBarProps) {
  const rows: MetricRow[] = [];

  // Sprint 15C.II Fase F.8 — solo el disco recibe coloreo del threshold de
  // cuota (R3 — bandwidth fuera por reset mensual). Calculamos pct/severity
  // solo cuando hay used+total Y el orquestador exportó un threshold válido.
  let diskSeverity: DiskQuotaSeverity = 'ok';
  let diskPct: number | null = null;
  if (
    metrics.diskUsedMb !== undefined &&
    metrics.diskTotalMb !== undefined &&
    metrics.diskTotalMb > 0 &&
    typeof quotaAlertThresholdPct === 'number'
  ) {
    diskPct = (metrics.diskUsedMb / metrics.diskTotalMb) * 100;
    diskSeverity = deriveDiskSeverity(diskPct, quotaAlertThresholdPct);
  }

  if (metrics.diskUsedMb !== undefined || metrics.diskTotalMb !== undefined) {
    rows.push({
      key: 'disk',
      label: t('service.resources.disk'),
      used: metrics.diskUsedMb,
      total: metrics.diskTotalMb,
      unit: 'MB',
      valueText: pairText(metrics.diskUsedMb, metrics.diskTotalMb, formatMb),
      thresholdPct:
        typeof quotaAlertThresholdPct === 'number'
          ? quotaAlertThresholdPct
          : undefined,
      advisory:
        diskPct !== null ? buildDiskAdvisory(diskPct, diskSeverity) : undefined,
    });
  }
  if (
    metrics.bandwidthUsedMb !== undefined ||
    metrics.bandwidthTotalMb !== undefined
  ) {
    rows.push({
      key: 'bandwidth',
      label: t('service.resources.bandwidth'),
      used: metrics.bandwidthUsedMb,
      total: metrics.bandwidthTotalMb,
      unit: 'MB',
      valueText: pairText(
        metrics.bandwidthUsedMb,
        metrics.bandwidthTotalMb,
        formatMb,
      ),
    });
  }
  if (metrics.ramUsedMb !== undefined || metrics.ramTotalMb !== undefined) {
    rows.push({
      key: 'ram',
      label: t('service.resources.ram'),
      used: metrics.ramUsedMb,
      total: metrics.ramTotalMb,
      unit: 'MB',
      valueText: pairText(metrics.ramUsedMb, metrics.ramTotalMb, formatMb),
    });
  }
  if (metrics.cpuUsagePercent !== undefined) {
    rows.push({
      key: 'cpu',
      label: t('service.resources.cpu'),
      percent: metrics.cpuUsagePercent,
      unit: '%',
      valueText: formatPct(metrics.cpuUsagePercent),
    });
  }
  if (
    metrics.emailAccountsUsed !== undefined ||
    metrics.emailAccountsTotal !== undefined
  ) {
    rows.push({
      key: 'email',
      label: t('service.resources.email'),
      used: metrics.emailAccountsUsed,
      total: metrics.emailAccountsTotal,
      valueText: pairText(metrics.emailAccountsUsed, metrics.emailAccountsTotal),
    });
  }
  if (
    metrics.databasesUsed !== undefined ||
    metrics.databasesTotal !== undefined
  ) {
    rows.push({
      key: 'databases',
      label: t('service.resources.databases'),
      used: metrics.databasesUsed,
      total: metrics.databasesTotal,
      valueText: pairText(metrics.databasesUsed, metrics.databasesTotal),
    });
  }
  if (metrics.custom) {
    for (const [key, value] of Object.entries(metrics.custom)) {
      rows.push({
        key: `custom-${key}`,
        label: key,
        used: typeof value === 'number' ? value : undefined,
        valueText: String(value),
      });
    }
  }

  // Sprint 15C.II Fase B fix-up round 3: sin métricas pero con serviceId,
  // renderizamos la card con mensaje explicativo. Sin serviceId (legacy
  // call-site), null.
  if (rows.length === 0 && !serviceId) return null;

  // F.C round 7: botones de métricas (↻ Refrescar + Recalcular) SOLO admin
  // (UX pasiva estándar para cliente). F.12.5 punto 2: recalcular junto a
  // refrescar, cada uno con su ⓘ explicando la diferencia. La condición inline
  // (no const) permite a TS estrechar `serviceId` a string en la rama true.
  const metricsActions =
    serviceId !== undefined && isAdmin ? (
      <div className={styles.metricsActions}>
        {canRecalculate && (
          <span className={styles.actionWithTip}>
            <MetricsRecalculateButton serviceId={serviceId} />
            <HelpTip text={t('service.resources.recalculate_help')} />
          </span>
        )}
        <span className={styles.actionWithTip}>
          <MetricsRefreshButton serviceId={serviceId} isAdmin={isAdmin} />
          <HelpTip text={t('service.resources.refresh_help')} />
        </span>
      </div>
    ) : undefined;

  const emptyMessage = isAdmin
    ? t('service.resources.empty_admin')
    : t('service.resources.empty_client');

  const fetchedAtIso = metrics.fetchedAt;
  const relativeTime = formatRelativeTime(fetchedAtIso);
  const exactTime = new Date(fetchedAtIso).toLocaleString('es-ES');

  return (
    <SectionCard title={t('service.resources.card_title')} actions={metricsActions}>
      {rows.length === 0 ? (
        <p className={styles.resourcesEmpty}>{emptyMessage}</p>
      ) : (
        <div className={styles.metersList}>
          {rows.map((row) => (
            <Meter
              key={row.key}
              label={row.label}
              used={row.used}
              total={row.total}
              percent={row.percent}
              unit={row.unit}
              valueText={row.valueText}
              thresholdPct={row.thresholdPct}
              advisory={row.advisory}
            />
          ))}
        </div>
      )}
      <p
        className={styles.resourcesUpdated}
        title={`${t('service.resources.fetched_tooltip_prefix')}${exactTime}`}
      >
        {t('service.resources.updated_prefix')}
        {relativeTime}
        {!isAdmin && (
          <span className={styles.resourcesUpdatedHint}>
            {' '}
            {t('service.resources.updated_client_hint')}
          </span>
        )}
      </p>
    </SectionCard>
  );
}
