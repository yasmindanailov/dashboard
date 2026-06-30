import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { Prisma } from '@prisma/client';
import Ajv, { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

import { PrismaService } from '../../core/database/prisma.service';
import { CircuitBreakerRegistry } from '../../core/provisioning/circuit-breaker';
import type { CircuitBreakerState } from '../../core/provisioning/circuit-breaker';
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import { deriveAuditEntityId } from '../../core/provisioning/plugin-audit-id.util';
import {
  ReconcileRegistryService,
  ReconcileResult,
} from '../../core/provisioning/reconcile-registry.service';
import { SecretVaultService } from '../../core/security/secret-vault.service';
import {
  PluginManifest,
  ProvisionerPlugin,
} from '../../core/provisioning/types';
import { AiProviderRegistry } from '../../core/ai/ai-provider-registry.service';
import { AiProviderPlugin } from '../../core/ai/types';
import { AuditService } from '../audit/audit.service';

import { AdminPluginUpdateDto } from './dto/admin-plugin-update.dto';
import {
  PluginHealthStatus,
  PluginOperationalOverview,
  PluginReconcileChangeType,
} from './dto/plugin-operational-overview.dto';

/**
 * Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1) — shape de
 * respuesta canónico del endpoint `POST /api/v1/admin/plugins/:slug/reconcile-all`.
 *
 * Coherente con `ReconcileResult` interno del registry pero con campos
 * snake_case + `triggered_at` ISO timestamp para serialización REST canónica.
 */
export interface ReconcileAllResponse {
  readonly slug: string;
  readonly triggered_at: string;
  readonly services_processed: number;
  readonly drifts_detected: number;
  readonly duration_ms: number;
  readonly details: Readonly<Record<string, unknown>> | null;
}

/**
 * F3·E13 Fase E (ADR-080 Amendment D) — el panel `/admin/settings/plugins`
 * gestiona DOS tipos de plugin que comparten infraestructura (`plugin_installs`
 * + SecretVault + `PluginManifest`) pero tienen registries/contratos distintos:
 *   - `provisioner` (hosting/dominios) → `PluginRegistryService`.
 *   - `ai` (subsistema IA paralelo) → `AiProviderRegistry`.
 * El service resuelve por slug a esta unión etiquetada; la lógica compartida
 * (config/secrets/audit/emit) opera sobre `{ slug, manifest }`, y solo lo
 * type-específico (test-connection, overview, reconcile) ramifica por `kind`.
 */
type ResolvedPlugin =
  | {
      kind: 'provisioner';
      slug: string;
      manifest: PluginManifest;
      provisioner: ProvisionerPlugin;
    }
  | {
      kind: 'ai';
      slug: string;
      manifest: PluginManifest;
      ai: AiProviderPlugin;
    };

/** Subset que las rutinas compartidas necesitan (cualquiera de los 2 tipos). */
type ManifestCarrier = { slug: string; manifest: PluginManifest };

/**
 * AdminPluginsService — Sprint 15A Fase G (ADR-080 §7).
 *
 * Responsabilidades:
 *  1. Listar plugins disponibles (DI + contrato OK) con su manifest +
 *     estado de instalación + estado del circuit breaker.
 *  2. Detalle por slug (sin exponer secrets descifrados — los secrets
 *     responden como `{ <field>: '***' }` si están seteados, `null` si no).
 *  3. PATCH: actualiza `enabled`/`config`/`secrets` con validación Ajv
 *     contra `manifest.configSchema`/`manifest.secretsSchema`. Cifra
 *     secrets nuevos. Preserva secrets omitidos (parcial-update).
 *  4. Test-connection: según `manifest.testConnectionMethod` — `'custom'`
 *     invoca `plugin.testConnection()` (probe ligero contra el proveedor,
 *     sin servicio); `'getStatus'` invoca `plugin.getStatus()` con un service
 *     sintético; `null` ⇒ 400. Sprint 15C.II Fase F.3 (GAP-15CII-G8).
 *
 * Doctrina canónica:
 *   - **Secrets nunca salen del backend** (R12). GET no devuelve plaintext;
 *     solo `{ <field>: '***' }` para indicar "está seteado" vs `null`.
 *   - **Validación Ajv lazy + cacheada** por slug. Compilamos el schema
 *     la primera vez que se valida un payload del plugin; el resultado se
 *     guarda en `validateConfigCache` / `validateSecretsCache`. Los schemas
 *     son inmutables durante la vida del proceso (parte del manifest del
 *     plugin → recompilan en redeploy si el plugin cambia).
 *   - **Audit obligatorio** (R3 + ADR-017): cada PATCH genera un
 *     `audit_change_log` con `entity_type='Plugin'`, `entity_id=slug`,
 *     `action='plugin.config_changed'`, `changes_before`/`changes_after`.
 *     Los valores secretos NO entran en el audit — solo `{ <field>: '<set>' }`
 *     o `{ <field>: '<cleared>' }`.
 *   - **Emit canónico**: tras persistir, emite `plugin.config_changed`
 *     (consumido por `PluginRegistryService.handleConfigChanged` para
 *     reload runtime) + `plugin.installed` la primera vez que se enable
 *     un plugin no bootstrap.
 *   - **Strict Ajv**: configurado con `strict: false` para permitir
 *     `format: 'password'` y `format: 'uri'` sin errores adicionales —
 *     `addFormats` los provee. `removeAdditional` para sanear payloads.
 */
@Injectable()
export class AdminPluginsService implements OnModuleInit {
  private readonly logger = new Logger(AdminPluginsService.name);

  private readonly ajv: Ajv;
  private readonly validateConfigCache = new Map<string, ValidateFunction>();
  private readonly validateSecretsCache = new Map<string, ValidateFunction>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PluginRegistryService,
    private readonly vault: SecretVaultService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly breakers: CircuitBreakerRegistry,
    // Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1) — registry
    // genérico de executors `reconcile-all`. Cada plugin con
    // capabilities.supports_reconciliation registra su executor en
    // onModuleInit del cron correspondiente.
    private readonly reconcileRegistry: ReconcileRegistryService,
    // F3·E13 Fase E (ADR-080 Amendment D) — registry del subsistema IA
    // paralelo. El panel admin gestiona sus plugins (ej. `anthropic`) con el
    // mismo flujo de config/secrets/test-connection que los provisioners.
    private readonly aiRegistry: AiProviderRegistry,
  ) {
    this.ajv = new Ajv({
      strict: false,
      allErrors: true,
      removeAdditional: 'all',
      useDefaults: true,
    });
    addFormats(this.ajv);
  }

  onModuleInit(): void {
    // Pre-compilamos los schemas de TODOS los plugins disponibles (provisioner
    // + IA) para detectar schemas inválidos al boot (fail-fast). En runtime, el
    // cache evita recompilación.
    const allSlugs = [
      ...this.registry.listAvailableSlugs(),
      ...this.aiRegistry.listAvailableSlugs(),
    ];
    for (const slug of allSlugs) {
      const resolved = this.resolvePlugin(slug);
      if (resolved) {
        try {
          this.compileForPlugin(resolved);
        } catch (err) {
          // No tirar el boot — el plugin queda fuera del set "instalable"
          // pero el resto del sistema sigue (R7).
          this.logger.error(
            `Failed to compile manifest schemas for plugin "${slug}": ${(err as Error).message}`,
          );
        }
      }
    }
  }

  /**
   * Resuelve un slug a su plugin (provisioner primero, IA después). Devuelve
   * una unión etiquetada con el `manifest` común + la referencia al plugin
   * concreto. `null` si ningún registry lo conoce.
   */
  private resolvePlugin(slug: string): ResolvedPlugin | null {
    const provisioner = this.registry.getAvailable(slug);
    if (provisioner) {
      return {
        kind: 'provisioner',
        slug,
        manifest: provisioner.manifest,
        provisioner,
      };
    }
    const ai = this.aiRegistry.getAvailable(slug);
    if (ai) {
      return { kind: 'ai', slug, manifest: ai.manifest, ai };
    }
    return null;
  }

  /** Como `resolvePlugin` pero lanza 404 si ningún registry conoce el slug. */
  private requirePlugin(slug: string): ResolvedPlugin {
    const resolved = this.resolvePlugin(slug);
    if (!resolved) {
      const known = [
        ...this.registry.listAvailableSlugs(),
        ...this.aiRegistry.listAvailableSlugs(),
      ].join(', ');
      throw new NotFoundException(
        `Plugin "${slug}" not registered. Available: [${known}].`,
      );
    }
    return resolved;
  }

  /**
   * Lista todos los plugins disponibles (DI + contrato OK) con su manifest +
   * estado de instalación + estado del circuit breaker.
   *
   * Útil para `/admin/settings/plugins` (UI lista cards).
   */
  async list() {
    const installs = await this.prisma.pluginInstall.findMany({
      orderBy: { slug: 'asc' },
    });
    const installsBySlug = new Map(installs.map((i) => [i.slug, i]));

    // Provisioners primero, luego proveedores IA (ADR-080 Amendment D).
    const availableSlugs = [
      ...this.registry.listAvailableSlugs(),
      ...this.aiRegistry.listAvailableSlugs(),
    ];
    return availableSlugs.map((slug) => this.summarize(slug, installsBySlug));
  }

  /** Detalle por slug. Secrets devueltos como `'***'` si seteados, `null` si no. */
  async findOne(slug: string) {
    const resolved = this.requirePlugin(slug);
    const install = await this.prisma.pluginInstall.findUnique({
      where: { slug },
    });

    return {
      slug,
      manifest: resolved.manifest,
      enabled: install?.enabled ?? false,
      installed_at: install?.installed_at?.toISOString() ?? null,
      updated_at: install?.updated_at?.toISOString() ?? null,
      config: this.loadConfig(install?.config),
      secrets: this.maskSecrets(resolved, install?.secrets),
      circuit_state: this.collectCircuitState(slug),
    };
  }

  /**
   * Actualiza enabled / config / secrets. Idempotente: si el plugin no
   * tiene fila aún (caso plugin nuevo nunca tocado), la upsert crea una.
   */
  async update(
    slug: string,
    actorUserId: string,
    dto: AdminPluginUpdateDto,
  ): Promise<{ slug: string; enabled: boolean; updated_at: string }> {
    const resolved = this.requirePlugin(slug);

    // 1. Validar config contra manifest.configSchema con Ajv.
    if (dto.config !== undefined) {
      this.validateConfigOrThrow(resolved, dto.config);
    }

    // 2. Validar secrets contra manifest.secretsSchema con Ajv.
    if (dto.secrets !== undefined) {
      this.validateSecretsOrThrow(resolved, dto.secrets);
    }

    // 3. Cargar estado anterior para audit + parcial-update de secrets.
    const before = await this.prisma.pluginInstall.findUnique({
      where: { slug },
    });

    // 4. Construir nuevos valores (preservar secrets omitidos).
    const previousSecrets = this.parseSecretsRecord(before?.secrets);
    const nextSecretsPlain = {
      ...this.decryptKnownSecrets(resolved, previousSecrets),
    };
    if (dto.secrets) {
      for (const [field, value] of Object.entries(dto.secrets)) {
        nextSecretsPlain[field] = value;
      }
    }
    const nextSecretsEncrypted = this.vault.encryptRecord(nextSecretsPlain);

    const nextConfig = dto.config ?? this.loadConfig(before?.config);
    const nextEnabled = dto.enabled ?? before?.enabled ?? false;
    const wasEnabled = before?.enabled ?? false;

    // 5. Persistir (upsert idempotente). Cast explícito a `Prisma.InputJsonValue`
    //    requerido por el cliente Prisma: `Record<string, unknown>` no satisface
    //    su tipo estricto Jsonb (ya validado por Ajv arriba).
    const configJson = nextConfig as unknown as Prisma.InputJsonValue;
    const secretsJson =
      nextSecretsEncrypted as unknown as Prisma.InputJsonValue;
    const updated = await this.prisma.pluginInstall.upsert({
      where: { slug },
      create: {
        slug,
        enabled: nextEnabled,
        config: configJson,
        secrets: secretsJson,
        key_version: this.vault.currentKeyVersion,
        installed_at: new Date(),
        installed_by: actorUserId,
        updated_by: actorUserId,
      },
      update: {
        enabled: nextEnabled,
        config: configJson,
        secrets: secretsJson,
        key_version: this.vault.currentKeyVersion,
        updated_by: actorUserId,
      },
    });

    // 6. Audit log canónico (R3) — secrets NUNCA en plaintext.
    //    `entity_id` es @db.Uuid estricto en audit_change_log → derivamos
    //    UUID v5 determinístico del slug. El slug real va a changes_*.slug
    //    para búsqueda humana (ver namespace canónico arriba).
    await this.audit.logChange({
      user_id: actorUserId,
      entity_type: 'Plugin',
      entity_id: deriveAuditEntityId(slug),
      action: 'plugin.config_changed',
      changes_before: {
        slug,
        enabled: wasEnabled,
        config: this.loadConfig(before?.config),
        secrets: this.maskSecretsForAudit(resolved, previousSecrets),
      },
      changes_after: {
        slug,
        enabled: nextEnabled,
        config: nextConfig,
        secrets: this.maskSecretsForAudit(resolved, nextSecretsEncrypted),
      },
    });

    // 7. Emit canónico — `PluginRegistryService` recarga `activePlugins`.
    const secretsModified = dto.secrets !== undefined;
    this.events.emit('plugin.config_changed', {
      slug,
      changed_by: actorUserId,
      changed_at: updated.updated_at.toISOString(),
      secrets_modified: secretsModified,
    });

    // 8. Si pasamos de no-existente o disabled → enabled, emitir installed.
    const isFirstEnable = !before && nextEnabled;
    const isReEnable = !!before && !wasEnabled && nextEnabled;
    if (isFirstEnable || isReEnable) {
      this.events.emit('plugin.installed', {
        slug,
        installed_by: actorUserId,
        installed_at: updated.installed_at.toISOString(),
      });
    }

    // 9. Reset circuit breakers asociados al plugin (config nueva =
    //    cambios pueden resolver una caída). Mejor UX: el siguiente
    //    intento entra en closed sin esperar el reset_timeout. Solo aplica a
    //    provisioners (los plugins IA no tienen breakers por-operación aquí;
    //    el del subsistema IA vive en `AiSuggestionService`).
    if (
      resolved.kind === 'provisioner' &&
      (secretsModified || dto.config !== undefined)
    ) {
      for (const op of ['getServiceInfo', 'executeAction']) {
        const breaker = this.breakers.get(`${slug}:${op}`);
        if (breaker && breaker.getState() !== 'closed') {
          breaker.reset();
        }
      }
    }

    return {
      slug: updated.slug,
      enabled: updated.enabled,
      updated_at: updated.updated_at.toISOString(),
    };
  }

  /**
   * Test-connection. Dos modos según `manifest.testConnectionMethod`:
   *
   *  - `'custom'` (Sprint 15C.II Fase F.3 — GAP-15CII-G8): invoca
   *    `plugin.testConnection()` — un *probe* ligero contra el proveedor con
   *    las credenciales configuradas, **independiente de cualquier servicio**.
   *    Es el modo correcto para plugins cuyo `getStatus()` requiere un
   *    `provider_reference` real (Enhance: `getStatus` sobre un servicio
   *    sintético siempre reportaba "sin metadata" — falso negativo).
   *  - `'getStatus'`: invoca `plugin.getStatus()` con un servicio sintético
   *    mínimo (incluye `metadata: {}` para no romper plugins que lo lean).
   *    Reservado para plugins cuyo `getStatus` no depende de estado externo
   *    por servicio.
   *
   * `null` (o `'custom'` sin `testConnection()` implementado) → 400.
   */
  async testConnection(slug: string): Promise<{
    success: boolean;
    message: string;
    checked_at: string;
  }> {
    const resolved = this.requirePlugin(slug);

    // F3·E13 Fase E — proveedor IA: su `testConnection(ctx)` necesita el
    // contexto (config + secrets descifrados), distinto de la firma sin args
    // del provisioner. Construimos el ctx aquí (R12: secrets nunca salen).
    if (resolved.kind === 'ai') {
      return this.testAiConnection(resolved.ai, slug);
    }

    const plugin = resolved.provisioner;
    const method = plugin.manifest.testConnectionMethod;

    if (method === 'custom') {
      if (typeof plugin.testConnection !== 'function') {
        throw new BadRequestException(
          `Plugin "${slug}" declares testConnectionMethod='custom' but does not implement testConnection(). ` +
            `This is a wiring bug — the plugin must implement the contract method.`,
        );
      }
      try {
        const result = await plugin.testConnection();
        if (!result.ok) {
          this.logger.warn(
            `test-connection failed for plugin "${slug}": ${result.message}`,
          );
        }
        return {
          success: result.ok,
          message: result.message,
          checked_at: new Date().toISOString(),
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'unexpected error from plugin';
        this.logger.warn(
          `test-connection threw for plugin "${slug}": ${message}`,
        );
        return {
          success: false,
          message,
          checked_at: new Date().toISOString(),
        };
      }
    }

    if (method === 'getStatus') {
      const syntheticService = this.buildSyntheticService(slug);
      try {
        const report = await plugin.getStatus(syntheticService);
        return {
          success: report.status !== 'unknown' && report.status !== 'failed',
          message: report.statusReason ?? `Status reported: ${report.status}`,
          checked_at: report.checkedAt,
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'unexpected error from plugin';
        this.logger.warn(
          `test-connection failed for plugin "${slug}": ${message}`,
        );
        return {
          success: false,
          message,
          checked_at: new Date().toISOString(),
        };
      }
    }

    throw new BadRequestException(
      `Plugin "${slug}" does not support test-connection (manifest.testConnectionMethod=${method ?? 'null'}).`,
    );
  }

  /**
   * Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1) —
   * `reconcile-all` admin endpoint para plugins SaaS.
   *
   * Trigger manual del executor reconcile registrado por el plugin (ver
   * `ReconcileRegistryService`). Doble propósito doctrinal:
   *   1. UX A2 — botón "↻ Reconciliar todos los servicios contra <Plugin>
   *      ahora" en `/admin/settings/plugins/[slug]` (sin esperar el cron).
   *   2. Gap G1 — desbloquea smoke testing manual sin esperar la próxima
   *      ventana del cron L3 (típicamente 6h en plugin Enhance).
   *
   * Validaciones (defense in depth):
   *   - Plugin debe estar registrado y validado (DI + contrato OK).
   *   - Plugin debe declarar `capabilities.supports_reconciliation = true`.
   *   - Plugin debe haber registrado un executor en el registry global
   *     (típicamente vía `onModuleInit()` del cron reconciliation).
   *
   * Audit canónico (R3): emite `audit_change_log` con
   * `action='plugin.reconcile_triggered_manually'` + actor_user_id +
   * payload con el resultado normalizado. Esto cierra la trazabilidad
   * RGPD del trigger manual (quién, cuándo, qué resultado).
   *
   * Heredable a 15D RC (`resellerclub`), 15E Docker, 15G Plesk.
   */
  async reconcileAll(
    slug: string,
    actorUserId: string,
  ): Promise<ReconcileAllResponse> {
    const plugin = this.requireValidatedPlugin(slug);

    if (!plugin.capabilities.supports_reconciliation) {
      throw new BadRequestException(
        `Plugin "${slug}" does not declare capabilities.supports_reconciliation=true. ` +
          `Reconcile-all only applies to plugins that maintain external state synced via cron.`,
      );
    }

    if (!this.reconcileRegistry.hasExecutor(slug)) {
      throw new BadRequestException(
        `Plugin "${slug}" declares supports_reconciliation=true but has not registered ` +
          `a reconcile executor. This is a wiring bug — the plugin module should register ` +
          `via ReconcileRegistryService.register(slug, executor) in onModuleInit().`,
      );
    }

    this.logger.log(
      `Manual reconcile-all triggered for plugin "${slug}" by user=${actorUserId}.`,
    );

    let result: ReconcileResult;
    try {
      result = await this.reconcileRegistry.runFor(slug);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'unexpected reconcile failure';
      this.logger.error(
        `reconcile-all failed for plugin "${slug}" (actor=${actorUserId}): ${message}`,
      );
      // Audit del fallo (trazabilidad operativa) antes de re-lanzar.
      await this.audit.logChange({
        user_id: actorUserId,
        entity_type: 'Plugin',
        entity_id: deriveAuditEntityId(slug),
        action: 'plugin.reconcile_triggered_manually',
        changes_before: null,
        changes_after: { slug, success: false, error: message },
      });
      throw err;
    }

    // Audit canónico del éxito + payload normalizado (no contiene secrets,
    // solo conteos agregados — safe para auditar al completo).
    await this.audit.logChange({
      user_id: actorUserId,
      entity_type: 'Plugin',
      entity_id: deriveAuditEntityId(slug),
      action: 'plugin.reconcile_triggered_manually',
      changes_before: null,
      changes_after: {
        slug,
        success: true,
        services_processed: result.servicesProcessed,
        drifts_detected: result.driftsDetected,
        duration_ms: result.durationMs,
        details: result.details ?? null,
      },
    });

    return {
      slug,
      triggered_at: new Date().toISOString(),
      services_processed: result.servicesProcessed,
      drifts_detected: result.driftsDetected,
      duration_ms: result.durationMs,
      details: result.details ?? null,
    };
  }

  /**
   * Sprint 15C.II Fase F.2 (ADR-083 Amendment A4.4) — resumen operativo del
   * plugin para `/admin/settings/plugins/[slug]` (`<PluginOperationalOverview>`).
   *
   * Construye un shape **plugin-agnóstico** (heredable a 15D RC / 15E / 15G)
   * a partir de:
   *  - manifest (label, secrets requeridos),
   *  - capabilities (`supports_reconciliation`),
   *  - circuit breakers in-process (`getServiceInfo` + `executeAction`),
   *  - `services` count (active / suspended) por `provisioner_slug`,
   *  - audit `reconcile_completed` (última pasada — estado observado),
   *  - audit `reconciled_external_change` (drifts 24h — ventana vía índice
   *    `created_at`, filtrado por `_meta.plugin_slug` en memoria).
   *
   * La salud (`operational | degraded | down | disabled`) se deriva de:
   *  - `disabled`  si el plugin no está habilitado.
   *  - `down`      si algún circuit está `open`, o falta un secret requerido.
   *  - `degraded`  si algún circuit está `half-open`, o la última pasada de
   *                reconciliación tuvo errores.
   *  - `operational` en otro caso.
   * `reasons` siempre tiene ≥1 clave i18n explicativa.
   */
  async getOperationalOverview(
    slug: string,
  ): Promise<PluginOperationalOverview> {
    const plugin = this.requireValidatedPlugin(slug);
    const install = await this.prisma.pluginInstall.findUnique({
      where: { slug },
    });
    const enabled = install?.enabled ?? false;

    const circuit = this.collectCircuitState(slug) as {
      getServiceInfo: CircuitBreakerState | null;
      executeAction: CircuitBreakerState | null;
    };
    const secrets = this.collectSecretsStatus(plugin, install?.secrets);

    const supportsReconciliation =
      plugin.capabilities.supports_reconciliation === true &&
      this.reconcileRegistry.hasExecutor(slug);

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [activeCount, suspendedCount, lastReconcileRow, driftRows] =
      await Promise.all([
        this.prisma.service.count({
          where: { provisioner_slug: slug, status: 'active' },
        }),
        this.prisma.service.count({
          where: { provisioner_slug: slug, status: 'suspended' },
        }),
        this.prisma.auditChangeLog.findFirst({
          where: {
            entity_type: 'Plugin',
            entity_id: deriveAuditEntityId(slug),
            action: 'reconcile_completed',
          },
          orderBy: { created_at: 'desc' },
          select: { changes_after: true, created_at: true },
        }),
        // Ventana 24h acotada por el índice `created_at`; filtramos por
        // `_meta.plugin_slug` en memoria (un único plugin SaaS hoy; aun con
        // varios, 24h de drifts es un conjunto pequeño). `take` como tope
        // duro defensivo ante un proveedor que degrade en bucle.
        this.prisma.auditChangeLog.findMany({
          where: {
            entity_type: 'Service',
            action: 'reconciled_external_change',
            created_at: { gte: since24h },
          },
          orderBy: { created_at: 'desc' },
          take: 500,
          select: { entity_id: true, changes_after: true, created_at: true },
        }),
      ]);

    const pluginDrifts = driftRows.filter(
      (row) => readMetaString(row.changes_after, 'plugin_slug') === slug,
    );
    const recentDrifts = pluginDrifts.slice(0, 20).map((row) => ({
      service_id: row.entity_id,
      change_type: normalizeChangeType(
        readMetaString(row.changes_after, 'change_type'),
      ),
      detected_at:
        readMetaString(row.changes_after, 'detected_at') ??
        row.created_at.toISOString(),
    }));

    const last = lastReconcileRow
      ? readReconcileSummary(
          lastReconcileRow.changes_after,
          lastReconcileRow.created_at,
        )
      : null;

    const scheduleMeta = supportsReconciliation
      ? this.reconcileRegistry.getScheduleMeta(slug)
      : null;
    const nextScheduledAt =
      scheduleMeta && scheduleMeta.intervalSeconds > 0
        ? new Date(
            Math.ceil(Date.now() / (scheduleMeta.intervalSeconds * 1000)) *
              scheduleMeta.intervalSeconds *
              1000,
          ).toISOString()
        : null;

    const health = deriveHealth({
      enabled,
      circuit,
      missingSecrets: secrets.missing,
      lastReconcileErrors: last?.errors ?? 0,
      supportsReconciliation,
    });

    return {
      slug,
      label: plugin.manifest.label,
      enabled,
      health,
      circuit,
      secrets,
      services: { active: activeCount, suspended: suspendedCount },
      reconciliation: {
        supported: supportsReconciliation,
        // Sprint 15C.II F.9 (R9 frozen §A.11.10.6.2 Amendment III):
        // capability-driven por presencia del executor en el registry — el
        // frontend gatea el CTA "Reconciliar contra el proveedor" leyendo
        // este flag sin tocar PluginManifest declarativo (coherente A6/A7).
        supports_reconcile_one:
          this.reconcileRegistry.hasReconcileOneExecutor(slug),
        last,
        next_scheduled_at: nextScheduledAt,
        drifts_24h: pluginDrifts.length,
      },
      recent_drifts: recentDrifts,
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Helpers privados ───────────────────────────────────────────────

  /**
   * F3·E13 Fase E — test-connection del proveedor IA. Descifra los secrets
   * (R12: nunca salen del backend) + carga la config, arma el
   * `AiProviderRuntimeContext` y llama `plugin.testConnection(ctx)` (probe
   * ligero contra el proveedor; sin api_key → `{ ok:false }` con detalle).
   */
  private async testAiConnection(
    ai: AiProviderPlugin,
    slug: string,
  ): Promise<{ success: boolean; message: string; checked_at: string }> {
    const install = await this.prisma.pluginInstall.findUnique({
      where: { slug },
    });
    const config = this.loadConfig(install?.config);
    const secrets = this.decryptKnownSecrets(
      { slug, manifest: ai.manifest },
      this.parseSecretsRecord(install?.secrets),
    );
    try {
      const result = await ai.testConnection({ config, secrets });
      if (!result.ok) {
        this.logger.warn(
          `test-connection failed for AI plugin "${slug}": ${result.detail ?? 'sin detalle'}`,
        );
      }
      return {
        success: result.ok,
        message:
          result.detail ??
          (result.ok ? 'Conexión verificada.' : 'Error de conexión.'),
        checked_at: new Date().toISOString(),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'unexpected error from AI plugin';
      this.logger.warn(
        `test-connection threw for AI plugin "${slug}": ${message}`,
      );
      return { success: false, message, checked_at: new Date().toISOString() };
    }
  }

  /**
   * Estado de cobertura de los secrets **requeridos** por el manifest:
   * cuántos pide, cuántos están seteados (cifrados en BD), y los nombres de
   * los que faltan. NO devuelve valores — solo presencia (R12).
   */
  private collectSecretsStatus(
    plugin: ProvisionerPlugin,
    encryptedRaw: unknown,
  ): { required: number; configured: number; missing: string[] } {
    const schema = plugin.manifest.secretsSchema as {
      required?: string[];
    } | null;
    const required = Array.isArray(schema?.required) ? schema.required : [];
    const encrypted = this.parseSecretsRecord(encryptedRaw);
    const missing = required.filter((field) => !encrypted[field]);
    return {
      required: required.length,
      configured: required.length - missing.length,
      missing,
    };
  }

  /**
   * Devuelve el plugin si está validado (DI + contrato OK), aunque NO esté
   * enabled. La UI admin debe poder verlo + habilitarlo.
   */
  private requireValidatedPlugin(slug: string): ProvisionerPlugin {
    const plugin = this.findPluginInValidated(slug);
    if (!plugin) {
      throw new NotFoundException(
        `Plugin "${slug}" not registered. Available: [${this.registry.listAvailableSlugs().join(', ')}].`,
      );
    }
    return plugin;
  }

  /**
   * Devuelve el plugin VALIDADO (DI + contrato OK) por slug, ignorando si
   * está enabled. Wrapper sobre `PluginRegistryService.getAvailable` para
   * mantener la API local del service.
   */
  private findPluginInValidated(slug: string): ProvisionerPlugin | null {
    return this.registry.getAvailable(slug);
  }

  private summarize(
    slug: string,
    installsBySlug: Map<string, { enabled: boolean; updated_at: Date }>,
  ) {
    const resolved = this.resolvePlugin(slug);
    const install = installsBySlug.get(slug);
    return {
      slug,
      manifest: resolved?.manifest ?? null,
      enabled: install?.enabled ?? false,
      updated_at: install?.updated_at?.toISOString() ?? null,
      // Los plugins IA no tienen circuit breakers por-operación de provisioning;
      // `collectCircuitState` devuelve `{null, null}` (no existe la clave).
      circuit_state: this.collectCircuitState(slug),
    };
  }

  private collectCircuitState(slug: string): {
    getServiceInfo: string | null;
    executeAction: string | null;
  } {
    return {
      getServiceInfo:
        this.breakers.get(`${slug}:getServiceInfo`)?.getState() ?? null,
      executeAction:
        this.breakers.get(`${slug}:executeAction`)?.getState() ?? null,
    };
  }

  private compileForPlugin(plugin: ManifestCarrier): void {
    if (!this.validateConfigCache.has(plugin.slug)) {
      this.validateConfigCache.set(
        plugin.slug,
        this.ajv.compile(plugin.manifest.configSchema),
      );
    }
    if (!this.validateSecretsCache.has(plugin.slug)) {
      this.validateSecretsCache.set(
        plugin.slug,
        this.ajv.compile(plugin.manifest.secretsSchema),
      );
    }
  }

  private validateConfigOrThrow(
    plugin: ManifestCarrier,
    payload: Record<string, unknown>,
  ): void {
    this.compileForPlugin(plugin);
    const validate = this.validateConfigCache.get(plugin.slug);
    if (!validate) {
      throw new BadRequestException(
        `Plugin "${plugin.slug}" config schema not compiled.`,
      );
    }
    if (!validate(payload)) {
      throw new BadRequestException({
        code: 'INVALID_PLUGIN_CONFIG',
        details: this.formatAjvErrors(validate.errors ?? []),
      });
    }
  }

  private validateSecretsOrThrow(
    plugin: ManifestCarrier,
    payload: Record<string, unknown>,
  ): void {
    this.compileForPlugin(plugin);
    const validate = this.validateSecretsCache.get(plugin.slug);
    if (!validate) {
      throw new BadRequestException(
        `Plugin "${plugin.slug}" secrets schema not compiled.`,
      );
    }
    if (!validate(payload)) {
      throw new BadRequestException({
        code: 'INVALID_PLUGIN_SECRETS',
        details: this.formatAjvErrors(validate.errors ?? []),
      });
    }
  }

  private formatAjvErrors(
    errors: ErrorObject[],
  ): Array<{ path: string; message: string }> {
    return errors.map((err) => ({
      path: err.instancePath || '/',
      message: err.message ?? 'invalid',
    }));
  }

  private loadConfig(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  /**
   * Convierte el Jsonb persistido en `EncryptedRecord` (pre-vault). Tolera
   * blobs malformados devolviendo un mapa vacío + log warning.
   */
  private parseSecretsRecord(
    raw: unknown,
  ): Record<
    string,
    { ciphertext: string; iv: string; tag: string; key_version: number }
  > {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const record = raw as Record<string, unknown>;
    const out: Record<
      string,
      { ciphertext: string; iv: string; tag: string; key_version: number }
    > = {};
    for (const [key, blob] of Object.entries(record)) {
      if (
        blob &&
        typeof blob === 'object' &&
        'ciphertext' in blob &&
        'iv' in blob &&
        'tag' in blob &&
        'key_version' in blob
      ) {
        out[key] = blob as {
          ciphertext: string;
          iv: string;
          tag: string;
          key_version: number;
        };
      }
    }
    return out;
  }

  private decryptKnownSecrets(
    plugin: ManifestCarrier,
    encrypted: ReturnType<AdminPluginsService['parseSecretsRecord']>,
  ): Record<string, string> {
    const allowedFields = new Set(
      Object.keys(plugin.manifest.secretsSchema.properties ?? {}),
    );
    const out: Record<string, string> = {};
    for (const [field, blob] of Object.entries(encrypted)) {
      if (!allowedFields.has(field)) continue;
      try {
        out[field] = this.vault.decrypt(blob);
      } catch (err) {
        this.logger.error(
          `Failed to decrypt existing secret "${field}" for plugin "${plugin.slug}": ${(err as Error).message}. Field will be re-set on next update.`,
        );
      }
    }
    return out;
  }

  private maskSecrets(
    plugin: ManifestCarrier,
    encryptedRaw: unknown,
  ): Record<string, '***' | null> {
    const encrypted = this.parseSecretsRecord(encryptedRaw);
    const out: Record<string, '***' | null> = {};
    for (const field of Object.keys(
      plugin.manifest.secretsSchema.properties ?? {},
    )) {
      out[field] = encrypted[field] ? '***' : null;
    }
    return out;
  }

  private maskSecretsForAudit(
    plugin: ManifestCarrier,
    encryptedRaw: unknown,
  ): Record<string, '<set>' | '<cleared>'> {
    const encrypted = this.parseSecretsRecord(encryptedRaw);
    const out: Record<string, '<set>' | '<cleared>'> = {};
    for (const field of Object.keys(
      plugin.manifest.secretsSchema.properties ?? {},
    )) {
      out[field] = encrypted[field] ? '<set>' : '<cleared>';
    }
    return out;
  }

  private buildSyntheticService(slug: string): never {
    // Forma sintética mínima — los plugins no deben asumir más que esto
    // para test-connection. Cast `as never` para evitar forzar el shape
    // completo de `ServiceWithRelations` al usuario que invoque
    // test-connection (las plantillas reales de `getStatus` solo leen
    // status del proveedor remoto, no propiedades del service).
    const synthetic = {
      id: `test-connection-${slug}`,
      user_id: 'test-connection',
      product_id: 'test-connection',
      status: 'pending',
      label: 'Test Connection',
      domain: null,
      server_id: null,
      provisioner_slug: slug,
      provider_reference: null,
      // Sprint 15C.II Fase F.3 (GAP-15CII-G8): objeto vacío, no `undefined` —
      // los plugins que lean `service.metadata` en `getStatus` no deben
      // romper ante el servicio sintético del test-connection. (Plugins cuyo
      // `getStatus` requiere refs reales del proveedor deberían declarar
      // `testConnectionMethod: 'custom'` + `testConnection()` — ver Enhance.)
      metadata: {},
      client: {
        id: 'test-connection',
        email: 'test-connection@aelium.test',
        first_name: 'Test',
        last_name: 'Connection',
        company_name: null,
        phone: null,
        locale: 'es',
        country_code: null,
      },
      product: {
        id: 'test-connection',
        slug: 'test-connection',
        name: 'Test Connection',
        type: 'test_connection',
        provisioner: slug,
        provisioner_config: null,
      },
    };
    return synthetic as never;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers file-private del overview operativo (Fase F.2)
// ────────────────────────────────────────────────────────────────────────────

/** Lee `changes_after._meta.<key>` como string, o `null` si no aplica. */
function readMetaString(changesAfter: unknown, key: string): string | null {
  if (!changesAfter || typeof changesAfter !== 'object') return null;
  const meta = (changesAfter as Record<string, unknown>)._meta;
  if (!meta || typeof meta !== 'object') return null;
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Lee un número de un objeto JSON arbitrario; `0` si no aplica. */
function readNumber(obj: unknown, key: string): number {
  if (!obj || typeof obj !== 'object') return 0;
  const value = (obj as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeChangeType(raw: string | null): PluginReconcileChangeType {
  return raw === 'subscription_missing' ||
    raw === 'status_divergence' ||
    raw === 'plan_divergence'
    ? raw
    : 'status_divergence';
}

/**
 * Reconstruye el resumen de la última pasada desde el `changes_after` del
 * audit `reconcile_completed`. Tolera filas legacy/malformadas devolviendo
 * el `created_at` como `completed_at` y `trigger='cron'` por defecto.
 */
function readReconcileSummary(
  changesAfter: unknown,
  createdAt: Date,
): {
  completed_at: string;
  trigger: 'cron' | 'manual';
  services_processed: number;
  drifts_detected: number;
  errors: number;
} {
  const obj =
    changesAfter && typeof changesAfter === 'object'
      ? (changesAfter as Record<string, unknown>)
      : {};
  const trigger = obj.trigger === 'manual' ? 'manual' : 'cron';
  const completedAt =
    typeof obj.completed_at === 'string' && obj.completed_at.length > 0
      ? obj.completed_at
      : createdAt.toISOString();
  return {
    completed_at: completedAt,
    trigger,
    services_processed: readNumber(obj, 'services_processed'),
    drifts_detected: readNumber(obj, 'drifts_detected'),
    errors: readNumber(obj, 'errors'),
  };
}

/**
 * Deriva la salud del plugin + las claves i18n que la explican. Ver
 * docstring de `getOperationalOverview` para la doctrina de transiciones.
 */
function deriveHealth(input: {
  enabled: boolean;
  circuit: {
    getServiceInfo: CircuitBreakerState | null;
    executeAction: CircuitBreakerState | null;
  };
  missingSecrets: readonly string[];
  lastReconcileErrors: number;
  supportsReconciliation: boolean;
}): { status: PluginHealthStatus; reasons: string[] } {
  if (!input.enabled) {
    return {
      status: 'disabled',
      reasons: ['admin.plugins.overview.health_reason.disabled'],
    };
  }

  const reasons: string[] = [];
  let down = false;
  let degraded = false;

  const circuitOpen =
    input.circuit.getServiceInfo === 'open' ||
    input.circuit.executeAction === 'open';
  const circuitRecovering =
    input.circuit.getServiceInfo === 'half-open' ||
    input.circuit.executeAction === 'half-open';

  if (circuitOpen) {
    down = true;
    reasons.push('admin.plugins.overview.health_reason.circuit_open');
  }
  if (input.missingSecrets.length > 0) {
    down = true;
    reasons.push('admin.plugins.overview.health_reason.missing_secrets');
  }
  if (circuitRecovering) {
    degraded = true;
    reasons.push('admin.plugins.overview.health_reason.circuit_recovering');
  }
  if (input.supportsReconciliation && input.lastReconcileErrors > 0) {
    degraded = true;
    reasons.push('admin.plugins.overview.health_reason.reconcile_errors');
  }

  if (down) return { status: 'down', reasons };
  if (degraded) return { status: 'degraded', reasons };
  return {
    status: 'operational',
    reasons: ['admin.plugins.overview.health_reason.all_clear'],
  };
}
