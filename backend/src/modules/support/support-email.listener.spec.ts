// `unbound-method` produce falsos positivos en specs Jest con
// `expect(mock.method).toHaveBeenCalled()`.

import { ConfigService } from '@nestjs/config';

import { EmailService } from '../../core/email/email.service';
import { SettingsService } from '../../core/settings/settings.service';
import { PrismaService } from '../../core/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationTemplateService } from '../notifications/notification-template.service';
import { SupportEmailListener } from './support-email.listener';

/**
 * Tests unit SupportEmailListener — GL-25 (audit 2026-06-25).
 *
 * Foco: la migración de los emails inline (inyección + D12) a
 * `NotificationsService.dispatchToUser` (registrados → email + campana) y al
 * render+EmailService para chats GUEST (sin cuenta), respetando el kill-switch
 * `email_enabled_globally` (GL-9) y SUPP-INV-3 (notas internas nunca al cliente).
 */
describe('SupportEmailListener — GL-25', () => {
  let prisma: {
    conversation: { findUnique: jest.Mock };
    message: { findUnique: jest.Mock };
  };
  let notifications: { dispatchToUser: jest.Mock };
  let templates: { render: jest.Mock };
  let emailService: { send: jest.Mock };
  let settings: { getBoolean: jest.Mock };
  let config: { get: jest.Mock };
  let listener: SupportEmailListener;

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: jest.fn() },
      message: { findUnique: jest.fn() },
    };
    notifications = { dispatchToUser: jest.fn().mockResolvedValue(undefined) };
    templates = { render: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue(true) };
    settings = { getBoolean: jest.fn().mockResolvedValue(true) };
    config = { get: jest.fn().mockReturnValue('https://app.aelium.test') };

    listener = new SupportEmailListener(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
      templates as unknown as NotificationTemplateService,
      emailService as unknown as EmailService,
      settings as unknown as SettingsService,
      config as unknown as ConfigService,
    );
  });

  describe('conversation.created', () => {
    it('cliente registrado → dispatchToUser (email + campana), NO EmailService directo', async () => {
      await listener.handleConversationCreated({
        conversation_id: 'c1',
        user_id: 'u1',
        user_name: 'Ana García',
        user_email: 'ana@cliente.test',
        subject: 'Mi web no carga',
        channel: 'web',
      });

      expect(notifications.dispatchToUser).toHaveBeenCalledWith(
        'conversation.created',
        expect.objectContaining({
          subject: 'Mi web no carga',
          channel: 'web',
          support_url: 'https://app.aelium.test/dashboard/support',
        }),
        'u1',
      );
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('chat GUEST (sin user_id) con email → render plantilla + EmailService (sin dispatchToUser)', async () => {
      templates.render.mockResolvedValueOnce({
        subject: 'Tu consulta ha sido recibida — "x"',
        body: '<p>escapado</p>',
      });

      await listener.handleConversationCreated({
        conversation_id: 'c2',
        user_id: null,
        user_name: 'Visitante Anónimo',
        user_email: 'guest@externo.test',
        subject: '<script>x</script>',
        channel: 'landing',
        is_guest: true,
      });

      expect(notifications.dispatchToUser).not.toHaveBeenCalled();
      // Renderiza la MISMA plantilla de email con recipient sintético.
      expect(templates.render).toHaveBeenCalledWith(
        'conversation.created',
        'email',
        'es',
        expect.objectContaining({
          subject: '<script>x</script>',
          recipient: { first_name: 'Visitante' },
        }),
      );
      expect(emailService.send).toHaveBeenCalledWith({
        to: 'guest@externo.test',
        subject: 'Tu consulta ha sido recibida — "x"',
        html: '<p>escapado</p>',
      });
    });

    it('chat GUEST con kill-switch email OFF (GL-9) → no renderiza ni envía', async () => {
      settings.getBoolean.mockResolvedValueOnce(false);

      await listener.handleConversationCreated({
        conversation_id: 'c3',
        user_id: null,
        user_name: 'Guest',
        user_email: 'guest@externo.test',
        subject: 'hola',
        channel: 'landing',
        is_guest: true,
      });

      expect(templates.render).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('chat GUEST sin email → no envía nada', async () => {
      await listener.handleConversationCreated({
        conversation_id: 'c4',
        user_id: null,
        user_name: 'Guest',
        user_email: null,
        subject: 'hola',
        channel: 'landing',
        is_guest: true,
      });

      expect(notifications.dispatchToUser).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });

  describe('message.created', () => {
    it('respuesta del agente a cliente registrado → dispatchToUser con preview truncado', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce({
        subject: 'Asunto',
        user_id: 'cliente-1',
      });
      prisma.message.findUnique.mockResolvedValueOnce({
        body: 'A'.repeat(250),
      });

      await listener.handleMessageCreated({
        conversation_id: 'c1',
        message_id: 'm1',
        sender_type: 'agent',
        sender_id: 'agente-1',
        is_internal: false,
        user_id: null,
      });

      expect(notifications.dispatchToUser).toHaveBeenCalledTimes(1);
      const [eventType, payload, userId] = notifications.dispatchToUser.mock
        .calls[0] as [string, { subject: string; preview: string }, string];
      expect(eventType).toBe('message.created');
      expect(userId).toBe('cliente-1');
      expect(payload.subject).toBe('Asunto');
      expect(payload.preview).toBe('A'.repeat(200) + '...');
    });

    it('SUPP-INV-3: nota interna → NO notifica al cliente', async () => {
      await listener.handleMessageCreated({
        conversation_id: 'c1',
        message_id: 'm1',
        sender_type: 'agent',
        sender_id: 'agente-1',
        is_internal: true,
        user_id: null,
      });

      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
      expect(notifications.dispatchToUser).not.toHaveBeenCalled();
    });

    it('mensaje del cliente (no agente) → no notifica', async () => {
      await listener.handleMessageCreated({
        conversation_id: 'c1',
        message_id: 'm1',
        sender_type: 'user',
        sender_id: 'cliente-1',
        is_internal: false,
        user_id: 'cliente-1',
      });

      expect(notifications.dispatchToUser).not.toHaveBeenCalled();
    });

    it('chat guest (conversation.user_id null) → no notifica', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce({
        subject: 'Asunto',
        user_id: null,
      });

      await listener.handleMessageCreated({
        conversation_id: 'c1',
        message_id: 'm1',
        sender_type: 'agent',
        sender_id: 'agente-1',
        is_internal: false,
        user_id: null,
      });

      expect(notifications.dispatchToUser).not.toHaveBeenCalled();
    });
  });

  describe('conversation.assigned', () => {
    it('→ dispatchToUser al agente con support_url del panel admin', async () => {
      prisma.conversation.findUnique.mockResolvedValueOnce({
        subject: 'Asunto',
      });

      await listener.handleConversationAssigned({
        conversation_id: 'c1',
        agent_id: 'agente-1',
        agent_name: 'Agente Uno',
        assigned_by: 'admin-1',
      });

      expect(notifications.dispatchToUser).toHaveBeenCalledWith(
        'conversation.assigned',
        expect.objectContaining({
          subject: 'Asunto',
          support_url: 'https://app.aelium.test/admin/support',
        }),
        'agente-1',
      );
    });
  });
});
