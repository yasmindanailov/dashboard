/**
 * Barrel index — Sprint 11 Fase 11.D.
 *
 * Componentes shared para `/dashboard/services/*` y `/admin/services/*`.
 * Mezclan presentational puros (Server-component compatible) y Client
 * Components con marker TODO(ADR-078) para Sprint 13 §13.AUTH.
 */
export { ServiceHeader } from './ServiceHeader';
export { MetricsBar } from './MetricsBar';
export { ActionsBar } from './ActionsBar';
export { SsoButton } from './SsoButton';
export {
  SERVICE_STATUS_LABEL,
  SERVICE_STATUS_TONE,
  type StatusTone,
} from './service-status';
