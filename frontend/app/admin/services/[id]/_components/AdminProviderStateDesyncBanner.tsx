'use client';

/**
 * AdminProviderStateDesyncBanner — Sprint 15C.II Fase F.4.3.
 *
 * Aviso admin en `/admin/services/[id]` cuando `service.provider_state_desync`
 * es `true` (ver `ProvisioningService.getInfoForUser` F.4.1): el estado de
 * **suspensión** registrado en Aelium (`services.status`, autoritativo para el
 * lifecycle administrativo) no coincide con el que reporta el proveedor. No
 * bloquea — informa y ofrece la remediación canónica:
 *
 *   - **"Realinear estado del proveedor con Aelium"** → re-aplica la inline
 *     action `suspend_service` / `unsuspend_service` (según `services.status`)
 *     para que el proveedor se ponga al día. NO es una transición de
 *     lifecycle (el lifecycle ya estaba en `services.status`): no escribe la
 *     BD, no emite `service.suspended`/`unsuspended`, no crea notas. Es
 *     idempotente. Endpoint `POST /admin/services/:id/resync-provider-state`.
 *
 * (Antes de F.4 el único camino era "Reanudar y volver a suspender", que
 * generaba dos transiciones de lifecycle falsas — audit + notificaciones
 * espurias.)
 *
 * Plugin-agnostic: recibe `serviceId` + `adminStatus` por props. Heredable a
 * cualquier plugin con `supports_suspend`.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { AlertBanner, Button, Modal, useToast } from '../../../../components/ui';
import { t } from '../../../../_shared/i18n';
import { resyncProviderStateAction } from '../../../../_shared/services/_actions';

interface AdminProviderStateDesyncBannerProps {
  serviceId: string;
  /**
   * `service.status` — autoritativo para el lifecycle administrativo. El
   * realineado lleva al proveedor a este estado: `'suspended'` → se suspende
   * en el proveedor; `'active'` → se reactiva en el proveedor.
   */
  adminStatus: 'active' | 'suspended';
}

export function AdminProviderStateDesyncBanner({
  serviceId,
  adminStatus,
}: AdminProviderStateDesyncBannerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [resyncing, setResyncing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function executeResync(): Promise<void> {
    setConfirmOpen(false);
    setResyncing(true);
    const result = await resyncProviderStateAction(serviceId);
    if (!result.ok) {
      setResyncing(false);
      toast(
        'error',
        result.error ||
          t('service.provider_state_desync.admin.resync_error'),
      );
      return;
    }
    toast(
      'success',
      t('service.provider_state_desync.admin.resync_success'),
    );
    router.refresh();
    setResyncing(false);
  }

  const targetLabel =
    adminStatus === 'suspended'
      ? t('service.provider_state_desync.admin.target_suspended')
      : t('service.provider_state_desync.admin.target_active');

  return (
    <AlertBanner
      variant="warning"
      title={t('service.provider_state_desync.admin.title')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          {t('service.provider_state_desync.admin.body')}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          <strong>{t('service.provider_state_desync.admin.aelium_state')}:</strong>{' '}
          {targetLabel}
        </p>
        <div>
          <Button
            variant="primary"
            onClick={() => setConfirmOpen(true)}
            disabled={resyncing}
            title={t('service.provider_state_desync.admin.resync_help')}
          >
            {resyncing
              ? '…'
              : t('service.provider_state_desync.admin.resync_cta')}
          </Button>
        </div>
      </div>
      {confirmOpen && (
        <Modal
          open={true}
          onClose={() => setConfirmOpen(false)}
          title={t('service.provider_state_desync.admin.resync_cta')}
          size="sm"
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void executeResync()}>
                {t('service.provider_state_desync.admin.resync_cta')}
              </Button>
            </div>
          }
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {adminStatus === 'suspended'
              ? t('service.provider_state_desync.admin.confirm_suspend')
              : t('service.provider_state_desync.admin.confirm_active')}
          </p>
        </Modal>
      )}
    </AlertBanner>
  );
}
