import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { BillingModule } from '../billing/billing.module';
import { SupportInsideService } from './support-inside.service';
import { SupportInsideController } from './support-inside.controller';
import { SupportInsidePlansAdminService } from './support-inside-plans-admin.service';
import { SupportInsidePlansAdminController } from './support-inside-plans-admin.controller';

/**
 * SupportInsideModule — Sprint 8 Fase D (ADR-034 + ADR-061 + ADR-075).
 *
 * Importa `BillingModule` para reusar `BillingCheckoutService` en el
 * flujo `subscribe()` (ADR-061 §"reutiliza checkout"). NO importa
 * `ProductsModule`: la edición de planes Support Inside va directo a
 * Prisma desde `SupportInsidePlansAdminService` (ADR-075 §A — el guard
 * del `AdminProductsController` rechaza editar `type=support_inside`
 * desde otra puerta).
 */
@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [SupportInsideController, SupportInsidePlansAdminController],
  providers: [SupportInsideService, SupportInsidePlansAdminService],
  exports: [SupportInsideService, SupportInsidePlansAdminService],
})
export class SupportInsideModule {}
