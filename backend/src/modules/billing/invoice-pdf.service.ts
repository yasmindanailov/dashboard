import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { StorageService } from '../../core/storage/storage.service';
import { getErrorMessage } from '../../core/common/utils/error.util';
// pdfkit publica un CommonJS export sin default — `import = require()` es la
// forma correcta. Lint excepción documentada (R8 conv: librerías legacy).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import PDFDocument = require('pdfkit');

/**
 * Forma concreta del invoice consumido por el generador de PDF.
 * Coincide 1:1 con el `findUnique({ include: ... })` de generatePdf().
 */
type InvoiceForPdf = Prisma.InvoiceGetPayload<{
  include: {
    items: true;
    billing_profile: true;
    user: { select: { first_name: true; last_name: true; email: true } };
  };
}>;

/**
 * InvoicePdfService — Generates PDF invoices.
 *
 * Uses PDFKit for server-side PDF generation.
 * Template is configurable via Settings (company info, logo URL).
 *
 * Invoice types:
 * - Factura simplificada: no NIF/CIF required (personal purchases < €400)
 * - Factura completa: with NIF/CIF (business purchases, mandatory for deductions)
 *
 * Ref: DECISIONS.md §12, §32
 * Legal: retención 10 años (Hacienda España)
 */
@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Generate a PDF buffer for an invoice.
   * Returns a Buffer that can be stored or streamed.
   */
  async generatePdf(invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        items: true,
        billing_profile: true,
        user: {
          select: {
            first_name: true,
            last_name: true,
            email: true,
          },
        },
      },
    });

    if (!invoice) throw new NotFoundException('Factura no encontrada.');

    // Load company info + logo from settings (branding.*)
    const companyInfo = await this.getCompanyInfo();
    const logo = await this.loadLogo(companyInfo.logo_key);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Factura ${invoice.invoice_number}`,
          Author: companyInfo.name,
          Subject: 'Factura',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Header ──
      this.drawHeader(doc, companyInfo, invoice, logo);

      // ── Client info ──
      this.drawClientInfo(doc, invoice);

      // ── Items table ──
      this.drawItemsTable(doc, invoice);

      // ── Totals ──
      this.drawTotals(doc, invoice);

      // ── Footer ──
      this.drawFooter(doc, companyInfo, invoice);

      doc.end();
    });
  }

  /* ═══════════════════════════════════════
     TEMPLATE SECTIONS
     ═══════════════════════════════════════ */

  private drawHeader(
    doc: PDFKit.PDFDocument,
    company: CompanyInfo,
    invoice: InvoiceForPdf,
    logo: Buffer | null,
  ): void {
    // Logo de marca (PNG/JPG). Si existe, se dibuja arriba-izquierda y el
    // bloque de datos de empresa se desplaza a su derecha. Fail-soft: una
    // imagen corrupta no debe romper la factura.
    let textX = 50;
    if (logo) {
      try {
        doc.image(logo, 50, 45, { fit: [44, 44] });
        textX = 105;
      } catch (err) {
        this.logger.warn(
          `Logo de marca no se pudo incrustar en el PDF: ${getErrorMessage(err)}`,
        );
      }
    }

    // Company name (en el color primario de marca)
    doc
      .fontSize(20)
      .font('Helvetica-Bold')
      .fillColor(company.primary_color)
      .text(company.name, textX, 50);
    doc.fontSize(9).font('Helvetica').fillColor('#666666');
    doc.text(company.address, textX, 75);
    doc.text(
      `${company.postal_code} ${company.city}, ${company.country}`,
      textX,
      87,
    );
    doc.text(`NIF: ${company.nif}`, textX, 99);
    doc.text(`Email: ${company.email}`, textX, 111);

    // Invoice title
    doc.fontSize(24).font('Helvetica-Bold').fillColor(company.primary_color);
    doc.text('FACTURA', 400, 50, { align: 'right' });

    doc.fontSize(10).font('Helvetica').fillColor('#666666');
    doc.text(`Nº: ${invoice.invoice_number}`, 400, 80, { align: 'right' });
    doc.text(`Fecha: ${this.formatDate(invoice.created_at)}`, 400, 94, {
      align: 'right',
    });
    doc.text(`Vencimiento: ${this.formatDate(invoice.due_date)}`, 400, 108, {
      align: 'right',
    });

    // Status badge
    const statusColors: Record<string, string> = {
      draft: '#9CA3AF',
      pending: '#F59E0B',
      paid: '#10B981',
      overdue: '#EF4444',
      cancelled: '#6B7280',
      refunded: '#8B5CF6',
    };
    const color = statusColors[invoice.status] || '#666666';
    doc.fontSize(9).font('Helvetica-Bold').fillColor(color);
    doc.text(invoice.status.toUpperCase(), 400, 126, { align: 'right' });

    // Separator
    doc.moveTo(50, 150).lineTo(545, 150).strokeColor('#E5E7EB').stroke();
  }

  private drawClientInfo(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceForPdf,
  ): void {
    const bp = invoice.billing_profile;
    const user = invoice.user;
    const isComplete = bp?.nif_cif;

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a1a');
    doc.text(isComplete ? 'FACTURA COMPLETA' : 'FACTURA SIMPLIFICADA', 50, 165);

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333');
    doc.text('Datos del cliente:', 50, 185);

    doc.fontSize(9).font('Helvetica').fillColor('#666666');
    let y = 200;

    if (bp) {
      // Full billing profile
      if (bp.company_name) {
        doc.text(bp.company_name, 50, y);
        y += 13;
      }
      if (bp.first_name || bp.last_name) {
        doc.text(`${bp.first_name || ''} ${bp.last_name || ''}`.trim(), 50, y);
        y += 13;
      }
      if (bp.nif_cif) {
        doc.text(`NIF/CIF: ${bp.nif_cif}`, 50, y);
        y += 13;
      }
      if (bp.address_line1) {
        doc.text(bp.address_line1, 50, y);
        y += 13;
      }
      if (bp.address_line2) {
        doc.text(bp.address_line2, 50, y);
        y += 13;
      }
      if (bp.postal_code || bp.city || bp.country) {
        doc.text(
          `${bp.postal_code || ''} ${bp.city || ''}, ${bp.country || ''}`.trim(),
          50,
          y,
        );
        y += 13;
      }
    } else if (user) {
      // Fallback: use user profile data (factura simplificada)
      const fullName =
        `${user.first_name || ''} ${user.last_name || ''}`.trim();
      if (fullName) {
        doc.text(fullName, 50, y);
        y += 13;
      }
      if (user.email) {
        doc.text(user.email, 50, y);
        y += 13;
      }
      doc.fontSize(7).fillColor('#9CA3AF');
      doc.text('(Factura simplificada — sin perfil de facturación)', 50, y);
      y += 11;
      doc.fontSize(9).fillColor('#666666');
    } else {
      doc.text('(Sin datos de cliente)', 50, y);
      y += 13;
    }

    // Separator
    doc
      .moveTo(50, y + 10)
      .lineTo(545, y + 10)
      .strokeColor('#E5E7EB')
      .stroke();
  }

  private drawItemsTable(
    doc: PDFKit.PDFDocument,
    invoice: InvoiceForPdf,
  ): void {
    const tableTop = 290;
    const colWidths = { desc: 220, qty: 50, price: 80, setup: 70, total: 80 };

    // Table header
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#ffffff');
    doc.rect(50, tableTop - 5, 495, 20).fill('#374151');
    doc.fillColor('#ffffff');
    doc.text('Descripción', 55, tableTop, { width: colWidths.desc });
    doc.text('Cant.', 275, tableTop, { width: colWidths.qty, align: 'center' });
    doc.text('Precio', 325, tableTop, {
      width: colWidths.price,
      align: 'right',
    });
    doc.text('Setup', 405, tableTop, {
      width: colWidths.setup,
      align: 'right',
    });
    doc.text('Total', 465, tableTop, {
      width: colWidths.total,
      align: 'right',
    });

    // Table rows
    let y = tableTop + 22;
    doc.fontSize(8).font('Helvetica').fillColor('#333333');

    for (const item of invoice.items) {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      // Alternate row background
      const idx = invoice.items.indexOf(item);
      if (idx % 2 === 0) {
        doc.rect(50, y - 3, 495, 18).fill('#F9FAFB');
        doc.fillColor('#333333');
      }

      doc.text(item.description, 55, y, { width: colWidths.desc });
      doc.text(String(item.quantity), 275, y, {
        width: colWidths.qty,
        align: 'center',
      });
      doc.text(
        this.formatCurrency(Number(item.unit_price), invoice.currency),
        325,
        y,
        { width: colWidths.price, align: 'right' },
      );
      doc.text(
        this.formatCurrency(Number(item.setup_fee || 0), invoice.currency),
        405,
        y,
        { width: colWidths.setup, align: 'right' },
      );
      doc.text(
        this.formatCurrency(Number(item.total), invoice.currency),
        465,
        y,
        { width: colWidths.total, align: 'right' },
      );

      // Period
      if (item.period_start && item.period_end) {
        y += 14;
        doc.fontSize(7).fillColor('#9CA3AF');
        doc.text(
          `Período: ${this.formatDate(item.period_start)} — ${this.formatDate(item.period_end)}`,
          55,
          y,
        );
        doc.fontSize(8).fillColor('#333333');
      }

      y += 18;
    }

    // Table bottom line
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#E5E7EB').stroke();
  }

  private drawTotals(doc: PDFKit.PDFDocument, invoice: InvoiceForPdf): void {
    let y = doc.y + 20;

    const drawRow = (label: string, value: string, bold = false) => {
      doc
        .fontSize(9)
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor('#333333');
      doc.text(label, 350, y, { width: 100, align: 'right' });
      doc.text(value, 460, y, { width: 85, align: 'right' });
      y += 16;
    };

    drawRow(
      'Subtotal:',
      this.formatCurrency(Number(invoice.subtotal), invoice.currency),
    );

    if (Number(invoice.discount_amount) > 0) {
      drawRow(
        'Descuento:',
        `-${this.formatCurrency(Number(invoice.discount_amount), invoice.currency)}`,
      );
    }

    drawRow(
      `IVA (${Number(invoice.tax_rate)}%):`,
      this.formatCurrency(Number(invoice.tax_amount), invoice.currency),
    );

    // Separator before total
    doc
      .moveTo(350, y)
      .lineTo(545, y)
      .strokeColor('#374151')
      .lineWidth(1)
      .stroke();
    y += 8;

    drawRow(
      'TOTAL:',
      this.formatCurrency(Number(invoice.total), invoice.currency),
      true,
    );

    if (invoice.paid_at) {
      y += 10;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#10B981');
      doc.text(`✓ Pagada el ${this.formatDate(invoice.paid_at)}`, 350, y, {
        width: 195,
        align: 'right',
      });
    }
  }

  private drawFooter(
    doc: PDFKit.PDFDocument,
    company: CompanyInfo,
    invoice: InvoiceForPdf,
  ): void {
    const y = 750;
    doc.fontSize(7).font('Helvetica').fillColor('#9CA3AF');
    doc.text(
      `${company.name} · ${company.nif} · ${company.address}, ${company.postal_code} ${company.city}`,
      50,
      y,
      { width: 495, align: 'center' },
    );
    doc.text(
      `Documento generado automáticamente — ${invoice.invoice_number}`,
      50,
      y + 12,
      { width: 495, align: 'center' },
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

  private formatDate(date: Date | string): string {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(date));
  }

  /**
   * Datos de empresa para la factura, desde `branding.*` (Sprint 12, ADR-044
   * Amendment A1). Lee crudo vía `SettingsService` — corrige el bug previo que
   * leía `category:'company'` con el envoltorio `{value}` y siempre caía al
   * fallback.
   */
  private async getCompanyInfo(): Promise<CompanyInfo> {
    const get = (key: string, fallback: string) =>
      this.settings.get('branding', key, fallback);
    const [
      name,
      nif,
      address,
      city,
      postal_code,
      country,
      email,
      logo_key,
      primary_color,
    ] = await Promise.all([
      get('company_name', 'Aelium S.L.'),
      get('company_nif', 'B12345678'),
      get('company_address', 'Calle Ejemplo 1'),
      get('company_city', 'Madrid'),
      get('company_postal_code', '28001'),
      get('company_country', 'España'),
      get('company_email', 'billing@aelium.es'),
      get('logo_key', ''),
      get('primary_color', '#1a1a1a'),
    ]);

    return {
      name,
      nif,
      address,
      city,
      postal_code,
      country,
      email,
      logo_key,
      primary_color,
    };
  }

  /** Descarga el logo de MinIO. Fail-soft: `null` si no hay key o falla. */
  private async loadLogo(logoKey: string): Promise<Buffer | null> {
    if (!logoKey) return null;
    try {
      return await this.storage.download(logoKey);
    } catch (err) {
      this.logger.warn(
        `No se pudo descargar el logo de marca (${logoKey}): ${getErrorMessage(err)}`,
      );
      return null;
    }
  }
}

interface CompanyInfo {
  name: string;
  nif: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  email: string;
  logo_key: string;
  primary_color: string;
}
