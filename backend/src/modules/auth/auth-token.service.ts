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
      jti: crypto.randomUUID(),
    };
    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.slug,
      type: 'refresh',
      jti: crypto.randomUUID(),
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

  /* ── Refresh con rotation + replay detection ── */
  /**
   * Sprint 13 §13.AUTH Fase B (2026-05-03) — refresh rotation canónica
   * (ADR-078 §1.4 + Amendment A1).
   *
   * Flow:
   *   1. Verifica firma del JWT con `JWT_REFRESH_SECRET`.
   *   2. Busca sesión por `refresh_hash`.
   *   3. **REPLAY DETECTION:** si `session.used_at IS NOT NULL` → el token ya
   *      fue canjeado antes. Asumimos compromiso de la cuenta:
   *        - Revoca TODAS las sesiones activas del user (`is_active=false`,
   *          `revoked_reason='replay_detected'`).
   *        - Emite `auth.refresh_replay_detected` con payload completo
   *          (user_id, session_id, attempted_at, ip, revoked_count) para
   *          que `NotificationsAuthReplayListener` alerte al superadmin
   *          (D12 NotificationsService.dispatchToSuperadmins).
   *        - Devuelve UnauthorizedException con mensaje claro al cliente.
   *   4. Si la sesión está revocada / no encontrada → throw.
   *   5. Si el user está bloqueado / inactivo → throw.
   *   6. Genera **par nuevo** (access + refresh — rotación completa).
   *   7. Crea sesión nueva, marca la vieja como `used_at=now()` +
   *      `is_active=false` + `revoked_reason='rotated'` +
   *      `replaced_by_session_id=<nueva>`. Cadena auditada.
   *   8. Devuelve `{access_token, refresh_token, expires_in}` — el caller
   *      (Server Action en Modelo A o body JSON consumer) setea ambas cookies.
   *
   * Nota Modelo A (Amendment A1): este service NO toca cookies. La Server
   * Action `refreshAction` en Next.js recibe el par nuevo y rota las
   * cookies httpOnly del dominio Next.js. Backend stateless sobre body.
   */
  async refresh(refreshToken: string, ip: string, userAgent?: string) {
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

    if (!session) {
      throw new UnauthorizedException('Sesión no encontrada o revocada');
    }

    // ── REPLAY DETECTION ──
    // Token ya fue canjeado. Asumimos compromiso.
    if (session.used_at) {
      const attemptedAt = new Date();
      const revoked = await this.prisma.session.updateMany({
        where: { user_id: session.user_id, is_active: true },
        data: { is_active: false, revoked_reason: 'replay_detected' },
      });

      this.events.emit('auth.refresh_replay_detected', {
        user_id: session.user_id,
        session_id: session.id,
        original_used_at: session.used_at.toISOString(),
        attempted_at: attemptedAt.toISOString(),
        ip,
        revoked_sessions_count: revoked.count,
      });

      throw new UnauthorizedException(
        'Sesión comprometida — todas las sesiones se han revocado por seguridad. Vuelve a iniciar sesión.',
      );
    }

    if (!session.is_active) {
      throw new UnauthorizedException('Sesión revocada');
    }

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
    const refreshExpiresDays = await this.settings.getNumber(
      'auth',
      'refresh_token_expires_days',
      7,
    );

    // Genera par nuevo (rotación completa). `jti` random garantiza que el
    // token sea único aunque el resto del payload + iat (en segundos) coincida
    // con un token previo del mismo user — sin esto, login + refresh inmediato
    // colisionan en `sessions.token_hash UNIQUE`. Sprint 13 §13.AUTH Fase B
    // smoke test confirmó la regresión.
    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.slug,
      type: 'access',
      jti: crypto.randomUUID(),
    };
    const refreshPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.slug,
      type: 'refresh',
      jti: crypto.randomUUID(),
    };
    const accessToken = this.jwt.sign(accessPayload, {
      expiresIn: `${accessExpiresMin}m`,
    });
    const newRefreshToken = this.jwt.sign(refreshPayload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: `${refreshExpiresDays}d`,
    });

    // Transacción: crea sesión nueva, marca vieja como rotated. Patrón
    // canónico Prisma 7 (idéntico a billing-invoice.service.ts: devolver el
    // record completo del create() y dejar que TypeScript infiera).
    const newSession = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          user_id: user.id,
          token_hash: this.hashToken(accessToken),
          refresh_hash: this.hashToken(newRefreshToken),
          ip_address: ip,
          user_agent: userAgent ?? session.user_agent,
          device_label: this.parseDeviceLabel(
            userAgent ?? session.user_agent ?? undefined,
          ),
          expires_at: new Date(Date.now() + refreshExpiresDays * 86400_000),
        },
      });
      await tx.session.update({
        where: { id: session.id },
        data: {
          used_at: new Date(),
          is_active: false,
          revoked_reason: 'rotated',
          replaced_by_session_id: created.id,
          last_used_at: new Date(),
          ip_address: ip,
        },
      });
      return created;
    });

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: accessExpiresMin * 60,
      session_id: newSession.id,
    };
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

  /* ── WebSocket short-lived token ── */
  /**
   * Sprint 13 §13.AUTH Fase A (2026-05-03) — token efímero para handshake WS.
   *
   * Por qué existe: en arquitectura Modelo A (ADR-078 Amendment A1) el JWT
   * vive en una cookie httpOnly del dominio Next.js que el `socket.io-client`
   * del browser no puede leer (sin acceso JS). Un Server Action de Next.js
   * (`getWsTokenAction`) llama a este endpoint server-side reenviando el
   * `Authorization: Bearer` desde la cookie y devuelve este token corto al
   * Client Component que monta el socket. El cliente lo pasa al handshake:
   *   `io('/support', { auth: { token } })`.
   *
   * Ámbito y caducidad:
   *  - Claim `type: 'ws'` (jwt.strategy.ts) — distinto de 'access'.
   *  - Caducidad fija de 60 segundos. Ventana suficiente para el handshake
   *    inicial; el socket persiste sin token tras `connect`. Si la conexión
   *    cae, el cliente vuelve a pedir un token nuevo (Server Action coste
   *    bajo).
   *  - Firmado con `JWT_SECRET` igual que el access token — `SupportGatewayAuth`
   *    lo verifica sin cambios. La únicidad real se da por `type='ws'`: el
   *    gateway acepta cualquier JWT válido, y el strategy del backend rechaza
   *    los `type='ws'` en HTTP (validate() exige 'access'), así que un atacante
   *    que robara este token solo podría abrir un socket — no llamar la API.
   *
   * Audit: NO se persiste audit log por cada generación de token WS (ruido
   * elevado: cada apertura de chat genera uno). El audit del uso real vive
   * en el gateway (`Connected: ...` log) y en `audit_access_log` cuando el
   * usuario interactúa con conversaciones.
   */
  async issueWsToken(
    userId: string,
  ): Promise<{ token: string; expiresIn: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (user.status !== 'active') {
      throw new UnauthorizedException('User not active');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.slug,
      type: 'ws',
      jti: crypto.randomUUID(),
    };
    const expiresIn = 60; // seconds
    const token = this.jwt.sign(payload, { expiresIn: `${expiresIn}s` });

    return { token, expiresIn };
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
