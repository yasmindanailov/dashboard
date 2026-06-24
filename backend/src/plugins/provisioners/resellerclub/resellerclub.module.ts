import { Module } from '@nestjs/common';

import { DomainPricingSyncRegistryModule } from '../../../core/provisioning/domain-pricing-sync-registry.module';
import { ReconcileRegistryModule } from '../../../core/provisioning/reconcile-registry.module';

import { ResellerclubPricingSyncCron } from './crons/resellerclub-pricing-sync.cron';
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
 * Fase 15D.E — añade los crons del registrar:
 *   - `ResellerclubReconciliationCron` (reconcile + lifecycle) → importa
 *     `ReconcileRegistryModule` (leaf, evita el ciclo con `ProvisioningModule`).
 *   - `ResellerclubPricingSyncCron` (writer de `domain_tld_pricing`) → solo Prisma
 *     (global) + el plugin + EventEmitter2 (global), sin import extra.
 * El cron de avisos de expiración (transversal a dominios) vive fuera de este
 * módulo (no es específico de RC).
 */
@Module({
  imports: [ReconcileRegistryModule, DomainPricingSyncRegistryModule],
  providers: [
    ResellerclubProvisionerPlugin,
    ResellerclubCustomersService,
    ResellerclubReconciliationCron,
    ResellerclubPricingSyncCron,
  ],
  exports: [ResellerclubProvisionerPlugin, ResellerclubCustomersService],
})
export class ResellerclubModule {}
