import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { CircuitBreakerRegistry } from '../../core/provisioning/circuit-breaker';
import {
  PluginRegistryService,
  PROVISIONER_PLUGINS,
} from '../../core/provisioning/plugin-registry';
import { ProvisioningCacheModule } from '../../core/provisioning/provisioning-cache.module';
import { ReconcileRegistryModule } from '../../core/provisioning/reconcile-registry.module';
import { SettingsModule } from '../../core/settings/settings.module';
import { EnhanceCpModule } from '../../plugins/provisioners/enhance_cp/enhance.module';
import { EnhanceProvisionerPlugin } from '../../plugins/provisioners/enhance_cp/enhance.plugin';
import { InternalProvisionerPlugin } from '../../plugins/provisioners/internal/internal.plugin';
import { ManualProvisionerPlugin } from '../../plugins/provisioners/manual/manual.plugin';
import { ResellerclubModule } from '../../plugins/provisioners/resellerclub/resellerclub.module';
import { ResellerclubProvisionerPlugin } from '../../plugins/provisioners/resellerclub/resellerclub.plugin';
import { AuditModule } from '../audit/audit.module';
import { ClientsModule } from '../clients/clients.module';
import { TasksModule } from '../tasks/tasks.module';

import { AdminProvisioningController } from './admin-provisioning.controller';
import { DomainExpiryWarningsCron } from './domain-expiry-warnings.cron';
import { DomainNsLifecycleService } from './domain-ns-lifecycle.service';
import { BootstrapEnhanceDefaultsOnPluginInstalledListener } from './listeners/bootstrap-enhance-defaults-on-plugin-installed.listener';
import { ProvisioningOnTaskCompletedListener } from './listeners/provisioning-on-task-completed.listener';
import { ReactivateServicesOnInvoicePaidListener } from './listeners/reactivate-services-on-invoice-paid.listener';
import { ReconcileDnsDefaultsOnServiceActivatedListener } from './listeners/reconcile-dns-defaults-on-service-activated.listener';
import { ReconcileDomainNsOnTransferCompletedListener } from './listeners/reconcile-domain-ns-on-transfer-completed.listener';
import { SwitchDomainNsOnHostingActivatedListener } from './listeners/switch-domain-ns-on-hosting-activated.listener';
import { SyncDefaultNameserversToEnhanceListener } from './listeners/sync-default-nameservers-to-enhance.listener';
import {
  PROVISIONING_DISPATCH_QUEUE,
  ProvisioningOrchestratorService,
} from './provisioning-orchestrator.service';
import { ProvisioningDispatchProcessor } from './provisioning-dispatch.processor';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';

/**
 * Sprint 11 Fase 11.B (2026-05-01) — Módulo de provisioning.
 * Sprint 11 Fase 11.C (2026-05-02) — Plugins triviales + listener task→active.
 *
 * Provisiona:
 *  - `ProvisioningOrchestratorService` (orquestador + listener `invoice.paid`).
 *  - `ProvisioningDispatchProcessor` (worker BullMQ).
 *  - `PluginRegistryService` (registry global de plugins).
 *  - `ProvisioningCacheService` (cache Redis DB 2 para `service_info`).
 *  - `ProvisioningOnTaskCompletedListener` (Fase 11.C — activa servicios
 *    cuando una Task con `service_id` y plugin `completes_via_task=true`
 *    se completa).
 *  - Plugins triviales `internal` + `manual` agregados como array al
 *    token DI `PROVISIONER_PLUGINS` vía `useFactory`.
 *
 * Cumple R4: los plugins viven en `src/plugins/provisioners/<slug>/`. El
 * orquestador NO importa los plugins concretos — sólo el `ProvisioningModule`
 * conoce sus clases para registrarlos. El resto del módulo opera contra el
 * `PluginRegistryService` (resolución dinámica por slug).
 *
 * Plugins reales (Sprint 15A/C/D/E/G — Enhance CP, ResellerClub, Docker
 * Engine, Plesk Obsidian) seguirán este mismo patrón: declarar la clase
 * como provider individual y añadirla al array que devuelve el
 * `useFactory` del token `PROVISIONER_PLUGINS` (NestJS DI no soporta
 * `multi: true` al estilo Angular — el array se compone manualmente).
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: PROVISIONING_DISPATCH_QUEUE }),
    SettingsModule,
    AuditModule,
    TasksModule,
    // Sprint 15C.II F.6: `ProvisioningService` invoca `ClientNotesService`
    // direct-call dentro de la `$transaction` de las transiciones admin
    // (suspend/unsuspend/deprovision) para dejar el `ClientNote` en el
    // mismo commit que el cambio de status. Sin ciclo: ClientsModule no
    // depende de ProvisioningModule.
    ClientsModule,
    // Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1): registry
    // genérico para `reconcile-all` admin endpoint. Cada plugin con
    // supports_reconciliation registra su executor en onModuleInit del
    // cron correspondiente. Heredable a 15D RC + 15E Docker + 15G Plesk.
    ReconcileRegistryModule,
    // Sprint 15C.II Fase F.11.2 Amendment II hot-fix (DI clash 2026-05-19):
    // ProvisioningCacheService extraído a módulo leaf canónico para que
    // NotificationsModule (Global) lo pueda importar sin acoplarse a todo
    // ProvisioningModule. Mismo patrón que ReconcileRegistryModule arriba.
    ProvisioningCacheModule,
    // Sprint 15C Fase 15C.C — primer plugin SaaS real (Enhance CP).
    // Sprints 15D/E/G seguirán el mismo patrón: importar `<Plugin>Module` aquí
    // + añadir su clase al factory `PROVISIONER_PLUGINS` abajo.
    EnhanceCpModule,
    // Sprint 15D Fase 15D.D — plugin registrar de dominios (ResellerClub).
    ResellerclubModule,
  ],
  controllers: [ProvisioningController, AdminProvisioningController],
  providers: [
    ProvisioningService,
    ProvisioningOrchestratorService,
    ProvisioningDispatchProcessor,
    PluginRegistryService,
    // ProvisioningCacheService viene de ProvisioningCacheModule (imports)
    // — extraído a módulo leaf en Amendment II hot-fix 2026-05-19 (DI clash
    // post-PR original — NotificationsModule lo necesita para el cooldown
    // de resend; importar ProvisioningModule completo desde Notifications
    // sería acoplamiento estructural innecesario).
    ProvisioningOnTaskCompletedListener,
    // Sprint 15C Fase 15C.D — listeners de DNS-as-capability (ADR-082 §4 + §5):
    //   • bootstrap defaults cuando se enable el plugin enhance_cp,
    //   • reconcile defensivo zone tras service.activated,
    //   • NS-sync C3→C2 cuando cambia el setting provisioning.default_nameservers.
    BootstrapEnhanceDefaultsOnPluginInstalledListener,
    ReconcileDnsDefaultsOnServiceActivatedListener,
    SyncDefaultNameserversToEnhanceListener,
    // Sprint 15D Fase 15D.F.3 — ADR-082 Amendment "dominio-solo aparca en el
    // registrar": al activarse un hosting, conmutar a Aelium los NS de un
    // dominio hermano que estaba aparcado en el registrar (capability-routed).
    DomainNsLifecycleService,
    SwitchDomainNsOnHostingActivatedListener,
    // Sprint 15D.II.T3 — zona DNS al completar un transfer-in (ADR-082 A5):
    // si hay hosting hermano, conmuta a Aelium (capability-routed, idempotente).
    ReconcileDomainNsOnTransferCompletedListener,
    // Sprint 15C.II Fase F.5.3 — auto-reactivación al pagar (`invoice.paid`
    // → reactivar los servicios suspendidos por impago de la factura).
    ReactivateServicesOnInvoicePaidListener,
    // Sprint 15D Fase 15D.E — avisos de expiración de dominios (transversal,
    // lee `services.expires_at`; emite `domain.expiring_soon` 30/14/7/1d).
    DomainExpiryWarningsCron,
    // Plugins triviales (Sprint 11 Fase 11.C). Cada plugin se declara como
    // provider individual (NestJS DI gestiona su ciclo de vida) y se compone
    // un array vía `useFactory` que el `PluginRegistryService` recibe en
    // `onModuleInit` para validar + registrar.
    InternalProvisionerPlugin,
    ManualProvisionerPlugin,
    {
      // Sprint 15C — el plugin Enhance se inyecta vía `EnhanceCpModule`.
      // Sprint 15D — el plugin ResellerClub vía `ResellerclubModule` (ambos
      // importados arriba — proveen la instancia y sus deps internas).
      provide: PROVISIONER_PLUGINS,
      useFactory: (
        internal: InternalProvisionerPlugin,
        manual: ManualProvisionerPlugin,
        enhance: EnhanceProvisionerPlugin,
        resellerclub: ResellerclubProvisionerPlugin,
      ) => [internal, manual, enhance, resellerclub],
      inject: [
        InternalProvisionerPlugin,
        ManualProvisionerPlugin,
        EnhanceProvisionerPlugin,
        ResellerclubProvisionerPlugin,
      ],
    },
    // Sprint 15A Fase F (ADR-080 §5) — singleton CircuitBreakerRegistry.
    // Un único registry por módulo de provisioning gestiona breakers para
    // todos los plugins. Lazy-creates `<plugin_slug>:<operation>` la primera
    // vez que se invoca un wrapper.
    {
      provide: CircuitBreakerRegistry,
      useFactory: (events: EventEmitter2) => new CircuitBreakerRegistry(events),
      inject: [EventEmitter2],
    },
  ],
  exports: [
    ProvisioningService,
    ProvisioningOrchestratorService,
    PluginRegistryService,
    CircuitBreakerRegistry,
    // Sprint 15C.II Fase B: re-export del MÓDULO (no del provider) — el
    // service vive en ReconcileRegistryModule (leaf evita dependencia
    // circular). AdminPluginsModule importa ProvisioningModule y obtiene
    // acceso transitivo al ReconcileRegistryService vía esta re-exportación.
    ReconcileRegistryModule,
    // Sprint 15C.II Fase F.11.2 Amendment II hot-fix 2026-05-19: re-export
    // del módulo leaf que aloja ProvisioningCacheService. Mismo patrón
    // canónico que ReconcileRegistryModule — quien importe ProvisioningModule
    // obtiene acceso transitivo al cache service vía esta re-exportación
    // (cero breaking para módulos que ya inyectaban ProvisioningCacheService
    // sin saber del refactor de ubicación).
    ProvisioningCacheModule,
  ],
})
export class ProvisioningModule {}
