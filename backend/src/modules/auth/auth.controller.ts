import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../core/common/types/authenticated-request';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  RegisterDto,
  LoginDto,
  Verify2faDto,
  VerifyEmailDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import {
  Action,
  ROLE_PERMISSIONS,
  SIDEBAR_PERMISSIONS,
} from '../../core/casl/permissions';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new client account' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(
      dto,
      this.getIp(req),
      req.headers['user-agent'],
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login — returns tokens or 2FA challenge' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(
      dto,
      this.getIp(req),
      req.headers['user-agent'],
    );
  }

  @Post('verify-2fa')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA code (step 2 of login)' })
  async verify2fa(@Body() dto: Verify2faDto, @Req() req: Request) {
    return this.authService.verify2fa(
      dto,
      this.getIp(req),
      req.headers['user-agent'],
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(@Req() req: Request) {
    // Read refresh token from cookie or body. Express tipa cookies/body como
    // `any` por defecto — narrowing manual para satisfacer no-unsafe-*.
    const cookies = req.cookies as Record<string, string> | undefined;
    const body = req.body as { refresh_token?: string } | undefined;
    const refreshToken = cookies?.refresh_token ?? body?.refresh_token;
    if (!refreshToken) {
      throw new Error('Refresh token not provided');
    }
    return this.authService.refresh(refreshToken, this.getIp(req));
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout — revoke current session' })
  async logout(@Req() req: AuthenticatedRequest) {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    return this.authService.logout(req.user.id, token);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token from link' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link' })
  async resendVerification(@Body() dto: ForgotPasswordDto) {
    return this.authService.resendVerification(dto.email);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto.email, this.getIp(req));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions for current user' })
  async getSessions(@Req() req: AuthenticatedRequest) {
    return this.authService.getSessions(req.user.id);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.authService.revokeSession(req.user.id, id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.id);
  }

  /**
   * Sprint 13.5 Fase E (DC.15) — fuente única de verdad para los
   * permisos del usuario actual. El frontend cacheaba hasta este sprint
   * la matriz `SIDEBAR_PERMISSIONS` duplicada en `frontend/app/lib/
   * permissions.ts` con riesgo de drift respecto al backend; ahora lee
   * este endpoint al login y la cachea en `AuthContext`.
   *
   * Devuelve sólo lo que el rol del usuario tiene — NO la matriz global,
   * para no exponer la estructura completa de Subjects/Actions a roles
   * inferiores. El payload está pensado para uso UI (sidebar items +
   * sub-página per-Subject).
   */
  @Get('me/permissions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Permisos del usuario actual (Subjects visibles en sidebar + Actions por Subject). Sprint 13.5 DC.15.',
  })
  getMyPermissions(@Req() req: AuthenticatedRequest) {
    const roleSlug = req.user.role.slug;
    const sidebarSubjects = SIDEBAR_PERMISSIONS[roleSlug] ?? [];

    // Calcula Actions por Subject a partir de ROLE_PERMISSIONS. Para roles
    // con conditions/fields/inverted, devuelve la lista de Actions que el
    // rol tiene declaradas (la condición server-side se preserva en los
    // endpoints; el frontend sólo necesita saber QUÉ puede hacer, no QUÉ
    // condiciones aplican).
    const rules = ROLE_PERMISSIONS[roleSlug]
      ? ROLE_PERMISSIONS[roleSlug](
          req.user.id,
          req.user.partner_id ?? undefined,
        )
      : [];

    const actionsBySubject: Record<string, Action[]> = {};
    for (const rule of rules) {
      if (rule.inverted) continue; // las exclusiones no se exponen
      const subjectKey = String(rule.subject);
      const actions = Array.isArray(rule.action) ? rule.action : [rule.action];
      const existing = actionsBySubject[subjectKey] ?? [];
      const merged = Array.from(new Set([...existing, ...actions]));
      actionsBySubject[subjectKey] = merged;
    }

    // Subjects visibles del sidebar (subset filtrado del global) +
    // matriz de actions por subject. El frontend renderiza items con
    // `sidebar_subjects.includes(item.requiredModule)` y comprueba
    // permisos de acción con `actions_by_subject[subject].includes(action)`.
    return {
      role: roleSlug,
      sidebar_subjects: sidebarSubjects.map((s) => String(s)),
      actions_by_subject: actionsBySubject,
      // Subjects que aparecen en alguna regla pero NO en el sidebar:
      // útil para que el frontend permita acciones específicas sobre
      // Subjects no-navegables (ej. `Subject.Profile`).
      all_subjects_with_rules: Object.keys(actionsBySubject),
    };
  }

  private getIp(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      '0.0.0.0'
    );
  }
}
