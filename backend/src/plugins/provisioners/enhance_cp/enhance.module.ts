import { Module } from '@nestjs/common';

import { ReconcileRegistryModule } from '../../../core/provisioning/reconcile-registry.module';

import { EnhanceReconciliationCron } from './crons/enhance-reconciliation.cron';
import { EnhanceCustomersService } from './enhance-customers.service';
import { EnhanceDnsDefaultsService } from './enhance-dns-defaults.service';
import { EnhanceProvisionerPlugin } from './enhance.plugin';

/**
 * Sprint 15C Fase 15C.C (2026-05-08) — `EnhanceCpModule`.
 *
 * Provee:
 *   - `EnhanceProvisionerPlugin` (ProvisionerPlugin v2 — los 6 métodos).
 *   - `EnhanceCustomersService` (lazy create + advisory lock + 3-step
 *     idempotency del mapping Client ↔ Customer Org Enhance).
 *
 * Dependencias resueltas vía módulos globales:
 *   - `PrismaModule` (global core) → `PrismaService`.
 *   - `SecurityModule` (global core) → `SecretVaultService`.
 *
 * Patrón canónico para plugins reales con state propio (Sprint 15D RC,
 * 15E Docker, 15G Plesk seguirán este mismo layout):
 *
 *   - Cada plugin SaaS con dependencias service-level (BD, vault, helpers
 *     internos) tiene su propio `<plugin-slug>.module.ts` con providers
 *     declarados aquí.
 *   - El `ProvisioningModule` central importa estos modules y compone el
 *     factory `PROVISIONER_PLUGINS` con instancias inyectadas — NO los
 *     instancia manualmente como sí hace con plugins triviales sin state
 *     (`InternalProvisionerPlugin`, `ManualProvisionerPlugin`).
 *   - Cumple R4: ningún `core/provisioning/*` importa este module ni sus
 *     servicios. La única referencia inversa es vía DI token
 *     `PROVISIONER_PLUGINS` que resuelve dinámicamente.
 */
@Module({
  imports: [
    // Sprint 15C.II Fase B (ADR-083 Amendment A4.2): el cron
    // `EnhanceReconciliationCron` inyecta `ReconcileRegistryService` para
    // registrar su executor en `onModuleInit()`. El módulo lo provee como
    // leaf-importable evitando dependencia circular ProvisioningModule ↔
    // EnhanceCpModule (ProvisioningModule ya importa EnhanceCpModule).
    ReconcileRegistryModule,
  ],
  providers: [
    EnhanceProvisionerPlugin,
    EnhanceCustomersService,
    EnhanceDnsDefaultsService,
    // Sprint 15C Fase 15C.H — capa L3 reconciliation cron (ADR-083 §6
    // decisión 24). Cada 6h compara Enhance vs Aelium-side por servicio
    // activo/suspended y emite `service.reconciled_external_change`.
    EnhanceReconciliationCron,
  ],
  exports: [
    EnhanceProvisionerPlugin,
    EnhanceCustomersService,
    EnhanceDnsDefaultsService,
  ],
})
export class EnhanceCpModule {}
