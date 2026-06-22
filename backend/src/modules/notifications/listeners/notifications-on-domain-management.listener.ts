import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnDomainManagementListener — Sprint 15D Fase 15D.F.1 (ADR-084 §5).
 *
 * Consume los eventos de GESTIÓN de seguridad del dominio y los traduce en una
 * alerta al cliente (email + campana) vía `NotificationsService.dispatchToUser`
 * (D12 — NUNCA `EmailService.send` directo). Patrón "verifica que fuiste tú",
 * estándar de registrar:
 *
 *   - `domain.nameservers_changed` → se modificaron los NS delegados.
 *   - `domain.lock_changed`        → se cambió el bloqueo de transferencia.
 *
 * `domain.privacy_changed` NO se notifica (cambio benigno de WHOIS privacy);
 * `domain.contacts_changed` llega con su handler en Fase 15D.F.2.
 *
 * Separado de `NotificationsOnDomainLifecycleListener` (renew/expiración): aquí
 * son alertas de seguridad disparadas por una acción del usuario/admin, no
 * transiciones de ciclo de vida. El `fqdn` viaja en el payload (no se re-consulta
 * Prisma). Degradación elegante (R7): cualquier excepción del dispatch se loguea
 * y se traga — el evento ya está persistido/emitido aguas arriba (Outbox).
 */
@Injectable()
export class NotificationsOnDomainManagementListener {
  private readonly logger = new Logger(
    NotificationsOnDomainManagementListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('domain.nameservers_changed')
  async handleNameserversChanged(
    payload: DomainManagementEventPayload,
  ): Promise<void> {
    await this.dispatch('domain.nameservers_changed', payload);
  }

  @OnEvent('domain.lock_changed')
  async handleLockChanged(
    payload: DomainManagementEventPayload,
  ): Promise<void> {
    await this.dispatch('domain.lock_changed', payload);
  }

  private async dispatch(
    eventType: string,
    payload: DomainManagementEventPayload,
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

interface DomainManagementEventPayload {
  service_id: string;
  user_id: string;
  fqdn?: string | null;
}
