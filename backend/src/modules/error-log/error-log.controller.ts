import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { ErrorLogService } from './error-log.service';

/**
 * ErrorLogController — Sprint 9 Fase F (DC.7 + ADR-055 §Monitoring + R7).
 *
 * Bajo `/api/v1/admin/error-log` con doble guard:
 *  1. JwtAuthGuard — usuario autenticado.
 *  2. AdminOnlyGuard — rol en {superadmin, agent_full, agent_billing, agent_support}.
 *
 * Granularidad por rol staff (qué subset de errores ve cada agente) se
 * difiere a Sprint 9.6 con CASL `Manage.ErrorLog` específico.
 */
@ApiTags('Admin / Error Log')
@ApiBearerAuth()
@Controller('admin/error-log')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class ErrorLogController {
  constructor(private readonly service: ErrorLogService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar errores operativos (paginado, filtrable)',
  })
  list(
    @Query('level') level?: string,
    @Query('module') moduleName?: string,
    @Query('resolved') resolved?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      level,
      module: moduleName,
      resolved:
        resolved === undefined ? undefined : resolved === 'true' ? true : false,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Patch(':id/resolve')
  @ApiOperation({
    summary: 'Marcar entrada como resuelta (audit: actor + fecha)',
  })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.markResolved(id, req.user.id);
  }
}
