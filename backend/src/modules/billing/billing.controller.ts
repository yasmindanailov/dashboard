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
import type { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { BillingService } from './billing.service';
import { InvoicePdfService } from './invoice-pdf.service';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  MarkAsPaidDto,
  InvoiceListQueryDto,
} from './dto/billing.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';

/** Helper: admin roles that can see all data */
const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_billing'];

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  /* ═══════════════════════════════════════
     INVOICES — LIST (role-filtered)
     ═══════════════════════════════════════ */

  @Get('invoices')
  @ApiOperation({ summary: 'List invoices — admin sees all, client sees own' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  findAll(@Req() req: Request, @Query() query: InvoiceListQueryDto) {
    const user = req.user as any;
    const isAdmin = ADMIN_ROLES.includes(user.role?.slug);

    if (!isAdmin) {
      // Client/partner: force own user_id — never trust query param
      return this.billingService.findAll({ ...query, user_id: user.id });
    }
    return this.billingService.findAll(query);
  }

  @Get('invoices/stats')
  @ApiOperation({ summary: 'Invoice statistics — admin sees global, client sees own' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  getStats(@Req() req: Request) {
    const user = req.user as any;
    const isAdmin = ADMIN_ROLES.includes(user.role?.slug);
    return this.billingService.getStats(isAdmin ? undefined : user.id);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice detail — ownership enforced for clients' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  async findOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const user = req.user as any;
    const isAdmin = ADMIN_ROLES.includes(user.role?.slug);
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
    const invoice = await this.billingService.findOne(id) as any;
    if (!invoice.items || invoice.items.length === 0) {
      throw new BadRequestException('No se puede enviar una factura sin líneas');
    }
    if (Number(invoice.total) <= 0) {
      throw new BadRequestException('El total de la factura debe ser mayor que 0');
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
  @ApiOperation({ summary: 'Cancel invoice (does NOT delete — preserves numbering)' })
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
     PDF DOWNLOAD (ownership enforced)
     ═══════════════════════════════════════ */

  @Get('invoices/:id/pdf')
  @ApiOperation({ summary: 'Download invoice PDF' })
  @ApiProduces('application/pdf')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Invoice))
  async downloadPdf(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const user = req.user as any;
    const isAdmin = ADMIN_ROLES.includes(user.role?.slug);
    const invoice = await this.billingService.findOne(id) as any;

    if (!isAdmin && invoice.user_id !== user.id) {
      throw new ForbiddenException('No tienes acceso a esta factura');
    }

    const pdfBuffer = await this.invoicePdfService.generatePdf(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoice_number}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.end(pdfBuffer);
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
     CHECKOUT — userId from JWT, admin can target another user
     ═══════════════════════════════════════ */

  @Post('checkout')
  @ApiOperation({ summary: 'Checkout: create Service + Invoice from product' })
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Invoice))
  checkout(
    @Req() req: Request,
    @Body() dto: CheckoutDto,
    @Query('targetUserId') targetUserId?: string,
  ) {
    const user = req.user as any;
    const isAdmin = ADMIN_ROLES.includes(user.role?.slug);

    // Admin can create checkout for another user
    // Client always creates for themselves
    let userId = user.id;
    if (isAdmin && targetUserId) {
      userId = targetUserId;
    } else if (!isAdmin) {
      userId = user.id; // force — ignore any query param
    }

    return this.billingService.checkout(userId, dto);
  }
}
