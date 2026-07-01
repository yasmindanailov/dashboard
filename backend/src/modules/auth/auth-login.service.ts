import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EmailService } from '../../core/email/email.service';
import { twoFactorCodeTemplate } from '../../core/email/templates/auth.templates';
import { LoginDto, Verify2faDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { AuthTokenService } from './auth-token.service';
import { ROLES_REQUIRING_2FA } from './auth.constants';
import { Prisma } from '@prisma/client';

/** Usuario con su rol incluido — devuelto por findUnique({ include: { role } }). */
type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

/* ═══════════════════════════════════════
   AuthLoginService — Login + 2FA
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class AuthLoginService {
  private readonly logger = new Logger('AuthLoginService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    private readonly email: EmailService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async login(dto: LoginDto, ip: string, userAgent?: string) {
    dto.email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Check block
    if (user.blocked_until && user.blocked_until > new Date()) {
      const minutesLeft = Math.ceil(
        (user.blocked_until.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Cuenta bloqueada temporalmente. Inténtalo en ${minutesLeft} minutos.`,
      );
    }

    // Check pending_verification
    if (user.status === 'pending_verification') {
      throw new ForbiddenException(
        'Debes verificar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.',
      );
    }

    if (user.status === 'blocked') {
      throw new ForbiddenException(
        'Tu cuenta ha sido bloqueada. Contacta con soporte.',
      );
    }
    if (user.status === 'inactive') {
      throw new ForbiddenException('Tu cuenta está inactiva.');
    }

    // Verify password
    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      await this.handleFailedLogin(user.id, ip, userAgent);
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Reset login attempts
    await this.prisma.user.update({
      where: { id: user.id },
      data: { login_attempts: 0, blocked_until: null },
    });

    // 2FA requerido por rol (ADR-013) o activado opt-in (ADR-013 Amendment A1).
    if (
      ROLES_REQUIRING_2FA.includes(user.role.slug) ||
      user.two_factor_enabled
    ) {
      return this.initiate2fa(user, ip);
    }

    return this.tokenService.issueTokens(user, ip, userAgent);
  }

  async verify2fa(dto: Verify2faDto, ip: string, userAgent?: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(dto.temp_token);
    } catch {
      throw new UnauthorizedException(
        'Token expirado. Inicia sesión de nuevo.',
      );
    }

    if (payload.type !== 'temp_2fa') {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || !user.two_factor_secret) {
      throw new UnauthorizedException('Código inválido');
    }

    const codeHash = this.tokenService.hashToken(dto.code);
    if (codeHash !== user.two_factor_secret) {
      throw new UnauthorizedException('Código incorrecto');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { two_factor_secret: null },
    });

    return this.tokenService.issueTokens(user, ip, userAgent);
  }

  /**
   * Reenvía el código 2FA (F4·W3 Auth). Verifica el `temp_token` emitido por
   * `initiate2fa` (paso credenciales OK), y regenera + reenvía un código nuevo,
   * devolviendo un `temp_token` fresco (ventana renovada). NO revalida la
   * contraseña: el temp_token ya prueba que el paso de credenciales se superó
   * (firmado por nosotros, expira). El rate-limit (R10) lo aplica el controller.
   */
  async resend2fa(tempToken: string, ip: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(tempToken);
    } catch {
      throw new UnauthorizedException(
        'Token expirado. Inicia sesión de nuevo.',
      );
    }
    if (payload.type !== 'temp_2fa') {
      throw new UnauthorizedException('Token inválido');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException('Token inválido');
    }
    // Reusa la maquinaria de generación+envío del código (mismo molde que login).
    return this.initiate2fa(user, ip);
  }

  /* ─── Private ─── */

  // ip recibido pero no usado todavía — pendiente registrar IP del intento
  // 2FA en LoginAttempt cuando se implemente la auditoría completa.
  private async initiate2fa(user: UserWithRole, _ip: string) {
    const code = this.tokenService.generate2FACode();
    const codeHash = this.tokenService.hashToken(code);
    const expiresMinutes = await this.settings.getNumber(
      'auth',
      'two_factor_code_expires_minutes',
      5,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: { two_factor_secret: codeHash, two_factor_enabled: true },
    });

    const tpl = twoFactorCodeTemplate(user.first_name, code);
    await this.email.send({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
    });

    const tempToken = this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role.slug,
        type: 'temp_2fa',
        jti: crypto.randomUUID(),
      } as JwtPayload,
      { expiresIn: `${expiresMinutes}m` },
    );

    this.events.emit('auth.2fa_required', { userId: user.id });

    return {
      requires_2fa: true,
      temp_token: tempToken,
      message: 'Código de verificación enviado a tu email',
    };
  }

  private async handleFailedLogin(
    userId: string,
    ip: string,
    userAgent?: string,
  ) {
    const maxAttempts = await this.settings.getNumber(
      'auth',
      'max_login_attempts',
      5,
    );
    const blockMinutes = await this.settings.getNumber(
      'auth',
      'block_duration_minutes',
      15,
    );

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const attempts = user.login_attempts + 1;
    const updateData: Prisma.UserUpdateInput = { login_attempts: attempts };

    if (attempts >= maxAttempts) {
      updateData.blocked_until = new Date(Date.now() + blockMinutes * 60_000);
      this.events.emit('auth.account_blocked', { userId, attempts });
      this.logger.warn(
        `Account blocked: ${user.email} after ${attempts} attempts`,
      );
    }

    await this.prisma.user.update({ where: { id: userId }, data: updateData });

    await this.prisma.auditAccessLog.create({
      data: {
        user_id: userId,
        action: 'login_failed',
        ip_address: ip,
        user_agent: userAgent,
        metadata: { attempt: attempts, max: maxAttempts },
      },
    });

    this.events.emit('auth.login_failed', { userId, attempt: attempts });
  }
}
