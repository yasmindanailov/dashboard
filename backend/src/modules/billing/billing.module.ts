import { Module } from '@nestjs/common';
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

@Module({
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
  ],
  exports: [
    BillingService,
    BillingCalculatorService,
    SubscriptionService,
    InvoicePdfService,
    InvoicePdfStorageService,
  ],
})
export class BillingModule {}
