import { Module } from '@nestjs/common';

import { ReconcileRegistryModule } from '../../../core/provisioning/reconcile-registry.module';

import { ResellerclubReconciliationCron } from './crons/resellerclub-reconciliation.cron';
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
 * Fase 15D.E — añade el cron de reconcile (`ResellerclubReconciliationCron`)
 * importando `ReconcileRegistryModule` (leaf, mismo patrón que Enhance — evita el
 * ciclo con `ProvisioningModule`). El cron de pricing-sync y el de avisos de
 * expiración (que no dependen del registry) se añaden en commits siguientes.
 */
@Module({
  imports: [ReconcileRegistryModule],
  providers: [
    ResellerclubProvisionerPlugin,
    ResellerclubCustomersService,
    ResellerclubReconciliationCron,
  ],
  exports: [ResellerclubProvisionerPlugin, ResellerclubCustomersService],
})
export class ResellerclubModule {}
