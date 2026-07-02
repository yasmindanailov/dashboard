import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { EmailService } from '../../core/email/email.service';
import {
  verifyEmailTemplate,
  welcomeTemplate,
} from '../../core/email/templates/auth.templates';
import { resolveEmailFooterLegal } from '../../core/email/email-branding';
import { RegisterDto } from './dto/auth.dto';
import { AuthTokenService } from './auth-token.service';
import { RoleSlug } from '@prisma/client';

/* ═══════════════════════════════════════
   AuthRegisterService — Registration
   and email verification.
   Ref: ARCHITECTURE.md Regla 15
   ═══════════════════════════════════════ */

@Injectable()
export class AuthRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
    private readonly email: EmailService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async register(dto: RegisterDto, ip: string, userAgent?: string) {
    dto.email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing)
      throw new ConflictException('Ya existe una cuenta con este email');

    const clientRole = await this.prisma.role.findUnique({
      where: { slug: RoleSlug.client },
    });
    if (!clientRole) throw new Error('Client role not found in database');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // E11 — perfil fiscal opcional. `personal` no aporta dirección (no tiene
    // BillingProfile); `autonomo`/`empresa` sí. Los datos fiscales se guardan en
    // ClientProfile (identidad / fuente del registrante de dominios, ADR-077 A12)
    // y, para autonomo/empresa, también como BillingProfile (lo que factura).
    const accountType = dto.account_type ?? 'personal';
    const isFiscal = accountType === 'autonomo' || accountType === 'empresa';
    const country = (dto.country ?? 'ES').toUpperCase();
    const fullName = `${dto.first_name} ${dto.last_name}`.trim();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          password_hash: passwordHash,
          first_name: dto.first_name,
          last_name: dto.last_name,
          status: 'pending_verification',
          role_id: clientRole.id,
          terms_accepted_at: dto.terms_accepted ? new Date() : null,
        },
      });

      await tx.clientProfile.create({
        data: {
          user_id: created.id,
          client_type: accountType === 'empresa' ? 'company' : 'individual',
          phone: dto.phone ?? null,
          company_name: accountType === 'empresa' ? dto.company_name : null,
          tax_id: isFiscal ? dto.nif_cif : null,
          address_line1: isFiscal ? dto.address_line1 : null,
          city: isFiscal ? dto.city : null,
          postal_code: isFiscal ? dto.postal_code : null,
          country,
        },
      });

      // Primer perfil de facturación del cliente ⇒ is_default.
      if (isFiscal) {
        await tx.billingProfile.create({
          data: {
            user_id: created.id,
            type: accountType,
            label:
              accountType === 'empresa' && dto.company_name
                ? dto.company_name
                : fullName,
            first_name: dto.first_name,
            last_name: dto.last_name,
            company_name: accountType === 'empresa' ? dto.company_name : null,
            nif_cif: dto.nif_cif,
            address_line1: dto.address_line1!,
            city: dto.city!,
            postal_code: dto.postal_code!,
            country,
            is_default: true,
          },
        });
      }

      return created;
    });

    await this.createEmailVerification(user.id);

    await this.prisma.auditAccessLog.create({
      data: {
        user_id: user.id,
        action: 'register',
        ip_address: ip,
        user_agent: userAgent,
      },
    });

    this.events.emit('auth.registered', { userId: user.id, email: user.email });

    return {
      message: 'Cuenta creada. Revisa tu email para verificar tu cuenta.',
      user_id: user.id,
    };
  }

  async verifyEmail(token: string) {
    const tokenHash = this.tokenService.hashToken(token);
    const verification = await this.prisma.emailVerification.findUnique({
      where: { token_hash: tokenHash },
    });

    if (!verification)
      throw new BadRequestException('Token de verificación inválido');
    if (verification.used_at)
      throw new BadRequestException('Este enlace ya fue utilizado');
    if (verification.expires_at < new Date())
      throw new BadRequestException(
        'El enlace ha expirado. Solicita uno nuevo.',
      );

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: verification.id },
        data: { used_at: new Date() },
      }),
      this.prisma.user.update({
        where: { id: verification.user_id },
        data: { email_verified_at: new Date(), status: 'active' },
      }),
    ]);

    this.events.emit('auth.email_verified', { userId: verification.user_id });

    const user = await this.prisma.user.findUnique({
      where: { id: verification.user_id },
    });
    if (user) {
      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );
      const legal = await resolveEmailFooterLegal(this.settings);
      const tpl = welcomeTemplate(user.first_name, appUrl, legal);
      await this.email.send({
        to: user.email,
        subject: tpl.subject,
        html: tpl.html,
      });
    }

    return {
      message: 'Email verificado correctamente. Ya puedes iniciar sesión.',
    };
  }

  async resendVerification(email: string) {
    email = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user)
      return {
        message: 'Si el email existe, recibirás un enlace de verificación.',
      };
    if (user.email_verified_at)
      return { message: 'Tu email ya está verificado.' };

    await this.createEmailVerification(user.id);
    return {
      message: 'Si el email existe, recibirás un enlace de verificación.',
    };
  }

  /* ─── Private ─── */

  private async createEmailVerification(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.tokenService.hashToken(token);
    const expiresHours = await this.settings.getNumber(
      'auth',
      'email_verification_expires_hours',
      24,
    );

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

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const appUrl = this.config.get<string>(
        'NEXT_PUBLIC_APP_URL',
        'http://localhost:3002',
      );
      const verifyUrl = `${appUrl}/verify-email?token=${token}`;
      const legal = await resolveEmailFooterLegal(this.settings);
      const tpl = verifyEmailTemplate(user.first_name, verifyUrl, legal);
      await this.email.send({
        to: user.email,
        subject: tpl.subject,
        html: tpl.html,
      });
    }
    return token;
  }
}
