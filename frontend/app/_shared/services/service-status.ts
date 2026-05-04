/**
 * Maps `ServiceInfo.status` (canónico ADR-077) → tono visual del Badge
 * + label ES. Usado por Listado cliente, detalle cliente y admin.
 *
 * Helper de tipos puro (sin auth, sin fetch). Server-component
 * compatible. Sprint 13 §13.AUTH Fase E lo mantiene intacto.
 */
import type { ServiceInfo } from '../../lib/api';

export type StatusTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'info';

export const SERVICE_STATUS_LABEL: Record<ServiceInfo['status'], string> = {
  active: 'Activo',
  pending: 'En provisioning',
  suspended: 'Suspendido',
  expired: 'Expirado',
  failed: 'Fallido',
  cancelled: 'Cancelado',
  unknown: 'Estado desconocido',
};

export const SERVICE_STATUS_TONE: Record<ServiceInfo['status'], StatusTone> = {
  active: 'success',
  pending: 'info',
  suspended: 'warning',
  expired: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
  unknown: 'neutral',
};
