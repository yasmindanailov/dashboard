import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditRetentionCron } from './audit-retention.cron';
import { AuditAuthListener } from './audit-auth.listener';
import { AuditAdminSsoImpersonationListener } from './audit-admin-sso-impersonation.listener';

/**
 * AuditModule — Sprint 9 Fase E (ADR-017 + ADR-010 RGPD).
 *
 * @Global: cualquier módulo puede inyectar `AuditService.logChange()`
 * sin importar este módulo.
 *
 * `AuditInterceptor` se registra a nivel APP. Solo actúa cuando el
 * handler tiene `@AuditAccess(...)` — cero overhead en el resto.
 */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditRetentionCron,
    AuditAuthListener,
    // Sprint 15C Fase 15C.F (ADR-083 §4 decisión 14): listener canónico
    // que persiste cada admin SSO impersonation en `audit_access_log` con
    // `metadata.target_user_id = service.user_id` para que el portal de
    // transparencia del cliente afectado lo exponga.
    AuditAdminSsoImpersonationListener,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
