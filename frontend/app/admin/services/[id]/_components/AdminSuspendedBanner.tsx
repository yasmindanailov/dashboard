/**
 * AdminSuspendedBanner — Sprint 15C.II Fase F.12 (layout canónico).
 *
 * Banner amarillo "Servicio suspendido" para la vista admin. Estado operativo
 * reversible (NO drift, NO terminal). Muestra el motivo canónico localizado +
 * (si hay) la nota interna del admin + cuándo se suspendió. La reactivación se
 * opera desde `AdminServiceOperationsCard`.
 *
 * **Cero cambio funcional** (F.12.2): JSX portado literalmente del bloque
 * inline de `/admin/services/[id]/page.tsx`. Antes el page parseaba
 * `suspension_reason` con un helper local duplicado; ahora usa el helper
 * compartido `_shared/services/suspension-reason`.
 *
 * Presentacional puro — Server-component compatible (sin `'use client'`).
 */
import { AlertBanner } from '../../../../components/ui';
import { parseSuspensionReason } from '../../../../_shared/services/suspension-reason';
import type { ServiceDetailContext } from '../../../../_shared/services/service-detail-context';

export function AdminSuspendedBanner({ ctx }: { ctx: ServiceDetailContext }) {
  const { service } = ctx;
  const suspension = parseSuspensionReason(service.suspension_reason);
  return (
    <AlertBanner variant="warning" title="Servicio suspendido">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          Este servicio está suspendido — el cliente no tiene acceso, pero sus
          datos se conservan en el proveedor. Reactívalo desde «Operaciones
          admin» cuando proceda.
        </p>
        <p style={{ margin: 0, fontSize: 13 }}>
          <strong>Motivo:</strong> {suspension.label}
          {suspension.note ? (
            <span style={{ color: 'var(--text-secondary)' }}>
              {' — '}
              {suspension.note}
            </span>
          ) : null}
        </p>
        {service.suspended_at && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Suspendido el{' '}
            {new Date(service.suspended_at).toLocaleString('es-ES')}
          </p>
        )}
      </div>
    </AlertBanner>
  );
}
