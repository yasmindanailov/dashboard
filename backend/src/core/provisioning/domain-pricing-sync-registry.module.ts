import { Module } from '@nestjs/common';

import { DomainPricingSyncRegistryService } from './domain-pricing-sync-registry.service';

/**
 * Sprint 15D Fase 15D.G·1 — `DomainPricingSyncRegistryModule`.
 *
 * Módulo leaf (espejo de `ReconcileRegistryModule`) que provee el singleton
 * `DomainPricingSyncRegistryService`. Importable sin ciclos tanto por el módulo
 * del registrar (que registra su executor de pricing en `onModuleInit`) como
 * por `DomainsModule` (que lo invoca desde el endpoint admin "sincronizar
 * precios ahora"). Cumple R4: cero coupling cross-module.
 */
@Module({
  providers: [DomainPricingSyncRegistryService],
  exports: [DomainPricingSyncRegistryService],
})
export class DomainPricingSyncRegistryModule {}
