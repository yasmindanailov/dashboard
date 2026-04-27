import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { NotificationsService } from './notifications.service';
import { NotificationListQueryDto } from './dto/notification-list-query.dto';

/**
 * NotificationsController — endpoints cliente (Sprint 9.5 + ADR-042).
 *
 * Todos los endpoints filtran por `user_id = req.user.id` server-side. El
 * CASL `Read.Notification` / `Update.Notification` actúa como gate de
 * "puede el rol acceder al subject" y la ownership la enforza el
 * controller — patrón establecido para Notification (ver
 * `permissions.ts:client` y `:partner`).
 *
 * No exponemos un endpoint para EMITIR notificaciones desde el cliente —
 * eso solo sucede a través de listeners de eventos de negocio
 * (`invoice.*`, `task.assigned`, `system.error`, etc.).
 */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get('unread')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Notification))
  @ApiOperation({
    summary: 'Notificaciones no leídas (campana del Topbar)',
  })
  unread(@Req() req: AuthenticatedRequest) {
    return this.service.findUnreadForUser(req.user.id);
  }

  @Get()
  @CheckPolicies((ability) => ability.can(Action.List, Subject.Notification))
  @ApiOperation({
    summary: 'Histórico paginado de notificaciones del usuario',
  })
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: NotificationListQueryDto,
  ) {
    return this.service.findAllForUser(req.user.id, query);
  }

  @Patch(':id/read')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Notification))
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  markRead(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.markAsRead(id, req.user.id);
  }

  @Patch('read-all')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Notification))
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  markAllRead(@Req() req: AuthenticatedRequest) {
    return this.service.markAllAsRead(req.user.id);
  }
}
