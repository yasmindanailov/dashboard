import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * BillingEmailListener — delega a `NotificationsService.dispatchToUser`
 * (Sprint 9 Fase D + ADR-065).
 *
 * Tras la migración a notifications:
 *  - Cada handler queda en una línea: extrae `user_id` del payload del
 *    evento y encola un job en la cola `notifications-dispatch`.
 *  - Las plantillas HTML inline previas (Sprint 6) se han movido a la
 *    tabla `notification_templates` (seed `notifications-templates.ts`),
 *    parametrizadas con Handlebars. Los emails enviados son byte-idéntico.
 *  - El procesado real (render plantilla + envío SMTP + insert campana)
 *    lo hace `NotificationsDispatchProcessor` con retries + DLQ canónicos.
 *
 * Cumple R1 + R2 (envío vía cola) + R7 + ADR-042 + ADR-065.
 */
@Injectable()
export class BillingEmailListener {
  private readonly logger = new Logger(BillingEmailListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent('invoice.created')
  async handleInvoiceCreated(payload: {
    invoice_id: string;
    invoice_number: string;
    user_id: string;
    total: number;
    currency: string;
  }) {
    await this.notifications.dispatchToUser(
      'invoice.created',
      payload as unknown as Record<string, unknown>,
      payload.user_id,
    );
  }

  @OnEvent('invoice.paid')
  async handleInvoicePaid(payload: {
    invoice_id: string;
    invoice_number: string;
    user_id: string;
    total: number;
    currency: string;
    payment_provider: string;
  }) {
    await this.notifications.dispatchToUser(
      'invoice.paid',
      payload as unknown as Record<string, unknown>,
      payload.user_id,
    );
  }

  @OnEvent('invoice.failed')
  async handleInvoiceFailed(payload: {
    invoice_id: string;
    invoice_number: string;
    user_id: string;
    retry_count: number;
    max_retries: number;
  }) {
    await this.notifications.dispatchToUser(
      'invoice.failed',
      payload as unknown as Record<string, unknown>,
      payload.user_id,
    );
  }

  @OnEvent('invoice.overdue')
  async handleInvoiceOverdue(payload: {
    invoice_id: string;
    invoice_number: string;
    user_id: string;
    total: number;
    retry_count: number;
    max_retries: number;
  }) {
    await this.notifications.dispatchToUser(
      'invoice.overdue',
      payload as unknown as Record<string, unknown>,
      payload.user_id,
    );
  }
}
