import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnDomainTransferListener — Sprint 15D.II.T3 (ADR-084 §5 + A2).
 *
 * Consume los eventos de la FSM de transfer-in y los traduce en notificaciones al
 * cliente (email + campana) vía `NotificationsService.dispatchToUser` (D12 — NUNCA
 * `EmailService.send` directo):
 *
 *   - `domain.transfer_initiated` → transferencia enviada al registrar (orquestador,
 *      Outbox); informa que tardará unos días.
 *   - `domain.transfer_completed` → dominio ya bajo Aelium (reconcile cron, Outbox);
 *      también lo consumen billing (factura, T2c.2) + zona DNS (T3).
 *   - `domain.transfer_failed`    → la transferencia no se completó (reconcile cron,
 *      Outbox); invita a reintentar.
 *
 * El `fqdn` viaja en el payload (no se re-consulta Prisma). El CTA apunta al detalle
 * del dominio (`/dashboard/domains/:id`) — donde el cliente reintenta o ve el estado.
 * Degradación elegante (R7): cualquier excepción se loguea y se traga (el estado ya
 * está persistido/emitido aguas arriba).
 */
@Injectable()
export class NotificationsOnDomainTransferListener {
  private readonly logger = new Logger(
    NotificationsOnDomainTransferListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('domain.transfer_initiated')
  async handleInitiated(payload: DomainTransferEventPayload): Promise<void> {
    await this.dispatch('domain.transfer_initiated', payload, {});
  }

  @OnEvent('domain.transfer_completed')
  async handleCompleted(payload: DomainTransferEventPayload): Promise<void> {
    await this.dispatch('domain.transfer_completed', payload, {});
  }

  @OnEvent('domain.transfer_failed')
  async handleFailed(payload: DomainTransferEventPayload): Promise<void> {
    await this.dispatch('domain.transfer_failed', payload, {
      reason: payload.reason ?? 'failed',
    });
  }

  /**
   * Despacho común: añade `fqdn` + `panel_url` (detalle del dominio) al payload de
   * la plantilla y delega en `dispatchToUser`. Traga errores (R7).
   */
  private async dispatch(
    eventType: string,
    payload: DomainTransferEventPayload,
    extra: Record<string, string | number>,
  ): Promise<void> {
    if (!payload.user_id) {
      this.logger.warn(`${eventType} sin user_id — notificación omitida.`);
      return;
    }
    try {
      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );
      await this.notifications.dispatchToUser(
        eventType,
        {
          service_id: payload.service_id,
          fqdn: payload.fqdn ?? payload.service_id,
          panel_url: `${appUrl}/dashboard/domains/${payload.service_id}`,
          ...extra,
        },
        payload.user_id,
      );
      this.logger.log(
        `${eventType} dispatched to user=${payload.user_id} (service=${payload.service_id}).`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch ${eventType} (service=${payload.service_id} ` +
          `user=${payload.user_id}): ${getErrorMessage(err)}`,
      );
    }
  }
}

interface DomainTransferEventPayload {
  service_id: string;
  user_id: string;
  fqdn?: string | null;
  /** Solo `domain.transfer_failed`: `failed` | `cancelled`. */
  reason?: string;
}
