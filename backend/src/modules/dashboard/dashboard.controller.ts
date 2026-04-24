import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/* ═══════════════════════════════════════
   DashboardController — Role-aware overview
   GET /api/v1/dashboard/overview
   Returns role-specific stats per UI_SPEC §2.3.
   ═══════════════════════════════════════ */

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({
    summary: 'Dashboard overview — role-specific stats per §2.3',
    description: 'Returns different metrics depending on user role: admin (global), client (personal), agent (workload), partner (referrals).',
  })
  getOverview(@Req() req: Request) {
    const user = req.user as any;
    return this.dashboardService.getOverviewStats(user.id, user.role?.slug);
  }
}
