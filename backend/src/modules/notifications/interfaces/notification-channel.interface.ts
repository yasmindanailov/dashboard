import type { NotificationChannel as ChannelType } from '@prisma/client';

/**
 * NotificationChannelInterface — patrón canónico (ADR-065).
 *
 * Cada canal (email, in-app, futuro WhatsApp/SMS) implementa esta interfaz
 * y se registra como provider Nest con token `NOTIFICATION_CHANNELS`
 * (multi-provider). El `NotificationsDispatchProcessor` itera los canales
 * disponibles para un evento y delega el envío.
 *
 * Patrón análogo a payment providers (ADR-031) y provisioners (ADR-021):
 * el core llama a la interfaz; los plugins implementan; nadie importa
 * un canal concreto desde el core (R4).
 */

export interface NotificationRecipient {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  language: string | null;
}

export interface RenderedNotification {
  event_type: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface DeliveryResult {
  delivered: boolean;
  channel: ChannelType;
  message?: string;
  external_id?: string;
}

export interface NotificationChannelInterface {
  readonly name: ChannelType;
  readonly label: string;
  isAvailableFor(recipient: NotificationRecipient): boolean | Promise<boolean>;
  send(
    rendered: RenderedNotification,
    recipient: NotificationRecipient,
  ): Promise<DeliveryResult>;
}

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
