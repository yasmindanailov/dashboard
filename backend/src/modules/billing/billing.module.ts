import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BillingService } from './billing.service';
import { BillingInvoiceService } from './billing-invoice.service';
import { BillingCheckoutService } from './billing-checkout.service';
import { BillingCalculatorService } from './billing-calculator.service';
import { BillingController } from './billing.controller';
import { BillingLifecycleWorker } from './billing-lifecycle.worker';
import { ServiceLifecycleWorker } from './service-lifecycle.worker';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { InvoicePdfStorageService } from './invoice-pdf-storage.service';
import { BillingEmailListener } from './billing-email.listener';
import { GenerateInvoiceOnDomainTransferCompletedListener } from './generate-invoice-on-domain-transfer-completed.listener';
import {
  PdfGenerationProcessor,
  PDF_GENERATION_QUEUE,
} from './pdf-generation.processor';
import { ProvisioningModule } from '../provisioning/provisioning.module';

@Module({
  imports: [
    // Sprint 9 Fase B — cola BullMQ para generación + upload de PDFs.
    // Hereda los defaults del JobsModule global (attempts=5, backoff
    // exponencial 30s→480s, removeOnFail:false). ADR-063.
    BullModule.registerQueue({ name: PDF_GENERATION_QUEUE }),
    // Sprint 15C.II Fase F.5 — `ServiceLifecycleWorker.autoSuspendServices`
    // delega en `ProvisioningService.suspendAsAdmin` (punto único de
    // transición de estado). `ProvisioningModule` no importa `BillingModule`
    // (consume sus eventos vía `@OnEvent`, no por import) → no hay ciclo.
    ProvisioningModule,
  ],
  controllers: [BillingController, SubscriptionController],
  providers: [
    BillingCalculatorService,
    BillingInvoiceService,
    BillingCheckoutService,
    BillingService,
    SubscriptionService,
    BillingLifecycleWorker,
    ServiceLifecycleWorker,
    InvoicePdfService,
    InvoicePdfStorageService,
    BillingEmailListener,
    GenerateInvoiceOnDomainTransferCompletedListener,
    PdfGenerationProcessor,
  ],
  exports: [
    BillingService,
    BillingCalculatorService,
    BillingCheckoutService,
    SubscriptionService,
    InvoicePdfService,
    InvoicePdfStorageService,
  ],
})
export class BillingModule {}
