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
