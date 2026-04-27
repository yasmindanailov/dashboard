import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { AuditService } from './audit.service';

/**
 * AuditController — portal transparencia cliente (Sprint 9 Fase E +
 * ADR-017 + ADR-010 RGPD).
 *
 * Endpoint cliente (compartido — el rol determina qué ve, no la URL):
 *  - `GET /api/v1/audit/access` — el caller ve filas donde un staff
 *    accedió a SUS datos personales/financieros.
 *
 * NUNCA devuelve accesos cuyo `target_user_id` no sea el caller.
 * Filtro de ownership aplicado server-side, no opcional.
 */
@ApiTags('Audit / Transparency')
@ApiBearerAuth()
@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('access')
  @ApiOperation({
    summary: 'Listar accesos staff a tus datos (portal transparencia RGPD)',
  })
  async myAccessLog(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Filtro ownership: solo accesos cuyo `metadata.target_user_id`
    // coincida con el caller. Combina con `action='read'` para excluir
    // los registros legacy de `auth.*` (login_failed, etc.) que
    // contaminarían la vista del cliente.
    const result = await this.auditService.findAccessLog({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      action: 'read',
    });
    const callerId = req.user.id;
    const filtered = result.data.filter(
      (entry) =>
        entry.metadata &&
        typeof entry.metadata === 'object' &&
        (entry.metadata as Record<string, unknown>).target_user_id === callerId,
    );
    return {
      data: filtered,
      meta: {
        ...result.meta,
        total: filtered.length,
        // Nota: total real != total filtrado. El cliente ve sólo lo suyo.
        // Sprint 9.5 podrá implementar paginación con filter SQL nativo
        // (jsonb GIN index) para mayor eficiencia.
      },
    };
  }
}
