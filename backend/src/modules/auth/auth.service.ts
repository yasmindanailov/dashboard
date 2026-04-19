import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EmailService } from '../../core/email/email.service';
import {
  verifyEmailTemplate,
  twoFactorCodeTemplate,
  passwordResetTemplate,
  welcomeTemplate,
} from '../../core/email/templates/auth.templates';
import { RegisterDto, LoginDto, Verify2faDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { RoleSlug } from '@prisma/client';

// Roles that require 2FA
const ROLES_REQUIRING_2FA: RoleSlug[] = [
  RoleSlug.superadmin,
  RoleSlug.agent_full,
  RoleSlug.agent_billing,
  RoleSlug.agent_support,
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger('AuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    private readonly email: EmailService,
  ) {}

  /* ═══════════════════════════════════════
     REGISTER
     ═══════════════════════════════════════ */
  async register(dto: RegisterDto, ip: string, userAgent?: string) {
    // Normalize email to lowercase
    dto.email = dto.email.toLowerCase().trim();

    // Check if email already exists
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con este email');
    }

    // Get client role
    const clientRole = await this.prisma.role.findUnique({ where: { slug: RoleSlug.client } });
    if (!clientRole) throw new Error('Client role not found in database');

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create user with pending_verification status
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password_hash: passwordHash,
        first_name: dto.first_name,
        last_name: dto.last_name,
        status: 'pending_verification',
        role_id: clientRole.id,
      },
    });

    // Create empty client profile (CRM ficha)
    await this.prisma.clientProfile.create({
      data: { user_id: user.id },
    });

    // Generate verification token
    await this.createEmailVerification(user.id);

    // Audit log
    await this.prisma.auditAccessLog.create({
      data: {
        user_id: user.id,
        action: 'register',
        ip_address: ip,
        user_agent: userAgent,
      },
    });

    // Emit event
    this.events.emit('auth.registered', { userId: user.id, email: user.email });

    return {
      message: 'Cuenta creada. Revisa tu email para verificar tu cuenta.',
      user_id: user.id,
    };
  }

  /* ═══════════════════════════════════════
     LOGIN — Step 1
     ═══════════════════════════════════════ */
  async login(dto: LoginDto, ip: string, userAgent?: string) {
    // Normalize email to lowercase
    dto.email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    if (!user) {
      // Don't reveal if email exists
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Check block
    if (user.blocked_until && user.blocked_until > new Date()) {
      const minutesLeft = Math.ceil((user.blocked_until.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Cuenta bloqueada temporalmente. Inténtalo en ${minutesLeft} minutos.`,
      );
    }

    // Check pending_verification — direct registration (no purchase) cannot login
    if (user.status === 'pending_verification') {
      throw new ForbiddenException(
        'Debes verificar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.',
      );
    }

    // Check inactive/blocked status
    if (user.status === 'blocked') {
      throw new ForbiddenException('Tu cuenta ha sido bloqueada. Contacta con soporte.');
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

    // Reset login attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: { login_attempts: 0, blocked_until: null },
    });

    // Check if 2FA is required
    if (ROLES_REQUIRING_2FA.includes(user.role.slug)) {
      const code = this.generate2FACode();
      const codeHash = this.hashToken(code);
      const expiresMinutes = await this.settings.getNumber('auth', 'two_factor_code_expires_minutes', 5);

      // Store 2FA code
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          two_factor_secret: codeHash,
          two_factor_enabled: true,
        },
      });

      // Send 2FA code by email
      const tpl = twoFactorCodeTemplate(user.first_name, code);
      await this.email.send({ to: user.email, subject: tpl.subject, html: tpl.html });

      // Generate temporary token for 2FA step
      const tempToken = this.jwt.sign(
        { sub: user.id, email: user.email, role: user.role.slug, type: 'temp_2fa' } as JwtPayload,
        { expiresIn: `${expiresMinutes}m` },
      );

      this.events.emit('auth.2fa_required', { userId: user.id });

      return {
        requires_2fa: true,
        temp_token: tempToken,
        message: 'Código de verificación enviado a tu email',
      };
    }

    // No 2FA — issue tokens directly
    return this.issueTokens(user, ip, userAgent);
  }

  /* ═══════════════════════════════════════
     VERIFY 2FA — Step 2
     ═══════════════════════════════════════ */
  async verify2fa(dto: Verify2faDto, ip: string, userAgent?: string) {
    // Decode temp token
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(dto.temp_token);
    } catch {
      throw new UnauthorizedException('Token expirado. Inicia sesión de nuevo.');
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

    // Verify code
    const codeHash = this.hashToken(dto.code);
    if (codeHash !== user.two_factor_secret) {
      throw new UnauthorizedException('Código incorrecto');
    }

    // Clear 2FA secret (single use)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { two_factor_secret: null },
    });

    return this.issueTokens(user, ip, userAgent);
  }

  /* ═══════════════════════════════════════
     REFRESH TOKEN
     ═══════════════════════════════════════ */
  async refresh(refreshToken: string, ip: string) {
    // Verify JWT
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token inválido');
    }

    // Find session by refresh hash
    const refreshHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refresh_hash: refreshHash },
    });

    if (!session || !session.is_active) {
      throw new UnauthorizedException('Sesión no encontrada o revocada');
    }

    // Load user
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || user.status === 'blocked' || user.status === 'inactive') {
      throw new UnauthorizedException('Usuario no válido');
    }

    // Generate new access token
    const accessExpiresMin = await this.settings.getNumber('auth', 'access_token_expires_minutes', 15);
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role.slug, type: 'access' } as JwtPayload,
      { expiresIn: `${accessExpiresMin}m` },
    );

    // Update session last_used
    await this.prisma.session.update({
      where: { id: session.id },
      data: { last_used_at: new Date(), ip_address: ip },
    });

    return { access_token: accessToken, expires_in: accessExpiresMin * 60 };
  }

  /* ═══════════════════════════════════════
     LOGOUT
     ═══════════════════════════════════════ */
  async logout(userId: string, accessToken: string) {
    const tokenHash = this.hashToken(accessToken);

    // Try to find and deactivate the session
    await this.prisma.session.updateMany({
      where: { user_id: userId, is_active: true, token_hash: tokenHash },
      data: { is_active: false },
    });

    this.events.emit('auth.session_closed', { userId });
    return { message: 'Sesión cerrada correctamente' };
  }

  /* ═══════════════════════════════════════
     EMAIL VERIFICATION
     ═══════════════════════════════════════ */
  async verifyEmail(token: string) {
    const tokenHash = this.hashToken(token);

    const verification = await this.prisma.emailVerification.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!verification) {
      throw new BadRequestException('Token de verificación inválido');
    }

    if (verification.used_at) {
      throw new BadRequestException('Este enlace ya fue utilizado');
    }

    if (verification.expires_at < new Date()) {
      throw new BadRequestException('El enlace ha expirado. Solicita uno nuevo.');
    }

    // Mark as used and activate user
    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { used_at: new Date() },
      }),
      this.prisma.user.update({
        where: { id: verification.user_id },
        data: {
          email_verified_at: new Date(),
          status: 'active',
        },
      }),
    ]);

    this.events.emit('auth.email_verified', { userId: verification.user_id });

    // Send welcome email
    const user = await this.prisma.user.findUnique({ where: { id: verification.user_id } });
    if (user) {
      const appUrl = this.config.get<string>('NEXT_PUBLIC_APP_URL', 'http://localhost:3002');
      const tpl = welcomeTemplate(user.first_name, appUrl);
      await this.email.send({ to: user.email, subject: tpl.subject, html: tpl.html });
    }

    return { message: 'Email verificado correctamente. Ya puedes iniciar sesión.' };
  }

  async resendVerification(email: string) {
    // Normalize email to lowercase
    email = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Don't reveal if email exists
      return { message: 'Si el email existe, recibirás un enlace de verificación.' };
    }

    if (user.email_verified_at) {
      return { message: 'Tu email ya está verificado.' };
    }

    await this.createEmailVerification(user.id);
    return { message: 'Si el email existe, recibirás un enlace de verificación.' };
  }

  /* ═══════════════════════════════════════
     PASSWORD RESET
     ═══════════════════════════════════════ */
  async forgotPassword(email: string, ip: string) {
    // Normalize email to lowercase
    email = email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always return same message (don't reveal if email exists)
    const response = { message: 'Si el email existe, recibirás instrucciones para resetear tu contraseña.' };

    if (!user) return response;

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresHours = await this.settings.getNumber('auth', 'password_reset_expires_hours', 1);

    // Invalidate any pending reset tokens for this user
    await this.prisma.passwordReset.updateMany({
      where: { user_id: user.id, used_at: null },
      data: { used_at: new Date() },
    });

    await this.prisma.passwordReset.create({
      data: {
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + expiresHours * 3600_000),
        ip_address: ip,
      },
    });

    // Send password reset email
    const appUrl = this.config.get<string>('NEXT_PUBLIC_APP_URL', 'http://localhost:3002');
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    const tpl = passwordResetTemplate(user.first_name, resetUrl);
    await this.email.send({ to: user.email, subject: tpl.subject, html: tpl.html });

    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.hashToken(dto.token);

    const reset = await this.prisma.passwordReset.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!reset) {
      throw new BadRequestException('Token inválido');
    }

    if (reset.used_at) {
      throw new BadRequestException('Este enlace ya fue utilizado');
    }

    if (reset.expires_at < new Date()) {
      throw new BadRequestException('El enlace ha expirado. Solicita uno nuevo.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    await this.prisma.$transaction([
      this.prisma.passwordReset.update({
        where: { id: reset.id },
        data: { used_at: new Date() },
      }),
      this.prisma.user.update({
        where: { id: reset.user_id },
        data: { password_hash: passwordHash },
      }),
      // Revoke all active sessions (security: force re-login)
      this.prisma.session.updateMany({
        where: { user_id: reset.user_id, is_active: true },
        data: { is_active: false },
      }),
    ]);

    this.events.emit('auth.password_reset', { userId: reset.user_id });

    return { message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' };
  }

  /* ═══════════════════════════════════════
     SESSIONS
     ═══════════════════════════════════════ */
  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { user_id: userId, is_active: true },
      select: {
        id: true,
        ip_address: true,
        device_label: true,
        user_agent: true,
        last_used_at: true,
        created_at: true,
      },
      orderBy: { last_used_at: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.session.findFirst({
      where: { id: sessionId, user_id: userId, is_active: true },
    });

    if (!session) {
      throw new BadRequestException('Sesión no encontrada');
    }

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { is_active: false },
    });

    this.events.emit('auth.session_closed', { userId, sessionId });
    return { message: 'Sesión cerrada' };
  }

  /* ═══════════════════════════════════════
     GET ME (profile)
     ═══════════════════════════════════════ */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        status: true,
        email_verified_at: true,
        avatar_url: true,
        language: true,
        timezone: true,
        last_login_at: true,
        created_at: true,
        role: {
          select: { slug: true, name: true },
        },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  /* ═══════════════════════════════════════
     PRIVATE HELPERS
     ═══════════════════════════════════════ */
  private async issueTokens(
    user: {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      status: string;
      last_login_at: Date | null;
      role: { slug: RoleSlug; name: string };
    },
    ip: string,
    userAgent?: string,
  ) {
    const accessExpiresMin = await this.settings.getNumber('auth', 'access_token_expires_minutes', 15);
    const refreshExpiresDays = await this.settings.getNumber('auth', 'refresh_token_expires_days', 7);

    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.slug,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.slug,
      type: 'refresh',
    };

    const accessToken = this.jwt.sign(accessPayload, {
      expiresIn: `${accessExpiresMin}m`,
    });

    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: `${refreshExpiresDays}d`,
    });

    // Store session
    await this.prisma.session.create({
      data: {
        user_id: user.id,
        token_hash: this.hashToken(accessToken),
        refresh_hash: this.hashToken(refreshToken),
        ip_address: ip,
        user_agent: userAgent,
        device_label: this.parseDeviceLabel(userAgent),
        expires_at: new Date(Date.now() + refreshExpiresDays * 86400_000),
      },
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), last_login_ip: ip },
    });

    // Audit log
    await this.prisma.auditAccessLog.create({
      data: {
        user_id: user.id,
        action: 'login_success',
        ip_address: ip,
        user_agent: userAgent,
      },
    });

    this.events.emit('auth.login_success', { userId: user.id });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: accessExpiresMin * 60,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        status: user.status,
        role: {
          slug: user.role.slug,
          name: user.role.name,
        },
        last_login_at: user.last_login_at,
      },
    };
  }

  private async handleFailedLogin(userId: string, ip: string, userAgent?: string) {
    const maxAttempts = await this.settings.getNumber('auth', 'max_login_attempts', 5);
    const blockMinutes = await this.settings.getNumber('auth', 'block_duration_minutes', 15);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const attempts = user.login_attempts + 1;
    const updateData: any = { login_attempts: attempts };

    if (attempts >= maxAttempts) {
      updateData.blocked_until = new Date(Date.now() + blockMinutes * 60_000);
      this.events.emit('auth.account_blocked', { userId, attempts });
      this.logger.warn(`Account blocked: ${user.email} after ${attempts} attempts`);
    }

    await this.prisma.user.update({ where: { id: userId }, data: updateData });

    // Audit log
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

  private async createEmailVerification(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const expiresHours = await this.settings.getNumber('auth', 'email_verification_expires_hours', 24);

    // Invalidate any pending verification tokens for this user
    await this.prisma.emailVerification.updateMany({
      where: { user_id: userId, used_at: null },
      data: { used_at: new Date() },
    });

    await this.prisma.emailVerification.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + expiresHours * 3600_000),
      },
    });

    // Send verification email
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const appUrl = this.config.get<string>('NEXT_PUBLIC_APP_URL', 'http://localhost:3002');
      const verifyUrl = `${appUrl}/verify-email?token=${token}`;
      const tpl = verifyEmailTemplate(user.first_name, verifyUrl);
      await this.email.send({ to: user.email, subject: tpl.subject, html: tpl.html });
    }
    return token;
  }

  private generate2FACode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseDeviceLabel(userAgent?: string): string {
    if (!userAgent) return 'Unknown';
    if (userAgent.includes('Mobile')) return 'Mobile';
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac')) return 'Mac';
    if (userAgent.includes('Linux')) return 'Linux';
    return 'Browser';
  }
}
