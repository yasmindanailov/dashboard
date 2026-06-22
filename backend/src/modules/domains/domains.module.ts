import { Module } from '@nestjs/common';

import { ProvisioningModule } from '../provisioning/provisioning.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

/**
 * DomainsModule — Sprint 15D Fase 15D.F.2.
 *
 * Hogar de la superficie de comercio de dominios del portal cliente (buscador
 * hoy; checkout de registro + gestión en F.2/F.4). Importa `ProvisioningModule`
 * para resolver el registrar por capability (`PluginRegistryService`, exportado
 * por provisioning); `PrismaService` es global. NO acopla a ningún plugin
 * concreto (R4 — routing por capability).
 */
@Module({
  imports: [ProvisioningModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
