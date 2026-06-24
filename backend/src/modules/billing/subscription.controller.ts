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

  @Patch(':id/pause')
  @ApiOperation({ summary: 'Pause subscription (client action)' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  pause(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('userId') userId: string,
  ) {
    // TODO (HIGH-2, auditoría 2026-06-21): resolver userId del JWT, no de @Query.
    return this.subscriptionService.pauseService(id, userId);
  }

  @Patch(':id/resume')
  @ApiOperation({ summary: 'Resume paused subscription' })
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.Service))
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('userId') userId: string,
  ) {
    return this.subscriptionService.resumeService(id, userId);
  }

  /* ═══════════════════════════════════════
     CHANGE PLAN — prorrateo de ciclo (ADR-029)
     ═══════════════════════════════════════ */

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
