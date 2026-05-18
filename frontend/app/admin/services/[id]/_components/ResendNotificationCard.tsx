'use client';

/**
 * ResendNotificationCard — Sprint 15C.II Fase F.11.2 (R2+R4+R5 frozen
 * §A.11.10.8.2 + Amendment I).
 *
 * Card admin-only en `/admin/services/[id]` con botón "Reenviar
 * notificación al cliente…" → modal con `<select>` de la whitelist
 * canónica de 3 plantillas de service-lifecycle (`service.suspended` /
 * `service.unsuspended` / `service.cancelled`). Re-render fresh contra
 * el estado actual del Service en backend (R2). El frontend solo
 * refleja la whitelist; el enforce real vive en backend
 * (`NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE`).
 *
 * Cuándo usarlo:
 *   - El cliente reporta que no recibió / perdió el email original.
 *   - Admin reenvía el resumen de la suspensión/cancelación con
 *     contexto fresh (motivo canónico vigente).
 *
 * Doctrina:
 *   - Re-render fresh (R2): el payload se reconstruye desde el estado
 *     actual del Service. Si admin cambió el motivo de suspensión
 *     desde el envío original, el cliente recibe la versión nueva.
 *   - Defense-in-depth (R4): backend valida `@IsIn(whitelist)`. Bypass
 *     curl con plantilla no whitelisted → 400 antes de tocar el service.
 *   - Audit (R5): backend escribe `audit_access_log` con metadata
 *     enriquecida (`template_key`, `target_user_id`, `resource_id`).
 *     NO incluye `rendered_subject`/`rendered_body` (cero PII).
 *
 * Admin-only por diseño (R1 frozen — el cliente NO tiene este botón).
 */

import { useState } from 'react';

import {
  AlertBanner,
  Button,
  Card,
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
  serviceId: string;
  serviceDisplayName: string;
}

/**
 * Whitelist V1 frozen (Amendment I §A.11.10.8.2 durante implementación):
 * 3 plantillas reenviables — las puras transiciones del lifecycle cuyo
 * payload se deriva trivialmente del Service actual. Sincronizada con
 * `NOTIFICATION_TEMPLATE_WHITELIST_SERVICE_LIFECYCLE` del backend; un
 * `template_key` fuera de la lista → 400 (defense-in-depth).
 */
const TEMPLATE_OPTIONS: ReadonlyArray<{
  value: ServiceLifecycleTemplateKey;
  labelKey: string;
}> = [
  { value: 'service.suspended', labelKey: 'service.notifications.resend.template_label.suspended' },
  { value: 'service.unsuspended', labelKey: 'service.notifications.resend.template_label.unsuspended' },
  { value: 'service.cancelled', labelKey: 'service.notifications.resend.template_label.cancelled' },
];

export function ResendNotificationCard({ serviceId, serviceDisplayName }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [templateKey, setTemplateKey] =
    useState<ServiceLifecycleTemplateKey>('service.suspended');
  const [submitting, setSubmitting] = useState(false);

  function handleClose(): void {
    if (submitting) return;
    setOpen(false);
    setTemplateKey('service.suspended');
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    const result = await resendNotificationAction(serviceId, templateKey);
    setSubmitting(false);
    if (!result.ok) {
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
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
            {t('service.notifications.resend.card_title')}
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {t('service.notifications.resend.card_description')}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('service.notifications.resend.card_button')}
        </Button>
      </div>

      <Modal
        open={open}
        onClose={handleClose}
        title={t('service.notifications.resend.modal_title')}
        size="md"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={submitting}
            >
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
    </Card>
  );
}
