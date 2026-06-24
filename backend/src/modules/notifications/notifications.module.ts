import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ProvisioningCacheModule } from '../../core/provisioning/provisioning-cache.module';
import { NotificationsService } from './notifications.service';
import { NotificationResendService } from './notification-resend.service';
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
import { NotificationsOnServiceQuotaThresholdCrossedListener } from './listeners/notifications-on-service-quota-threshold-crossed.listener';
import { NotificationsOnServiceSuspendedListener } from './listeners/notifications-on-service-suspended.listener';
import { NotificationsOnServiceUnsuspendedListener } from './listeners/notifications-on-service-unsuspended.listener';
import { NotificationsOnDomainLifecycleListener } from './listeners/notifications-on-domain-lifecycle.listener';
import { NotificationsOnDomainManagementListener } from './listeners/notifications-on-domain-management.listener';
import { NotificationsOnDomainTransferListener } from './listeners/notifications-on-domain-transfer.listener';
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
  imports: [
    BullModule.registerQueue({ name: NOTIFICATIONS_DISPATCH_QUEUE }),
    // Sprint 15C.II Fase F.11.2 Amendment II hot-fix 2026-05-19 (DI clash):
    // NotificationResendService usa ProvisioningCacheService para el
    // cooldown del endpoint resend (P1 rate limiting). El cache vive en
    // un módulo leaf canónico para evitar acoplar Notifications (Global)
    // a todo ProvisioningModule.
    ProvisioningCacheModule,
  ],
  controllers: [NotificationsController, NotificationTemplatesAdminController],
  providers: [
    NotificationsService,
    NotificationTemplateService,
    // Sprint 15C.II Fase F.11.2 (R2+R4 frozen §A.11.10.8.2 + Amendment I):
    // reenvío admin de notificaciones de lifecycle del service. Whitelist
    // canónica de 3 plantillas (`service.suspended` / `service.unsuspended` /
    // `service.cancelled`). Re-render fresh contra plantilla viva.
    NotificationResendService,
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
    // Sprint 15C.II Fase F.8 (dossier §A.11.10.5.1 R6): consume
    // `service.quota_threshold_crossed` emitido por
    // `QuotaThresholdDetectorService.detectAndNotify` (edge-triggered
    // upstream — el listener NO aplica anti-spam adicional). Plantilla
    // genérica heredable a cualquier plugin con `has_metrics`.
    NotificationsOnServiceQuotaThresholdCrossedListener,
    // Sprint 15D Fase 15D.E (ADR-084 §5): consume los 4 eventos de ciclo de vida
    // del dominio (domain.renewed/expiring_soon/expired/entered_redemption) y
    // despacha email + campana al cliente. Heredable a futuros registrars.
    NotificationsOnDomainLifecycleListener,
    // Sprint 15D Fase 15D.F.1 (ADR-084 §5): alertas de seguridad de gestión
    // (domain.nameservers_changed / domain.lock_changed) → email + campana
    // "verifica que fuiste tú". Heredable a futuros registrars.
    NotificationsOnDomainManagementListener,
    // Sprint 15D.II.T3 (ADR-084 §5 + A2): consume la FSM de transfer-in
    // (domain.transfer_initiated/completed/failed) → email + campana al cliente.
    NotificationsOnDomainTransferListener,
    NotificationsRetentionCron,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (email: EmailChannel, inApp: InAppChannel) => [email, inApp],
      inject: [EmailChannel, InAppChannel],
    },
  ],
  exports: [
    NotificationsService,
    NotificationTemplateService,
    NotificationResendService,
  ],
})
export class NotificationsModule {}
