import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BillingCalculatorService } from './billing-calculator.service';
import { BillingInvoiceService } from './billing-invoice.service';

/* ═══════════════════════════════════════
   BillingCheckoutService — Checkout flow
   Creates Service + Invoice in one operation.
   Ref: DECISIONS.md §12, §21, §32
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class BillingCheckoutService {
  private readonly logger = new Logger('BillingCheckoutService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly calculator: BillingCalculatorService,
    private readonly invoiceService: BillingInvoiceService,
  ) {}

  async checkout(
    userId: string,
    dto: {
      product_pricing_id: string;
      billing_profile_id?: string;
      label?: string;
      domain?: string;
    },
  ) {
    // 1. Validate target user
    const targetUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!targetUser)
      throw new NotFoundException('Usuario destino no encontrado.');

    // 2. Validate pricing plan
    const pricing = await this.prisma.productPricing.findUnique({
      where: { id: dto.product_pricing_id },
      include: { product: true },
    });
    if (!pricing) throw new NotFoundException('Plan de precios no encontrado.');
    if (!pricing.active)
      throw new BadRequestException('Este plan de precios no está activo.');
    if (pricing.product.status !== 'active')
      throw new BadRequestException('Este producto no está disponible.');

    // 3. Validate billing profile belongs to TARGET user (7.0.3)
    let billingProfile = null;
    if (dto.billing_profile_id) {
      billingProfile = await this.prisma.billingProfile.findFirst({
        where: { id: dto.billing_profile_id, user_id: userId },
      });
      if (!billingProfile)
        throw new BadRequestException(
          'El perfil de facturación no pertenece al cliente seleccionado.',
        );
    }

    // 4. Check max_quantity_per_client
    if (pricing.product.max_quantity_per_client) {
      const existingCount = await this.prisma.service.count({
        where: {
          user_id: userId,
          product_id: pricing.product_id,
          status: { notIn: ['cancelled', 'terminated'] },
        },
      });
      if (existingCount >= pricing.product.max_quantity_per_client) {
        throw new BadRequestException(
          `El cliente ha alcanzado el límite de ${pricing.product.max_quantity_per_client} servicio(s) de este tipo.`,
        );
      }
    }

    // 5. Calculate pricing with discount (7.0.5)
    const basePrice = Number(pricing.price);
    const discountPct = pricing.discount_percentage
      ? Number(pricing.discount_percentage)
      : 0;
    const discountedPrice =
      discountPct > 0
        ? Math.round(basePrice * (1 - discountPct / 100) * 100) / 100
        : basePrice;

    // 6. Calculate due dates
    const cycleDays = this.calculator.getCycleDays(pricing.billing_cycle);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + cycleDays);

    // 7. Create service in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const service = await tx.service.create({
        data: {
          user_id: userId,
          product_id: pricing.product_id,
          billing_profile_id: dto.billing_profile_id,
          status: 'pending',
          label: dto.label,
          domain: dto.domain,
          billing_cycle: pricing.billing_cycle,
          amount: discountedPrice,
          currency: pricing.currency,
          next_due_date: nextDueDate,
          next_invoice_date: nextDueDate,
        },
      });
      return { service, pricing };
    });

    // 8. Create invoice (outside transaction — uses SEQUENCE)
    const invoice = await this.invoiceService.createInvoice({
      user_id: userId,
      billing_profile_id: dto.billing_profile_id,
      due_date: dueDate.toISOString(),
      currency: result.pricing.currency,
      items: [
        {
          service_id: result.service.id,
          product_id: result.pricing.product_id,
          description: `${result.pricing.product.name} — ${dto.label || dto.domain || 'Nuevo servicio'}`,
          quantity: 1,
          unit_price: discountedPrice,
          setup_fee: Number(result.pricing.setup_fee),
          discount_pct: discountPct > 0 ? discountPct : undefined,
          period_start: new Date().toISOString(),
          period_end: new Date(
            Date.now() + cycleDays * 86400_000,
          ).toISOString(),
        },
      ],
    });

    this.logger.log(
      `Checkout complete: Service ${result.service.id} + Invoice ${invoice.invoice_number} for user ${userId}` +
        (discountPct > 0 ? ` (${discountPct}% discount applied)` : ''),
    );

    this.eventEmitter.emit('checkout.completed', {
      user_id: userId,
      service_id: result.service.id,
      invoice_id: invoice.id,
      product_name: result.pricing.product.name,
      total: invoice.total,
    });

    // ADR-076 + sub-fase 8.D.12.9 — emit canónico `service.provisioned`.
    // Listener `support-inside-on-service-provisioned` filtra por
    // `product_type='support_inside'` y crea/reactiva la subscription.
    // Otros futuros listeners (Sprint 11 Provisioning para hosting,
    // Docker, etc.) se enganchan al mismo evento sin tocar este service.
    this.eventEmitter.emit('service.provisioned', {
      service_id: result.service.id,
      user_id: userId,
      product_id: result.pricing.product_id,
      product_type: result.pricing.product.type,
      product_pricing_id: result.pricing.id,
      invoice_id: invoice.id,
      billing_profile_id: dto.billing_profile_id,
    });

    return {
      service: result.service,
      invoice,
      invoice_type: billingProfile?.nif_cif ? 'completa' : 'simplificada',
      discount_applied: discountPct > 0 ? `${discountPct}%` : null,
    };
  }
}
