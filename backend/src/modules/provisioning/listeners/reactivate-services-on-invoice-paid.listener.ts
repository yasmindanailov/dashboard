import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { ProvisioningService } from '../provisioning.service';

/**
 * ReactivateServicesOnInvoicePaidListener — Sprint 15C.II Fase F.5.3
 * (`DC.44` billing-suspend-unify).
 *
 * Cierra el ciclo del flujo de suspensión por impago: cuando una factura se
 * paga (`invoice.paid`, emitido por billing vía Outbox), reactiva los
 * servicios de esa factura que estuvieran suspendidos **por impago**.
 *
 * Separación de responsabilidades:
 *   - Este listener (capa "puente" billing → provisioning, en `ProvisioningModule`)
 *     resuelve el `invoice_id → service_id[]` — el mapping factura↔servicio es
 *     dominio billing y vive en `invoice_items`.
 *   - `ProvisioningService.reactivateSuspendedServiceOnPayment(serviceId)`
 *     decide si reactivar ese servicio concreto: solo si está `suspended` con
 *     el motivo canónico `overdue_payment` (NO se des-suspende un servicio
 *     suspendido por abuso / RGPD / mantenimiento porque el cliente pague otra
 *     factura — el `reactivar al pagar` solo deshace la suspensión que el pago
 *     deshace). Es idempotente (si ya está `active`, no-op) y pasa por
 *     `unsuspendAsAdmin` con actor sistema (`'system:billing-on-invoice-paid'`).
 *
 * Coexiste con `ProvisioningOrchestratorService.handleInvoicePaid` (también
 * `@OnEvent('invoice.paid')`), que se ocupa de aprovisionar servicios *nuevos*
 * (`pending`/`failed`/no-aprovisionados) de la factura — concerns distintos,
 * sin solapamiento práctico (un servicio `suspended` no entra al pipeline de
 * provisioning porque su status no es `pending`/`failed`; un `enqueueProvisioning`
 * sobre él sería un no-op del dispatcher).
 *
 * Degradación elegante (R7): cualquier excepción se loguea y se traga — perder
 * la auto-reactivación de un servicio no debe romper el flujo de pago.
 */
@Injectable()
export class ReactivateServicesOnInvoicePaidListener {
  private readonly logger = new Logger(
    ReactivateServicesOnInvoicePaidListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
  ) {}

  @OnEvent('invoice.paid')
  async handleInvoicePaid(payload: {
    invoice_id: string;
    user_id?: string;
  }): Promise<void> {
    try {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: payload.invoice_id },
        // Sprint 15C.II F.6: cargamos `invoice_number` para componer el body
        // del `ClientNote` que `reactivateSuspendedServiceOnPayment` crea
        // (vía `unsuspendAsAdmin`): "Reactivado automáticamente al pagar la
        // factura N". Paralelo a `autoSuspendServices` que ya compone el
        // body con el nº de factura al suspender.
        select: {
          invoice_number: true,
          items: { select: { service_id: true } },
        },
      });
      if (!invoice) {
        // El orquestador ya loguea este caso; aquí solo salimos.
        return;
      }

      const serviceIds = [
        ...new Set(
          invoice.items
            .map((it) => it.service_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (serviceIds.length === 0) return;

      for (const serviceId of serviceIds) {
        try {
          await this.provisioning.reactivateSuspendedServiceOnPayment(
            serviceId,
            invoice.invoice_number,
          );
        } catch (err) {
          this.logger.error(
            `Failed to auto-reactivate service ${serviceId} after invoice ` +
              `${payload.invoice_id} paid: ${getErrorMessage(err)}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to process invoice.paid for auto-reactivation ` +
          `(invoice=${payload.invoice_id}): ${getErrorMessage(err)}`,
      );
    }
  }
}
