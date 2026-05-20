'use client';

/**
 * ResendNotificationModal — Sprint 15C.II Fase F.11.2 → F.12.5 (Amendment VII).
 *
 * Modal controlado para reenviar una notificación de service-lifecycle al
 * cliente (whitelist V1: `service.suspended` / `service.unsuspended` /
 * `service.cancelled`). Extraído de la antigua `ResendNotificationCard`: en
 * F.12.5 el disparador es el ítem "Reenviar notificación…" del menú "Más
 * acciones" del header (`<AdminServiceActionsMenu>`), no una card en una tab.
 *
 * Doctrina conservada de F.11.2 (sin cambios funcionales):
 *   - Re-render fresh (R2): el payload se reconstruye desde el estado actual
 *     del Service en backend.
 *   - Defense-in-depth (R4): backend valida `@IsIn(whitelist)`.
 *   - Rate limit (Amendment II): 429 RESEND_TOO_FREQUENT → toast con segundos.
 *   - Audit (R5): backend escribe `audit_access_log` enriquecido (cero PII).
 */

import { useState } from 'react';

import {
  AlertBanner,
  Button,
  Modal,
  Select,
  useToast,
} from '../../../../components/ui';
import {
  resendNotificationAction,
  type ServiceLifecycleTemplateKey,
} from '../../../../_shared/services/_actions';
import { t } from '../../../../_shared/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  serviceId: string;
  serviceDisplayName: string;
}

const TEMPLATE_OPTIONS: ReadonlyArray<{
  value: ServiceLifecycleTemplateKey;
  labelKey: string;
}> = [
  { value: 'service.suspended', labelKey: 'service.notifications.resend.template_label.suspended' },
  { value: 'service.unsuspended', labelKey: 'service.notifications.resend.template_label.unsuspended' },
  { value: 'service.cancelled', labelKey: 'service.notifications.resend.template_label.cancelled' },
];

export function ResendNotificationModal({
  open,
  onClose,
  serviceId,
  serviceDisplayName,
}: Props) {
  const { toast } = useToast();
  const [templateKey, setTemplateKey] =
    useState<ServiceLifecycleTemplateKey>('service.suspended');
  const [submitting, setSubmitting] = useState(false);

  function handleClose(): void {
    if (submitting) return;
    setTemplateKey('service.suspended');
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    const result = await resendNotificationAction(serviceId, templateKey);
    setSubmitting(false);
    if (!result.ok) {
      if (result.rateLimited && result.retryAfterSeconds !== undefined) {
        toast(
          'error',
          `${t('service.notifications.resend.toast_rate_limited_prefix')}${result.retryAfterSeconds}${t('service.notifications.resend.toast_rate_limited_suffix')}`,
        );
        return;
      }
      toast('error', result.error);
      return;
    }
    toast(
      'success',
      `${t('service.notifications.resend.toast_success_prefix')}${t(
        `service.notifications.resend.template_label.${templateKey.replace(
          'service.',
          '',
        )}`,
      )}`,
    );
    handleClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('service.notifications.resend.modal_title')}
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            {t('service.notifications.resend.cancel')}
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            loading={submitting}
          >
            {submitting
              ? t('service.notifications.resend.submitting')
              : t('service.notifications.resend.submit')}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AlertBanner variant="info">
          {t('service.notifications.resend.modal_help_prefix')}
          <strong>{serviceDisplayName}</strong>
          {t('service.notifications.resend.modal_help_suffix')}
        </AlertBanner>
        <Select
          label={t('service.notifications.resend.template_field_label')}
          value={templateKey}
          onChange={(e) =>
            setTemplateKey(e.target.value as ServiceLifecycleTemplateKey)
          }
          options={TEMPLATE_OPTIONS.map((opt) => ({
            value: opt.value,
            label: t(opt.labelKey),
          }))}
          helperText={t('service.notifications.resend.template_field_help')}
          disabled={submitting}
        />
      </div>
    </Modal>
  );
}
