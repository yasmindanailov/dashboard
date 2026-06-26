import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { normalizeFqdn } from '../../../core/provisioning/fqdn.util';
import { DomainNsLifecycleService } from '../domain-ns-lifecycle.service';

/**
 * Tipos de producto de hosting (DH-INV-1: siempre tienen su propia zona DNS en
 * el DNS authority). Mismos que `PRODUCT_TYPES_WITH_OWN_ZONE` del resolver.
 */
const HOSTING_PRODUCT_TYPES = new Set(['hosting_web', 'docker_service']);

/**
 * Sprint 15D Fase 15D.F.3 — `SwitchDomainNsOnHostingActivatedListener`.
 *
 * Cara "switch" del ADR-082 Amendment "dominio-solo aparca en el registrar".
 * Cuando un servicio de HOSTING se activa (`service.activated`), busca el dominio
 * Aelium hermano de ese mismo FQDN que esté APARCADO (registrado sin hosting, con
 * NS del registrar) y conmuta su delegación a los NS de Aelium — así la zona del
 * website (Enhance) lo sirve.
 *
 * R4: NO importa ningún plugin concreto; resuelve el registrar por capability
 * dentro de `DomainNsLifecycleService`. El listener solo DECIDE (qué dominio,
 * cuándo); la conmutación (guardas + acción + persistencia) vive en el servicio.
 *
 * No-op correcto en:
 *   - el propio servicio de dominio al activarse (no es `hosting_web`/`docker_service`);
 *   - F1/F2 (el dominio ya delega a Aelium → `switchToAeliumIfParked` es no-op);
 *   - F3 (BYOD externo: no existe un servicio `type=domain` para ese FQDN);
 *   - hosting sin dominio o sin FQDN normalizable.
 *
 * `service.activated` se persiste vía Outbox (R8/GL-17, audit 2026-06-25) en la
 * misma tx que la transición `status='active'` y lo despacha el `OutboxWorker`
 * (at-least-once, ≤5s). Este handler es fail-soft + idempotente (todo el cuerpo
 * en try/catch que loguea y traga, R7) → nunca propaga al worker; el reconcile
 * cron (6h) actúa de red de seguridad adicional.
 */
@Injectable()
export class SwitchDomainNsOnHostingActivatedListener {
  private readonly logger = new Logger(
    SwitchDomainNsOnHostingActivatedListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly nsLifecycle: DomainNsLifecycleService,
  ) {}

  @OnEvent('service.activated')
  async handle(payload: {
    service_id: string;
    user_id: string;
    correlation_id: string;
  }): Promise<void> {
    try {
      const hosting = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        select: {
          domain: true,
          user_id: true,
          product: { select: { type: true } },
        },
      });

      if (!hosting?.domain) return;
      if (!HOSTING_PRODUCT_TYPES.has(String(hosting.product.type))) {
        return; // listener silencioso para no-hosting (incl. el propio dominio)
      }

      const fqdn = normalizeFqdn(hosting.domain);

      // ¿Hay un dominio Aelium hermano (mismo cliente, mismo FQDN) activo? Si no
      // (F3 BYOD externo), no-op. La verificación de "es registrar" + "está
      // aparcado" la hace `switchToAeliumIfParked` (R4: por capability).
      const domain = await this.prisma.service.findFirst({
        where: {
          user_id: hosting.user_id,
          status: 'active',
          product: { type: 'domain' },
          domain: { equals: fqdn, mode: 'insensitive' },
        },
        select: { id: true },
      });

      if (!domain) return;

      await this.nsLifecycle.switchToAeliumIfParked(domain.id);
    } catch (err) {
      this.logger.warn(
        `switch-domain-ns-on-hosting-activated failed for service=${payload.service_id}: ` +
          `${getErrorMessage(err)} — fail-soft.`,
      );
    }
  }
}
