import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../core/database/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { TasksModule } from '../tasks/tasks.module';
import { SupportInsideService } from './support-inside.service';
import { SupportInsideController } from './support-inside.controller';
import { SupportInsidePlansAdminService } from './support-inside-plans-admin.service';
import { SupportInsidePlansAdminController } from './support-inside-plans-admin.controller';
import { SupportInsideAdminService } from './support-inside-admin.service';
import { SupportInsideAdminController } from './support-inside-admin.controller';
import { MaintenanceMonthlyService } from './crons/maintenance-monthly.service';
import {
  MaintenanceMonthlyProcessor,
  MAINTENANCE_MONTHLY_QUEUE,
} from './crons/maintenance-monthly.processor';
import { MaintenanceMonthlyAdminController } from './crons/maintenance-monthly-admin.controller';
import { SupportInsidePriorityListener } from './listeners/support-inside-priority.listener';
import { SupportInsideAuditListener } from './listeners/support-inside-audit.listener';
import { SupportInsideOnServiceProvisionedListener } from './listeners/support-inside-on-service-provisioned.listener';

/**
 * SupportInsideModule — Sprint 8 Fase D (ADR-034 + ADR-061 + ADR-075).
 *
 * Importa `BillingModule` para reusar `BillingCheckoutService` en el
 * flujo `subscribe()` (ADR-061 §"reutiliza checkout"). NO importa
 * `ProductsModule`: la edición de planes Support Inside va directo a
 * Prisma desde `SupportInsidePlansAdminService` (ADR-075 §A — el guard
 * del `AdminProductsController` rechaza editar `type=support_inside`
 * desde otra puerta).
 *
 * Registra la cola BullMQ `maintenance-monthly` para el cron mensual
 * que crea tasks de mantenimiento por slot activo (ADR-034 + Sprint 8
 * Fase D plan §8.D.7 — replica el patrón canónico de Fase C).
 */
@Module({
  imports: [
    PrismaModule,
    BillingModule,
    TasksModule,
    BullModule.registerQueue({ name: MAINTENANCE_MONTHLY_QUEUE }),
  ],
  controllers: [
    SupportInsideController,
    SupportInsidePlansAdminController,
    SupportInsideAdminController,
    MaintenanceMonthlyAdminController,
  ],
  providers: [
    SupportInsideService,
    SupportInsidePlansAdminService,
    SupportInsideAdminService,
    MaintenanceMonthlyService,
    MaintenanceMonthlyProcessor,
    // Listeners transversales (sub-fase 8.D.12).
    SupportInsidePriorityListener,
    SupportInsideAuditListener,
    SupportInsideOnServiceProvisionedListener,
  ],
  exports: [SupportInsideService, SupportInsidePlansAdminService],
})
export class SupportInsideModule {}
