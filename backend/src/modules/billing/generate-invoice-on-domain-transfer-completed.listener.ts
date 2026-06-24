import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../../core/database/prisma.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

import { BillingService } from './billing.service';

/**
 * GenerateInvoiceOnDomainTransferCompletedListener — Sprint 15D.II.T2c.2.
 *
 * **Cobro AL COMPLETAR** de un transfer-in ([ADR-084 A2.3](../../../docs/10-decisions/adr-084-comercio-dominios-registrar.md)).
 * A diferencia de `register` (que factura en el checkout), un transfer NO se
 * cobra al pedirlo: cuando el reconcile lo lleva a `completed` y emite
 * `domain.transfer_completed` (Outbox, R8), este listener genera la factura del
 * transfer con el precio que el checkout snapshotó en `services.amount`
 * (operación `transfer` de `domain_tld_pricing`; el margin guard same-currency
 * DOM-INV-3 ya se aplicó en el checkout).
 *
 * Idempotente: omite si ya hay una factura `draft`/`pending` para ese servicio
 * (mismo guard que la generación de facturas de renovación,
 * `BillingLifecycleWorker.generatePendingInvoices`). Best-effort: un fallo de
 * facturación NO rompe el flujo del evento (el dominio ya está activo); se
 * loguea para reintento/alerta. **R4:** billing consume el evento; el reconcile
 * y el plugin de registrar no conocen billing.
 */
@Injectable()
export class GenerateInvoiceOnDomainTransferCompletedListener {
  private readonly logger = new Logger(
    GenerateInvoiceOnDomainTransferCompletedListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  @OnEvent('domain.transfer_completed')
  async handle(payload: {
    service_id: string;
    user_id: string;
    fqdn: string;
  }): Promise<void> {
    try {
      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        include: { product: true },
      });
      if (!service) {
        this.logger.warn(
          `transfer_completed: service ${payload.service_id} no encontrado — no se factura.`,
        );
        return;
      }

      // Idempotencia: no duplicar si ya hay una factura abierta del transfer.
      const existing = await this.prisma.invoice.findFirst({
        where: {
          user_id: service.user_id,
          status: { in: ['draft', 'pending'] },
          items: { some: { service_id: service.id } },
        },
        select: { id: true },
      });
      if (existing) {
        this.logger.debug(
          `transfer_completed: factura ya existe para service ${service.id} — skip.`,
        );
        return;
      }

      const now = new Date();
      await this.billing.createInvoice({
        user_id: service.user_id,
        billing_profile_id: service.billing_profile_id ?? undefined,
        due_date: now.toISOString(),
        currency: service.currency,
        items: [
          {
            service_id: service.id,
            product_id: service.product_id,
            description: `${service.product.name} — ${service.domain ?? service.label} (transferencia)`,
            quantity: 1,
            unit_price: Number(service.amount),
            period_start: now.toISOString(),
            period_end: (service.next_due_date ?? now).toISOString(),
          },
        ],
      });

      this.logger.log(
        `transfer_completed: factura de transfer generada para service ${service.id} ` +
          `(cobro al completar, ${Number(service.amount)} ${service.currency}).`,
      );
    } catch (err) {
      this.logger.error(
        `transfer_completed: fallo generando la factura para service ` +
          `${payload.service_id}: ${getErrorMessage(err)}`,
      );
    }
  }
}
