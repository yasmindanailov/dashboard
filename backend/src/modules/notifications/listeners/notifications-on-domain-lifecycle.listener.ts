import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnDomainLifecycleListener — Sprint 15D Fase 15D.E (ADR-084 §5).
 *
 * Consume los eventos de ciclo de vida del dominio y los traduce en
 * notificaciones al cliente (email + campana) vía
 * `NotificationsService.dispatchToUser` (D12 — NUNCA `EmailService.send` directo):
 *
 *   - `domain.renewed`            → confirmación de renovación (orquestador, Outbox).
 *   - `domain.expiring_soon`      → aviso 30/14/7/1 días (cron de avisos, alerta).
 *   - `domain.expired`            → el dominio expiró (reconcile cron, Outbox).
 *   - `domain.entered_redemption` → en redención: rescatable con fee (reconcile, Outbox).
 *
 * El `fqdn` viaja en el payload (no se re-consulta Prisma). `panel_url` se resuelve
 * desde `NEXT_PUBLIC_APP_URL`. Degradación elegante (R7): cualquier excepción del
 * dispatch se loguea y se traga — el estado ya está persistido/emitido aguas arriba.
 */
@Injectable()
export class NotificationsOnDomainLifecycleListener {
  private readonly logger = new Logger(
    NotificationsOnDomainLifecycleListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('domain.renewed')
  async handleRenewed(payload: DomainEventPayload): Promise<void> {
    await this.dispatch('domain.renewed', payload, {
      new_expires_at: payload.new_expires_at ?? '',
    });
  }

  @OnEvent('domain.expiring_soon')
  async handleExpiringSoon(payload: DomainEventPayload): Promise<void> {
    await this.dispatch('domain.expiring_soon', payload, {
      days_left: payload.days_left ?? 0,
    });
  }

  @OnEvent('domain.expired')
  async handleExpired(payload: DomainEventPayload): Promise<void> {
    await this.dispatch('domain.expired', payload, {});
  }

  @OnEvent('domain.entered_redemption')
  async handleEnteredRedemption(payload: DomainEventPayload): Promise<void> {
    await this.dispatch('domain.entered_redemption', payload, {});
  }

  // Sprint 15D.II.R — el admin/soporte restauró un dominio desde redención (RGP).
  @OnEvent('domain.restored')
  async handleRestored(payload: DomainEventPayload): Promise<void> {
    await this.dispatch('domain.restored', payload, {});
  }

  /**
   * Despacho común: añade `fqdn` + `panel_url` al payload de la plantilla y
   * delega en `dispatchToUser`. Traga errores (R7).
   */
  private async dispatch(
    eventType: string,
    payload: DomainEventPayload,
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
          panel_url: `${appUrl}/dashboard/services/${payload.service_id}`,
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

interface DomainEventPayload {
  service_id: string;
  user_id: string;
  fqdn?: string | null;
  days_left?: number;
  new_expires_at?: string | null;
}
