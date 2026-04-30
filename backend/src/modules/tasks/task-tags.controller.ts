/* ═══════════════════════════════════════
   TaskTagsController — Sprint 8 Fase B.7 (ADR-073)
   Prefix: /api/v1/admin/task-tags
   ═══════════════════════════════════════ */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TaskTagsService } from './task-tags.service';
import { CreateTaskTagDto } from './dto/task-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';

@ApiTags('TaskTags')
@ApiBearerAuth()
@Controller('admin/task-tags')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TaskTagsController {
  constructor(private readonly service: TaskTagsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.TaskTag))
  @ApiOperation({ summary: 'Listar tags disponibles (catálogo)' })
  list() {
    return this.service.list();
  }

  @Post()
  @CheckPolicies((ability) => ability.can(Action.Create, Subject.TaskTag))
  @ApiOperation({ summary: 'Crear tag (slug auto-generado del label)' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTaskTagDto) {
    return this.service.create(dto, req.user.id);
  }

  @Delete(':id')
  @CheckPolicies((ability) => ability.can(Action.Delete, Subject.TaskTag))
  @ApiOperation({ summary: 'Eliminar tag (cascada borra assignments)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
