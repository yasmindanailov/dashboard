import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { PoliciesGuard } from '../casl/policies.guard';
import { CheckPolicies } from '../casl/check-policies.decorator';
import { Action, Subject } from '../casl/permissions';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { PrismaService } from '../database/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { RetryService } from './retry.service';

/**
 * JobsController — Sprint 9 Fase F (DC.7 + ADR-063 §UI admin + R13)
 * + granularidad CASL Sprint 9.6 (ADR-067).
 *
 * Bajo `/api/v1/admin/jobs` con triple guard (defense in depth, ADR-067 §4):
 *  1. `JwtAuthGuard` — usuario autenticado.
 *  2. `AdminOnlyGuard` — rol staff (corte temprano antes de CASL).
 *  3. `PoliciesGuard` — evalúa `@CheckPolicies(Manage Job)`.
 *
 * Sólo `superadmin` tiene `Manage Job` (regla wildcard `Manage All`). Reintentar
 * un job de DLQ re-ejecuta side effects (emails, PDFs, integraciones) — debe
 * estar restringido al rol con visión global.
 *
 * Endpoints:
 *  - `GET /admin/jobs/failed` — paginado de filas `failed_jobs` (post-mortem
 *    persistente de jobs BullMQ que agotaron retries).
 *  - `POST /admin/jobs/:id/retry` — reencola el job vía `RetryService`.
 *    El job entra como nuevo en su cola original con `attempts=5` reseteado.
 *    Audit trail: `retried_at` + `retried_by`.
 */
@ApiTags('Admin / Jobs')
@ApiBearerAuth()
@Controller('admin/jobs')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class JobsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly retryService: RetryService,
  ) {}

  @Get('failed')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Job))
  @ApiOperation({ summary: 'Listar jobs en DLQ (failed_jobs paginado)' })
  async listFailed(
    @Query('queue') queue?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const where: Prisma.FailedJobWhereInput = {};
    if (queue) where.queue = queue;
    if (status === 'failed' || status === 'retrying' || status === 'resolved') {
      where.status = status;
    }
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = Math.min(limit ? parseInt(limit, 10) : 50, 200);

    const [items, total] = await Promise.all([
      this.prisma.failedJob.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        select: {
          id: true,
          bull_job_id: true,
          queue: true,
          name: true,
          last_error: true,
          attempts_made: true,
          status: true,
          retried_at: true,
          retried_by: true,
          created_at: true,
        },
      }),
      this.prisma.failedJob.count({ where }),
    ]);

    return paginate(items, total, pageNum, limitNum);
  }

  @Post(':id/retry')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Job))
  @ApiOperation({ summary: 'Reintentar job de DLQ manualmente' })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.retryService.retry(id, req.user.id);
  }
}
