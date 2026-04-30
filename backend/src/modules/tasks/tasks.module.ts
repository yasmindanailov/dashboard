import { Module } from '@nestjs/common';
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
import { PrismaModule } from '../../core/database/prisma.module';
import { SupportModule } from '../support/support.module';

@Module({
  // Sprint 8 Fase B.10 (2026-04-30) — ADR-074 ticket↔task bridge requiere
  // que `TasksService.complete()` delegue en `SupportService.updateConversation`
  // cuando la tarea tiene `conversation_id`. SupportModule NO importa
  // TasksModule (sin ciclo), pero el listener canónico
  // `SupportTicketTaskCreatorListener` vive aquí (en `tasks/`) porque su
  // efecto es crear/reasignar una task — su lugar natural.
  imports: [PrismaModule, SupportModule],
  controllers: [TasksController, TaskTagsController],
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
  ],
  exports: [TasksService, TaskTagsService, TaskNotesService],
})
export class TasksModule {}
