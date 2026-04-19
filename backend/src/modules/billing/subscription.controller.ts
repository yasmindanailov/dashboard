import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';

@ApiTags('Subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

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
    // TODO: resolve userId from JWT token
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
     PLAN CHANGE PREVIEW
     ═══════════════════════════════════════ */

  @Get(':id/change-plan/preview')
  @ApiOperation({ summary: 'Preview proration for plan change' })
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.Service))
  previewPlanChange(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('newPricingId') newPricingId: string,
  ) {
    return this.subscriptionService.previewPlanChange(id, newPricingId);
  }
}
