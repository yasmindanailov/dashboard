import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * SupportInsideOnServiceProvisionedListener — Sprint 8 Fase D.12.9 (ADR-076).
 *
 * Materializa la decisión "checkout único por dominio billing": cuando
 * `BillingCheckoutService.checkout()` resuelve un producto
 * `type='support_inside'`, este listener crea/reactiva la
 * `SupportInsideSubscription` apuntando al `service.id` recién creado.
 *
 * Antes (Sprint 8 Fase D backend): `SupportInsideService.subscribe()`
 * llamaba directo a `BillingCheckoutService` y luego creaba la subscription.
 * Funcionaba pero forzaba al frontend cliente a tener un modal in-page
 * para subscribe Support Inside, mientras el resto de productos contrataban
 * por `/dashboard/billing/checkout`. Asimetría de UX + duplicación al
 * integrar Stripe → ADR-076.
 *
 * Reglas:
 *   - Filtro defensivo `if (payload.product_type !== 'support_inside') return;`
 *     — coexiste con futuros listeners de hosting/docker/etc en el mismo
 *     evento. Cumple R1 y EC-T8-50.
 *   - Si existe `SupportInsideSubscription` cancelled del cliente → reactivar
 *     (update). Si no existe → create. UQ `client_id` lo exige.
 *   - Re-emite `support_inside.subscribed` para que `support-inside-audit`
 *     (D.12.3) y otros consumidores futuros se enteren. Backward-compat:
 *     `SupportInsideService.subscribe()` (API interna no expuesta) sigue
 *     emitiendo el mismo evento.
 *
 * Cumple ADR-076 + R1 + R7.
 */
@Injectable()
export class SupportInsideOnServiceProvisionedListener {
  private readonly logger = new Logger(
    SupportInsideOnServiceProvisionedListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent('service.provisioned')
  async handleServiceProvisioned(payload: {
    service_id: string;
    user_id: string;
    product_id: string;
    product_type: string;
    product_pricing_id: string;
    invoice_id: string;
  }): Promise<void> {
    if (payload.product_type !== 'support_inside') {
      return;
    }

    try {
      const existing = await this.prisma.supportInsideSubscription.findUnique({
        where: { client_id: payload.user_id },
        select: { id: true, status: true },
      });

      const subscription = existing
        ? await this.prisma.supportInsideSubscription.update({
            where: { client_id: payload.user_id },
            data: {
              product_id: payload.product_id,
              service_id: payload.service_id,
              status: 'active',
              started_at: new Date(),
              cancelled_at: null,
              cancellation_reason: null,
            },
          })
        : await this.prisma.supportInsideSubscription.create({
            data: {
              client_id: payload.user_id,
              product_id: payload.product_id,
              service_id: payload.service_id,
              status: 'active',
            },
          });

      this.events.emit('support_inside.subscribed', {
        subscription_id: subscription.id,
        client_id: payload.user_id,
        product_id: payload.product_id,
        service_id: payload.service_id,
      });

      this.logger.log(
        `Support Inside ${existing ? 'reactivated' : 'subscribed'} via service.provisioned: client=${payload.user_id} subscription=${subscription.id}`,
      );
    } catch (err) {
      // R7 + R13: log + degradación silenciosa. El billing ya completó
      // el cobro; si la subscription falla, alerta superadmin via
      // listener system.error (Sprint 9.5) — el cliente ya pagó pero
      // su subscription queda en limbo. Manualmente recuperable con
      // `SupportInsideService.subscribe()` interno si es necesario.
      // P2002 = subscription duplicada (race condition con dos checkouts
      // simultáneos para el mismo cliente — UQ client_id la corta).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        this.logger.warn(
          `support_inside.subscribed race condition for client=${payload.user_id} — UQ violated, idempotente`,
        );
        return;
      }
      this.logger.error(
        `support-inside-on-service-provisioned failed for service ${payload.service_id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
