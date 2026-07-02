import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EmailService } from '../../core/email/email.service';
import { passwordResetTemplate } from '../../core/email/templates/auth.templates';
import { resolveEmailFooterLegal } from '../../core/email/email-branding';
import { ResetPasswordDto } from './dto/auth.dto';
import { AuthTokenService } from './auth-token.service';

/* ═══════════════════════════════════════
   AuthRecoveryService — Password
   forgot + reset flows.
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class AuthRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    private readonly email: EmailService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async forgotPassword(email: string, ip: string) {
    email = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    const response = {
      message:
        'Si el email existe, recibirás instrucciones para resetear tu contraseña.',
    };
    if (!user) return response;

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.tokenService.hashToken(token);
    const expiresHours = await this.settings.getNumber(
      'auth',
      'password_reset_expires_hours',
      1,
    );

    // Invalidate pending resets
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

    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    const legal = await resolveEmailFooterLegal(this.settings);
    const tpl = passwordResetTemplate(user.first_name, resetUrl, legal);
    await this.email.send({
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
    });

    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = this.tokenService.hashToken(dto.token);
    const reset = await this.prisma.passwordReset.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!reset) throw new BadRequestException('Token inválido');
    if (reset.used_at)
      throw new BadRequestException('Este enlace ya fue utilizado');
    if (reset.expires_at < new Date())
      throw new BadRequestException(
        'El enlace ha expirado. Solicita uno nuevo.',
      );

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
      this.prisma.session.updateMany({
        where: { user_id: reset.user_id, is_active: true },
        data: { is_active: false },
      }),
    ]);

    this.events.emit('auth.password_reset', { userId: reset.user_id });
    return {
      message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
    };
  }
}
