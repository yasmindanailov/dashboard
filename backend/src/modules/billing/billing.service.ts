import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { paginate, PaginatedResult } from '../../common/dto/pagination.dto';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  MarkAsPaidDto,
  InvoiceListQueryDto,
} from './dto/billing.dto';
import { Prisma, Invoice, InvoiceStatus } from '@prisma/client';
import {
  PaymentProviderInterface,
  ManualPaymentProvider,
} from './interfaces/payment-provider.interface';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private paymentProvider: PaymentProviderInterface;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    // Default provider — will be resolved from Settings when plugin system exists
    this.paymentProvider = new ManualPaymentProvider();
  }

  /* ═══════════════════════════════════════
     PAYMENT PROVIDER MANAGEMENT
     ═══════════════════════════════════════ */

  /**
   * Swap the active payment provider at runtime.
   * Called by plugin system (Sprint 15) when activating a provider.
   */
  setPaymentProvider(provider: PaymentProviderInterface): void {
    this.logger.log(`Payment provider switched to: ${provider.name}`);
    this.paymentProvider = provider;
  }

  getPaymentProvider(): PaymentProviderInterface {
    return this.paymentProvider;
  }

  /* ═══════════════════════════════════════
     INVOICE NUMBERING — SEQUENTIAL
     ═══════════════════════════════════════ */

  /**
   * Generate next invoice number using PostgreSQL SEQUENCE.
   * Format: configurable prefix + year + sequential number.
   * Default: AELIUM-2026-0001
   *
   * Uses raw SQL for atomic sequence increment — no race conditions.
   */
  async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const seqName = `invoice_number_seq_${year}`;

    // Create sequence if it doesn't exist (first invoice of the year)
    await this.prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${seqName}" START WITH 1 INCREMENT BY 1 NO CYCLE`,
    );

    // Atomically get next value
    const result = await this.prisma.$queryRawUnsafe<{ nextval: string }[]>(
      `SELECT nextval('"${seqName}"')`,
    );

    const seq = parseInt(result[0].nextval, 10);

    // Load prefix from settings (default: AELIUM)
    const prefixSetting = await this.prisma.setting.findUnique({
      where: { category_key: { category: 'billing', key: 'invoice_prefix' } },
    });
    const prefix = prefixSetting
      ? (prefixSetting.value as { value: string }).value || 'AELIUM'
      : 'AELIUM';

    return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  }

  /* ═══════════════════════════════════════
     CREATE INVOICE
     ═══════════════════════════════════════ */

  async createInvoice(dto: CreateInvoiceDto): Promise<Invoice> {
    // Validate user exists
    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    // Validate billing profile if provided
    if (dto.billing_profile_id) {
      const profile = await this.prisma.billingProfile.findFirst({
        where: { id: dto.billing_profile_id, user_id: dto.user_id },
      });
      if (!profile)
        throw new NotFoundException(
          'Perfil de facturación no encontrado o no pertenece al usuario.',
        );
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('La factura debe tener al menos un item.');
    }

    // Load billing settings defaults
    const taxRate = dto.tax_rate ?? (await this.getSettingValue<number>('billing', 'default_tax_rate', 21));
    const maxRetries = await this.getSettingValue<number>('billing', 'max_payment_retries', 3);

    // Calculate totals
    const calculatedItems = dto.items.map((item) => {
      const qty = item.quantity ?? 1;
      const baseTotal = qty * item.unit_price;
      const setupFee = item.setup_fee ?? 0;
      const discountPct = item.discount_pct ?? 0;
      const discountAmount = baseTotal * (discountPct / 100);
      const itemTotal = baseTotal - discountAmount + setupFee;

      return {
        service_id: item.service_id,
        product_id: item.product_id,
        description: item.description,
        quantity: qty,
        unit_price: item.unit_price,
        setup_fee: setupFee,
        discount_pct: item.discount_pct,
        total: Math.round(itemTotal * 100) / 100,
        period_start: item.period_start ? new Date(item.period_start) : undefined,
        period_end: item.period_end ? new Date(item.period_end) : undefined,
      };
    });

    const subtotal = calculatedItems.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = dto.discount_amount ?? 0;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
    const total = Math.round((taxableAmount + taxAmount) * 100) / 100;

    const invoiceNumber = await this.generateInvoiceNumber();

    const invoice = await this.prisma.invoice.create({
      data: {
        invoice_number: invoiceNumber,
        user_id: dto.user_id,
        billing_profile_id: dto.billing_profile_id,
        status: 'draft',
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        total,
        currency: dto.currency ?? 'EUR',
        due_date: new Date(dto.due_date),
        is_manual: dto.is_manual ?? false,
        max_retries: maxRetries,
        notes: dto.notes,
        payment_provider: this.paymentProvider.name,
        items: {
          create: calculatedItems,
        },
      },
      include: { items: true, billing_profile: true },
    });

    this.logger.log(
      `Invoice ${invoiceNumber} created for user ${dto.user_id} — total: ${total} ${invoice.currency}`,
    );

    this.eventEmitter.emit('invoice.created', {
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      user_id: invoice.user_id,
      total: invoice.total,
      currency: invoice.currency,
    });

    return invoice;
  }

  /* ═══════════════════════════════════════
     MARK AS PAID
     ═══════════════════════════════════════ */

  async markAsPaid(invoiceId: string, dto: MarkAsPaidDto = {}): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);

    if (invoice.status === 'paid') {
      throw new ConflictException('La factura ya está pagada.');
    }
    if (invoice.status === 'cancelled') {
      throw new BadRequestException('No se puede pagar una factura cancelada.');
    }
    if (invoice.status === 'refunded') {
      throw new BadRequestException('No se puede pagar una factura reembolsada.');
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'paid',
        paid_at: new Date(),
        payment_provider: dto.payment_provider ?? this.paymentProvider.name,
        payment_method: dto.payment_method ?? 'manual',
        payment_ref: dto.payment_ref,
      },
      include: { items: true, billing_profile: true },
    });

    this.logger.log(`Invoice ${invoice.invoice_number} marked as PAID`);

    this.eventEmitter.emit('invoice.paid', {
      invoice_id: updated.id,
      invoice_number: updated.invoice_number,
      user_id: updated.user_id,
      total: updated.total,
      currency: updated.currency,
      payment_provider: updated.payment_provider,
    });

    return updated;
  }

  /* ═══════════════════════════════════════
     MARK AS OVERDUE
     ═══════════════════════════════════════ */

  async markAsOverdue(invoiceId: string): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);

    if (invoice.status !== 'pending') {
      throw new BadRequestException('Solo facturas pendientes pueden marcarse como vencidas.');
    }

    const retryDays = await this.getSettingValue<number>('billing', 'retry_interval_days', 3);

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'overdue',
        retry_count: { increment: 1 },
        next_retry_at: new Date(Date.now() + retryDays * 24 * 60 * 60 * 1000),
      },
      include: { items: true },
    });

    this.eventEmitter.emit('invoice.overdue', {
      invoice_id: updated.id,
      invoice_number: updated.invoice_number,
      user_id: updated.user_id,
      total: updated.total,
      retry_count: updated.retry_count,
      max_retries: updated.max_retries,
    });

    return updated;
  }

  /* ═══════════════════════════════════════
     CANCEL INVOICE
     ═══════════════════════════════════════ */

  async cancelInvoice(invoiceId: string): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);

    if (invoice.status === 'paid') {
      throw new BadRequestException(
        'No se puede cancelar una factura pagada. Usa el reembolso.',
      );
    }
    if (invoice.status === 'cancelled') {
      throw new ConflictException('La factura ya está cancelada.');
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'cancelled' },
      include: { items: true },
    });

    this.logger.log(`Invoice ${invoice.invoice_number} cancelled`);

    return updated;
  }

  /* ═══════════════════════════════════════
     SEND TO PENDING (finalize draft)
     ═══════════════════════════════════════ */

  async sendToPending(invoiceId: string): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);

    if (invoice.status !== 'draft') {
      throw new BadRequestException('Solo facturas en borrador pueden enviarse.');
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'pending' },
      include: { items: true, billing_profile: true },
    });

    this.logger.log(`Invoice ${invoice.invoice_number} finalized → PENDING`);

    return updated;
  }

  /* ═══════════════════════════════════════
     REFUND
     ═══════════════════════════════════════ */

  async refundInvoice(invoiceId: string): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);

    if (invoice.status !== 'paid') {
      throw new BadRequestException('Solo facturas pagadas pueden reembolsarse.');
    }

    // Delegate to payment provider
    if (invoice.payment_ref) {
      const result = await this.paymentProvider.refund({
        id: invoice.id,
        payment_ref: invoice.payment_ref,
        amount: Number(invoice.total),
        currency: invoice.currency,
      });

      if (!result.success) {
        throw new BadRequestException(`Error del proveedor de pago: ${result.error}`);
      }
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'refunded' },
      include: { items: true },
    });

    this.logger.log(`Invoice ${invoice.invoice_number} refunded`);

    return updated;
  }

  /* ═══════════════════════════════════════
     READ OPERATIONS
     ═══════════════════════════════════════ */

  async findAll(query: InvoiceListQueryDto): Promise<PaginatedResult<Invoice>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InvoiceWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.user_id) where.user_id = query.user_id;

    if (query.search) {
      where.OR = [
        { invoice_number: { contains: query.search, mode: 'insensitive' } },
        { notes: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.date_from || query.date_to) {
      where.created_at = {};
      if (query.date_from) where.created_at.gte = new Date(query.date_from);
      if (query.date_to) where.created_at.lte = new Date(query.date_to);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        include: {
          items: true,
          billing_profile: true,
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string): Promise<Invoice> {
    return this.findOneOrFail(id);
  }

  async findByUser(userId: string, query: InvoiceListQueryDto): Promise<PaginatedResult<Invoice>> {
    return this.findAll({ ...query, user_id: userId });
  }

  /* ═══════════════════════════════════════
     UPDATE INVOICE
     7.0.4: Recalculates totals when items are present
     ═══════════════════════════════════════ */

  async updateInvoice(id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.findOneOrFail(id);

    // Prevent editing paid/refunded invoices
    if (['paid', 'refunded'].includes(invoice.status)) {
      throw new BadRequestException(
        'No se pueden editar facturas pagadas o reembolsadas.',
      );
    }

    // Only drafts can have items edited
    if (dto.items && invoice.status !== 'draft') {
      throw new BadRequestException(
        'Solo se pueden editar items en facturas en borrador.',
      );
    }

    // Prevent direct status manipulation via update — use dedicated methods
    if (dto.status) {
      throw new BadRequestException(
        'Usa los endpoints específicos para cambiar el estado de la factura.',
      );
    }

    // If items are provided, recalculate everything
    if (dto.items && dto.items.length > 0) {
      return this.recalculateInvoice(id, dto);
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        notes: dto.notes,
        due_date: dto.due_date ? new Date(dto.due_date) : undefined,
      },
      include: { items: true, billing_profile: true },
    });

    return updated;
  }

  /**
   * Recalculate invoice totals from items.
   * Shared logic between createInvoice and updateInvoice.
   * 7.0.4: IVA se recalcula al editar items de factura.
   */
  private async recalculateInvoice(id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const taxRate = await this.getSettingValue<number>('billing', 'default_tax_rate', 21);

    const calculatedItems = dto.items!.map((item) => {
      const qty = item.quantity ?? 1;
      const baseTotal = qty * item.unit_price;
      const setupFee = item.setup_fee ?? 0;
      const discountPct = item.discount_pct ?? 0;
      const discountAmount = baseTotal * (discountPct / 100);
      const itemTotal = baseTotal - discountAmount + setupFee;

      return {
        service_id: item.service_id,
        product_id: item.product_id,
        description: item.description,
        quantity: qty,
        unit_price: item.unit_price,
        setup_fee: setupFee,
        discount_pct: item.discount_pct,
        total: Math.round(itemTotal * 100) / 100,
        period_start: item.period_start ? new Date(item.period_start) : undefined,
        period_end: item.period_end ? new Date(item.period_end) : undefined,
      };
    });

    const subtotal = calculatedItems.reduce((sum, item) => sum + item.total, 0);
    const roundedSubtotal = Math.round(subtotal * 100) / 100;
    const taxAmount = Math.round(roundedSubtotal * (taxRate / 100) * 100) / 100;
    const total = Math.round((roundedSubtotal + taxAmount) * 100) / 100;

    // Delete old items and create new ones in a transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoice_id: id } });

      return tx.invoice.update({
        where: { id },
        data: {
          subtotal: roundedSubtotal,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total,
          notes: dto.notes,
          due_date: dto.due_date ? new Date(dto.due_date) : undefined,
          items: {
            create: calculatedItems,
          },
        },
        include: { items: true, billing_profile: true },
      });
    });

    this.logger.log(
      `Invoice ${id} recalculated — subtotal: ${roundedSubtotal}, tax: ${taxAmount}, total: ${total}`,
    );

    return updated;
  }

  /* ═══════════════════════════════════════
     PRORATION CALCULATION
     ═══════════════════════════════════════ */

  /**
   * Calculate proration credit when switching billing cycles.
   * Returns the credit amount for unused days.
   *
   * DECISIONS.md §21:
   * - Daily price = plan price / days in period
   * - Credit = unused days × daily price
   * - Credit is deducted from new plan — never refunded
   */
  calculateProration(params: {
    currentAmount: number;
    currentCycleDays: number;
    daysUsed: number;
    newAmount: number;
  }): {
    dailyRate: number;
    unusedDays: number;
    credit: number;
    newCharge: number;
    totalDue: number;
  } {
    const { currentAmount, currentCycleDays, daysUsed, newAmount } = params;

    const dailyRate = currentAmount / currentCycleDays;
    const unusedDays = Math.max(0, currentCycleDays - daysUsed);
    const credit = Math.round(unusedDays * dailyRate * 100) / 100;
    const totalDue = Math.max(0, Math.round((newAmount - credit) * 100) / 100);

    return {
      dailyRate: Math.round(dailyRate * 100) / 100,
      unusedDays,
      credit,
      newCharge: newAmount,
      totalDue,
    };
  }

  /**
   * Get the number of days in a billing cycle.
   */
  getCycleDays(cycle: string): number {
    const map: Record<string, number> = {
      monthly: 30,
      quarterly: 90,
      semiannual: 180,
      annual: 365,
      one_time: 0,
    };
    return map[cycle] ?? 30;
  }

  /* ═══════════════════════════════════════
     BILLING SETTINGS HELPERS
     ═══════════════════════════════════════ */

  /**
   * Read a setting value from the settings table with a fallback default.
   */
  async getSettingValue<T>(category: string, key: string, defaultValue: T): Promise<T> {
    const setting = await this.prisma.setting.findUnique({
      where: { category_key: { category, key } },
    });

    if (!setting) return defaultValue;

    const val = setting.value as { value?: T };
    return val.value ?? defaultValue;
  }

  /* ═══════════════════════════════════════
     INVOICE STATS (for dashboard)
     ═══════════════════════════════════════ */

  async getStats(userId?: string): Promise<{
    total_invoices: number;
    total_revenue: number;
    pending_amount: number;
    overdue_count: number;
    /* Per-status counts for StatusTabs (UI_SPEC §3.2) */
    draft_count: number;
    pending_count: number;
    paid_count: number;
    cancelled_count: number;
    refunded_count: number;
  }> {
    const baseWhere = userId ? { user_id: userId } : {};

    const [totalCount, paidAgg, pendingAgg, statusGroups] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where: baseWhere }),
      this.prisma.invoice.aggregate({
        where: { ...baseWhere, status: 'paid' },
        _sum: { total: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...baseWhere, status: { in: ['pending', 'overdue'] } },
        _sum: { total: true },
      }),
      this.prisma.invoice.groupBy({
        by: ['status'],
        where: baseWhere,
        orderBy: { status: 'asc' },
        _count: true,
      }),
    ]);

    // Build a status→count map from the groupBy result
    const countByStatus: Record<string, number> = {};
    for (const group of statusGroups) {
      countByStatus[group.status] = typeof group._count === 'number' ? group._count : 0;
    }

    return {
      total_invoices: totalCount,
      total_revenue: Number(paidAgg._sum.total ?? 0),
      pending_amount: Number(pendingAgg._sum.total ?? 0),
      overdue_count: countByStatus['overdue'] ?? 0,
      draft_count: countByStatus['draft'] ?? 0,
      pending_count: countByStatus['pending'] ?? 0,
      paid_count: countByStatus['paid'] ?? 0,
      cancelled_count: countByStatus['cancelled'] ?? 0,
      refunded_count: countByStatus['refunded'] ?? 0,
    };
  }

  /* ═══════════════════════════════════════
     CHECKOUT — Create Service + Invoice
     ═══════════════════════════════════════ */

  /**
   * Process a checkout: creates a pending Service and a draft Invoice.
   * The invoice type (simplified vs complete) depends on the billing profile:
   *   - No profile or type=personal (no NIF) → factura simplificada
   *   - Profile type=company (with NIF/CIF) → factura completa
   *
   * Without an active payment plugin, the admin marks the invoice as paid
   * manually, which triggers service activation.
   *
   * 7.0.3: billing_profile_id is validated against the target userId
   * 7.0.5: discount_percentage from ProductPricing is applied to the invoice item
   *
   * Ref: DECISIONS.md §12, §21, §32
   */
  async checkout(userId: string, dto: {
    product_pricing_id: string;
    billing_profile_id?: string;
    label?: string;
    domain?: string;
  }) {
    // 1. Validate target user exists
    const targetUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) throw new NotFoundException('Usuario destino no encontrado.');

    // 2. Validate pricing plan
    const pricing = await this.prisma.productPricing.findUnique({
      where: { id: dto.product_pricing_id },
      include: { product: true },
    });

    if (!pricing) throw new NotFoundException('Plan de precios no encontrado.');
    if (!pricing.active) throw new BadRequestException('Este plan de precios no está activo.');
    if (pricing.product.status !== 'active') {
      throw new BadRequestException('Este producto no está disponible.');
    }

    // 3. Validate billing profile belongs to the TARGET user, not the caller
    // 7.0.3: prevents admin accidentally billing to their own profile
    let billingProfile = null;
    if (dto.billing_profile_id) {
      billingProfile = await this.prisma.billingProfile.findFirst({
        where: { id: dto.billing_profile_id, user_id: userId },
      });
      if (!billingProfile) {
        throw new BadRequestException(
          'El perfil de facturación no pertenece al cliente seleccionado.',
        );
      }
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

    // 5. Calculate pricing with discount
    // 7.0.5: Apply discount_percentage from the pricing plan (annual discounts etc.)
    const basePrice = Number(pricing.price);
    const discountPct = pricing.discount_percentage ? Number(pricing.discount_percentage) : 0;
    const discountedPrice = discountPct > 0
      ? Math.round(basePrice * (1 - discountPct / 100) * 100) / 100
      : basePrice;

    // 6. Calculate due date
    const cycleDays = this.getCycleDays(pricing.billing_cycle);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // 7 days to pay

    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + cycleDays);

    // 7. Create service + invoice in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create service in pending state — amount is the discounted price
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
    const invoice = await this.createInvoice({
      user_id: userId,
      billing_profile_id: dto.billing_profile_id,
      due_date: dueDate.toISOString(),
      currency: result.pricing.currency,
      items: [{
        service_id: result.service.id,
        product_id: result.pricing.product_id,
        description: `${result.pricing.product.name} — ${dto.label || dto.domain || 'Nuevo servicio'}`,
        quantity: 1,
        unit_price: discountedPrice,
        setup_fee: Number(result.pricing.setup_fee),
        discount_pct: discountPct > 0 ? discountPct : undefined,
        period_start: new Date().toISOString(),
        period_end: new Date(Date.now() + cycleDays * 24 * 60 * 60 * 1000).toISOString(),
      }],
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

    return {
      service: result.service,
      invoice,
      invoice_type: billingProfile?.nif_cif ? 'completa' : 'simplificada',
      discount_applied: discountPct > 0 ? `${discountPct}%` : null,
    };
  }

  /* ═══════════════════════════════════════
     INTERNAL HELPERS
     ═══════════════════════════════════════ */

  private async findOneOrFail(id: string): Promise<Invoice & { items: any[]; user: any }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        billing_profile: true,
        user: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Factura ${id} no encontrada.`);
    }

    return invoice as Invoice & { items: any[]; user: any };
  }
}
