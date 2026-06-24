import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { getErrorMessage } from '../../core/common/utils/error.util';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import { CircuitBreakerRegistry } from '../../core/provisioning/circuit-breaker';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import { ProvisioningCacheService } from '../../core/provisioning/provisioning-cache.service';
import { executeActionWithCacheInvalidation } from '../../core/provisioning/plugin-utils';
import { AuditService } from '../audit/audit.service';
import { ServiceWithRelations } from '../../core/provisioning/types';

/** Fallbacks defensivos si los settings no están poblados (ADR-082 §4 + Amendment F.3). */
const DEFAULT_AELIUM_NS = ['ns1.aelium.net', 'ns2.aelium.net'] as const;
const DEFAULT_PARKING_NS = [
  'dns1.resellerclub.com',
  'dns2.resellerclub.com',
] as const;

/** Etiqueta de actor sistema en el audit (`audit_change_log.changes_after.actor`). */
const SYSTEM_ACTOR = 'system:provisioning-ns-switch';

/**
 * Sprint 15D Fase 15D.F.3 — `DomainNsLifecycleService`.
 *
 * Materializa la cara "switch" del ADR-082 Amendment "dominio-solo aparca en el
 * registrar": cuando se añade hosting a un dominio que estaba APARCADO (NS del
 * registrar), conmuta su delegación a los NS de Aelium (`provisioning.default_nameservers`)
 * para que la zona del website del DNS authority (Enhance) lo sirva.
 *
 * R4: resuelve el plugin registrar por capability (`is_domain_registrar`), nunca
 * por slug, y ejecuta la acción curada `modify_nameservers` vía el wrapper
 * canónico (`executeActionWithCacheInvalidation` — breaker + cache + audit).
 *
 * Idempotente + no-clobber + fail-soft:
 *   - NS ya == Aelium → no-op (flujos F1/F2, el dominio ya delegaba a Aelium).
 *   - NS != parking (custom/externos del cliente) → no-op (respeta su intención).
 *   - NS == parking → conmuta + persiste `metadata.nameservers` (que lee el
 *     `dns-authority-resolver` y el propio "¿está aparcado?").
 *   - Cualquier fallo se loguea y se traga (post-activación: no debe tumbar el
 *     hosting). El reconcile cron (6h) reintenta si el switch no llegó a aplicarse.
 *
 * NO emite `domain.nameservers_changed`: ese evento dispara la alerta de
 * seguridad "verifica que fuiste tú" (F.1), engañosa para un cambio de SISTEMA
 * esperado (el cliente acaba de comprar hosting). El rastro durable lo da el
 * `service.action_executed:modify_nameservers` (actor `system:…`) del wrapper.
 */
@Injectable()
export class DomainNsLifecycleService {
  private readonly logger = new Logger(DomainNsLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
    private readonly cache: ProvisioningCacheService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly breakers: CircuitBreakerRegistry,
  ) {}

  async switchToAeliumIfParked(domainServiceId: string): Promise<void> {
    try {
      const service = await this.loadDomainService(domainServiceId);
      if (!service) return;

      const plugin = this.registry.get(
        service.provisioner_slug ?? service.product.provisioner,
      );
      if (!plugin || !plugin.capabilities.is_domain_registrar) {
        return; // no es un registrar → no-op (defensivo)
      }
      if (!service.provider_reference) {
        this.logger.warn(
          `switch NS service=${domainServiceId}: dominio sin provider_reference ` +
            `(no registrado aún) — skip.`,
        );
        return;
      }

      const aeliumNs = await this.settings.getJson<string[]>(
        'provisioning',
        'default_nameservers',
        [...DEFAULT_AELIUM_NS],
      );
      const parkingNs = await this.settings.getJson<string[]>(
        'provisioning',
        'registrar_parking_nameservers',
        [...DEFAULT_PARKING_NS],
      );
      const currentNs = readNameservers(service.metadata);

      if (currentNs.length > 0 && sameNs(currentNs, aeliumNs)) {
        return; // ya delega a Aelium (F1/F2) → no-op idempotente
      }
      if (currentNs.length > 0 && !sameNs(currentNs, parkingNs)) {
        this.logger.log(
          `switch NS service=${domainServiceId}: NS actuales no son de parking ` +
            `(custom/externos) — no-clobber, skip.`,
        );
        return;
      }
      // currentNs == parking (o vacío defensivo) → conmutar a Aelium.

      const result = await executeActionWithCacheInvalidation(
        plugin,
        service,
        'modify_nameservers',
        { nameservers: aeliumNs },
        {
          actorUserId: null,
          actorLabel: SYSTEM_ACTOR,
          ipAddress: '',
          userAgent: null,
          actorIsAdmin: true, // actor sistema: full rights (modify_nameservers no es adminOnly)
        },
        this.cache,
        this.events,
        this.audit,
        this.breakers,
      );

      if (!result.success) {
        this.logger.warn(
          `switch NS service=${domainServiceId}: modify_nameservers no exitoso ` +
            `(${result.message ?? 'sin mensaje'}) — fail-soft; el reconcile lo reintentará.`,
        );
        return;
      }

      const nextMeta = {
        ...readObject(service.metadata),
        nameservers: aeliumNs,
      };
      await this.prisma.service.update({
        where: { id: domainServiceId },
        data: { metadata: nextMeta as Prisma.InputJsonValue },
      });
      this.logger.log(
        `switch NS service=${domainServiceId}: parking→Aelium ` +
          `[${aeliumNs.join(', ')}] tras añadir hosting (la zona la sirve el DNS authority).`,
      );
    } catch (err) {
      this.logger.warn(
        `switch NS service=${domainServiceId} falló: ${getErrorMessage(err)} — fail-soft.`,
      );
    }
  }

  /** Carga el service de dominio como `ServiceWithRelations` (cliente mínimo: la acción NS no lo usa). */
  private async loadDomainService(
    serviceId: string,
  ): Promise<ServiceWithRelations | null> {
    const row = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        product: {
          select: {
            id: true,
            slug: true,
            name: true,
            type: true,
            provisioner: true,
            provisioner_config: true,
          },
        },
      },
    });
    if (!row) return null;

    return {
      ...row,
      client: {
        id: row.user_id,
        email: '',
        first_name: null,
        last_name: null,
        company_name: null,
        phone: null,
        locale: null,
        country_code: null,
      },
      product: {
        id: row.product.id,
        slug: row.product.slug,
        name: row.product.name,
        type: String(row.product.type),
        provisioner: row.product.provisioner,
        provisioner_config:
          (row.product.provisioner_config as Record<string, unknown> | null) ??
          null,
      },
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

function readObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

/** Lee `metadata.nameservers` (array de strings) defensivamente. */
function readNameservers(metadata: unknown): string[] {
  const v = readObject(metadata).nameservers;
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : [];
}

/** Compara dos sets de NS ignorando case + orden + trailing dot. */
function sameNs(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  const norm = (s: string): string => s.replace(/\.$/, '').toLowerCase().trim();
  const sa = [...a].map(norm).sort();
  const sb = [...b].map(norm).sort();
  return sa.every((x, i) => x === sb[i]);
}
