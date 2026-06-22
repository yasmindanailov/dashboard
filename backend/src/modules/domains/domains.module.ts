import { Module } from '@nestjs/common';

import { BillingModule } from '../billing/billing.module';
import { ProvisioningModule } from '../provisioning/provisioning.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';

/**
 * DomainsModule — Sprint 15D Fase 15D.F.2/F.4.
 *
 * Hogar de la superficie de comercio de dominios del portal cliente (buscador +
 * "Mis dominios" + checkout del carrito; gestión vía el endpoint genérico de
 * services). Importa:
 *   - `ProvisioningModule` → `PluginRegistryService` (resuelve el registrar por
 *     capability `is_domain_registrar`, R4 — NUNCA por slug).
 *   - `BillingModule` → `BillingCheckoutService` (core multi-ítem `checkoutItems`
 *     con DOM-INV-2/3/5). Sin ciclo: Billing→Provisioning; Domains→Billing +
 *     Provisioning; Provisioning no importa ninguno de los dos.
 * `PrismaService` es global. NO acopla a ningún plugin concreto (R4).
 */
@Module({
  imports: [ProvisioningModule, BillingModule],
  controllers: [DomainsController],
  providers: [DomainsService],
  exports: [DomainsService],
})
export class DomainsModule {}
