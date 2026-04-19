import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { BillingLifecycleWorker } from './billing-lifecycle.worker';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { BillingEmailListener } from './billing-email.listener';

@Module({
  controllers: [BillingController, SubscriptionController],
  providers: [
    BillingService,
    SubscriptionService,
    BillingLifecycleWorker,
    InvoicePdfService,
    BillingEmailListener,
  ],
  exports: [BillingService, SubscriptionService, InvoicePdfService],
})
export class BillingModule {}
