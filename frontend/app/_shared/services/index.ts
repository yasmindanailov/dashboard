/**
 * Barrel index — Sprint 11 Fase 11.D.
 *
 * Componentes shared para `/dashboard/services/*` y `/admin/services/*`.
 * Mezclan presentational puros (Server-component compatible) y Client
 * Components que invocan Server Actions (Sprint 13 §13.AUTH Fase E,
 * ADR-078 Amendment A1).
 */
export { ServiceHeader } from './ServiceHeader';
export { MetricsBar } from './MetricsBar';
export { ActionsBar } from './ActionsBar';
export { SsoButton } from './SsoButton';
export { SslStatusCard } from './SslStatusCard';
export {
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_TONE,
  type StatusTone,
} from './service-status';
