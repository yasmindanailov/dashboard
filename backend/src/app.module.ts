import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';

// Core
import { PrismaModule } from './core/database/prisma.module';
import { SettingsModule } from './core/settings/settings.module';
import { EmailModule } from './core/email/email.module';
import { CorrelationIdMiddleware } from './core/common/middleware/correlation-id.middleware';
import { LegacyRouteDeprecationMiddleware } from './core/common/middleware/legacy-route-deprecation.middleware';
import { CaslModule } from './core/casl/casl.module';
import { OutboxModule } from './core/outbox/outbox.module';
import { StorageModule } from './core/storage/storage.module';
import { JobsModule } from './core/jobs/jobs.module';
import { SecurityModule } from './core/security/security.module';
import { RedisThrottlerStorage } from './core/security/redis-throttler.storage';

// Health
import { HealthModule } from './health/health.module';

// Business modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { BillingModule } from './modules/billing/billing.module';
import { ProductsModule } from './modules/products/products.module';
import { ProvisioningModule } from './modules/provisioning/provisioning.module';
import { DomainsModule } from './modules/domains/domains.module';
import { AdminPluginsModule } from './modules/admin-plugins/admin-plugins.module';
import { AdminSettingsModule } from './modules/admin-settings/admin-settings.module';
import { SupportModule } from './modules/support/support.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { SupportInsideModule } from './modules/support-inside/support-inside.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { InfrastructureModule } from './modules/infrastructure/infrastructure.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { ErrorLogModule } from './modules/error-log/error-log.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminOverviewModule } from './modules/admin-overview/admin-overview.module';
import { ResponseTemplatesModule } from './modules/response-templates/response-templates.module';

@Module({
  imports: [
    // ── Sentry (debe ir primero para captura completa) ──
    // Init real ocurre en src/instrument.ts antes del bootstrap.
    // Aquí solo se registra el módulo NestJS para integración con DI/filters.
    SentryModule.forRoot(),

    // ── Configuration ──
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    // ── Event bus (EventEmitter2) ──
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
    }),

    // ── Rate limiting (ADR-016 + R10) ──
    // UN throttler 'default' global (100 req/min/IP) aplicado a TODAS las rutas
    // por el `ThrottlerGuard` global (APP_GUARD abajo). Los endpoints sensibles lo
    // estrechan con `@Throttle({ default: { ttl, limit } })` (login 5/min, register
    // y forgot 3/min — auth.controller; chat guest 3/h — support-guest). Storage
    // Redis (R6 multi-instancia, ADR-016 §Decisión) inyectado desde SecurityModule.
    // `skipIf` deshabilita el throttling en E2E (THROTTLER_DISABLED=true) para no
    // colisionar con los tests que iteran logins desde una sola IP.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (config: ConfigService, storage: RedisThrottlerStorage) => ({
        throttlers: [{ name: 'default', ttl: 60000, limit: 100 }],
        storage,
        errorMessage:
          'Demasiados intentos. Espera unos segundos e inténtalo de nuevo.',
        skipIf: () => config.get<string>('THROTTLER_DISABLED') === 'true',
      }),
    }),

    // ── Scheduled tasks (cron) ──
    ScheduleModule.forRoot(),

    // ── Core ──
    PrismaModule,
    SettingsModule,
    EmailModule,
    CaslModule,
    OutboxModule,
    StorageModule,
    JobsModule,
    SecurityModule,
    HealthModule,

    // ── Business modules ──
    AuthModule,
    UsersModule,
    ClientsModule,
    BillingModule,
    ProductsModule,
    ProvisioningModule,
    DomainsModule,
    AdminPluginsModule,
    AdminSettingsModule,
    SupportModule,
    TasksModule,
    SupportInsideModule,
    NotificationsModule,
    AuditModule,
    InfrastructureModule,
    PromotionsModule,
    KnowledgeBaseModule,
    ErrorLogModule,
    DashboardModule,
    AdminOverviewModule,
    ResponseTemplatesModule,
  ],
  providers: [
    // SentryGlobalFilter captura excepciones no manejadas y las reporta a
    // Sentry antes de pasar al GlobalExceptionFilter (que formatea la
    // respuesta HTTP). Registrado vía APP_FILTER para inyectarse antes que
    // los filters de useGlobalFilters() en main.ts.
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    // ADR-016 + R10: ThrottlerGuard global → rate limiting en TODAS las rutas
    // (default 100/min/IP) sin tener que poner @UseGuards en cada controller.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // CorrelationIdMiddleware debe correr ANTES que cualquier otro middleware
    // que quiera incluir el correlationId en su log (R9 + ADR-068).
    consumer
      .apply(CorrelationIdMiddleware, LegacyRouteDeprecationMiddleware)
      .forRoutes('*');
  }
}
