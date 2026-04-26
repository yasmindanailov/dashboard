import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';

// Core
import { PrismaModule } from './core/database/prisma.module';
import { SettingsModule } from './core/settings/settings.module';
import { EmailModule } from './core/email/email.module';
import { CorrelationIdMiddleware } from './core/common/middleware/correlation-id.middleware';
import { CaslModule } from './core/casl/casl.module';
import { OutboxModule } from './core/outbox/outbox.module';
import { StorageModule } from './core/storage/storage.module';
import { JobsModule } from './core/jobs/jobs.module';

// Health
import { HealthModule } from './health/health.module';

// Business modules
import { AuthModule } from './modules/auth/auth.module';
import { ClientsModule } from './modules/clients/clients.module';
import { BillingModule } from './modules/billing/billing.module';
import { ProductsModule } from './modules/products/products.module';
import { ProvisioningModule } from './modules/provisioning/provisioning.module';
import { SupportModule } from './modules/support/support.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { InfrastructureModule } from './modules/infrastructure/infrastructure.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { KnowledgeBaseModule } from './modules/knowledge-base/knowledge-base.module';
import { ErrorLogModule } from './modules/error-log/error-log.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

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

    // ── Rate limiting ──
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 60000, limit: 100 }, // 100 req/min general
        { name: 'login', ttl: 60000, limit: 5 }, // 5 login attempts/min
      ],
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
    HealthModule,

    // ── Business modules ──
    AuthModule,
    ClientsModule,
    BillingModule,
    ProductsModule,
    ProvisioningModule,
    SupportModule,
    TasksModule,
    NotificationsModule,
    AuditModule,
    InfrastructureModule,
    PromotionsModule,
    KnowledgeBaseModule,
    ErrorLogModule,
    DashboardModule,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
