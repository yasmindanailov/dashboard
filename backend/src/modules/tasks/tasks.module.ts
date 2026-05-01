import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksEmailListener } from './tasks-email.listener';
import { ChecklistCompletionService } from './checklist-completion.service';
import { MaintenanceLogService } from './maintenance-log.service';
import { MaintenanceCompletedListener } from './maintenance-completed.listener';
import { TaskTagsService } from './task-tags.service';
import { TaskTagsController } from './task-tags.controller';
import { TaskNotesService } from './task-notes.service';
import { TaskCompletedListener } from './task-completed.listener';
import { SupportTicketTaskCreatorListener } from './support-ticket-task-creator.listener';
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

@Module({
  // Sprint 8 Fase B.10 (2026-04-30) — ADR-074 ticket↔task bridge requiere
  // que `TasksService.complete()` delegue en `SupportService.updateConversation`
  // cuando la tarea tiene `conversation_id`. SupportModule NO importa
  // TasksModule (sin ciclo), pero el listener canónico
  // `SupportTicketTaskCreatorListener` vive aquí (en `tasks/`) porque su
  // efecto es crear/reasignar una task — su lugar natural.
  //
  // Sprint 8 Fase C (2026-05-01) — registra la cola BullMQ `tasks-overdue`
  // (ADR-063 patrón canónico, ADR-064 leader election). El processor
  // delega en `TasksOverdueService` para permitir testeo unitario y
  // disparo manual desde el endpoint admin de smoke testing.
  imports: [
    PrismaModule,
    SupportModule,
    BullModule.registerQueue({ name: TASKS_OVERDUE_QUEUE }),
    BullModule.registerQueue({ name: TASKS_UNASSIGNED_OVERDUE_QUEUE }),
    BullModule.registerQueue({ name: MAINTENANCE_CRITICAL_QUEUE }),
  ],
  controllers: [TasksController, TaskTagsController, TasksCronsAdminController],
  providers: [
    TasksService,
    ChecklistCompletionService,
    MaintenanceLogService,
    TasksEmailListener,
    MaintenanceCompletedListener,
    TaskCompletedListener,
    SupportTicketTaskCreatorListener,
    TaskTagsService,
    TaskNotesService,
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
  exports: [TasksService, TaskTagsService, TaskNotesService],
})
export class TasksModule {}
