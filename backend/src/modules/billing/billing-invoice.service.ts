import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../core/database/prisma.service';
import { OutboxService } from '../../core/outbox/outbox.service';
import { SettingsService } from '../../core/settings/settings.service';
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
import { BillingCalculatorService } from './billing-calculator.service';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import {
  PDF_GENERATION_QUEUE,
  INVOICE_PDF_JOB,
  type InvoicePdfJobPayload,
} from './pdf-generation.processor';

/**
 * Sprint 15C.II Fase F.11.3 (§A.11.10.8.2 R3-derivado) — shape canónico
 * del cross-link entre un Service y su billing (próxima renovación +
 * última factura asociada vía `InvoiceItem.service_id`). Capability-
 * driven por presencia: si el service no tiene `next_due_date` ni
 * facturas asociadas, el card no se renderiza en el frontend.
 *
 * Razón de la separación cross-link vs Invoice CRUD: el cliente/admin
 * en la página del Service necesita una vista resumen no-paginada con
 * 1 invoice (la última) — distinta del listado paginado `findByUser`.
 */
export interface ServiceBillingCrossLink {
  nextDueDate: string | null;
  amount: string | null;
  currency: string;
  lastInvoice: {
    id: string;
    invoice_number: string;
    status: InvoiceStatus;
    total: string;
    due_date: string;
    paid_at: string | null;
  } | null;
}

/* BillingInvoiceService — Invoice CRUD, lifecycle, stats & numbering. Ref: Regla 15 */

@Injectable()
export class BillingInvoiceService {
  private readonly logger = new Logger('BillingInvoiceService');
  private paymentProvider: PaymentProviderInterface;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly calculator: BillingCalculatorService,
    private readonly pdfStorage: InvoicePdfStorageService,
    private readonly settings: SettingsService,
    @InjectQueue(PDF_GENERATION_QUEUE) private readonly pdfQueue: Queue,
  ) {
    this.paymentProvider = new ManualPaymentProvider();
  }

  /**
   * Encola la generación + upload del PDF en la cola `pdf-generation`.
   * `jobId` estable por factura → BullMQ descarta duplicados (idempotencia
   * natural — ADR-063 §G). Si el job falla agotando retries, el DlqService
   * lo persiste en `failed_jobs` y emite `dlq.job_failed` (R7+R13).
   *
   * Sustituye al `pdfStorage.generateAndUploadInBackground(...)` introducido
   * en Sprint 11.5 (deuda controlada R2). Cumple R2 estricto: el upload va
   * a la cola, nunca al hilo de la request.
   */
  private async enqueuePdfGeneration(invoiceId: string): Promise<void> {
    const payload: InvoicePdfJobPayload = { invoice_id: invoiceId };
    await this.pdfQueue.add(INVOICE_PDF_JOB, payload, {
      jobId: `invoice-pdf-${invoiceId}`,
    });
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
    // Sprint 12: lectura canónica vía SettingsService (crudo). El previo
    // `calculator.getSettingValue` leía el envoltorio `{value}` → siempre
    // caía al fallback ('AELIUM'), ignorando el `invoice_prefix` seedeado.
    const prefix = await this.settings.get('billing', 'invoice_prefix', 'AEL');
    return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Fecha de vencimiento de una factura nueva: la del DTO si viene; si no,
   * hoy + `billing.payment_due_days` (Sprint 12 — consumidor de settings que
   * antes estaba seedeado pero inerte).
   */
  private async resolveDueDate(explicit?: string): Promise<Date> {
    if (explicit) return new Date(explicit);
    const days = await this.settings.getNumber(
      'billing',
      'payment_due_days',
      7,
    );
    const due = new Date();
    due.setDate(due.getDate() + days);
    return due;
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
    const dueDate = await this.resolveDueDate(dto.due_date);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
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
          due_date: dueDate,
          is_manual: dto.is_manual ?? false,
          max_retries: maxRetries,
          notes: dto.notes,
          payment_provider: this.paymentProvider.name,
          items: { create: totals.calculatedItems },
        },
        include: { items: true, billing_profile: true },
      });
      await this.outbox.enqueue(tx, 'invoice.created', {
        invoice_id: created.id,
        invoice_number: created.invoice_number,
        user_id: created.user_id,
        total: Number(created.total),
        currency: created.currency,
      });
      return created;
    });

    this.logger.log(
      `Invoice ${invoiceNumber} created for user ${dto.user_id} — total: ${totals.total} ${invoice.currency}`,
    );

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

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.invoice.update({
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
      await this.outbox.enqueue(tx, 'invoice.paid', {
        invoice_id: u.id,
        invoice_number: u.invoice_number,
        user_id: u.user_id,
        total: Number(u.total),
        currency: u.currency,
        payment_provider: u.payment_provider,
      });
      return u;
    });

    // Encolar generación + upload del PDF (R2 + ADR-063 Fase B).
    // Si MinIO o el processor están caídos, la cola reintenta (5 intentos
    // con backoff exponencial) y, si agota, queda en `failed_jobs` con
    // alerta superadmin. La descarga conserva fallback inline.
    await this.enqueuePdfGeneration(invoiceId);

    this.logger.log(`Invoice ${invoice.invoice_number} marked as PAID`);
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
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'overdue',
          retry_count: { increment: 1 },
          next_retry_at: new Date(Date.now() + retryDays * 86400_000),
        },
        include: { items: true },
      });
      await this.outbox.enqueue(tx, 'invoice.overdue', {
        invoice_id: u.id,
        invoice_number: u.invoice_number,
        user_id: u.user_id,
        total: Number(u.total),
        retry_count: u.retry_count,
        max_retries: u.max_retries,
      });
      return u;
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

    // Generar y persistir PDF al finalizar (R2 + ADR-063 Fase B).
    await this.enqueuePdfGeneration(invoiceId);

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

  /**
   * Sprint 15C.II Fase F.11.3 (§A.11.10.8.2) — cross-link Service↔billing
   * para mostrar en `/dashboard/services/[id]` (cliente) y
   * `/admin/services/[id]` (admin) la próxima renovación + link a la
   * última factura asociada.
   *
   * Owner check canónico espejo de `ProvisioningService.getInfoForUser`:
   * si `!isAdmin && service.user_id !== userId` → 403. El controller
   * admin pasa `isAdmin=true` (saltea check, garantizado por
   * `AdminOnlyGuard` upstream).
   *
   * Last invoice lookup: `Invoice` ordered by `created_at DESC` que tenga
   * al menos un `InvoiceItem.service_id === serviceId`. Si ninguno → null
   * (service todavía no facturado / service legacy sin invoice asociado).
   *
   * Decimals serializados como string (coherente patrón Prisma) — el
   * frontend los formatea con `Intl.NumberFormat`.
   */
  async getServiceBillingCrossLink(
    serviceId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<ServiceBillingCrossLink> {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        id: true,
        user_id: true,
        next_due_date: true,
        amount: true,
        currency: true,
      },
    });
    if (!service) {
      throw new NotFoundException(`Service ${serviceId} no encontrado`);
    }
    if (!isAdmin && service.user_id !== userId) {
      throw new ForbiddenException(
        'No tienes acceso al billing de este servicio.',
      );
    }

    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { items: { some: { service_id: serviceId } } },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        invoice_number: true,
        status: true,
        total: true,
        due_date: true,
        paid_at: true,
      },
    });

    return {
      nextDueDate: service.next_due_date?.toISOString() ?? null,
      amount: service.amount.toString(),
      currency: service.currency,
      lastInvoice: lastInvoice
        ? {
            id: lastInvoice.id,
            invoice_number: lastInvoice.invoice_number,
            status: lastInvoice.status,
            total: lastInvoice.total.toString(),
            due_date: lastInvoice.due_date.toISOString(),
            paid_at: lastInvoice.paid_at?.toISOString() ?? null,
          }
        : null,
    };
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
