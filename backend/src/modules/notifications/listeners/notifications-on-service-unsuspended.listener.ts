import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { NotificationsService } from '../notifications.service';

/**
 * NotificationsOnServiceUnsuspendedListener — Sprint 15C.II Fase F (2026-05-11).
 *
 * Consume `service.unsuspended` emitido por
 * `ProvisioningService.unsuspendAsAdmin`
 * ([modules/provisioning/provisioning.service.ts](../../provisioning/provisioning.service.ts))
 * cuando un admin reactiva un servicio suspendido vía
 * `POST /admin/services/:id/unsuspend` (o, en el futuro, el listener billing
 * `billing-on-invoice-paid` que auto-reactiva tras pago — Sprint 8 Fase 8.1).
 * Despacha la plantilla `service.unsuspended` (email + campana) al dueño.
 *
 * Doctrina canónica (heredada de Fase D/E L11+L12):
 *   - NO invoca `EmailService.send` directamente (ADR-065).
 *   - Usa `NotificationsService.dispatchToUser('service.unsuspended', payload, user_id)`.
 *   - **Siempre notifica** — a diferencia de `suspend`, la reactivación NO
 *     tiene toggle de supresión: reactivar un servicio es buena noticia para
 *     el cliente. (Edge case: si la suspensión se hizo con `notify_client=false`
 *     por fraude, una reactivación posterior es rara y el email "tu servicio
 *     vuelve a estar activo" sigue siendo neutral/positivo.)
 *   - Heredable a 15E Docker + 15G Plesk.
 *
 * Degradación elegante (R7): cualquier excepción del dispatch se loguea y se
 * traga. La reactivación ya se ejecutó (status `active` persistido + audit).
 */
@Injectable()
export class NotificationsOnServiceUnsuspendedListener {
  private readonly logger = new Logger(
    NotificationsOnServiceUnsuspendedListener.name,
  );

  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('service.unsuspended')
  async handleServiceUnsuspended(payload: {
    service_id: string;
    user_id: string;
    provisioner_slug: string | null;
    actor_user_id: string;
    previous_suspension_reason: string | null;
  }): Promise<void> {
    try {
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

      await this.notifications.dispatchToUser(
        'service.unsuspended',
        {
          service_id: payload.service_id,
          domain: displayDomain,
          panel_url: `${appUrl}/dashboard/services/${payload.service_id}`,
        },
        payload.user_id,
      );

      this.logger.log(
        `service.unsuspended email dispatched to user=${payload.user_id} ` +
          `(service=${payload.service_id} plugin=${payload.provisioner_slug ?? 'none'})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to dispatch service.unsuspended email ` +
          `(service=${payload.service_id} user=${payload.user_id}): ` +
          `${getErrorMessage(err)}`,
      );
    }
  }
}
