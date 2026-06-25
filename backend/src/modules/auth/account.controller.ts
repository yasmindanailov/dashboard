import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';

import { AuthService } from './auth.service';
import { AccountTransparencyService } from './account-transparency.service';
import { AccountDeletionService } from './account-deletion.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  UpdateAccountDto,
  ChangePasswordDto,
  Confirm2faDto,
} from './dto/account.dto';
import { RequestAccountDeletionDto } from './dto/account-deletion.dto';

/**
 * AccountController — superficie self-service de la cuenta del usuario
 * autenticado (ADR-085). Todo deriva el `userId` de `req.user.id` (JWT), nunca
 * de un parámetro → sin IDOR. Para LECTURA del perfil se reutiliza
 * `GET /auth/me`; para sesiones, `GET/DELETE /auth/sessions`.
 *
 * Vive en el módulo auth (sub-servicio `AuthAccountService` vía facade
 * `AuthService`). Controlador aparte de `AuthController` para respetar Regla 15.
 */
@ApiTags('Account')
@Controller('account')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AccountController {
  constructor(
    private readonly authService: AuthService,
    private readonly transparency: AccountTransparencyService,
    private readonly deletion: AccountDeletionService,
  ) {}

  /* ─── Transparencia RGPD (GL-5 / H3b.1) ─── */

  @Get('transparency')
  @ApiOperation({
    summary: 'Subprocesadores (terceros que reciben datos) — portal RGPD',
  })
  async getTransparency() {
    return { subprocessors: await this.transparency.getSubprocessors() };
  }

  @Get('data-export')
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // acción pesada: cap suave
  @ApiOperation({
    summary: 'Exporta TODOS mis datos personales en JSON (portabilidad RGPD)',
  })
  exportMyData(@Req() req: AuthenticatedRequest) {
    return this.transparency.exportForUser(req.user.id, new Date());
  }

  /* ─── Borrado de cuenta · derecho al olvido (GL-5 / H3b.2) ─── */

  @Get('deletion-request')
  @ApiOperation({ summary: 'Estado de mi solicitud de borrado de cuenta' })
  getMyDeletionRequest(@Req() req: AuthenticatedRequest) {
    return this.deletion.getMyRequest(req.user.id);
  }

  @Post('deletion-request')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicita el borrado de mi cuenta (lo revisa y ejecuta un admin)',
  })
  requestDeletion(
    @Body() dto: RequestAccountDeletionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.deletion.requestDeletion(req.user.id, dto.reason);
  }

  @Delete('deletion-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancela mi solicitud de borrado pendiente' })
  cancelDeletionRequest(@Req() req: AuthenticatedRequest) {
    return this.deletion.cancelMyRequest(req.user.id);
  }

  @Patch('profile')
  @ApiOperation({
    summary: 'Actualiza el perfil propio (nombre, idioma, zona horaria)',
  })
  updateProfile(
    @Body() dto: UpdateAccountDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.authService.updateMe(req.user.id, dto);
  }

  @Post('change-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } }) // ADR-016: acción sensible
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cambia la contraseña propia (revoca las demás sesiones)',
  })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const token = req.headers.authorization?.replace('Bearer ', '') ?? '';
    return this.authService.changePassword(req.user.id, dto, {
      ip: this.getIp(req),
      userAgent: req.headers['user-agent'],
      currentAccessToken: token,
    });
  }

  @Post('2fa/enable')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activa 2FA por email opt-in (ADR-013 A1)' })
  enable2fa(@Body() dto: Confirm2faDto, @Req() req: AuthenticatedRequest) {
    return this.authService.enable2fa(req.user.id, dto, this.ctx(req));
  }

  @Post('2fa/disable')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desactiva 2FA (bloqueado para roles con 2FA obligatorio)',
  })
  disable2fa(@Body() dto: Confirm2faDto, @Req() req: AuthenticatedRequest) {
    return this.authService.disable2fa(req.user.id, dto, this.ctx(req));
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cierra todas las sesiones activas (ADR-060 §B)' })
  logoutAll(@Req() req: AuthenticatedRequest) {
    return this.authService.logoutAll(req.user.id, this.ctx(req));
  }

  /* ─── Private ─── */

  private ctx(req: AuthenticatedRequest): {
    ip: string;
    userAgent?: string;
  } {
    return { ip: this.getIp(req), userAgent: req.headers['user-agent'] };
  }

  private getIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      '0.0.0.0'
    );
  }
}
