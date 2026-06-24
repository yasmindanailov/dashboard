import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../../core/database/prisma.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

import { BillingService } from './billing.service';

/**
 * GenerateInvoiceOnPlanChangedListener — ADR-029 (cambio de plan con prorrateo).
 *
 * `SubscriptionPlanChangeService.confirmPlanChange` actualiza el service al nuevo
 * plan y emite `service.plan_changed` (Outbox, R8) con el importe prorrateado ya
 * calculado server-side (R5). Este listener genera la factura del prorrateo
 * (`total = amount_to_pay`), **factura NUEVA** (BILL-INV-3: la del período en curso
 * no se modifica). Mismo patrón que transfer/restore: el módulo billing consume el
 * evento; el servicio de cambio de plan no conoce la mecánica de facturación (R4).
 *
 * - **Idempotente:** omite si ya hay una factura `draft`/`pending` para ese servicio
 *   (mismo guard que la generación de facturas de renovación).
 * - **Sin cargo cuando el crédito lo cubre todo:** si `amount_to_pay ≤ 0` no se crea
 *   factura (el sobrante ya quedó en `credit_balance_eur`, se consumirá en la próxima
 *   renovación).
 * - **Best-effort (R7):** un fallo de facturación NO rompe el evento (el service ya
 *   está en el nuevo plan); se loguea para reintento/alerta.
 */
@Injectable()
export class GenerateInvoiceOnPlanChangedListener {
  private readonly logger = new Logger(
    GenerateInvoiceOnPlanChangedListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  @OnEvent('service.plan_changed')
  async handle(payload: {
    service_id: string;
    user_id: string;
    amount_to_pay: number;
    period_start: string;
    period_end: string;
  }): Promise<void> {
    try {
      // Crédito cubre el cambio entero → nada que cobrar (sobrante a cuenta).
      if (!payload.amount_to_pay || payload.amount_to_pay <= 0) {
        this.logger.debug(
          `plan_changed: amount_to_pay=${payload.amount_to_pay} para service ` +
            `${payload.service_id} — sin factura (cubierto por crédito).`,
        );
        return;
      }

      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        include: { product: true },
      });
      if (!service) {
        this.logger.warn(
          `plan_changed: service ${payload.service_id} no encontrado — no se factura.`,
        );
        return;
      }

      // Idempotencia: no duplicar si ya hay una factura abierta del servicio.
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
          `plan_changed: factura ya existe para service ${service.id} — skip.`,
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
            description: `${service.product.name} — cambio de plan (prorrateo)`,
            quantity: 1,
            unit_price: payload.amount_to_pay,
            period_start: payload.period_start,
            period_end: payload.period_end,
          },
        ],
      });

      this.logger.log(
        `plan_changed: factura de prorrateo generada para service ${service.id} ` +
          `(${payload.amount_to_pay} ${service.currency}).`,
      );
    } catch (err) {
      this.logger.error(
        `plan_changed: fallo generando la factura para service ` +
          `${payload.service_id}: ${getErrorMessage(err)}`,
      );
    }
  }
}
