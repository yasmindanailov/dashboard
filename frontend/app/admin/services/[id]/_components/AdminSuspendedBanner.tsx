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
import { t } from '../../../../_shared/i18n';
import { parseSuspensionReason } from '../../../../_shared/services/suspension-reason';
import type { ServiceDetailContext } from '../../../../_shared/services/service-detail-context';
import styles from '../../../../_shared/services/service-detail.module.css';

export function AdminSuspendedBanner({ ctx }: { ctx: ServiceDetailContext }) {
  const { service } = ctx;
  const suspension = parseSuspensionReason(service.suspension_reason);
  return (
    <AlertBanner
      variant="warning"
      title={t('service.detail.suspended_admin.title')}
    >
      <div className={styles.bannerStackTight}>
        <p className={styles.bannerText}>
          {t('service.detail.suspended_admin.body')}
        </p>
        <p className={styles.bannerText}>
          <strong>{t('service.detail.suspended_admin.reason_label')}:</strong>{' '}
          {suspension.label}
        </p>
        {suspension.note && (
          <div className={styles.bannerNote}>
            <span className={styles.bannerNoteTag}>Nota interna</span>
            <span className={styles.bannerNoteText}>{suspension.note}</span>
          </div>
        )}
        {service.suspended_at && (
          <p className={styles.bannerMetaTertiary}>
            {t('service.detail.suspended_at')}{' '}
            {new Date(service.suspended_at).toLocaleString('es-ES')}
          </p>
        )}
      </div>
    </AlertBanner>
  );
}
