import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../../core/database/prisma.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

import { BillingService } from './billing.service';

/** Marcador estable en la descripción de la línea → idempotencia del restore. */
const RESTORE_MARKER = 'restauración RGP';

/**
 * GenerateInvoiceOnDomainRestoredListener — Sprint 15D.II.R.
 *
 * **Cobro del restore RGP.** Cuando `AdminDomainsService.restoreDomain` recupera un
 * dominio en redención y emite `domain.restored` (Outbox, R8) con el fee resuelto
 * server-side (op `restore` de `domain_tld_pricing`, R5), este listener genera la
 * factura del fee. A diferencia de register/renew, el fee de restore es distinto y
 * viaja en el evento (lo snapshotó el admin service al restaurar).
 *
 * Idempotente: omite si ya hay una factura `draft`/`pending` de restore para ese
 * servicio (marcador `RESTORE_MARKER` en la descripción — distingue del posible
 * cobro de renovación del mismo dominio). Best-effort: un fallo de facturación NO
 * rompe el flujo (el dominio ya está restaurado); se loguea para reintento/alerta.
 * **R4:** billing consume el evento; el registrar/admin service no conocen billing.
 */
@Injectable()
export class GenerateInvoiceOnDomainRestoredListener {
  private readonly logger = new Logger(
    GenerateInvoiceOnDomainRestoredListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  @OnEvent('domain.restored')
  async handle(payload: {
    service_id: string;
    user_id: string;
    fqdn: string;
    amount: number;
    currency: string;
  }): Promise<void> {
    try {
      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        include: { product: true },
      });
      if (!service) {
        this.logger.warn(
          `domain.restored: service ${payload.service_id} no encontrado — no se factura.`,
        );
        return;
      }

      // Idempotencia: no duplicar la factura del restore (Outbox at-least-once).
      const existing = await this.prisma.invoice.findFirst({
        where: {
          user_id: service.user_id,
          status: { in: ['draft', 'pending'] },
          items: {
            some: {
              service_id: service.id,
              description: { contains: RESTORE_MARKER },
            },
          },
        },
        select: { id: true },
      });
      if (existing) {
        this.logger.debug(
          `domain.restored: factura de restore ya existe para service ${service.id} — skip.`,
        );
        return;
      }

      const now = new Date();
      await this.billing.createInvoice({
        user_id: service.user_id,
        billing_profile_id: service.billing_profile_id ?? undefined,
        due_date: now.toISOString(),
        currency: payload.currency,
        items: [
          {
            service_id: service.id,
            product_id: service.product_id,
            description: `${service.product.name} — ${payload.fqdn} (${RESTORE_MARKER})`,
            quantity: 1,
            unit_price: payload.amount,
            period_start: now.toISOString(),
            period_end: (service.next_due_date ?? now).toISOString(),
          },
        ],
      });

      this.logger.log(
        `domain.restored: factura de restore generada para service ${service.id} ` +
          `(${payload.amount} ${payload.currency}).`,
      );
    } catch (err) {
      this.logger.error(
        `domain.restored: fallo generando la factura para service ` +
          `${payload.service_id}: ${getErrorMessage(err)}`,
      );
    }
  }
}
