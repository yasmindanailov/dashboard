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
import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import { SecretVaultService } from '../../core/security/secret-vault.service';
import { ProvisionerPlugin } from '../../core/provisioning/types';
import { AuditService } from '../audit/audit.service';

import { AdminPluginUpdateDto } from './dto/admin-plugin-update.dto';

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
 *  4. Test-connection: invoca `plugin.getStatus()` con un service sintético
 *     y reporta éxito/error. Solo si `manifest.testConnectionMethod === 'getStatus'`.
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
    // Pre-compilamos los schemas de los plugins disponibles para detectar
    // schemas inválidos al boot (fail-fast). En runtime, el cache evita
    // recompilación.
    for (const slug of this.registry.listAvailableSlugs()) {
      const plugin =
        this.registry.get(slug) ?? this.findPluginInValidated(slug);
      if (plugin) {
        try {
          this.compileForPlugin(plugin);
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

    const availableSlugs = this.registry.listAvailableSlugs();
    return availableSlugs.map((slug) => this.summarize(slug, installsBySlug));
  }

  /** Detalle por slug. Secrets devueltos como `'***'` si seteados, `null` si no. */
  async findOne(slug: string) {
    const plugin = this.requireValidatedPlugin(slug);
    const install = await this.prisma.pluginInstall.findUnique({
      where: { slug },
    });

    return {
      slug,
      manifest: plugin.manifest,
      enabled: install?.enabled ?? false,
      installed_at: install?.installed_at?.toISOString() ?? null,
      updated_at: install?.updated_at?.toISOString() ?? null,
      config: this.loadConfig(install?.config),
      secrets: this.maskSecrets(plugin, install?.secrets),
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
    const plugin = this.requireValidatedPlugin(slug);

    // 1. Validar config contra manifest.configSchema con Ajv.
    if (dto.config !== undefined) {
      this.validateConfigOrThrow(plugin, dto.config);
    }

    // 2. Validar secrets contra manifest.secretsSchema con Ajv.
    if (dto.secrets !== undefined) {
      this.validateSecretsOrThrow(plugin, dto.secrets);
    }

    // 3. Cargar estado anterior para audit + parcial-update de secrets.
    const before = await this.prisma.pluginInstall.findUnique({
      where: { slug },
    });

    // 4. Construir nuevos valores (preservar secrets omitidos).
    const previousSecrets = this.parseSecretsRecord(before?.secrets);
    const nextSecretsPlain = {
      ...this.decryptKnownSecrets(plugin, previousSecrets),
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
    await this.audit.logChange({
      user_id: actorUserId,
      entity_type: 'Plugin',
      entity_id: slug,
      action: 'plugin.config_changed',
      changes_before: {
        enabled: wasEnabled,
        config: this.loadConfig(before?.config),
        secrets: this.maskSecretsForAudit(plugin, previousSecrets),
      },
      changes_after: {
        enabled: nextEnabled,
        config: nextConfig,
        secrets: this.maskSecretsForAudit(plugin, nextSecretsEncrypted),
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
    //    intento entra en closed sin esperar el reset_timeout.
    if (secretsModified || dto.config !== undefined) {
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
   * Test-connection: invoca `plugin.getStatus()` con un service sintético
   * mínimo. Solo si el manifest declara `testConnectionMethod === 'getStatus'`.
   * Si declara otro modo o `null`, devuelve 400.
   */
  async testConnection(slug: string): Promise<{
    success: boolean;
    message: string;
    checked_at: string;
  }> {
    const plugin = this.requireValidatedPlugin(slug);
    if (plugin.manifest.testConnectionMethod !== 'getStatus') {
      throw new BadRequestException(
        `Plugin "${slug}" does not support test-connection (manifest.testConnectionMethod=${plugin.manifest.testConnectionMethod ?? 'null'}).`,
      );
    }

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

  // ─── Helpers privados ───────────────────────────────────────────────

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
    const plugin = this.findPluginInValidated(slug);
    const install = installsBySlug.get(slug);
    return {
      slug,
      manifest: plugin?.manifest ?? null,
      enabled: install?.enabled ?? false,
      updated_at: install?.updated_at?.toISOString() ?? null,
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

  private compileForPlugin(plugin: ProvisionerPlugin): void {
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
    plugin: ProvisionerPlugin,
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
    plugin: ProvisionerPlugin,
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
    plugin: ProvisionerPlugin,
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
    plugin: ProvisionerPlugin,
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
    plugin: ProvisionerPlugin,
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
