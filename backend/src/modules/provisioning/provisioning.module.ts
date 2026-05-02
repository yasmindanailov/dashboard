import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  PluginRegistryService,
  PROVISIONER_PLUGINS,
} from '../../core/provisioning/plugin-registry';
import { ProvisioningCacheService } from '../../core/provisioning/provisioning-cache.service';
import { InternalProvisionerPlugin } from '../../plugins/provisioners/internal/internal.plugin';
import { ManualProvisionerPlugin } from '../../plugins/provisioners/manual/manual.plugin';
import { TasksModule } from '../tasks/tasks.module';

import { ProvisioningOnTaskCompletedListener } from './listeners/provisioning-on-task-completed.listener';
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
    TasksModule,
  ],
  controllers: [ProvisioningController],
  providers: [
    ProvisioningService,
    ProvisioningOrchestratorService,
    ProvisioningDispatchProcessor,
    PluginRegistryService,
    ProvisioningCacheService,
    ProvisioningOnTaskCompletedListener,
    // Plugins triviales (Sprint 11 Fase 11.C). Cada plugin se declara como
    // provider individual (NestJS DI gestiona su ciclo de vida) y se compone
    // un array vía `useFactory` que el `PluginRegistryService` recibe en
    // `onModuleInit` para validar + registrar.
    InternalProvisionerPlugin,
    ManualProvisionerPlugin,
    {
      provide: PROVISIONER_PLUGINS,
      useFactory: (
        internal: InternalProvisionerPlugin,
        manual: ManualProvisionerPlugin,
      ) => [internal, manual],
      inject: [InternalProvisionerPlugin, ManualProvisionerPlugin],
    },
  ],
  exports: [
    ProvisioningService,
    ProvisioningOrchestratorService,
    PluginRegistryService,
    ProvisioningCacheService,
  ],
})
export class ProvisioningModule {}
