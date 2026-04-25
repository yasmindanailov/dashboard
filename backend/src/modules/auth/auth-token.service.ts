import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { JwtPayload } from './strategies/jwt.strategy';
import { RoleSlug } from '@prisma/client';

/* ═══════════════════════════════════════
   AuthTokenService — Token issuance,
   refresh, sessions, and crypto helpers.
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class AuthTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
  ) {}

  /* ── Issue Tokens ── */
  async issueTokens(
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
    const accessExpiresMin = await this.settings.getNumber(
      'auth',
      'access_token_expires_minutes',
      15,
    );
    const refreshExpiresDays = await this.settings.getNumber(
      'auth',
      'refresh_token_expires_days',
      7,
    );

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

    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date(), last_login_ip: ip },
    });

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
        role: { slug: user.role.slug, name: user.role.name },
        last_login_at: user.last_login_at,
      },
    };
  }

  /* ── Refresh ── */
  async refresh(refreshToken: string, ip: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    if (payload.type !== 'refresh')
      throw new UnauthorizedException('Token inválido');

    const refreshHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refresh_hash: refreshHash },
    });

    if (!session || !session.is_active)
      throw new UnauthorizedException('Sesión no encontrada o revocada');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user || user.status === 'blocked' || user.status === 'inactive') {
      throw new UnauthorizedException('Usuario no válido');
    }

    const accessExpiresMin = await this.settings.getNumber(
      'auth',
      'access_token_expires_minutes',
      15,
    );
    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role.slug,
        type: 'access',
      } as JwtPayload,
      { expiresIn: `${accessExpiresMin}m` },
    );

    await this.prisma.session.update({
      where: { id: session.id },
      data: { last_used_at: new Date(), ip_address: ip },
    });

    return { access_token: accessToken, expires_in: accessExpiresMin * 60 };
  }

  /* ── Logout ── */
  async logout(userId: string, accessToken: string) {
    const tokenHash = this.hashToken(accessToken);
    await this.prisma.session.updateMany({
      where: { user_id: userId, is_active: true, token_hash: tokenHash },
      data: { is_active: false },
    });
    this.events.emit('auth.session_closed', { userId });
    return { message: 'Sesión cerrada correctamente' };
  }

  /* ── Sessions ── */
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
    if (!session) throw new BadRequestException('Sesión no encontrada');

    await this.prisma.session.update({
      where: { id: sessionId },
      data: { is_active: false },
    });
    this.events.emit('auth.session_closed', { userId, sessionId });
    return { message: 'Sesión cerrada' };
  }

  /* ── Get Me ── */
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
        role: { select: { slug: true, name: true } },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  /* ── Crypto helpers (public for sub-services) ── */
  generate2FACode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  hashToken(token: string): string {
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
