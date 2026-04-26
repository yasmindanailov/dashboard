import { OnModuleInit, Logger } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DlqService } from '../../core/jobs/dlq.service';
import { RetryService } from '../../core/jobs/retry.service';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

export const PDF_GENERATION_QUEUE = 'pdf-generation';
export const INVOICE_PDF_JOB = 'invoice-pdf';

export interface InvoicePdfJobPayload {
  invoice_id: string;
}

/**
 * PdfGenerationProcessor — procesa la cola `pdf-generation` (Sprint 9 Fase B).
 *
 * Reemplaza el fire-and-forget síncrono `generateAndUploadInBackground` que
 * el Sprint 11.5 introdujo como deuda controlada R2. Cada `markAsPaid` y
 * `sendToPending` encola un job con `jobId = 'invoice-pdf-{invoice_id}'`,
 * BullMQ descarta duplicados con la misma key (idempotencia natural — ADR-063 §G).
 *
 * Defaults globales del JobsModule: 5 retries con backoff exponencial 30s→480s.
 * Si agota retries, `DlqService` lo persiste en `failed_jobs` y emite
 * `dlq.job_failed` para alerta superadmin (R7 + R13).
 */
@Processor(PDF_GENERATION_QUEUE)
export class PdfGenerationProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PdfGenerationProcessor.name);

  constructor(
    private readonly pdfStorage: InvoicePdfStorageService,
    private readonly dlq: DlqService,
    private readonly retry: RetryService,
    @InjectQueue(PDF_GENERATION_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  onModuleInit(): void {
    // Registra esta cola en los servicios cross-cutting de Sprint 9 Fase A.
    // El DlqService captura jobs failed → tabla `failed_jobs` + emit alerta.
    // El RetryService permite re-encolar desde UI admin.
    this.dlq.register(PDF_GENERATION_QUEUE);
    this.retry.register(PDF_GENERATION_QUEUE, this.queue);
  }

  async process(job: Job<InvoicePdfJobPayload>): Promise<{ key: string }> {
    const { invoice_id } = job.data;
    this.logger.log(
      `Processing job ${job.id} (attempt ${job.attemptsMade + 1}/${job.opts.attempts ?? 5}): invoice=${invoice_id}`,
    );

    try {
      const result = await this.pdfStorage.generateAndUpload(invoice_id);
      this.logger.log(
        `PDF generado y subido para invoice=${invoice_id} → key=${result.key}`,
      );
      return result;
    } catch (err) {
      this.logger.error(
        `Job ${job.id} falló (intento ${job.attemptsMade + 1}): ${getErrorMessage(err)}`,
      );
      throw err;
    }
  }
}
