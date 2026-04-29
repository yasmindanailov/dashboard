import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksEmailListener } from './tasks-email.listener';
import { ChecklistCompletionService } from './checklist-completion.service';
import { MaintenanceLogService } from './maintenance-log.service';
import { MaintenanceCompletedListener } from './maintenance-completed.listener';
import { TaskTagsService } from './task-tags.service';
import { TaskTagsController } from './task-tags.controller';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TasksController, TaskTagsController],
  providers: [
    TasksService,
    ChecklistCompletionService,
    MaintenanceLogService,
    TasksEmailListener,
    MaintenanceCompletedListener,
    TaskTagsService,
  ],
  exports: [TasksService, TaskTagsService],
})
export class TasksModule {}
