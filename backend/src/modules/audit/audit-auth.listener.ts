import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditService } from './audit.service';

/**
 * AuditAuthListener — Sprint 13.5 Fase E (DC.8).
 *
 * Hasta este sprint, los eventos `auth.*` huérfanos no quedaban
 * registrados en `audit_access_log`. La doctrina canónica
 * (ADR-017 + ADR-010 RGPD) exige que cada evento sensible
 * relacionado con la cuenta del cliente alimente el portal
 * transparencia (`/dashboard/transparency`).
 *
 * Reparto de responsabilidad:
 *  - `auth.login_failed`, `auth.registered`, `auth.login_success`:
 *     mantienen escritura **directa** desde sus respectivos services
 *     (`auth-login.service`, `auth-register.service`,
 *     `auth-token.service`) porque tienen contexto HTTP completo
 *     (IP + User-Agent). Este listener NO los duplica.
 *  - `auth.2fa_required`, `auth.account_blocked`, `auth.password_reset`,
 *     `auth.email_verified`, `auth.session_closed`: este listener los
 *     consume y persiste en `audit_access_log` con `ip_address='system'`
 *     (no hay request context disponible en el bus de eventos).
 *
 * Trade-off documentado: las entries asíncronas no llevan IP/UA
 * granulares. Aceptable porque (a) los emisores ya están dentro de
 * un flujo HTTP previamente auditado con IP (ej. `account_blocked`
 * sigue inmediatamente a `login_failed` que SÍ lleva IP), (b) la
 * señal "ocurrió" basta para el portal transparencia, (c) extender
 * los payloads de evento con IP/UA contextual es invasivo y rompe
 * la barrera de aislamiento del bus.
 */
@Injectable()
export class AuditAuthListener {
  private readonly logger = new Logger(AuditAuthListener.name);

  constructor(private readonly audit: AuditService) {}

  @OnEvent('auth.2fa_required')
  async on2faRequired(payload: { userId: string }): Promise<void> {
    await this.audit.logAccess({
      user_id: payload.userId,
      action: 'auth.2fa_required',
      ip_address: 'system',
      resource: 'auth',
    });
  }

  @OnEvent('auth.account_blocked')
  async onAccountBlocked(payload: {
    userId: string;
    attempts: number;
  }): Promise<void> {
    await this.audit.logAccess({
      user_id: payload.userId,
      action: 'auth.account_blocked',
      ip_address: 'system',
      resource: 'auth',
      metadata: { attempts: payload.attempts },
    });
  }

  @OnEvent('auth.password_reset')
  async onPasswordReset(payload: { userId: string }): Promise<void> {
    await this.audit.logAccess({
      user_id: payload.userId,
      action: 'auth.password_reset',
      ip_address: 'system',
      resource: 'auth',
    });
  }

  @OnEvent('auth.email_verified')
  async onEmailVerified(payload: { userId: string }): Promise<void> {
    await this.audit.logAccess({
      user_id: payload.userId,
      action: 'auth.email_verified',
      ip_address: 'system',
      resource: 'auth',
    });
  }

  @OnEvent('auth.session_closed')
  async onSessionClosed(payload: {
    userId: string;
    sessionId?: string;
  }): Promise<void> {
    await this.audit.logAccess({
      user_id: payload.userId,
      action: 'auth.session_closed',
      ip_address: 'system',
      resource: 'auth',
      ...(payload.sessionId
        ? { metadata: { session_id: payload.sessionId } }
        : {}),
    });
  }
}
