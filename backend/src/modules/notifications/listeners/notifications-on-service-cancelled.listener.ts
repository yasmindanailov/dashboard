import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnServiceCancelledListener — Sprint 15C.II Fase E (2026-05-11).
 *
 * Consume `service.cancelled` emitido por
 * `ProvisioningService.deprovisionAsAdmin`
 * ([modules/provisioning/provisioning.service.ts](../../provisioning/provisioning.service.ts))
 * cuando un admin cancela / desprovisiona un servicio vía
 * `POST /admin/services/:id/deprovision`. Si el flag `notify_client` del
 * payload no es `false` (toggle "Notificar al cliente" del modal admin —
 * default ON), despacha la plantilla `service.cancelled` (email + campana)
 * al dueño del servicio.
 *
 * Doctrina canónica (heredada de Fase D L11+L12):
 *   - NO invoca `EmailService.send` directamente (ADR-065 — ningún listener
 *     de negocio bypassa el orquestador notifications).
 *   - Usa `NotificationsService.dispatchToUser('service.cancelled', payload,
 *     user_id)`. El dispatcher resuelve recipient (email + language +
 *     first_name), renderiza la plantilla seedeada `service.cancelled`
 *     (Handlebars con escape XSS automático EC-T8-17) y entrega vía
 *     `EmailChannel` + `InAppChannel`.
 *   - La plantilla es GENÉRICA: NO menciona el motivo interno
 *     (cancelled/expired/admin_override es taxonomía billing no customer-
 *     facing) ni la nota interna del admin (`notes` — solo audit log).
 *   - Heredable a 15D RC + 15E Docker + 15G Plesk: cualquier servicio
 *     cancelado por admin reusa este listener sin tocar nada.
 *
 * Degradación elegante (R7): cualquier excepción del dispatch se loguea y
 * se traga. NO relanza — la cancelación ya se ejecutó (status `cancelled`
 * persistido + audit), perder el email NO debe deshacer el side effect.
 */
@Injectable()
export class NotificationsOnServiceCancelledListener {
  private readonly logger = new Logger(
    NotificationsOnServiceCancelledListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('service.cancelled')
  async handleServiceCancelled(payload: {
    service_id: string;
    user_id: string;
    provisioner_slug: string | null;
    reason: string;
    actor_user_id: string;
    notify_client?: boolean;
  }): Promise<void> {
    // Toggle "Notificar al cliente" (default ON). Solo `false` explícito
    // suprime el email (fraude confirmado, cuentas de test, etc.).
    if (payload.notify_client === false) {
      this.logger.log(
        `service.cancelled with notify_client=false (service=${payload.service_id}) ` +
          `— skipping client email by admin choice.`,
      );
      return;
    }

    try {
      // Necesitamos `domain` para el subject + body. El dispatcher carga
      // email/first_name/language del user pero no el service. Query mínima.
      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        select: { domain: true, label: true },
      });
      const displayDomain =
        service?.domain ?? service?.label ?? payload.service_id;

      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );
      const supportUrl = `${appUrl}/dashboard/support`;

      await this.notifications.dispatchToUser(
        'service.cancelled',
        {
          service_id: payload.service_id,
          domain: displayDomain,
          support_url: supportUrl,
        },
        payload.user_id,
      );

      this.logger.log(
        `service.cancelled email dispatched to user=${payload.user_id} ` +
          `(service=${payload.service_id} plugin=${payload.provisioner_slug ?? 'none'})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch service.cancelled email ` +
          `(service=${payload.service_id} user=${payload.user_id}): ` +
          `${getErrorMessage(err)}`,
      );
    }
  }
}
