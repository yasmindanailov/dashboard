import { Module } from '@nestjs/common';

import { QuotaThresholdDetectorService } from './quota-threshold-detector.service';
import { ReconcileRegistryService } from './reconcile-registry.service';

/**
 * Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1) —
 * `ReconcileRegistryModule`.
 *
 * Módulo dedicado para `ReconcileRegistryService` (singleton genérico
 * de executors reconcile-all). Existe como módulo independiente — NO
 * embebido en `ProvisioningModule` — para evitar dependencia circular:
 *
 *   - `ProvisioningModule` importa `EnhanceCpModule` (composición).
 *   - `EnhanceCpModule` necesita `ReconcileRegistryService` para el
 *     `EnhanceReconciliationCron` (registro en onModuleInit).
 *   - Si el provider viviera en `ProvisioningModule`, `EnhanceCpModule`
 *     tendría que importar `ProvisioningModule` → ciclo.
 *
 * Solución: módulo dedicado leaf importable por ambos. Patrón canónico
 * Nest para servicios cross-module sin estado por plugin (mismo modelo
 * que `SettingsModule`, `AuditModule`).
 *
 * Heredable: cuando 15D RC añada su `ResellerClubReconciliationCron`,
 * importa este mismo módulo y registra su executor con slug
 * `resellerclub` en su onModuleInit.
 */
// Sprint 15C.II Fase F.8 (dossier §A.11.10.5.1 R2 frozen 2026-05-16):
// `QuotaThresholdDetectorService` también vive aquí — mismo razonamiento que
// `ReconcileRegistryService`: el cron de cada plugin (Enhance: cron L3) lo
// inyecta para detectar el cruce de cuota al final de su pasada. Si el
// provider viviera en `ProvisioningModule`, `EnhanceCpModule` tendría que
// importar `ProvisioningModule` → ciclo. Como leaf-importable se mantiene
// la regla R4 (plugins NO importan modules/provisioning).
@Module({
  providers: [ReconcileRegistryService, QuotaThresholdDetectorService],
  exports: [ReconcileRegistryService, QuotaThresholdDetectorService],
})
export class ReconcileRegistryModule {}
