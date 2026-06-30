import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../database/prisma.service';
import {
  AI_PROVIDER_CONTRACT_VERSION,
  AI_PROVIDER_PLUGINS,
  AiProviderPlugin,
} from './types';

/**
 * AiProviderRegistry — registry del subsistema IA paralelo (ADR-080 Amendment D).
 *
 * Espejo mínimo de `PluginRegistryService` (provisioning) PERO para el contrato
 * `AiProviderPlugin`. Combina dos fuentes (igual doctrina ADR-080 §4):
 *   - DI = disponibilidad (qué proveedores IA existen y pasan validación).
 *   - `plugin_installs.enabled` = activación (cuáles aplican).
 *
 * AI-INV-2: a lo sumo UN proveedor IA activo a la vez (v1). Si hay varios
 * `enabled`, loguea warning y toma el primero (routing por setting → diferido).
 *
 * Reload runtime en `plugin.config_changed` (mismo evento que el registry de
 * provisioners; el admin habilita/edita desde `/admin/settings/plugins`).
 */
@Injectable()
export class AiProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(AiProviderRegistry.name);

  /** Proveedores que pasaron validación de contrato (inmutable en el proceso). */
  private readonly validated = new Map<string, AiProviderPlugin>();

  /** Proveedores ACTIVOS = validados ∧ enabled=true en `plugin_installs`. */
  private readonly active = new Map<string, AiProviderPlugin>();

  constructor(
    @Inject(AI_PROVIDER_PLUGINS)
    private readonly registered: AiProviderPlugin[] = [],
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const plugin of this.registered) this.tryValidate(plugin);
    this.logger.log(
      `Validated ${this.validated.size}/${this.registered.length} AI provider(s): ` +
        `[${[...this.validated.keys()].join(', ')}]`,
    );
    await this.reloadActivation();
  }

  @OnEvent('plugin.config_changed')
  async handleConfigChanged(): Promise<void> {
    await this.reloadActivation();
  }

  private async reloadActivation(): Promise<void> {
    const validatedSlugs = [...this.validated.keys()];
    if (validatedSlugs.length === 0) {
      this.active.clear();
      return;
    }

    const installs = await this.prisma.pluginInstall.findMany({
      where: { enabled: true, slug: { in: validatedSlugs } },
      select: { slug: true },
    });

    this.active.clear();
    for (const { slug } of installs) {
      const plugin = this.validated.get(slug);
      if (plugin) this.active.set(slug, plugin);
    }

    if (this.active.size > 1) {
      this.logger.warn(
        `AI-INV-2: ${this.active.size} AI providers enabled ` +
          `([${[...this.active.keys()].join(', ')}]) — only one is used per request. ` +
          `Routing by setting is deferred.`,
      );
    }
    this.logger.log(
      `Active AI provider(s): [${[...this.active.keys()].join(', ')}] ` +
        `(${this.active.size}/${this.validated.size} validated)`,
    );
  }

  private tryValidate(plugin: AiProviderPlugin): void {
    const version: string = plugin.aiContractVersion;
    if (version !== AI_PROVIDER_CONTRACT_VERSION) {
      this.logger.error(
        `AI provider "${plugin.slug}" rejected: aiContractVersion="${version}" ` +
          `(expected "${AI_PROVIDER_CONTRACT_VERSION}").`,
      );
      return;
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(plugin.slug)) {
      this.logger.error(
        `AI provider slug "${plugin.slug}" rejected: must match [a-z][a-z0-9_-]*.`,
      );
      return;
    }
    if (plugin.manifest.slug !== plugin.slug) {
      this.logger.error(
        `AI provider "${plugin.slug}" rejected: manifest.slug="${plugin.manifest.slug}" mismatch.`,
      );
      return;
    }
    if (plugin.manifest.settingsCategory !== 'ai') {
      this.logger.error(
        `AI provider "${plugin.slug}" rejected: manifest.settingsCategory must be 'ai'.`,
      );
      return;
    }
    if (this.validated.has(plugin.slug)) {
      this.logger.error(
        `AI provider slug "${plugin.slug}" already registered — duplicate rejected.`,
      );
      return;
    }
    this.validated.set(plugin.slug, plugin);
  }

  /** Proveedor IA activo (el primero, AI-INV-2), o `null` si ninguno. */
  getActive(): AiProviderPlugin | null {
    const first = this.active.values().next();
    return first.done ? null : first.value;
  }

  /** Proveedor validado por slug, ignorando `enabled`. Para la UI admin. */
  getAvailable(slug: string): AiProviderPlugin | null {
    return this.validated.get(slug) ?? null;
  }

  /** Slugs validados (DI + contrato OK). */
  listAvailableSlugs(): string[] {
    return [...this.validated.keys()];
  }
}
