import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiProduces,
} from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  MarkAsPaidDto,
  InvoiceListQueryDto,
} from './dto/billing.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { CheckoutItemsDto } from './dto/checkout-items.dto';
import type { PublicCartItem } from './billing-checkout.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { AuditAccess } from '../audit/audit.decorator';

/** Helper: admin roles that can see all data */
const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_billing'];

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly invoicePdfStorage: InvoicePdfStorageService,
  ) {}

  /* ═══════════════════════════════════════
     INVOICES — LIST (role-filtered)
     ═══════════════════════════════════════ */

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices — admin sees all, client sees own' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query() query: InvoiceListQueryDto,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);

    if (!isAdmin) {
      // Client/partner: force own user_id — never trust query param
      return this.billingService.findAll({ ...query, user_id: user.id });
    }
    return this.billingService.findAll(query);
  }

  @Get('invoices/stats')
  @ApiOperation({
    summary: 'Invoice statistics — admin sees global, client sees own',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  getStats(@Req() req: AuthenticatedRequest) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    return this.billingService.getStats(isAdmin ? undefined : user.id);
  }

  /**
   * Sprint 15C.II Fase F.11.3 (§A.11.10.8.2) — cross-link Service↔billing
   * para el card "Próxima renovación + última factura" en
   * `/dashboard/services/[id]` (cliente) y `/admin/services/[id]` (admin).
   *
   * Endpoint unificado cliente/admin (mismo path /billing/services/:id/cross-link)
   * — el service backing aplica owner check si !isAdmin (espejo
   * `BillingController.findOne` invoice). Devuelve `ServiceBillingCrossLink`:
   *   - `nextDueDate` + `amount` + `currency` del Service
   *   - `lastInvoice` (Invoice ordered by created_at DESC con
   *     InvoiceItem.service_id === serviceId), o null si no hay invoice
   *     asociada todavía (service legacy / pending no facturado).
   *
   * Capability-driven por presencia: el frontend ramifica si
   * `nextDueDate === null && lastInvoice === null` → no renderiza la card.
   * NO @AuditAccess — es read-only sobre billing del propio cliente
   * (cliente lee su propio service; admin lee billing service ajeno: el
   * @AuditAccess('Invoice') ya cubre el caso vía findOne cuando el admin
   * navega al invoice; el cross-link es una vista resumen que NO toca
   * Invoice individualmente).
   */
  @Get('services/:id/cross-link')
  @ApiOperation({
    summary:
      'Cross-link Service↔billing (próxima renovación + última factura asociada — F.11.3)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  getServiceBillingCrossLink(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    return this.billingService.getServiceBillingCrossLink(id, user.id, isAdmin);
  }

  @Get('invoices/:id')
  @ApiOperation({
    summary: 'Get invoice detail — ownership enforced for clients',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  @AuditAccess('Invoice')
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    const invoice = await this.billingService.findOne(id);

    if (!isAdmin && invoice.user_id !== user.id) {
      throw new ForbiddenException('No tienes acceso a esta factura');
    }
    return invoice;
  }

  /* ═══════════════════════════════════════
     INVOICES — CREATE / UPDATE (admin only via CASL)
     ═══════════════════════════════════════ */

  @Post('invoices')
  @ApiOperation({ summary: 'Create manual invoice (admin)' })
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Invoice))
  create(@Body() dto: CreateInvoiceDto) {
    return this.billingService.createInvoice(dto);
  }

  @Patch('invoices/:id')
  @ApiOperation({ summary: 'Update draft invoice' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Invoice))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.billingService.updateInvoice(id, dto);
  }

  /* ═══════════════════════════════════════
     INVOICES — STATE TRANSITIONS
     ═══════════════════════════════════════ */

  @Patch('invoices/:id/finalize')
  @ApiOperation({ summary: 'Finalize invoice: draft → pending' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Invoice))
  async finalize(@Param('id', ParseUUIDPipe) id: string) {
    // Validate invoice has items before finalizing
    const invoice = await this.billingService.findOne(id);
    if (!invoice.items || invoice.items.length === 0) {
      throw new BadRequestException(
        'No se puede enviar una factura sin líneas',
      );
    }
    if (Number(invoice.total) <= 0) {
      throw new BadRequestException(
        'El total de la factura debe ser mayor que 0',
      );
    }
    return this.billingService.sendToPending(id);
  }

  @Patch('invoices/:id/pay')
  @ApiOperation({ summary: 'Mark invoice as paid' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Invoice))
  markAsPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkAsPaidDto,
  ) {
    return this.billingService.markAsPaid(id, dto);
  }

  @Patch('invoices/:id/overdue')
  @ApiOperation({ summary: 'Mark invoice as overdue' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Invoice))
  markAsOverdue(@Param('id', ParseUUIDPipe) id: string) {
    return this.billingService.markAsOverdue(id);
  }

  @Patch('invoices/:id/cancel')
  @ApiOperation({
    summary: 'Cancel invoice (does NOT delete — preserves numbering)',
  })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Invoice))
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.billingService.cancelInvoice(id);
  }

  @Patch('invoices/:id/refund')
  @ApiOperation({ summary: 'Refund invoice: paid → refunded' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Invoice))
  refund(@Param('id', ParseUUIDPipe) id: string) {
    return this.billingService.refundInvoice(id);
  }

  /* ═══════════════════════════════════════
     PDF DOWNLOAD (ownership enforced + signed URL — ADR-062)

     Dos endpoints — mismo trabajo, distinto cliente:

     - `GET /pdf-url` (JSON):  { url, filename }
       Para el frontend del dashboard. El cliente hace fetch JSON con
       Authorization, recibe la URL firmada, y descarga directo del bucket
       (window.open / <a download>) sin XHR cross-origin → no requiere
       configurar CORS en MinIO.

     - `GET /pdf` (302 redirect):
       Para enlaces externos (correos, curl, integraciones). Sigue el
       redirect al bucket. NO usar desde fetch del navegador con
       Authorization (el header se strippea cross-origin y el preflight
       CORS al bucket falla).
     ═══════════════════════════════════════ */

  @Get('invoices/:id/pdf-url')
  @ApiOperation({
    summary:
      'Obtener URL firmada de descarga del PDF (consumido por el frontend)',
  })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  async getPdfUrl(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ url: string; filename: string }> {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    const invoice = await this.billingService.findOne(id);

    if (!isAdmin && invoice.user_id !== user.id) {
      throw new ForbiddenException('No tienes acceso a esta factura');
    }

    const url = await this.invoicePdfStorage.getSignedDownloadUrl(id);
    return { url, filename: `${invoice.invoice_number}.pdf` };
  }

  @Get('invoices/:id/pdf')
  @ApiOperation({
    summary:
      'Descargar PDF (302 redirect a signed URL — para correos/curl, no fetch CORS)',
  })
  @ApiProduces('application/pdf')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  async downloadPdf(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);
    const invoice = await this.billingService.findOne(id);

    if (!isAdmin && invoice.user_id !== user.id) {
      throw new ForbiddenException('No tienes acceso a esta factura');
    }

    const url = await this.invoicePdfStorage.getSignedDownloadUrl(id);
    res.redirect(302, url);
  }

  /* ═══════════════════════════════════════
     PRORATION PREVIEW
     ═══════════════════════════════════════ */

  @Get('proration/preview')
  @ApiOperation({ summary: 'Preview proration calculation for plan change' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  previewProration(
    @Query('currentAmount') currentAmount: string,
    @Query('currentCycleDays') currentCycleDays: string,
    @Query('daysUsed') daysUsed: string,
    @Query('newAmount') newAmount: string,
  ) {
    return this.billingService.calculateProration({
      currentAmount: parseFloat(currentAmount),
      currentCycleDays: parseInt(currentCycleDays, 10),
      daysUsed: parseInt(daysUsed, 10),
      newAmount: parseFloat(newAmount),
    });
  }

  /* ═══════════════════════════════════════
     CHECKOUT — userId from JWT, admin MUST target a client
     Ref: DECISIONS.md §32 — Proceso 2 (compra desde dashboard)
     ═══════════════════════════════════════ */

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout: create Service + Invoice from product' })
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Invoice))
  checkout(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CheckoutDto,
    @Query('targetUserId') targetUserId?: string,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);

    if (isAdmin) {
      // 7.0.2: Admin MUST specify a target client — cannot self-checkout
      if (!targetUserId) {
        throw new BadRequestException(
          'Como administrador, debes seleccionar un cliente destino (targetUserId).',
        );
      }
      return this.billingService.checkout(targetUserId, dto);
    }

    // Client: always self-scoped, ignore any query param
    return this.billingService.checkout(user.id, dto);
  }

  /**
   * Sprint 15D Fase 15D.F.4 — checkout del carrito unificado (producto + dominio).
   * Crea N services + 1 factura. El precio se resuelve server-side (R5); el
   * producto-dominio por capability (R4). Mismo modelo de targetUserId que el
   * checkout legacy (admin DEBE indicar cliente destino; cliente self-scoped).
   */
  @Post('checkout/items')
  @ApiOperation({
    summary:
      'Checkout del carrito unificado (N ítems producto/dominio → 1 factura)',
  })
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Invoice))
  async checkoutItems(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CheckoutItemsDto,
    @Query('targetUserId') targetUserId?: string,
  ) {
    const user = req.user;
    const isAdmin = ADMIN_ROLES.includes(user.role.slug);

    const items: PublicCartItem[] = dto.items.map((it) =>
      it.kind === 'product'
        ? {
            kind: 'product',
            productPricingId: it.product_pricing_id as string,
            label: it.label,
            domain: it.domain,
          }
        : {
            kind: 'domain',
            domainName: it.domain_name as string,
            years: it.years as number,
          },
    );

    let resolvedUserId = user.id;
    if (isAdmin) {
      if (!targetUserId) {
        throw new BadRequestException(
          'Como administrador, debes seleccionar un cliente destino (targetUserId).',
        );
      }
      resolvedUserId = targetUserId;
    }

    const result = await this.billingService.checkoutCart(resolvedUserId, {
      items,
      billingProfileId: dto.billing_profile_id,
    });
    return {
      invoice_id: result.invoice.id,
      invoice_number: result.invoice.invoice_number,
      total: result.invoice.total.toString(),
      currency: result.invoice.currency,
      services: result.services.map((s) => ({ id: s.id, domain: s.domain })),
    };
  }
}
