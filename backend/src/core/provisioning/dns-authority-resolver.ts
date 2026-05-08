/**
 * Sprint 15C Fase 15C.D (2026-05-08) — Cross-plugin DNS authority resolver.
 *
 * Materializa literalmente ADR-082 §6 + decisión 18 de ADR-083.
 *
 * Problema concreto que resuelve:
 *   El cliente abre `/dashboard/services/[id]/dns` para gestionar DNS
 *   records. Si el service es un dominio cuyo plugin (registrar) declara
 *   `has_dns_management=false` (caso ResellerClub: registra dominios pero
 *   los NS apuntan a Aelium), el orquestador NO puede pedir los records
 *   al plugin del registrar. Tiene que resolver "¿quién es la autoridad
 *   DNS de este dominio?" y routear al plugin correcto (típicamente
 *   `enhance_cp` que corre PowerDNS).
 *
 * Reglas canónicas (ADR-082 §6):
 *   1. Si product.type ∈ {hosting_web, docker_service}:
 *      authority='aelium', plugin = primer plugin activo con
 *      has_dns_management=true (canónico: `enhance_cp`). El hosting tiene
 *      su propia zona en Enhance siempre — DH-INV-1.
 *   2. Si product.type === 'domain':
 *      Comparar `service.metadata.nameservers` (lo que vive en RC) vs
 *      setting `provisioning.default_nameservers` (NS-sync C3).
 *        - Match → authority='aelium', plugin = enhance_cp (zona en cluster).
 *        - No match → authority='external', plugin=null (cliente gestiona
 *          DNS en su registrar/proveedor externo).
 *   3. Cualquier otro product.type: authority='external', plugin=null.
 *
 * R4 intacto: este helper vive en `core/provisioning/`, NO en plugin. El
 * plugin RC NO importa el plugin Enhance — el orquestador hace el routing
 * via `PluginRegistryService.getByCapability('has_dns_management')`.
 *
 * El resolver es **PURO** — sólo decide. No invoca al plugin. Quien lo use
 * (controller `/services/:id/dns/records`) llamará a
 * `executeActionWithCacheInvalidation(plugin, service, 'list_dns_records', ...)`
 * con el plugin que devuelva el resolver.
 */

import { Logger } from '@nestjs/common';

import { PluginRegistryService } from './plugin-registry';
import { ProvisionerPlugin, ServiceWithRelations } from './types';

const logger = new Logger('DnsAuthorityResolver');

/**
 * Tipos de producto que SIEMPRE tienen su propia zona DNS gestionada en
 * Aelium (DH-INV-1). Para estos, el resolver devuelve siempre el plugin
 * con has_dns_management=true sin comparar nameservers.
 */
const PRODUCT_TYPES_WITH_OWN_ZONE = new Set<string>([
  'hosting_web',
  'docker_service',
]);

const DOMAIN_PRODUCT_TYPE = 'domain';

export interface DnsAuthorityResolution {
  /**
   * 'aelium' = la zona vive en un plugin Aelium con has_dns_management=true.
   * 'external' = el cliente debe gestionar DNS fuera de Aelium.
   */
  readonly authority: 'aelium' | 'external';

  /**
   * Plugin que sirve los records si authority='aelium'. NULL si 'external'
   * o si no hay ningún plugin activo con has_dns_management=true (caso
   * degenerado: cluster Aelium sin DNS authority instalado).
   */
  readonly plugin: ProvisionerPlugin | null;

  /** Nameservers efectivos del service (si product.type=domain). */
  readonly nameservers: readonly string[];

  /** Razón legible de la resolución — útil para debug + audit + UI banner. */
  readonly reason: string;
}

/**
 * Lee `service.metadata.nameservers` (string array) defensivamente. RC
 * (futuro Sprint 15D) persiste aquí los NS reales del WHOIS al
 * registrar/transferir un dominio. Acepta también `nameservers` como
 * coma-separado o como array de objetos `{host: string}` por si plugins
 * futuros usan otro shape (defensivo, no obligado por contrato hoy).
 */
export function extractServiceNameservers(
  service: ServiceWithRelations,
): readonly string[] {
  const md = service.metadata as Record<string, unknown> | null | undefined;
  const raw = md?.nameservers;
  if (Array.isArray(raw)) {
    return raw
      .map((ns) => {
        if (typeof ns === 'string') return ns.trim().toLowerCase();
        if (ns && typeof ns === 'object' && 'host' in ns) {
          const host = (ns as { host?: unknown }).host;
          if (typeof host === 'string') return host.trim().toLowerCase();
        }
        return '';
      })
      .filter((s) => s.length > 0);
  }
  if (typeof raw === 'string' && raw.length > 0) {
    return raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
  }
  return [];
}

/**
 * Compara dos sets de nameservers ignorando case + orden + trailing dot.
 * Aelium acepta el dominio como "alineado con Aelium" si TODOS los NS de
 * `defaults` están presentes en `service` (puede haber NS adicionales si
 * cliente añadió más, pero los Aelium SI deben estar todos). Esta
 * decisión es defensiva: si Aelium ofrece "ns1+ns2" como pareja canónica,
 * un dominio con "ns1+ns2+ns3-extra" sigue alineado con Aelium para
 * propósito de resolver DNS authority.
 */
export function nameserversMatchAelium(
  serviceNs: readonly string[],
  defaultNs: readonly string[],
): boolean {
  if (defaultNs.length === 0) return false;
  const normalize = (s: string) => s.replace(/\.$/, '').toLowerCase().trim();
  const serviceSet = new Set(serviceNs.map(normalize));
  return defaultNs.every((ns) => serviceSet.has(normalize(ns)));
}

/**
 * Helper canónico (ADR-082 §6 + ADR-083 §5 decisión 18) de resolución de
 * DNS authority. Es síncrono respecto al registry pero asíncrono respecto
 * al lookup del setting `provisioning.default_nameservers` (sólo necesario
 * si product.type=domain).
 *
 * Usage canónico (controller `/services/:id/dns/records`):
 *
 *   const resolution = await resolveDnsAuthority(service, registry, settings);
 *   if (resolution.authority === 'external') {
 *     throw new NotFoundException({
 *       code: 'DNS_MANAGED_EXTERNALLY',
 *       message: 'DNS gestionado externamente',
 *       nameservers: resolution.nameservers,
 *       hint: 'modify_ns_to_aelium_to_enable_dns_management',
 *     });
 *   }
 *   return executeActionWithCacheInvalidation(
 *     resolution.plugin!, service, 'list_dns_records', {}, ...
 *   );
 */
export function resolveDnsAuthority(
  service: ServiceWithRelations,
  registry: PluginRegistryService,
  defaultNameservers: readonly string[],
): DnsAuthorityResolution {
  const productType = service.product.type;
  const dnsPlugin = registry.getByCapability('has_dns_management');

  if (PRODUCT_TYPES_WITH_OWN_ZONE.has(productType)) {
    if (!dnsPlugin) {
      logger.warn(
        `service=${service.id} type=${productType}: no active plugin with ` +
          `has_dns_management=true — cluster sin DNS authority instalado.`,
      );
      return {
        authority: 'external',
        plugin: null,
        nameservers: [],
        reason: 'no_dns_authority_plugin_active',
      };
    }
    return {
      authority: 'aelium',
      plugin: dnsPlugin,
      nameservers: defaultNameservers,
      reason: 'hosting_with_managed_zone',
    };
  }

  if (productType === DOMAIN_PRODUCT_TYPE) {
    const serviceNs = extractServiceNameservers(service);
    if (serviceNs.length === 0) {
      // Service domain sin metadata.nameservers todavía (recién registrado
      // antes del primer reconcile RC, o BYOD sin info). Asumimos external
      // — el cliente puede modificar NS via acción curada `modify_ns`.
      return {
        authority: 'external',
        plugin: null,
        nameservers: [],
        reason: 'domain_nameservers_unknown',
      };
    }
    if (!dnsPlugin) {
      return {
        authority: 'external',
        plugin: null,
        nameservers: serviceNs,
        reason: 'no_dns_authority_plugin_active',
      };
    }
    if (nameserversMatchAelium(serviceNs, defaultNameservers)) {
      return {
        authority: 'aelium',
        plugin: dnsPlugin,
        nameservers: serviceNs,
        reason: 'domain_nameservers_match_default',
      };
    }
    return {
      authority: 'external',
      plugin: null,
      nameservers: serviceNs,
      reason: 'domain_nameservers_external',
    };
  }

  // Cualquier otro tipo (we_do_it, support_inside, custom_service…) — no
  // tiene zona DNS asociada. Frontend debería ocultar la pestaña DNS en
  // estos casos pero el resolver es defensivo.
  return {
    authority: 'external',
    plugin: null,
    nameservers: [],
    reason: 'product_type_without_dns_zone',
  };
}
