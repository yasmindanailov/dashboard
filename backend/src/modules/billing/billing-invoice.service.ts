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
import { Prisma, Invoice } from '@prisma/client';
import {
  PaymentProviderInterface,
  ManualPaymentProvider,
} from './interfaces/payment-provider.interface';
import { BillingCalculatorService } from './billing-calculator.service';

/* BillingInvoiceService — Invoice CRUD, lifecycle, stats & numbering. Ref: Regla 15 */

@Injectable()
export class BillingInvoiceService {
  private readonly logger = new Logger('BillingInvoiceService');
  private paymentProvider: PaymentProviderInterface;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly calculator: BillingCalculatorService,
  ) {
    this.paymentProvider = new ManualPaymentProvider();
  }

  setPaymentProvider(provider: PaymentProviderInterface) {
    this.logger.log(`Payment provider switched to: ${provider.name}`);
    this.paymentProvider = provider;
  }

  getPaymentProvider() {
    return this.paymentProvider;
  }

  /* ── Invoice numbering (PostgreSQL SEQUENCE) ── */

  async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const seqName = `invoice_number_seq_${year}`;

    await this.prisma.$executeRawUnsafe(
      `CREATE SEQUENCE IF NOT EXISTS "${seqName}" START WITH 1 INCREMENT BY 1 NO CYCLE`,
    );
    const result = await this.prisma.$queryRawUnsafe<{ nextval: string }[]>(
      `SELECT nextval('"${seqName}"')`,
    );
    const seq = parseInt(result[0].nextval, 10);
    const prefix = await this.calculator.getSettingValue<string>(
      'billing',
      'invoice_prefix',
      'AELIUM',
    );
    return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  }

  /* ── Create ── */

  async createInvoice(dto: CreateInvoiceDto): Promise<Invoice> {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

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

    const maxRetries = await this.calculator.getSettingValue<number>(
      'billing',
      'max_payment_retries',
      3,
    );
    const totals = await this.calculator.calculateInvoiceTotals(
      dto.items,
      dto.tax_rate,
      dto.discount_amount,
    );
    const invoiceNumber = await this.generateInvoiceNumber();

    const invoice = await this.prisma.invoice.create({
      data: {
        invoice_number: invoiceNumber,
        user_id: dto.user_id,
        billing_profile_id: dto.billing_profile_id,
        status: 'draft',
        subtotal: totals.subtotal,
        tax_rate: totals.taxRate,
        tax_amount: totals.taxAmount,
        discount_amount: dto.discount_amount ?? 0,
        total: totals.total,
        currency: dto.currency ?? 'EUR',
        due_date: new Date(dto.due_date),
        is_manual: dto.is_manual ?? false,
        max_retries: maxRetries,
        notes: dto.notes,
        payment_provider: this.paymentProvider.name,
        items: { create: totals.calculatedItems },
      },
      include: { items: true, billing_profile: true },
    });

    this.logger.log(
      `Invoice ${invoiceNumber} created for user ${dto.user_id} — total: ${totals.total} ${invoice.currency}`,
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

  /* ── Status transitions ── */

  async markAsPaid(
    invoiceId: string,
    dto: MarkAsPaidDto = {},
  ): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);
    if (invoice.status === 'paid')
      throw new ConflictException('La factura ya está pagada.');
    if (invoice.status === 'cancelled')
      throw new BadRequestException('No se puede pagar una factura cancelada.');
    if (invoice.status === 'refunded')
      throw new BadRequestException(
        'No se puede pagar una factura reembolsada.',
      );

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

  async markAsOverdue(invoiceId: string): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);
    if (invoice.status !== 'pending')
      throw new BadRequestException(
        'Solo facturas pendientes pueden marcarse como vencidas.',
      );

    const retryDays = await this.calculator.getSettingValue<number>(
      'billing',
      'retry_interval_days',
      3,
    );
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'overdue',
        retry_count: { increment: 1 },
        next_retry_at: new Date(Date.now() + retryDays * 86400_000),
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

  async cancelInvoice(invoiceId: string): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);
    if (invoice.status === 'paid')
      throw new BadRequestException(
        'No se puede cancelar una factura pagada. Usa el reembolso.',
      );
    if (invoice.status === 'cancelled')
      throw new ConflictException('La factura ya está cancelada.');

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'cancelled' },
      include: { items: true },
    });
    this.logger.log(`Invoice ${invoice.invoice_number} cancelled`);
    return updated;
  }

  async sendToPending(invoiceId: string): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);
    if (invoice.status !== 'draft')
      throw new BadRequestException(
        'Solo facturas en borrador pueden enviarse.',
      );

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'pending' },
      include: { items: true, billing_profile: true },
    });
    this.logger.log(`Invoice ${invoice.invoice_number} finalized → PENDING`);
    return updated;
  }

  async refundInvoice(invoiceId: string): Promise<Invoice> {
    const invoice = await this.findOneOrFail(invoiceId);
    if (invoice.status !== 'paid')
      throw new BadRequestException(
        'Solo facturas pagadas pueden reembolsarse.',
      );

    if (invoice.payment_ref) {
      const result = await this.paymentProvider.refund({
        id: invoice.id,
        payment_ref: invoice.payment_ref,
        amount: Number(invoice.total),
        currency: invoice.currency,
      });
      if (!result.success)
        throw new BadRequestException(
          `Error del proveedor de pago: ${result.error}`,
        );
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'refunded' },
      include: { items: true },
    });
    this.logger.log(`Invoice ${invoice.invoice_number} refunded`);
    return updated;
  }

  /* ── Reads ── */

  async findAll(query: InvoiceListQueryDto): Promise<PaginatedResult<Invoice>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.InvoiceWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.user_id && { user_id: query.user_id }),
      ...(query.search && {
        OR: [
          {
            invoice_number: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
          { notes: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
      ...((query.date_from || query.date_to) && {
        created_at: {
          ...(query.date_from && { gte: new Date(query.date_from) }),
          ...(query.date_to && { lte: new Date(query.date_to) }),
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
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
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.findOneOrFail(id);
  }

  async findByUser(userId: string, query: InvoiceListQueryDto) {
    return this.findAll({ ...query, user_id: userId });
  }

  /* ── Update ── */

  async updateInvoice(id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.findOneOrFail(id);
    if (['paid', 'refunded'].includes(invoice.status))
      throw new BadRequestException(
        'No se pueden editar facturas pagadas o reembolsadas.',
      );
    if (dto.items && invoice.status !== 'draft')
      throw new BadRequestException(
        'Solo se pueden editar items en facturas en borrador.',
      );
    if (dto.status)
      throw new BadRequestException(
        'Usa los endpoints específicos para cambiar el estado de la factura.',
      );

    if (dto.items && dto.items.length > 0)
      return this.recalculateInvoice(id, dto);

    return this.prisma.invoice.update({
      where: { id },
      data: {
        notes: dto.notes,
        due_date: dto.due_date ? new Date(dto.due_date) : undefined,
      },
      include: { items: true, billing_profile: true },
    });
  }

  /* ── Stats ── */

  async getStats(userId?: string) {
    const w = userId ? { user_id: userId } : {};
    const [total, paidAgg, pendingAgg, groups] = await this.prisma.$transaction(
      [
        this.prisma.invoice.count({ where: w }),
        this.prisma.invoice.aggregate({
          where: { ...w, status: 'paid' },
          _sum: { total: true },
        }),
        this.prisma.invoice.aggregate({
          where: { ...w, status: { in: ['pending', 'overdue'] } },
          _sum: { total: true },
        }),
        this.prisma.invoice.groupBy({
          by: ['status'],
          where: w,
          orderBy: { status: 'asc' },
          _count: true,
        }),
      ],
    );
    const c: Record<string, number> = {};
    for (const g of groups)
      c[g.status] = typeof g._count === 'number' ? g._count : 0;

    return {
      total_invoices: total,
      total_revenue: Number(paidAgg._sum.total ?? 0),
      pending_amount: Number(pendingAgg._sum.total ?? 0),
      overdue_count: c['overdue'] ?? 0,
      draft_count: c['draft'] ?? 0,
      pending_count: c['pending'] ?? 0,
      paid_count: c['paid'] ?? 0,
      cancelled_count: c['cancelled'] ?? 0,
      refunded_count: c['refunded'] ?? 0,
    };
  }

  /* ── Helpers ── */

  async findOneOrFail(
    id: string,
  ): Promise<Invoice & { items: any[]; user: any }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        items: true,
        billing_profile: true,
        user: {
          select: { id: true, first_name: true, last_name: true, email: true },
        },
      },
    });
    if (!invoice) throw new NotFoundException(`Factura ${id} no encontrada.`);
    return invoice as Invoice & { items: any[]; user: any };
  }

  private async recalculateInvoice(
    id: string,
    dto: UpdateInvoiceDto,
  ): Promise<Invoice> {
    const totals = await this.calculator.calculateInvoiceTotals(dto.items!);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoice_id: id } });
      return tx.invoice.update({
        where: { id },
        data: {
          subtotal: totals.subtotal,
          tax_rate: totals.taxRate,
          tax_amount: totals.taxAmount,
          total: totals.total,
          notes: dto.notes,
          due_date: dto.due_date ? new Date(dto.due_date) : undefined,
          items: { create: totals.calculatedItems },
        },
        include: { items: true, billing_profile: true },
      });
    });
    this.logger.log(
      `Invoice ${id} recalculated — subtotal: ${totals.subtotal}, tax: ${totals.taxAmount}, total: ${totals.total}`,
    );
    return updated;
  }
}
