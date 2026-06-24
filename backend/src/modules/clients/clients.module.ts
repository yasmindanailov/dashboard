import { Module, forwardRef } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { ClientsBillingService } from './clients-billing.service';
import { ClientNotesService } from './client-notes.service';
import { ClientsController } from './clients.controller';
import { AccountBillingController } from './account-billing.controller';
import { ClientLifecycleTaskCreatorListener } from './listeners/client-lifecycle-task-creator.listener';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  /**
   * Sprint 16 (ADR-079): ClientsModule importa TasksModule (forwardRef
   * porque TasksModule también importa ClientsModule por
   * `ClientNotesService`). El listener `ClientLifecycleTaskCreatorListener`
   * vive aquí porque su trigger conceptual es del dominio cliente
   * (primer servicio activado = onboarding cliente), y porque consume el
   * helper canónico `clientsService.isFirstService`.
   */
  imports: [forwardRef(() => TasksModule)],
  controllers: [ClientsController, AccountBillingController],
  providers: [
    ClientsBillingService,
    ClientNotesService,
    ClientsService,
    ClientLifecycleTaskCreatorListener,
  ],
  exports: [ClientsService, ClientNotesService],
})
export class ClientsModule {}
