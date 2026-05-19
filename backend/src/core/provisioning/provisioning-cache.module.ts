import { Module } from '@nestjs/common';

import { ProvisioningCacheService } from './provisioning-cache.service';

/**
 * Sprint 15C.II Fase F.11.2 — Amendment II hot-fix (P1 rate limiting DI
 * clash, frozen 2026-05-19).
 *
 * Módulo leaf que aloja el `ProvisioningCacheService` (Redis DB 2 para
 * `service_info:<id>` + cooldowns canónicos `refresh_cooldown:` /
 * `reconcile_single_cooldown:` / `resend_notification_cooldown:`).
 *
 * **Razón canónica del módulo leaf** (heredado del patrón
 * `ReconcileRegistryModule` introducido en F.9 Amendment II DI clash):
 *
 * El servicio se necesita desde dos módulos sin relación jerárquica:
 *   - `ProvisioningModule` → `ProvisioningService` / `ProvisioningOrchestratorService`.
 *   - `NotificationsModule` (Global) → `NotificationResendService` para
 *     el cooldown del endpoint `POST /admin/services/:id/notifications/resend`
 *     (Amendment II P1 rate limiting).
 *
 * Importar `ProvisioningModule` desde `NotificationsModule` haría acoplamiento
 * estructural innecesario (notificaciones NO necesita el resto del
 * provisioning — plugins, controllers, BullMQ queue, ReconcileRegistry...).
 * Un módulo leaf con cero dependencias propias (solo `ConfigService` que
 * viene Global) es el patrón canónico NestJS para servicios compartidos.
 *
 * Heredable a 15D RC / 15E Docker / 15G Plesk: si un nuevo plugin SaaS
 * necesita usar el mismo cache desde otro módulo (ej. `BillingModule`
 * añade su propio cooldown del resend invoice futuro), simplemente
 * importa `ProvisioningCacheModule`.
 *
 * Constructor del service solo depende de `ConfigService` (Global ya
 * desde `ConfigModule.forRoot()`) — el módulo NO requiere `imports`.
 */
@Module({
  providers: [ProvisioningCacheService],
  exports: [ProvisioningCacheService],
})
export class ProvisioningCacheModule {}
