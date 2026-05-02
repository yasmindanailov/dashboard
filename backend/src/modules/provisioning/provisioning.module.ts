import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import {
  PluginRegistryService,
  PROVISIONER_PLUGINS,
} from '../../core/provisioning/plugin-registry';
import { ProvisioningCacheService } from '../../core/provisioning/provisioning-cache.service';
import { TasksModule } from '../tasks/tasks.module';

import {
  PROVISIONING_DISPATCH_QUEUE,
  ProvisioningOrchestratorService,
} from './provisioning-orchestrator.service';
import { ProvisioningDispatchProcessor } from './provisioning-dispatch.processor';
import { ProvisioningController } from './provisioning.controller';
import { ProvisioningService } from './provisioning.service';

/**
 * Sprint 11 Fase 11.B (2026-05-01) — Módulo de provisioning.
 *
 * Provisiona:
 *  - `ProvisioningOrchestratorService` (orquestador + listener `invoice.paid`).
 *  - `ProvisioningDispatchProcessor` (worker BullMQ).
 *  - `PluginRegistryService` (registry global de plugins).
 *  - `ProvisioningCacheService` (cache Redis DB 2 para `service_info`).
 *
 * Plugins concretos (`internal`, `manual`) se registran en Fase 11.C como
 * providers `{ provide: PROVISIONER_PLUGINS, useExisting: <PluginClass>, multi: true }`.
 * Hoy el array se inyecta vacío por defecto (`useValue: []`) — el orquestador
 * loguea "0 plugins registered" pero arranca sin error. Cuando 11.C añada los
 * plugins, el registry los recogerá automáticamente.
 *
 * Cumple R4 (plugins no se importan desde core — vía token DI multi-injection).
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
    // Token multi-injection para plugins. Sprint 11.C añade entries reales.
    { provide: PROVISIONER_PLUGINS, useValue: [] },
  ],
  exports: [
    ProvisioningService,
    ProvisioningOrchestratorService,
    PluginRegistryService,
    ProvisioningCacheService,
  ],
})
export class ProvisioningModule {}
