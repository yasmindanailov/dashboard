import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { StorageService } from '../../core/storage/storage.service';
import { getErrorMessage } from '../../core/common/utils/error.util';
import { InvoicePdfService } from './invoice-pdf.service';

/**
 * InvoicePdfStorageService — puente entre el render del PDF y el bucket
 * canónico (ADR-062). Mantiene `InvoicePdfService` como renderizador puro
 * y aísla aquí toda la lógica de upload + signed URL + actualización de
 * `Invoice.pdf_url`.
 *
 * Convención de keys (ADR-062 §D): `invoices/{invoice_number}.pdf`.
 *
 * Uso:
 *   await this.pdfStorage.generateAndUpload(invoiceId);     // post markAsPaid / sendToPending
 *   const url = await this.pdfStorage.getSignedDownloadUrl(invoiceId); // endpoint /pdf
 */
@Injectable()
export class InvoicePdfStorageService {
  private readonly logger = new Logger(InvoicePdfStorageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: InvoicePdfService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Genera el PDF, lo sube al bucket y actualiza `pdf_url` con la S3 key.
   * Idempotente: la key es estable (`invoices/{invoice_number}.pdf`) — un
   * segundo upload sobrescribe limpiamente.
   */
  async generateAndUpload(invoiceId: string): Promise<{ key: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoice_number: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');

    const buffer = await this.pdf.generatePdf(invoiceId);
    const key = this.buildKey(invoice.invoice_number);

    await this.storage.upload({
      key,
      body: buffer,
      contentType: 'application/pdf',
    });
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { pdf_url: key },
    });

    this.logger.log(`PDF subido a bucket: ${key} (${buffer.byteLength} bytes)`);
    return { key };
  }

  /**
   * Devuelve una URL firmada de descarga. Si `pdf_url` no existe (factura
   * legacy, factura nueva sin haber pasado por markAsPaid/sendToPending o
   * upload anterior fallido), genera + sube on-demand y luego firma.
   *
   * La URL firma `Content-Disposition: attachment; filename="<num>.pdf"`
   * para que el navegador descargue (no abra inline) — paridad con el
   * comportamiento previo del endpoint que pasaba el header explícito.
   */
  async getSignedDownloadUrl(invoiceId: string): Promise<string> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoice_number: true, pdf_url: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada.');

    let key = invoice.pdf_url;
    if (!key) {
      const result = await this.generateAndUpload(invoiceId);
      key = result.key;
    }

    return this.storage.presignedDownloadUrl(key, {
      responseContentDisposition: `attachment; filename="${invoice.invoice_number}.pdf"`,
      responseContentType: 'application/pdf',
    });
  }

  /**
   * Hook para `BillingInvoiceService.markAsPaid` y `sendToPending`.
   * Fire-and-forget: si el bucket está caído, log + sigue. La descarga
   * posterior recupera vía fallback en `getSignedDownloadUrl`.
   */
  generateAndUploadInBackground(invoiceId: string): void {
    void this.generateAndUpload(invoiceId).catch((err) => {
      this.logger.warn(
        `Upload de PDF falló para invoice=${invoiceId}: ${getErrorMessage(err)}. ` +
          `Se reintentará en la próxima descarga.`,
      );
    });
  }

  private buildKey(invoiceNumber: string): string {
    return `invoices/${invoiceNumber}.pdf`;
  }
}
