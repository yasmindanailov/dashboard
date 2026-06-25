import { Job, Queue } from 'bullmq';

import {
  NotificationsDispatchProcessor,
  DispatchNotificationJobPayload,
} from './notifications-dispatch.processor';
import { PrismaService } from '../../core/database/prisma.service';
import { DlqService } from '../../core/jobs/dlq.service';
import { RetryService } from '../../core/jobs/retry.service';
import { SettingsService } from '../../core/settings/settings.service';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationChannelInterface } from './interfaces/notification-channel.interface';

/**
 * Regresión audit 2026-06-25 GL-9 (seguridad/feature): el kill-switch global
 * `notifications.email_enabled_globally` debe HONRARSE. Antes existía en el
 * catálogo de settings pero ningún código lo leía → control de seguridad
 * falso. El processor lo lee una vez por job y salta el canal email si está
 * desactivado (el canal in-app sigue activo).
 */
describe('NotificationsDispatchProcessor — kill-switch global de email (GL-9)', () => {
  let processor: NotificationsDispatchProcessor;
  let getBoolean: jest.Mock;
  let render: jest.Mock;
  let emailSend: jest.Mock;
  let inAppSend: jest.Mock;

  const buildJob = (): Job<DispatchNotificationJobPayload> =>
    ({
      id: 'job-1',
      data: {
        eventType: 'invoice.paid',
        payload: {},
        recipient_user_ids: ['u1'],
      },
    }) as unknown as Job<DispatchNotificationJobPayload>;

  beforeEach(() => {
    getBoolean = jest.fn();
    render = jest.fn().mockResolvedValue({
      subject: 'S',
      body: '<p>B</p>',
      event_type: 'invoice.paid',
    });
    emailSend = jest
      .fn()
      .mockResolvedValue({ delivered: true, channel: 'email' });
    inAppSend = jest
      .fn()
      .mockResolvedValue({ delivered: true, channel: 'in_app' });

    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'u1',
            email: 'cliente@example.com',
            first_name: 'C',
            last_name: 'X',
            language: 'es',
          },
        ]),
      },
    } as unknown as PrismaService;

    const channels = [
      {
        name: 'email',
        label: 'Email',
        isAvailableFor: () => true,
        send: emailSend,
      },
      {
        name: 'in_app',
        label: 'Campana',
        isAvailableFor: () => true,
        send: inAppSend,
      },
    ] as unknown as NotificationChannelInterface[];

    processor = new NotificationsDispatchProcessor(
      prisma,
      { render } as unknown as NotificationTemplateService,
      { register: jest.fn() } as unknown as DlqService,
      { register: jest.fn() } as unknown as RetryService,
      { getBoolean } as unknown as SettingsService,
      {} as unknown as Queue,
      channels,
    );
  });

  it('con el switch OFF no envía email pero sí in-app', async () => {
    getBoolean.mockResolvedValue(false);

    await processor.process(buildJob());

    expect(getBoolean).toHaveBeenCalledWith(
      'notifications',
      'email_enabled_globally',
      true,
    );
    expect(emailSend).not.toHaveBeenCalled();
    expect(inAppSend).toHaveBeenCalledTimes(1);
    // No se renderiza la plantilla de email (se salta antes del render).
    expect(render).not.toHaveBeenCalledWith(
      'invoice.paid',
      'email',
      expect.anything(),
      expect.anything(),
    );
  });

  it('con el switch ON envía email e in-app', async () => {
    getBoolean.mockResolvedValue(true);

    await processor.process(buildJob());

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(inAppSend).toHaveBeenCalledTimes(1);
  });
});
