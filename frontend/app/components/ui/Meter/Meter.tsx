import type { CSSProperties, ReactNode } from 'react';
import styles from './Meter.module.css';

/**
 * Meter — Aelium Design System (Sprint 15C.II Fase F.12.5, Amendment V).
 *
 * Medidor usado/total (o porcentaje) con barra de progreso accesible + coloreo
 * por umbral. Primitiva reutilizable para recursos de hosting (disco, ancho de
 * banda, RAM, cuentas, BD), cuotas de plan y cualquier "X de Y" del producto.
 *
 * Distinta de `StatsCard` (número + tendencia, solo en Overview pages) y de la
 * antigua barra improvisada de `MetricsBar`: `Meter` es la primitiva canónica.
 *
 * Doctrina de coloreo (heredada de la Fase F.8 — alertas de cuota):
 *   - Sin `thresholdPct` → barra neutra (marca). El medidor es informativo.
 *   - Con `thresholdPct` → barra ámbar cuando `pct >= thresholdPct`; roja
 *     cuando `pct >= 95` (umbral crítico canónico, no configurable). El umbral
 *     ámbar lo decide el caller (en services viene del manifest del plugin).
 *
 * Cálculo del porcentaje (robusto a recursos sin total):
 *   1. Si `total > 0` y `used` numérico → `pct = used / total * 100`.
 *   2. Si no, y `percent` numérico → se usa `percent` (ej. CPU, sin total).
 *   3. Si ninguno → NO se renderiza barra (solo label + valor); útil para
 *      métricas custom textuales o contadores sin capacidad declarada.
 *
 * Server-component compatible: sin hooks, sin estado, sin Server Actions. Tokens
 * only (el único valor inline es el ancho del fill, expuesto como custom
 * property `--meter-value` — dato dinámico, no un literal de diseño).
 *
 * @example
 *   <Meter label="Almacenamiento" used={4300} total={10240} unit="MB"
 *          valueText="4,2 / 10 GB · 42%" thresholdPct={85} />
 *   <Meter label="Uso de CPU" percent={23} valueText="23 %" />
 */
export interface MeterProps {
  /** Etiqueta del recurso (ej. "Almacenamiento"). */
  label: ReactNode;
  /** Valor consumido. Base del % cuando hay `total`. */
  used?: number;
  /** Capacidad total. Si `> 0`, `pct = used / total`. */
  total?: number;
  /** Unidad cruda (ej. "MB", "%") — usada solo en el `valueText` por defecto. */
  unit?: string;
  /** Porcentaje explícito (0..100) cuando no hay `total` (ej. CPU). */
  percent?: number;
  /** Umbral ámbar (0..100). Superarlo colorea la barra; `>= 95` la pone roja. */
  thresholdPct?: number;
  /** Texto de valor pre-formateado (override del "used / total unit" crudo). */
  valueText?: ReactNode;
  /** Slot opcional bajo la barra (ej. aviso de cuota). Hereda el color de severidad. */
  advisory?: ReactNode;
  /** Override de clase para casos puntuales. */
  className?: string;
}

/** Umbral crítico canónico (rojo). No configurable — heredado de F.8. */
const METER_CRITICAL_PCT = 95;

type MeterSeverity = 'normal' | 'warning' | 'critical';

function deriveSeverity(
  pct: number | null,
  thresholdPct: number | undefined,
): MeterSeverity {
  if (pct === null) return 'normal';
  if (pct >= METER_CRITICAL_PCT) return 'critical';
  if (typeof thresholdPct === 'number' && pct >= thresholdPct) return 'warning';
  return 'normal';
}

function defaultValueText(
  used: number | undefined,
  total: number | undefined,
  unit: string | undefined,
): string {
  const u = used !== undefined ? String(used) : '—';
  const suffix = unit ? ` ${unit}` : '';
  if (total !== undefined) return `${u} / ${total}${suffix}`;
  return `${u}${suffix}`;
}

export function Meter({
  label,
  used,
  total,
  unit,
  percent,
  thresholdPct,
  valueText,
  advisory,
  className = '',
}: MeterProps) {
  let pct: number | null = null;
  if (typeof total === 'number' && total > 0 && typeof used === 'number') {
    pct = (used / total) * 100;
  } else if (typeof percent === 'number') {
    pct = percent;
  }

  const severity = deriveSeverity(pct, thresholdPct);
  // `pct` puede exceder 100 si el proveedor reporta used > total (race en su
  // lado) — clampamos solo la barra; el texto numérico se muestra crudo.
  const pctClamped = pct === null ? null : Math.min(Math.max(pct, 0), 100);
  const pctRounded = pct === null ? null : Math.round(pct * 10) / 10;

  const value = valueText ?? defaultValueText(used, total, unit);
  const fillStyle = { '--meter-value': `${pctClamped ?? 0}%` } as CSSProperties;

  return (
    <div className={`${styles.meter} ${className}`.trim()}>
      <div className={styles.row}>
        <span className={styles.label}>{label}</span>
        <span className={`${styles.value} ${styles[`value_${severity}`]}`}>
          {value}
        </span>
      </div>
      {pctClamped !== null && (
        <div
          className={styles.track}
          role="progressbar"
          aria-valuenow={pctRounded ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            typeof label === 'string' && pctRounded !== null
              ? `${label}: ${pctRounded}%`
              : undefined
          }
        >
          <div
            className={`${styles.fill} ${styles[`fill_${severity}`]}`}
            style={fillStyle}
          />
        </div>
      )}
      {advisory && (
        <p className={`${styles.advisory} ${styles[`advisory_${severity}`]}`}>
          {advisory}
        </p>
      )}
    </div>
  );
}
