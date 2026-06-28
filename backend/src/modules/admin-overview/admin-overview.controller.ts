import {
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { AdminOverviewService } from './admin-overview.service';

/* ═══════════════════════════════════════════════════════════════
   AdminOverviewController — Dashboard ejecutivo `/admin` (E7).

   Bajo `/api/v1/admin/overview`, dos capas de guard (defense in depth):
     1. JwtAuthGuard  — autenticado.
     2. AdminOnlyGuard — rol staff (corta clientes/partners).
   + una tercera comprobación explícita a **rol admin** (superadmin / agent_full):
   los KPIs incluyen ingresos globales, que un agent_support/billing no debe ver.
   Los roles `agent_*` siguen viendo SU overview operativo (AgentStats) en /admin.

   Endpoints (todos read-only, agregados sobre datos existentes):
     - GET /admin/overview            → KPIs (ingresos+MoM, clientes, vencido, SLA)
     - GET /admin/overview/decisions  → feed "Requiere tu decisión"
     - GET /admin/overview/team-load  → reparto de conversaciones por agente
   ═══════════════════════════════════════════════════════════════ */

const ADMIN_ROLES = new Set(['superadmin', 'agent_full']);

@ApiTags('Admin / Overview')
@ApiBearerAuth()
@Controller('admin/overview')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AdminOverviewController {
  constructor(private readonly service: AdminOverviewService) {}

  private assertAdminRole(req: AuthenticatedRequest): void {
    if (!ADMIN_ROLES.has(req.user.role.slug)) {
      throw new ForbiddenException(
        'El panel ejecutivo requiere rol de administración.',
      );
    }
  }

  @Get()
  @ApiOperation({ summary: 'KPIs ejecutivos del panel admin (E7)' })
  getKpis(@Req() req: AuthenticatedRequest) {
    this.assertAdminRole(req);
    return this.service.getKpis();
  }

  @Get('decisions')
  @ApiOperation({
    summary: 'Feed "Requiere tu decisión" (señales de plataforma)',
  })
  getDecisions(@Req() req: AuthenticatedRequest) {
    this.assertAdminRole(req);
    return this.service.getDecisions();
  }

  @Get('team-load')
  @ApiOperation({ summary: 'Reparto de conversaciones abiertas por agente' })
  getTeamLoad(@Req() req: AuthenticatedRequest) {
    this.assertAdminRole(req);
    return this.service.getTeamLoad();
  }
}
