import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';

import { AccountDeletionService } from './account-deletion.service';
import { RejectAccountDeletionDto } from './dto/account-deletion.dto';

/**
 * AccountDeletionAdminController — revisión y ejecución de solicitudes de borrado
 * de cuenta (derecho al olvido RGPD, audit 2026-06-25 GL-5 / H3b.2).
 *
 * Triple-guard como el resto de superficie admin sensible (espejo de
 * AdminSettingsController): JWT → staff (`AdminOnlyGuard`) → CASL
 * (`Manage AccountDeletion`). Solo `superadmin` lo tiene (vía `Manage All`); el
 * resto de staff queda denegado por defecto — la anonimización es irreversible.
 */
@ApiTags('Admin · Account Deletion')
@Controller('admin/account-deletion-requests')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
@ApiBearerAuth()
export class AccountDeletionAdminController {
  constructor(private readonly deletion: AccountDeletionService) {}

  @Get()
  @CheckPolicies((ability) =>
    ability.can(Action.Manage, Subject.AccountDeletion),
  )
  @ApiOperation({
    summary:
      'Lista solicitudes de borrado (con bloqueadores) — default pending',
  })
  list(@Query('status') status?: string) {
    return this.deletion.listRequests(status);
  }

  @Post(':id/reject')
  @CheckPolicies((ability) =>
    ability.can(Action.Manage, Subject.AccountDeletion),
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rechaza una solicitud pendiente (con nota)' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAccountDeletionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.deletion.rejectRequest(id, req.user.id, dto.note);
  }

  @Post(':id/execute')
  @CheckPolicies((ability) =>
    ability.can(Action.Manage, Subject.AccountDeletion),
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ejecuta el borrado: anonimiza (si no hay servicios vivos / impagos)',
  })
  execute(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.deletion.executeRequest(id, req.user.id);
  }
}
