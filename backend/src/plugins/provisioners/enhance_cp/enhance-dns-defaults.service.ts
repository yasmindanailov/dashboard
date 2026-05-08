/**
 * Sprint 15C Fase 15C.D (2026-05-08) — `EnhanceDnsDefaultsService`.
 *
 * Materializa ADR-082 §4 (NS-sync 3 capas, propagación C3 → C2) + §5
 * (listener reconcile defensivo) + ADR-083 §5 decisión 20 (bootstrap
 * default DNS records cluster).
 *
 * Doctrina canónica:
 *
 *   • Aelium tiene un único setting fuente de verdad de los nameservers
 *     (`provisioning.default_nameservers`, NS-sync C3). Cuando ese setting
 *     cambia (o cuando el plugin Enhance se enable la primera vez), el
 *     cluster Enhance debe tener los default DNS records globales:
 *
 *       { kind: 'NS', name: '@', value: 'ns1.aelium.net' }
 *       { kind: 'NS', name: '@', value: 'ns2.aelium.net' }
 *
 *     Estos records platform-level se aplican AUTOMÁTICAMENTE a TODA zona
 *     nueva por Enhance. Cero código de runtime de provision (ADR-082 §5).
 *
 *   • Reconcile defensivo: tras `service.activated` con plugin enhance_cp,
 *     verificamos que la zona del dominio tiene los NS canónicos. Si
 *     faltan (caso: admin cambió defaults DESPUÉS de que la zona ya
 *     estuviera creada), los añadimos. **NO borramos records inesperados**
 *     — el operador o cliente pueden haber añadido CNAME/MX/TXT custom.
 *
 *   • Idempotencia: cada operación es safe-to-replay. Si los records ya
 *     existen exactamente como esperamos → no-op. Si algunos faltan →
 *     sólo añadimos los que faltan. Nunca borramos defaults canónicos.
 *
 * R4: este servicio vive en el módulo del plugin (`EnhanceCpModule`).
 * Lo invocan los listeners centrales del `ProvisioningModule` que lo
 * importan vía DI — NO se invoca desde core/provisioning.
 *
 * Errores: degrada elegante. Si la API Enhance no responde, los listeners
 * loguean WARN y emiten `service.dns_defaults_reconcile_failed` futuro
 * (Sprint 12.5 audit transparency) — el sistema sigue operativo, los
 * defaults se reintenta en el siguiente listener tick (otro `service.activated`
 * o el cron L3 reconcile en Sprint 15C Fase 15C.H).
 */

import { Injectable, Logger } from '@nestjs/common';

import {
  EnhanceDefaultDnsRecord,
  EnhanceDnsRecord,
  EnhanceDnsRecordKind,
  EnhanceNewDefaultDnsRecord,
} from './api';
import { EnhanceProvisionerPlugin } from './enhance.plugin';

/** Nameserver record canónico esperado en la lista de defaults globales. */
interface ExpectedNsDefault {
  readonly kind: 'NS';
  readonly name: '@';
  readonly value: string; // ej. 'ns1.aelium.net' (sin trailing dot)
}

interface ApplyDefaultsResult {
  /** Records añadidos en esta ejecución (los que faltaban). */
  readonly added: ReadonlyArray<EnhanceNewDefaultDnsRecord>;
  /** Records que ya existían canónicamente (nada que hacer). */
  readonly preserved: ReadonlyArray<EnhanceDefaultDnsRecord>;
  /**
   * Records de tipo NS en defaults globales que YA NO están en la pareja
   * canónica de Aelium (caso: ns0.legacy.aelium.net tras renombrar). NO
   * se borran automáticamente — el operador decide. El servicio los reporta
   * para audit + alerta.
   */
  readonly stale: ReadonlyArray<EnhanceDefaultDnsRecord>;
}

interface ReconcileZoneResult {
  /** Zone records añadidos en esta ejecución (los que faltaban). */
  readonly added: ReadonlyArray<EnhanceNewDefaultDnsRecord>;
  /** Zone records que ya existían canónicamente. */
  readonly preserved: ReadonlyArray<EnhanceDnsRecord>;
}

@Injectable()
export class EnhanceDnsDefaultsService {
  private readonly logger = new Logger(EnhanceDnsDefaultsService.name);

  constructor(private readonly plugin: EnhanceProvisionerPlugin) {}

  /**
   * Aplica al cluster Enhance los default DNS records platform-level
   * canónicos (NS records apuntando a `nameservers`). Idempotente.
   *
   * Usado por el listener `bootstrap-enhance-defaults-on-plugin-installed`
   * (cuando se habilita el plugin) y por
   * `sync-default-nameservers-to-enhance` (cuando cambia el setting C3).
   *
   * ADR-082 §4 + ADR-083 §5 decisión 20.
   */
  async applyClusterNameservers(
    nameservers: readonly string[],
  ): Promise<ApplyDefaultsResult> {
    if (nameservers.length === 0) {
      throw new Error(
        'applyClusterNameservers: nameservers must be non-empty (R7).',
      );
    }
    const expected: ExpectedNsDefault[] = nameservers.map((ns) => ({
      kind: 'NS',
      name: '@',
      value: normalizeHost(ns),
    }));

    const { client: api } = await this.plugin.getApiClient();
    const existing = await api.listDefaultDnsRecords();

    const existingByKey = indexByKey(existing);

    const added: EnhanceNewDefaultDnsRecord[] = [];
    const preserved: EnhanceDefaultDnsRecord[] = [];

    for (const exp of expected) {
      const key = recordKey(exp.kind, exp.name, exp.value);
      const match = existingByKey.get(key);
      if (match) {
        preserved.push(match);
        continue;
      }
      // No está en la lista global → añadir.
      const body: EnhanceNewDefaultDnsRecord = {
        kind: exp.kind,
        name: exp.name,
        value: exp.value,
      };
      await api.addDefaultDnsRecord(body);
      added.push(body);
      this.logger.log(
        `applyClusterNameservers: added default ${exp.kind} ${exp.name} → ${exp.value}`,
      );
    }

    // Stale = records NS en la lista global que ya no aparecen en la
    // pareja canónica. NO se borran automáticamente — operador decide
    // (puede ser legacy con TTL alto del que clientes aún resuelven).
    const expectedValues = new Set(expected.map((e) => normalizeHost(e.value)));
    const stale = existing.filter(
      (r) =>
        r.kind === 'NS' &&
        r.name === '@' &&
        !expectedValues.has(normalizeHost(r.value)),
    );

    if (stale.length > 0) {
      this.logger.warn(
        `applyClusterNameservers: ${stale.length} stale NS default(s) detected ` +
          `(not in canonical pair) — NOT deleted automatically: ` +
          `[${stale.map((s) => s.value).join(', ')}]. Operador debe decidir.`,
      );
    }

    return { added, preserved, stale };
  }

  /**
   * Reconcile defensivo de una zona DNS específica tras `service.activated`.
   *
   * - Lee la zona del website Enhance (vía `getDnsZone`).
   * - Compara con los NS records esperados (los del setting C3).
   * - Si faltan, los añade directamente a la zona (NO al cluster) — la
   *   zona se creó antes de que estos defaults estuvieran en place, así
   *   que Enhance no los aplicó automáticamente.
   * - Si hay records inesperados extra → NO los borra (cliente o operador
   *   los puso intencionalmente).
   *
   * Idempotente: si la zona ya tiene los records esperados, no-op.
   *
   * ADR-082 §5 — listener reconcile defensivo.
   */
  async reconcileZoneDefaults(
    orgId: string,
    websiteId: string,
    domain: string,
    expectedNameservers: readonly string[],
  ): Promise<ReconcileZoneResult> {
    if (expectedNameservers.length === 0) {
      // Nada que reconciliar. Aún así devolvemos shape vacío sin lanzar:
      // el listener pasaría aquí si el setting está vacío en config edge
      // case — log warn y degradar.
      this.logger.warn(
        `reconcileZoneDefaults org=${orgId} ws=${websiteId} ` +
          `domain=${domain}: expectedNameservers empty — skipping.`,
      );
      return { added: [], preserved: [] };
    }

    const { client: api } = await this.plugin.getApiClient();
    const zone = await api.getDnsZone(orgId, websiteId, domain);

    const expected: Array<{
      kind: EnhanceDnsRecordKind;
      name: string;
      value: string;
    }> = expectedNameservers.map((ns) => ({
      kind: 'NS',
      name: '@',
      value: normalizeHost(ns),
    }));

    const zoneIndex = indexByKey(zone.records);
    const added: EnhanceNewDefaultDnsRecord[] = [];
    const preserved: EnhanceDnsRecord[] = [];

    for (const exp of expected) {
      const key = recordKey(exp.kind, exp.name, exp.value);
      const match = zoneIndex.get(key);
      if (match) {
        preserved.push(match);
        continue;
      }
      const body = {
        kind: exp.kind,
        name: exp.name,
        value: exp.value,
      };
      await api.addDnsRecord(orgId, websiteId, domain, body);
      added.push(body);
      this.logger.log(
        `reconcileZoneDefaults org=${orgId} ws=${websiteId} domain=${domain}: ` +
          `added missing ${exp.kind} ${exp.name} → ${exp.value}`,
      );
    }

    return { added, preserved };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

/** Normaliza un hostname: lowercase + trim + sin trailing dot. */
function normalizeHost(host: string): string {
  return host.replace(/\.$/, '').toLowerCase().trim();
}

/** Clave canónica de matching: `<kind>|<name>|<value normalizado>`. */
function recordKey(
  kind: EnhanceDnsRecordKind,
  name: string,
  value: string,
): string {
  return `${kind}|${name.toLowerCase()}|${normalizeHost(value)}`;
}

interface RecordWithKey {
  readonly kind: EnhanceDnsRecordKind;
  readonly name: string;
  readonly value: string;
}

function indexByKey<T extends RecordWithKey>(
  records: readonly T[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const r of records) {
    map.set(recordKey(r.kind, r.name, r.value), r);
  }
  return map;
}
