import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksEmailListener } from './tasks-email.listener';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TasksController],
  providers: [TasksService, TasksEmailListener],
  exports: [TasksService],
})
export class TasksModule {}
