import { Injectable } from '@nestjs/common';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  MarkAsPaidDto,
  InvoiceListQueryDto,
} from './dto/billing.dto';
import { Invoice } from '@prisma/client';
import { PaginatedResult } from '../../common/dto/pagination.dto';
import { PaymentProviderInterface } from './interfaces/payment-provider.interface';
import { BillingInvoiceService } from './billing-invoice.service';
import { BillingCheckoutService } from './billing-checkout.service';
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
