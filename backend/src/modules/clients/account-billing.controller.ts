import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { ClientsBillingService } from './clients-billing.service';
import {
  CreateBillingProfileDto,
  UpdateBillingProfileDto,
} from './dto/billing-profile.dto';

/**
 * AccountBillingController — perfiles de facturación **self-service** (ADR-085).
 *
 * Espejo self-scoped del CRUD admin de `ClientsController` (`/admin/clients/:id/
 * billing-profiles`): aquí el `userId` viene SIEMPRE de `req.user.id` (JWT),
 * nunca de un parámetro de ruta → sin IDOR. Reutiliza `ClientsBillingService`,
 * que ya valida la propiedad (`profile.user_id !== userId` → 404) en cada método.
 *
 * CASL: el rol `client` tiene `Manage` sobre `Subject.BillingProfile`
 * (permissions.ts: "guard allows, controller enforces user_id ownership").
 */
@ApiTags('Account')
@Controller('account/billing-profiles')
@UseGuards(JwtAuthGuard, PoliciesGuard)
@ApiBearerAuth()
export class AccountBillingController {
  constructor(private readonly billing: ClientsBillingService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.List, Subject.BillingProfile))
  @ApiOperation({ summary: 'Lista mis perfiles de facturación' })
  list(@Req() req: AuthenticatedRequest) {
    return this.billing.getBillingProfiles(req.user.id);
  }

  @Post()
  @CheckPolicies((ability) =>
    ability.can(Action.Create, Subject.BillingProfile),
  )
  @ApiOperation({ summary: 'Crea un perfil de facturación propio' })
  create(
    @Body() dto: CreateBillingProfileDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billing.createBillingProfile(req.user.id, dto);
  }

  @Patch(':id')
  @CheckPolicies((ability) =>
    ability.can(Action.Update, Subject.BillingProfile),
  )
  @ApiOperation({ summary: 'Actualiza un perfil de facturación propio' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBillingProfileDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billing.updateBillingProfile(req.user.id, id, dto);
  }

  @Delete(':id')
  @CheckPolicies((ability) =>
    ability.can(Action.Delete, Subject.BillingProfile),
  )
  @ApiOperation({ summary: 'Elimina un perfil de facturación propio' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billing.deleteBillingProfile(req.user.id, id);
  }

  @Patch(':id/default')
  @CheckPolicies((ability) =>
    ability.can(Action.Update, Subject.BillingProfile),
  )
  @ApiOperation({
    summary: 'Marca un perfil de facturación como predeterminado',
  })
  setDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.billing.setDefaultBillingProfile(req.user.id, id);
  }
}
