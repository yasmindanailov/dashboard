import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { Prisma, RoleSlug } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';

import { AuthTokenService } from './auth-token.service';
import { ROLES_REQUIRING_2FA } from './auth.constants';
import {
  UpdateAccountDto,
  ChangePasswordDto,
  Confirm2faDto,
} from './dto/account.dto';

/* ═══════════════════════════════════════════════════════════════════════════
   AuthAccountService — gestión self-service de la cuenta del usuario autenticado
   (ADR-085): identidad, contraseña, 2FA opt-in (Amendment A1 de ADR-013) y
   cierre de sesiones. TODO self-scoped por el `userId` del JWT.

   Robustez:
    - Las acciones sensibles (cambio de contraseña, 2FA) confirman la contraseña.
    - El cambio de contraseña revoca el resto de sesiones manteniendo la actual.
    - Se auditan en `audit_access_log` (R3) las acciones de seguridad.
   Ref: ARCHITECTURE.md Regla 15.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Contexto de petición para auditar la acción de seguridad. */
export interface SecurityActionContext {
  ip: string;
  userAgent?: string;
}

const BCRYPT_ROUNDS = 12; // mismo coste que el registro (auth-register.service.ts)

@Injectable()
export class AuthAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: AuthTokenService,
    private readonly events: EventEmitter2,
  ) {}

  /** Actualiza datos de identidad propios. **No** propaga al registrar (≠ WHOIS). */
  async updateMe(userId: string, dto: UpdateAccountDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.first_name !== undefined) data.first_name = dto.first_name;
    if (dto.last_name !== undefined) data.last_name = dto.last_name;
    if (dto.language !== undefined) data.language = dto.language;
    if (dto.timezone !== undefined) data.timezone = dto.timezone;

    if (Object.keys(data).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data });
    }
    return this.tokenService.getMe(userId);
  }

  /**
   * Cambia la contraseña: verifica la actual, exige que la nueva sea distinta, y
   * revoca el resto de sesiones (mantiene la actual). ADR-060 §B.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ctx: SecurityActionContext & { currentAccessToken: string },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password_hash: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');

    const valid = await bcrypt.compare(
      dto.current_password,
      user.password_hash,
    );
    if (!valid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }
    const same = await bcrypt.compare(dto.new_password, user.password_hash);
    if (same) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta de la actual',
      );
    }

    const newHash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    const currentSessionHash = this.tokenService.hashToken(
      ctx.currentAccessToken,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { password_hash: newHash },
      });
      await tx.session.updateMany({
        where: {
          user_id: userId,
          is_active: true,
          token_hash: { not: currentSessionHash },
        },
        data: { is_active: false, revoked_reason: 'password_changed' },
      });
    });

    await this.audit(userId, 'password_changed', ctx);
    return {
      message:
        'Contraseña actualizada. Se han cerrado las sesiones de los demás dispositivos.',
    };
  }

  /** Activa 2FA opt-in por email (ADR-013 A1). Confirma la contraseña. */
  async enable2fa(
    userId: string,
    dto: Confirm2faDto,
    ctx: SecurityActionContext,
  ) {
    await this.confirmPassword(userId, dto.password);
    await this.prisma.user.update({
      where: { id: userId },
      data: { two_factor_enabled: true },
    });
    await this.audit(userId, '2fa_enabled', ctx);
    return {
      two_factor_enabled: true,
      message: 'Verificación en dos pasos activada.',
    };
  }

  /**
   * Desactiva 2FA. Confirma la contraseña y **bloquea** la desactivación para
   * roles con 2FA obligatorio (ADR-013 A1: no pueden bajar su seguridad).
   */
  async disable2fa(
    userId: string,
    dto: Confirm2faDto,
    ctx: SecurityActionContext,
  ) {
    const user = await this.confirmPassword(userId, dto.password);
    if (ROLES_REQUIRING_2FA.includes(user.roleSlug)) {
      throw new ForbiddenException(
        'Tu rol exige verificación en dos pasos; no se puede desactivar.',
      );
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { two_factor_enabled: false, two_factor_secret: null },
    });
    await this.audit(userId, '2fa_disabled', ctx);
    return {
      two_factor_enabled: false,
      message: 'Verificación en dos pasos desactivada.',
    };
  }

  /** Cierra TODAS las sesiones activas del usuario (ADR-060 §B). */
  async logoutAll(userId: string, ctx: SecurityActionContext) {
    const res = await this.prisma.session.updateMany({
      where: { user_id: userId, is_active: true },
      data: { is_active: false, revoked_reason: 'logout_all' },
    });
    await this.audit(userId, 'logout_all', ctx, { revoked: res.count });
    this.events.emit('auth.session_closed', { userId, all: true });
    return {
      revoked: res.count,
      message: 'Se han cerrado todas tus sesiones.',
    };
  }

  /* ─── Private ─── */

  /** Verifica la contraseña actual; devuelve `{ roleSlug }` para guardas de rol. */
  private async confirmPassword(
    userId: string,
    password: string,
  ): Promise<{ roleSlug: RoleSlug }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password_hash: true, role: { select: { slug: true } } },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Contraseña incorrecta');
    return { roleSlug: user.role.slug };
  }

  private async audit(
    userId: string,
    action: string,
    ctx: SecurityActionContext,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.auditAccessLog.create({
      data: {
        user_id: userId,
        action,
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
  }
}
