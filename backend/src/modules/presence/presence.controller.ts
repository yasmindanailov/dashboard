import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { PresenceService } from './presence.service';

/**
 * PresenceController — Rediseño UI F3·E8.
 *
 * `POST /api/v1/presence/heartbeat` — el front del staff lo pulsa
 * periódicamente mientras la app está abierta para mantener fresco su
 * `last_seen_at`. Sólo requiere estar autenticado (cualquier usuario puede
 * latir; la presencia que se LEE/expone es la del staff técnico).
 */
@ApiTags('Presence')
@ApiBearerAuth()
@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly service: PresenceService) {}

  @Post('heartbeat')
  @HttpCode(204)
  @ApiOperation({ summary: 'Heartbeat de presencia del usuario actual' })
  async heartbeat(@Req() req: AuthenticatedRequest): Promise<void> {
    await this.service.heartbeat(req.user.id);
  }
}
