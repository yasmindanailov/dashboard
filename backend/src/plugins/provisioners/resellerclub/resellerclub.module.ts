import { Module } from '@nestjs/common';

import { ResellerclubCustomersService } from './resellerclub-customers.service';
import { ResellerclubProvisionerPlugin } from './resellerclub.plugin';

/**
 * Sprint 15D Fase 15D.D — `ResellerclubModule`.
 *
 * Provee:
 *   - `ResellerclubProvisionerPlugin` (ProvisionerPlugin v2 — registrar).
 *   - `ResellerclubCustomersService` (customer/contact lazy + advisory lock).
 *
 * Dependencias resueltas vía módulos globales del core:
 *   - `PrismaModule` (global) → `PrismaService`.
 *   - `SecurityModule` (global) → `SecretVaultService`.
 *
 * Patrón canónico (mismo layout que `EnhanceCpModule`, ADR-083): el
 * `ProvisioningModule` central importa este módulo y añade el plugin al factory
 * `PROVISIONER_PLUGINS`. Cumple R4: ningún `core/provisioning/*` importa este
 * módulo — la única referencia inversa es el token DI `PROVISIONER_PLUGINS`.
 *
 * Fase 15D.E añadirá aquí el cron de reconcile/pricing (importando
 * `ReconcileRegistryModule`, como Enhance).
 */
@Module({
  providers: [ResellerclubProvisionerPlugin, ResellerclubCustomersService],
  exports: [ResellerclubProvisionerPlugin, ResellerclubCustomersService],
})
export class ResellerclubModule {}
