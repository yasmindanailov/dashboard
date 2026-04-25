import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { EmailService } from '../../core/email/email.service';

/**
 * BillingEmailListener — Handles billing-related email notifications.
 *
 * Listens to:
 * - invoice.created  → Notify client of new invoice
 * - invoice.paid     → Confirm payment receipt
 * - invoice.failed   → Warn client of failed payment attempt
 * - invoice.overdue  → Urgent notice of overdue invoice
 *
 * Ref: DECISIONS.md §12 (billing notifications)
 */
@Injectable()
export class BillingEmailListener {
  private readonly logger = new Logger(BillingEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /* ═══════════════════════════════════════
     INVOICE CREATED
     ═══════════════════════════════════════ */

  @OnEvent('invoice.created')
  async handleInvoiceCreated(payload: {
    invoice_id: string;
    invoice_number: string;
    user_id: string;
    total: number;
    currency: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.user_id },
    });
    if (!user) return;

    const formattedTotal = this.formatCurrency(payload.total, payload.currency);

    await this.emailService.send({
      to: user.email,
      subject: `Nueva factura ${payload.invoice_number} — ${formattedTotal}`,
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Nueva factura</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${payload.invoice_number}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola${user.first_name ? ` ${user.first_name}` : ''},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Se ha generado una nueva factura por <strong>${formattedTotal}</strong>.
            </p>
            <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #9ca3af;">Factura:</td><td style="text-align: right; font-weight: 600;">${payload.invoice_number}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Importe:</td><td style="text-align: right; font-weight: 600;">${formattedTotal}</td></tr>
              </table>
            </div>
            <p style="color: #6b7280; font-size: 13px;">
              Puedes consultar los detalles y descargar el PDF desde tu panel de cliente.
            </p>
          </div>
        </div>
      `,
    });

    this.logger.log(
      `Email sent: invoice.created → ${user.email} (${payload.invoice_number})`,
    );
  }

  /* ═══════════════════════════════════════
     INVOICE PAID
     ═══════════════════════════════════════ */

  @OnEvent('invoice.paid')
  async handleInvoicePaid(payload: {
    invoice_id: string;
    invoice_number: string;
    user_id: string;
    total: number;
    currency: string;
    payment_provider: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.user_id },
    });
    if (!user) return;

    const formattedTotal = this.formatCurrency(payload.total, payload.currency);

    await this.emailService.send({
      to: user.email,
      subject: `✓ Pago confirmado — ${payload.invoice_number}`,
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">✓ Pago confirmado</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${payload.invoice_number}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola${user.first_name ? ` ${user.first_name}` : ''},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hemos recibido tu pago de <strong>${formattedTotal}</strong>. Tu servicio está activo.
            </p>
            <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid #bbf7d0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #6b7280;">Factura:</td><td style="text-align: right; font-weight: 600;">${payload.invoice_number}</td></tr>
                <tr><td style="padding: 4px 0; color: #6b7280;">Importe:</td><td style="text-align: right; font-weight: 600;">${formattedTotal}</td></tr>
                <tr><td style="padding: 4px 0; color: #6b7280;">Vía:</td><td style="text-align: right;">${payload.payment_provider}</td></tr>
              </table>
            </div>
            <p style="color: #6b7280; font-size: 13px;">
              Puedes descargar el PDF de tu factura desde tu panel de cliente.
            </p>
          </div>
        </div>
      `,
    });

    this.logger.log(
      `Email sent: invoice.paid → ${user.email} (${payload.invoice_number})`,
    );
  }

  /* ═══════════════════════════════════════
     INVOICE FAILED (retry)
     ═══════════════════════════════════════ */

  @OnEvent('invoice.failed')
  async handleInvoiceFailed(payload: {
    invoice_id: string;
    invoice_number: string;
    user_id: string;
    retry_count: number;
    max_retries: number;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.user_id },
    });
    if (!user) return;

    const remaining = payload.max_retries - payload.retry_count;

    await this.emailService.send({
      to: user.email,
      subject: `⚠ Cobro fallido — ${payload.invoice_number} (intento ${payload.retry_count}/${payload.max_retries})`,
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">⚠ Cobro fallido</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">Intento ${payload.retry_count} de ${payload.max_retries}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola${user.first_name ? ` ${user.first_name}` : ''},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              No hemos podido procesar el cobro de la factura <strong>${payload.invoice_number}</strong>.
              ${
                remaining > 0
                  ? `Volveremos a intentarlo automáticamente (${remaining} intento${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}).`
                  : 'Este ha sido el último intento. Tu servicio será suspendido si no regularizas el pago.'
              }
            </p>
            <p style="color: #6b7280; font-size: 13px;">
              Puedes actualizar tu método de pago desde tu panel de cliente.
            </p>
          </div>
        </div>
      `,
    });

    this.logger.log(
      `Email sent: invoice.failed → ${user.email} (${payload.invoice_number}, attempt ${payload.retry_count})`,
    );
  }

  /* ═══════════════════════════════════════
     INVOICE OVERDUE
     ═══════════════════════════════════════ */

  @OnEvent('invoice.overdue')
  async handleInvoiceOverdue(payload: {
    invoice_id: string;
    invoice_number: string;
    user_id: string;
    total: number;
    retry_count: number;
    max_retries: number;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.user_id },
    });
    if (!user) return;

    const formattedTotal = this.formatCurrency(payload.total, 'EUR');

    await this.emailService.send({
      to: user.email,
      subject: `🔴 Factura vencida — ${payload.invoice_number}`,
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">🔴 Factura vencida</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px;">${payload.invoice_number}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola${user.first_name ? ` ${user.first_name}` : ''},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              La factura <strong>${payload.invoice_number}</strong> por <strong>${formattedTotal}</strong> está vencida.
              Si no se regulariza el pago, tu servicio será suspendido automáticamente.
            </p>
            <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 16px; margin: 20px 0;">
              <p style="color: #991B1B; font-size: 14px; margin: 0; font-weight: 500;">
                ⚠ Acción requerida: actualiza tu método de pago o contacta con soporte para resolver esta situación.
              </p>
            </div>
          </div>
        </div>
      `,
    });

    this.logger.log(
      `Email sent: invoice.overdue → ${user.email} (${payload.invoice_number})`,
    );
  }

  /* ═══════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════ */

  private formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  }
}
