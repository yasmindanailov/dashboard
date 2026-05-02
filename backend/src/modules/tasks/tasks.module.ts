import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksEmailListener } from './tasks-email.listener';
import { ChecklistCompletionService } from './checklist-completion.service';
import { MaintenanceLogService } from './maintenance-log.service';
import { MaintenanceCompletedListener } from './maintenance-completed.listener';
import { TaskCompletedListener } from './task-completed.listener';
import { SupportTicketTaskCreatorListener } from './support-ticket-task-creator.listener';
import { TasksOnSlotReleasedListener } from './listeners/tasks-on-slot-released.listener';
import { TasksOnServiceCancelledListener } from './listeners/tasks-on-service-cancelled.listener';
import { TasksOverdueService } from './crons/tasks-overdue.service';
import {
  TasksOverdueProcessor,
  TASKS_OVERDUE_QUEUE,
} from './crons/tasks-overdue.processor';
import { TasksOverdueListener } from './listeners/tasks-overdue.listener';
import { TasksUnassignedOverdueService } from './crons/tasks-unassigned-overdue.service';
import {
  TasksUnassignedOverdueProcessor,
  TASKS_UNASSIGNED_OVERDUE_QUEUE,
} from './crons/tasks-unassigned-overdue.processor';
import { TasksUnassignedOverdueListener } from './listeners/tasks-unassigned-overdue.listener';
import { MaintenanceCriticalService } from './crons/maintenance-critical.service';
import {
  MaintenanceCriticalProcessor,
  MAINTENANCE_CRITICAL_QUEUE,
} from './crons/maintenance-critical.processor';
import { MaintenanceCriticalListener } from './listeners/maintenance-critical.listener';
import { TasksCronsAdminController } from './crons/tasks-crons-admin.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { SupportModule } from '../support/support.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  /**
   * Sprint 16 Fase 16.B (ADR-079) — el módulo se reorganiza en torno al
   * nuevo modelo bridge unidireccional read-only:
   *
   *  - SupportModule (igual que pre-Sprint 16): bridge ticket↔task delega
   *    en `SupportService.updateConversation`.
   *  - ClientsModule (nuevo): exporta `ClientNotesService` consolidado;
   *    `TasksService` y los listeners de cierre persisten ClientNote
   *    canónico vía sus métodos `createFrom*`.
   *
   * Listeners eliminados (legacy del enum TaskType):
   *   - `task-tags.controller`/`service` — ya no hay tags.
   *   - `task-notes.service` — la creación de nota interna inline durante
   *     la task se eliminó; las notas se generan al COMPLETAR vía
   *     `client-notes.service` con `source_system='task_completion'`.
   *
   * Listeners nuevos:
   *   - `TasksOnSlotReleasedListener` — cancela task al liberar slot.
   *   - `TasksOnServiceCancelledListener` — cancela task al cancelar
   *     service. (`ClientLifecycleTaskCreatorListener` vive en ClientsModule
   *     porque `isFirstService` es helper canónico de clientes.)
   */
  imports: [
    PrismaModule,
    SupportModule,
    forwardRef(() => ClientsModule),
    BullModule.registerQueue({ name: TASKS_OVERDUE_QUEUE }),
    BullModule.registerQueue({ name: TASKS_UNASSIGNED_OVERDUE_QUEUE }),
    BullModule.registerQueue({ name: MAINTENANCE_CRITICAL_QUEUE }),
  ],
  controllers: [TasksController, TasksCronsAdminController],
  providers: [
    TasksService,
    ChecklistCompletionService,
    MaintenanceLogService,
    TasksEmailListener,
    MaintenanceCompletedListener,
    TaskCompletedListener,
    SupportTicketTaskCreatorListener,
    TasksOnSlotReleasedListener,
    TasksOnServiceCancelledListener,
    TasksOverdueService,
    TasksOverdueProcessor,
    TasksOverdueListener,
    TasksUnassignedOverdueService,
    TasksUnassignedOverdueProcessor,
    TasksUnassignedOverdueListener,
    MaintenanceCriticalService,
    MaintenanceCriticalProcessor,
    MaintenanceCriticalListener,
  ],
  exports: [TasksService],
})
export class TasksModule {}
