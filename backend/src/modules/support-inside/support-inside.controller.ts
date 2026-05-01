import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { SupportInsideService } from './support-inside.service';
import {
  AddSlotDto,
  CancelSupportInsideDto,
  SubscribeSupportInsideDto,
} from './dto/support-inside.dto';

/**
 * SupportInsideController — Sprint 8 Fase D (cliente).
 *
 * Endpoints bajo `/api/v1/dashboard/support-inside` que el cliente usa
 * desde la página `/dashboard/support-inside` (ADR-061). Ownership la
 * enforza cada handler usando `req.user.id` — el cliente NUNCA opera
 * sobre subscriptions de otro cliente.
 *
 * Triple guard: JwtAuthGuard + PoliciesGuard con `Read.SupportInside` /
 * `Update.SupportInside` según operación.
 */
@ApiTags('Dashboard / Support Inside')
@ApiBearerAuth()
@Controller('dashboard/support-inside')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SupportInsideController {
  constructor(private readonly service: SupportInsideService) {}

  @Get('status')
  @CheckPolicies((ability) => ability.can(Action.Read, Subject.SupportInside))
  @ApiOperation({
    summary: 'Estado de la suscripción Support Inside del cliente actual',
  })
  getStatus(@Req() req: AuthenticatedRequest) {
    return this.service.getStatus(req.user.id);
  }

  @Post('subscribe')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.SupportInside))
  @ApiOperation({ summary: 'Suscribir al cliente al plan elegido' })
  subscribe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubscribeSupportInsideDto,
  ) {
    return this.service.subscribe(req.user.id, dto);
  }

  @Post('upgrade')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.SupportInside))
  @ApiOperation({
    summary:
      'Cambiar de plan (MVP Sprint 8: rechaza con mensaje accionable — ADR-029 prorrateo pendiente)',
  })
  upgrade(
    @Req() req: AuthenticatedRequest,
    @Body() dto: { new_product_pricing_id: string },
  ) {
    return this.service.upgrade(req.user.id, dto);
  }

  @Delete('subscription')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.SupportInside))
  @ApiOperation({
    summary: 'Cancelar suscripción Support Inside (cascada de slots, ADR-034)',
  })
  cancel(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CancelSupportInsideDto,
  ) {
    return this.service.cancel(req.user.id, dto);
  }

  @Post('slots')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.SupportInside))
  @ApiOperation({ summary: 'Asignar un slot a un servicio del cliente' })
  addSlot(@Req() req: AuthenticatedRequest, @Body() dto: AddSlotDto) {
    return this.service.addSlot(req.user.id, dto);
  }

  @Delete('slots/:id')
  @CheckPolicies((ability) => ability.can(Action.Update, Subject.SupportInside))
  @ApiOperation({ summary: 'Liberar un slot Support Inside' })
  releaseSlot(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.releaseSlot(req.user.id, id);
  }
}
