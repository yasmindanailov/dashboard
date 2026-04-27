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
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { NotificationTemplateService } from './notification-template.service';
import { NotificationTemplateListQueryDto } from './dto/notification-template-list-query.dto';
import { NotificationTemplateUpdateDto } from './dto/notification-template-update.dto';
import { NotificationTemplatePreviewDto } from './dto/notification-template-preview.dto';

/**
 * NotificationTemplatesAdminController — Sprint 9.5 (ADR-042 + ADR-065).
 *
 * Bajo `/api/v1/admin/notifications/templates` con doble guard:
 *  1. `JwtAuthGuard` — usuario autenticado.
 *  2. `AdminOnlyGuard` — rol staff (defense-in-depth Fase F).
 *
 * Granularidad por rol staff (qué subset de plantillas ve cada agente)
 * se difiere a Sprint 9.6 con CASL `Manage.NotificationTemplate`. Hoy
 * cualquier staff puede leer/editar — el riesgo es bajo (auditoría manual
 * vía `audit_change_log` cuando se necesite).
 */
@ApiTags('Admin / Notification Templates')
@ApiBearerAuth()
@Controller('admin/notifications/templates')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class NotificationTemplatesAdminController {
  constructor(private readonly service: NotificationTemplateService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar plantillas (filtrable por event_type/canal)',
  })
  list(@Query() query: NotificationTemplateListQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener una plantilla por id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
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
