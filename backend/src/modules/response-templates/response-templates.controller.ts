import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import { ResponseTemplatesService } from './response-templates.service';
import {
  CreateResponseTemplateDto,
  ListResponseTemplatesQueryDto,
  UpdateResponseTemplateDto,
} from './dto/response-template.dto';

/**
 * ResponseTemplatesController — Respuestas guardadas (macros de soporte).
 * Rediseño UI F3·E12.
 *
 * Recurso staff-puro bajo `/api/v1/admin/response-templates` con triple guard
 * (defense in depth, DC.7 + ADR-066/067):
 *   1. JwtAuthGuard      — usuario autenticado.
 *   2. AdminOnlyGuard    — corta clientes/partners a la entrada (403).
 *   3. PoliciesGuard     — CASL `Manage.ResponseTemplate`: solo staff de
 *      soporte (superadmin / agent_full / agent_support). `agent_billing`
 *      pasa AdminOnlyGuard pero CASL lo rechaza (no tiene el subject).
 *
 * Biblioteca de EQUIPO: sin ownership por agente. El picker del workspace de
 * chats consume `GET`; la gestión (POST/PATCH/DELETE) es colaborativa.
 */
@ApiTags('Admin / Response Templates')
@ApiBearerAuth()
@Controller('admin/response-templates')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class ResponseTemplatesController {
  constructor(private readonly service: ResponseTemplatesService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar respuestas guardadas (biblioteca de equipo)',
  })
  @CheckPolicies((ability) =>
    ability.can(Action.Read, Subject.ResponseTemplate),
  )
  list(@Query() query: ListResponseTemplatesQueryDto) {
    return this.service.findAll({
      category: query.category,
      search: query.search,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Crear una respuesta guardada' })
  @CheckPolicies((ability) =>
    ability.can(Action.Create, Subject.ResponseTemplate),
  )
  create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateResponseTemplateDto,
  ) {
    return this.service.create(dto, req.user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar una respuesta guardada' })
  @CheckPolicies((ability) =>
    ability.can(Action.Update, Subject.ResponseTemplate),
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateResponseTemplateDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borrar una respuesta guardada' })
  @CheckPolicies((ability) =>
    ability.can(Action.Delete, Subject.ResponseTemplate),
  )
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
