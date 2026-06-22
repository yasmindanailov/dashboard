import { Module } from '@nestjs/common';

import { ProvisioningModule } from '../provisioning/provisioning.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

/**
 * DomainsModule — Sprint 15D Fase 15D.F.2/F.4.
 *
 * Superficie específica de dominios del portal cliente: buscador
 * (`check-availability`) + "Mis dominios" (`GET /domains`). La COMPRA va por el
 * carrito unificado en `BillingModule` (`POST /billing/checkout/items`), así que
 * aquí NO se inyecta billing. Importa `ProvisioningModule` para resolver el
 * registrar por capability (`PluginRegistryService`, R4 — NUNCA por slug);
 * `PrismaService` es global.
 */
@Module({
  imports: [ProvisioningModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
