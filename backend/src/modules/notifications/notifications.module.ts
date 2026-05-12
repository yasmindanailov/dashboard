import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationTemplatesAdminController } from './notification-templates-admin.controller';
import {
  NotificationsDispatchProcessor,
  NOTIFICATIONS_DISPATCH_QUEUE,
} from './notifications-dispatch.processor';
import { EmailChannel } from './channels/email.channel';
import { InAppChannel } from './channels/in-app.channel';
import { NOTIFICATION_CHANNELS } from './interfaces/notification-channel.interface';
import { NotificationsOutboxListener } from './listeners/notifications-outbox.listener';
import { NotificationsDlqListener } from './listeners/notifications-dlq.listener';
import { NotificationsSystemErrorListener } from './listeners/notifications-system-error.listener';
import { NotificationsAuthReplayListener } from './listeners/notifications-auth-replay.listener';
import { NotificationsPluginCircuitListener } from './listeners/notifications-plugin-circuit.listener';
import { NotificationsOnReconciliationThresholdExceededListener } from './listeners/notifications-on-reconciliation-threshold-exceeded.listener';
import { NotificationsOnPasswordResetListener } from './listeners/notifications-on-password-reset.listener';
import { NotificationsOnServiceCancelledListener } from './listeners/notifications-on-service-cancelled.listener';
import { NotificationsOnServiceSuspendedListener } from './listeners/notifications-on-service-suspended.listener';
import { NotificationsOnServiceUnsuspendedListener } from './listeners/notifications-on-service-unsuspended.listener';
import { NotificationsRetentionCron } from './notifications-retention.cron';

/**
 * NotificationsModule — Sprint 9 Fase D (ADR-065 + ADR-042).
 *
 * @Global porque cualquier módulo de negocio que quiera emitir notificaciones
 * (billing, tasks, support, futuros provisioning/partner) debe poder
 * inyectar `NotificationsService.dispatchToUser()` /
 * `dispatchToSuperadmins()` sin importar este módulo cada vez.
 *
 * El multi-provider `NOTIFICATION_CHANNELS` permite extender con plugins
 * futuros (WhatsApp, SMS, Slack) sin tocar el dispatcher.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_DISPATCH_QUEUE })],
  controllers: [NotificationsController, NotificationTemplatesAdminController],
  providers: [
    NotificationsService,
    NotificationTemplateService,
    NotificationsDispatchProcessor,
    EmailChannel,
    InAppChannel,
    NotificationsOutboxListener,
    NotificationsDlqListener,
    NotificationsSystemErrorListener,
    NotificationsAuthReplayListener,
    NotificationsPluginCircuitListener,
    // Sprint 15C Fase 15C.H (ADR-083 §6 decisión 24): consume
    // `service.reconciled_external_change` y, si el count en últimas
    // 24h supera `provisioning.enhance_cp.reconciliation_alert_threshold`
    // (default 5), notifica a superadmins. Dedupe vía setting interno
    // `enhance_cp.reconciliation_last_alert_at` (24h ventana).
    NotificationsOnReconciliationThresholdExceededListener,
    // Sprint 15C.II Fase D (ADR-083 Amendment A4.5 + DC.NEW-15CII-EMAIL-RESET):
    // consume `service.action_executed` y, si la action es
    // `reset_account_password` exitosa, envía email al cliente con la nueva
    // password. PRE-CONDICIÓN R12: el wrapper canónico
    // `executeActionWithCacheInvalidation` ya redactó `data.password` en
    // audit_change_log via `core/provisioning/audit-sanitizer.ts` antes de
    // que este listener consuma el evento. El evento NestJS in-memory
    // conserva el plaintext temporal sólo para este listener; nunca se
    // persiste con plaintext. Heredable a 15D RC + 15G Plesk.
    NotificationsOnPasswordResetListener,
    // Sprint 15C.II Fase E: consume `service.cancelled` (emitido por
    // `ProvisioningService.deprovisionAsAdmin`) y, si `notify_client !== false`,
    // despacha email + campana `service.cancelled` al dueño del servicio.
    // Plantilla genérica heredable a 15D RC + 15E Docker + 15G Plesk.
    NotificationsOnServiceCancelledListener,
    // Sprint 15C.II Fase F (ADR-077 Amendment A4): consume `service.suspended`
    // (emitido por `ProvisioningService.suspendAsAdmin`) y, si
    // `notify_client !== false`, despacha email + campana `service.suspended`
    // con el motivo canónico localizado + CTA ramificado (regulariza pago /
    // soporte / nada para mantenimiento). NUNCA incluye la nota interna del
    // admin. Heredable a 15E Docker + 15G Plesk.
    NotificationsOnServiceSuspendedListener,
    // Sprint 15C.II Fase F: consume `service.unsuspended` (emitido por
    // `ProvisioningService.unsuspendAsAdmin`) y despacha siempre email +
    // campana `service.unsuspended` ("tu servicio vuelve a estar activo").
    NotificationsOnServiceUnsuspendedListener,
    NotificationsRetentionCron,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (email: EmailChannel, inApp: InAppChannel) => [email, inApp],
      inject: [EmailChannel, InAppChannel],
    },
  ],
  exports: [NotificationsService, NotificationTemplateService],
})
export class NotificationsModule {}
