import * as crypto from 'crypto';

/**
 * Namespace UUID v5 fijo para derivar `audit_change_log.entity_id`
 * determinístico desde el slug del plugin (Sprint 15A — ADR-080 §2 +
 * audit_change_log §schema).
 *
 * Razón: `audit_change_log.entity_id` es `@db.Uuid` estricto en Postgres
 * porque la mayoría de entidades del sistema usan UUID PK. Los plugins son
 * la excepción canónica con PK natural slug (ADR-080 §2). En lugar de
 * cambiar el schema de audit (impactaría a todas las tablas), derivamos un
 * UUID determinístico del slug. El slug real se preserva legible en
 * `changes_before.slug` / `changes_after.slug` para búsquedas humanas.
 *
 * El namespace es un UUID v4 generado UNA vez y congelado aquí. Cambiarlo
 * rompería la trazabilidad histórica (los `audit_change_log` antiguos
 * quedarían huérfanos del nuevo `entity_id`).
 *
 * Implementación RFC 4122 §4.3 nativa con `node:crypto` (sin dep `uuid`
 * para evitar problemas ESM↔CJS de uuid@14 en ts-jest). Equivalente
 * bit-exact a `import { v5 } from 'uuid'`.
 *
 * Sprint 15C.II Fase F.2 (2026-05-12): extraído de `AdminPluginsService` a
 * este util compartido — ahora también lo consume
 * `AuditOnPluginReconcileCompletedListener` para escribir/consultar el
 * audit del rollup `reconcile_completed` por plugin con el mismo
 * `entity_id` que `plugin.config_changed` / `plugin.reconcile_triggered_manually`.
 */
const PLUGIN_AUDIT_NAMESPACE = 'a8f1c4d2-3b5e-4f6a-9c2d-1e7b3f8a5c9d';

export function deriveAuditEntityId(slug: string): string {
  const nsBytes = Buffer.from(PLUGIN_AUDIT_NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = crypto
    .createHash('sha1')
    .update(nsBytes)
    .update(slug, 'utf8')
    .digest();
  // RFC 4122 §4.3: version 5 + variant RFC 4122
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
