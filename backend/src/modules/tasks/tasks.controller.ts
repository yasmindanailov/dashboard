/* ═══════════════════════════════════════
   TasksController — REST API for tasks
   Ref: DECISIONS.md §10, UI_SPEC.md §5.15-5.16
   ═══════════════════════════════════════ */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  CompleteTaskDto,
  TaskListQueryDto,
} from './dto/task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Post()
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.Task))
  @ApiOperation({ summary: 'Create a new task' })
  create(@Req() req: Request, @Body() dto: CreateTaskDto) {
    const user = req.user as any;
    return this.service.create(dto, user.id);
  }

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'List tasks (paginated, filtered)' })
  findAll(@Req() req: Request, @Query() query: TaskListQueryDto) {
    const user = req.user as any;
    const isAdmin = ['superadmin', 'agent_full'].includes(user.role?.slug);
    return this.service.findAll(query, user.id, isAdmin);
  }

  @Get('stats')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'Get task counters for StatusTabs' })
  getStats(@Req() req: Request) {
    const user = req.user as any;
    const isAdmin = ['superadmin', 'agent_full'].includes(user.role?.slug);
    return this.service.getStats(user.id, isAdmin);
  }

  @Get(':id')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Task))
  @ApiOperation({ summary: 'Get task detail' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({ summary: 'Update task (status, assignment, etc.)' })
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    const user = req.user as any;
    const isAdmin = ['superadmin', 'agent_full'].includes(user.role?.slug);
    return this.service.update(id, dto, user.id, isAdmin);
  }

  @Patch(':id/complete')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Task))
  @ApiOperation({ summary: 'Complete task with notes (maintenance flow)' })
  complete(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTaskDto,
  ) {
    const user = req.user as any;
    return this.service.complete(id, dto, user.id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can(Action.Delete, Subject.Task))
  @ApiOperation({ summary: 'Delete task (admin only)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
