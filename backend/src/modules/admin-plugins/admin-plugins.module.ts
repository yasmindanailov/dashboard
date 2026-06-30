import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ProvisioningModule } from '../provisioning/provisioning.module';
import { AiModule } from '../ai/ai.module';

import { AdminPluginsController } from './admin-plugins.controller';
import { AdminPluginsService } from './admin-plugins.service';

/**
 * AdminPluginsModule — Sprint 15A Fase G (ADR-080).
 *
 * Expone la capa REST `/admin/plugins` para que el superadmin gestione la
 * configuración de los plugins de provisioning (enabled, config, secrets
 * cifrados, test-connection).
 *
 * Dependencias:
 *  - `ProvisioningModule` para `PluginRegistryService` + `CircuitBreakerRegistry`.
 *  - `AuditModule` para `AuditService.logChange` (R3).
 *  - `AiModule` para `AiProviderRegistry` (subsistema IA paralelo, ADR-080 D).
 *  - `SecurityModule` (global) para `SecretVaultService` (cifrado AES-256-GCM).
 *  - `PrismaModule` (global) para `pluginInstall` model.
 *  - `EventEmitter2` (global core) para emisión `plugin.config_changed`.
 */
@Module({
  imports: [ProvisioningModule, AuditModule, AiModule],
  controllers: [AdminPluginsController],
  providers: [AdminPluginsService],
  exports: [AdminPluginsService],
})
export class AdminPluginsModule {}
