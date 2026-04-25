import { Module } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsBillingService } from './clients-billing.service';
import { ClientsController } from './clients.controller';

@Module({
  controllers: [ClientsController],
  providers: [ClientsBillingService, ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
