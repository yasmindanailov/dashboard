import {
  Body,
  Controller,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationTemplateListQueryDto } from './dto/notification-template-list-query.dto';
import { NotificationTemplateUpdateDto } from './dto/notification-template-update.dto';
import { NotificationTemplatePreviewDto } from './dto/notification-template-preview.dto';

/**
 * NotificationTemplatesAdminController — Sprint 9.5 (ADR-042 + ADR-065)
 * + granularidad CASL Sprint 9.6 (ADR-067).
 *
 * Bajo `/api/v1/admin/notifications/templates` con triple guard
 * (defense in depth, ADR-067 §4):
 *  1. `JwtAuthGuard` — usuario autenticado.
 *  2. `AdminOnlyGuard` — rol staff (corte temprano antes de CASL).
 *  3. `PoliciesGuard` — evalúa `@CheckPolicies(Manage NotificationTemplate)`.
 *
 * Sólo `superadmin` tiene `Manage NotificationTemplate` (regla wildcard
 * `Manage All`). El resto de staff (`agent_full`/`agent_billing`/`agent_support`)
 * recibe 403 — la edición de plantillas afecta el copy de la marca y debe
 * estar centralizada en el rol con visión global.
 */
@ApiTags('Admin / Notification Templates')
@ApiBearerAuth()
@Controller('admin/notifications/templates')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class NotificationTemplatesAdminController {
  constructor(private readonly service: NotificationTemplateService) {}

  @Get()
  @CheckPolicies((ability) =>
    ability.can(Action.Manage, Subject.NotificationTemplate),
  )
  @ApiOperation({
    summary: 'Listar plantillas (filtrable por event_type/canal)',
  })
  list(@Query() query: NotificationTemplateListQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @CheckPolicies((ability) =>
    ability.can(Action.Manage, Subject.NotificationTemplate),
  )
  @ApiOperation({ summary: 'Obtener una plantilla por id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @CheckPolicies((ability) =>
    ability.can(Action.Manage, Subject.NotificationTemplate),
  )
  @ApiOperation({
    summary:
      'Actualizar subject/body/active. Bloquea save si la plantilla no compila Handlebars (R14 + EC-S9-03).',
  })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotificationTemplateUpdateDto,
  ) {
    return this.service.update(id, req.user.id, dto);
  }

  @Post(':id/preview')
  @CheckPolicies((ability) =>
    ability.can(Action.Manage, Subject.NotificationTemplate),
  )
  @ApiOperation({
    summary:
      'Render preview con datos de muestra (o payload custom). NO persiste cambios.',
  })
  preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotificationTemplatePreviewDto,
  ) {
    return this.service.preview(id, dto);
  }
}
