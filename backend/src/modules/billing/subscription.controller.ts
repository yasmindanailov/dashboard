import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { SubscriptionPlanChangeService } from './subscription-plan-change.service';
import { ConfirmPlanChangeDto } from './dto/plan-change.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';

/** Roles staff que pueden operar sobre servicios de cualquier cliente. */
const ADMIN_ROLES = ['superadmin', 'agent_full', 'agent_billing'];

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SubscriptionController {
  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly planChangeService: SubscriptionPlanChangeService,
  ) {}

  /* ═══════════════════════════════════════
     PAUSE / RESUME
     ═══════════════════════════════════════ */

  // HIGH-2 (auditoría 2026-06-21): pause/resume son acciones del CLIENTE sobre SU
  // propio servicio. El dueño se resuelve del JWT (`req.user.id`), NUNCA de un query
  // param — antes `@Query('userId')` permitía a cualquier usuario autenticado pausar
  // el servicio de otro pasando `?userId=<víctima>` (IDOR horizontal / DoS).
  @Patch(':id/pause')
  @ApiOperation({ summary: 'Pause subscription (client action)' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.subscriptionService.pauseService(id, req.user.id);
  }

  @Patch(':id/resume')
  @ApiOperation({ summary: 'Resume paused subscription' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.subscriptionService.resumeService(id, req.user.id);
  }

  /* ═══════════════════════════════════════
     CHANGE PLAN — prorrateo de ciclo (ADR-029)
     ═══════════════════════════════════════ */

  /**
   * Planes (ciclos) a los que el servicio puede cambiar — para el picker (R5).
   */
  @Get(':id/change-plan/options')
  @ApiOperation({ summary: 'List plans a service can switch to' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  planChangeOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.planChangeService.listPlanOptions(id, req.user.id, isAdmin);
  }

  /**
   * Preview del prorrateo (R5: el cliente ve el desglose antes de confirmar).
   * El dueño se resuelve del JWT (`req.user.id`); staff puede previsualizar
   * cualquier servicio.
   */
  @Get(':id/change-plan/preview')
  @ApiOperation({ summary: 'Preview proration for a plan (cycle) change' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  previewPlanChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('newPricingId', ParseUUIDPipe) newPricingId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.planChangeService.previewPlanChange(
      id,
      newPricingId,
      req.user.id,
      isAdmin,
    );
  }

  /**
   * Confirma el cambio de plan. El importe se recalcula server-side (R5); el
   * dueño se resuelve del JWT (nunca de un query param).
   */
  @Post(':id/change-plan')
  @ApiOperation({ summary: 'Confirm plan (cycle) change with proration' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  confirmPlanChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmPlanChangeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = ADMIN_ROLES.includes(req.user.role.slug);
    return this.planChangeService.confirmPlanChange(
      id,
      dto.newPricingId,
      req.user.id,
      isAdmin,
    );
  }
}
