import { Injectable } from '@nestjs/common';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  MarkAsPaidDto,
  InvoiceListQueryDto,
} from './dto/billing.dto';
import { PaymentProviderInterface } from './interfaces/payment-provider.interface';
import { BillingInvoiceService } from './billing-invoice.service';
import {
  BillingCheckoutService,
  type PublicCartItem,
} from './billing-checkout.service';
import { BillingCalculatorService } from './billing-calculator.service';

/* ═══════════════════════════════════════
   BillingService — Facade
   Delegates to domain sub-services per
   ARCHITECTURE.md Regla 15 (max 300 lines).

   Split:
     billing-invoice.service.ts  → CRUD, lifecycle, stats, numbering
     billing-checkout.service.ts → checkout orchestration
     billing-calculator.service.ts → (already existed) proration, totals
   ═══════════════════════════════════════ */

@Injectable()
export class BillingService {
  constructor(
    private readonly invoiceService: BillingInvoiceService,
    private readonly checkoutService: BillingCheckoutService,
    private readonly calculator: BillingCalculatorService,
  ) {}

  /* ── Provider ── */
  setPaymentProvider(p: PaymentProviderInterface) {
    this.invoiceService.setPaymentProvider(p);
  }
  getPaymentProvider() {
    return this.invoiceService.getPaymentProvider();
  }

  /* ── Invoice CRUD ── */
  generateInvoiceNumber() {
    return this.invoiceService.generateInvoiceNumber();
  }
  createInvoice(dto: CreateInvoiceDto) {
    return this.invoiceService.createInvoice(dto);
  }
  updateInvoice(id: string, dto: UpdateInvoiceDto) {
    return this.invoiceService.updateInvoice(id, dto);
  }
  findAll(query: InvoiceListQueryDto) {
    return this.invoiceService.findAll(query);
  }
  findOne(id: string) {
    return this.invoiceService.findOne(id);
  }
  findByUser(userId: string, query: InvoiceListQueryDto) {
    return this.invoiceService.findByUser(userId, query);
  }

  /* ── Lifecycle ── */
  markAsPaid(id: string, dto?: MarkAsPaidDto) {
    return this.invoiceService.markAsPaid(id, dto);
  }
  markAsOverdue(id: string) {
    return this.invoiceService.markAsOverdue(id);
  }
  cancelInvoice(id: string) {
    return this.invoiceService.cancelInvoice(id);
  }
  sendToPending(id: string) {
    return this.invoiceService.sendToPending(id);
  }
  refundInvoice(id: string) {
    return this.invoiceService.refundInvoice(id);
  }

  /* ── Stats ── */
  getStats(userId?: string) {
    return this.invoiceService.getStats(userId);
  }

  /* ── Sprint 15C.II Fase F.11.3 — cross-link Service↔billing ── */
  getServiceBillingCrossLink(
    serviceId: string,
    userId: string,
    isAdmin: boolean,
  ) {
    return this.invoiceService.getServiceBillingCrossLink(
      serviceId,
      userId,
      isAdmin,
    );
  }

  /* ── Checkout ── */
  checkout(
    userId: string,
    dto: {
      product_pricing_id: string;
      billing_profile_id?: string;
      label?: string;
      domain?: string;
    },
  ) {
    return this.checkoutService.checkout(userId, dto);
  }

  /**
   * Sprint 15D Fase 15D.F.4 — carrito unificado (producto + dominio). Delega en
   * `BillingCheckoutService.checkoutCart` (resuelve el producto-dominio por
   * capability + DOM-INV-2/3/5 + multi-ítem).
   */
  checkoutCart(
    userId: string,
    input: { items: PublicCartItem[]; billingProfileId?: string },
  ) {
    return this.checkoutService.checkoutCart(userId, input);
  }

  /* ── Calculator delegates ── */
  calculateProration(params: {
    currentAmount: number;
    currentCycleDays: number;
    daysUsed: number;
    newAmount: number;
  }) {
    return this.calculator.calculateProration(params);
  }
  getCycleDays(cycle: string) {
    return this.calculator.getCycleDays(cycle);
  }
}
