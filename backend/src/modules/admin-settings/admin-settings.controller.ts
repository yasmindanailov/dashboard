import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminOnlyGuard } from '../../core/common/guards/admin-only.guard';
import { PoliciesGuard } from '../../core/casl/policies.guard';
import { CheckPolicies } from '../../core/casl/check-policies.decorator';
import { Action, Subject } from '../../core/casl/permissions';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { AdminSettingsService } from './admin-settings.service';
import type { UploadedImage } from './admin-settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';

/**
 * AdminSettingsController — Sprint 12 (ADR-044).
 *
 * Bajo `/api/v1/admin/settings` con triple guard (defense in depth, ADR-067):
 *  1. `JwtAuthGuard` — usuario autenticado.
 *  2. `AdminOnlyGuard` — rol staff (corte temprano antes de CASL).
 *  3. `PoliciesGuard` — evalúa `@CheckPolicies(Manage Setting)`.
 *
 * Sólo `superadmin` tiene `Manage Setting` (regla wildcard `Manage All`); el
 * resto de staff lo tiene denegado explícito (`permissions.ts`) → 403. Editar
 * settings cambia reglas de negocio críticas (numeración de facturas, márgenes,
 * kill switches) y debe estar centralizado en el rol de visión global.
 *
 * NOTA: el sub-árbol `/admin/settings/plugins` lo sirve `AdminPluginsController`
 * (Sprint 15A, ADR-080) — este controller cubre los settings de negocio.
 */
@ApiTags('Admin / Settings')
@ApiBearerAuth()
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, AdminOnlyGuard, PoliciesGuard)
export class AdminSettingsController {
  constructor(private readonly service: AdminSettingsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Setting))
  @ApiOperation({
    summary:
      'Listar los settings de negocio configurables, agrupados por sección, con su valor actual.',
  })
  list() {
    return this.service.list();
  }

  @Get('branding/logo')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Setting))
  @ApiOperation({
    summary: 'URL firmada del logo de marca actual (o null si no hay logo).',
  })
  getBrandingLogo() {
    return this.service.getBrandingLogo();
  }

  @Post('branding/logo')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Setting))
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Subir el logo de marca (PNG/JPG) a MinIO y persistir su key en branding.logo_key.',
  })
  uploadBrandingLogo(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: UploadedImage,
  ) {
    return this.service.uploadBrandingLogo(file, req.user.id);
  }

  @Patch(':category/:key')
  @CheckPolicies((ability) => ability.can(Action.Manage, Subject.Setting))
  @ApiOperation({
    summary:
      'Actualizar un setting. Valida contra el catálogo, persiste, audita (R3) e invalida la caché.',
  })
  update(
    @Req() req: AuthenticatedRequest,
    @Param('category') category: string,
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
  ) {
    return this.service.update(category, key, dto.value, req.user.id);
  }
}
