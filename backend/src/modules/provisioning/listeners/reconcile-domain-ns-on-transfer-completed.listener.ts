import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ProductType } from '@prisma/client';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { normalizeFqdn } from '../../../core/provisioning/fqdn.util';
import { DomainNsLifecycleService } from '../domain-ns-lifecycle.service';

/**
 * Tipos de producto de hosting (DH-INV-1: siempre tienen su propia zona DNS en el
 * DNS authority). Mismos que `PRODUCT_TYPES_WITH_OWN_ZONE` del resolver / del
 * `resolveDnsTargetHint` del orquestador.
 */
const HOSTING_PRODUCT_TYPES: ProductType[] = [
  ProductType.hosting_web,
  ProductType.docker_service,
];

/**
 * Sprint 15D.II.T3 — `ReconcileDomainNsOnTransferCompletedListener`.
 *
 * Materializa la zona DNS al **completar un transfer-in** ([ADR-082 A5](docs/10-decisions/adr-082-modelo-domain-hosting-dns-doctrine.md#amendments)):
 * un dominio recién transferido sigue **el mismo modelo de NS/zona que un register**
 * (A4) — NS de Aelium (+ zona del website Enhance) ⟺ tiene hosting; sin hosting,
 * aparca en los NS del registrar.
 *
 * Durante `submitted`/`awaiting_auth` no tocamos los NS (el dominio conserva los
 * entrantes); al `transfer_completed` reconciliamos: si hay un hosting hermano
 * activo para el FQDN → conmuta a Aelium (cubre el caso "hosting añadido durante
 * la ventana del transfer", que el listener `switch-domain-ns-on-hosting-activated`
 * no pudo conmutar porque el dominio estaba `provisioning`, no `active`).
 *
 * R4: NO importa ningún plugin concreto — `switchToAeliumIfParked` resuelve el
 * registrar por capability (`is_domain_registrar`). Idempotente (no-op si ya
 * delega a Aelium) + no-clobber (respeta NS custom) + fail-soft (post-activación;
 * el reconcile cron de 6h es la red de seguridad). Sin hosting → no-op (aparca).
 *
 * **Crea, no migra** (A5): la zona la acuña fresca el website Enhance; NO se
 * importan los records BYOD del registrar de origen (diferido a v1.1).
 */
@Injectable()
export class ReconcileDomainNsOnTransferCompletedListener {
  private readonly logger = new Logger(
    ReconcileDomainNsOnTransferCompletedListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly nsLifecycle: DomainNsLifecycleService,
  ) {}

  @OnEvent('domain.transfer_completed')
  async handle(payload: {
    service_id: string;
    user_id: string;
    fqdn?: string | null;
  }): Promise<void> {
    try {
      const domain = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        select: {
          domain: true,
          user_id: true,
          product: { select: { type: true } },
        },
      });

      if (!domain?.domain || domain.product.type !== 'domain') return;

      const fqdn = normalizeFqdn(domain.domain);

      // ¿Hay un hosting hermano (mismo cliente, mismo FQDN) ACTIVO? Si no, el
      // dominio aparca (NS del registrar ya fijados al iniciar) → no-op. La
      // verificación "es registrar" + "está aparcado" la hace switchToAeliumIfParked.
      const hosting = await this.prisma.service.findFirst({
        where: {
          user_id: domain.user_id,
          status: 'active',
          product: { type: { in: HOSTING_PRODUCT_TYPES } },
          domain: { equals: fqdn, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (!hosting) {
        this.logger.debug(
          `transfer_completed service=${payload.service_id}: sin hosting hermano ` +
            `(${fqdn}) → aparca en el registrar (no-op).`,
        );
        return;
      }

      await this.nsLifecycle.switchToAeliumIfParked(payload.service_id);
    } catch (err) {
      this.logger.warn(
        `reconcile-domain-ns-on-transfer-completed failed for service=` +
          `${payload.service_id}: ${getErrorMessage(err)} — fail-soft.`,
      );
    }
  }
}
