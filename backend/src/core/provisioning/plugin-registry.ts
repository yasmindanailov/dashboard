import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import {
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPlugin,
} from './types';

/**
 * Token DI canónico para inyectar el array de plugins registrados.
 * Cada plugin de provisioning se registra al `ProvisioningModule` como
 * `{ provide: PROVISIONER_PLUGINS, useExisting: <PluginClass>, multi: true }`.
 *
 * Sprint 11 Fase 11.C añade `internal` y `manual`. Sprint 15A construye
 * un registry más sofisticado con manifest declarativo. Mientras tanto,
 * este registry simple es suficiente — cumple el contrato canónico y es
 * testeable.
 */
export const PROVISIONER_PLUGINS = Symbol('PROVISIONER_PLUGINS');

/**
 * PluginRegistryService — Sprint 11 Fase 11.B.
 *
 * Responsabilidades:
 *  1. Recibir todos los plugins registrados al boot.
 *  2. Validar que cumplen `contractVersion === 'v2'` (ADR-077 §6).
 *  3. Validar slugs únicos.
 *  4. Validar coherencia de capability flags (ej. `has_sso_panel=true` exige `panel_label`).
 *  5. Exponer `get(slug)` y `getOrThrow(slug)` al orquestador.
 *
 * Cualquier inconsistencia se loguea como ERROR al boot. NO romper el boot
 * si un plugin individual está mal — el resto deben funcionar (R7 +
 * degradación elegante). Servicios cuyo plugin no esté disponible quedan
 * en `pending` con `service.provisioning_failed` emitido.
 */
@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly plugins = new Map<string, ProvisionerPlugin>();

  constructor(
    @Inject(PROVISIONER_PLUGINS)
    private readonly registered: ProvisionerPlugin[] = [],
  ) {}

  onModuleInit(): void {
    for (const plugin of this.registered) {
      this.tryRegister(plugin);
    }
    this.logger.log(
      `Registered ${this.plugins.size}/${this.registered.length} provisioner plugin(s): ` +
        `[${[...this.plugins.keys()].join(', ')}]`,
    );
  }

  private tryRegister(plugin: ProvisionerPlugin): void {
    // Cast a string para defenderse contra plugins en runtime con
    // contractVersion incorrecto. El type-narrow de TypeScript haría que
    // `plugin.contractVersion` se infiera como `never` dentro del if (porque
    // la interfaz declara `'v2'`), pero un plugin malformado en JS puede
    // llegar aquí con cualquier string.
    const declaredVersion: string = plugin.contractVersion;
    if (declaredVersion !== PROVISIONER_PLUGIN_CONTRACT_VERSION) {
      this.logger.error(
        `Plugin "${plugin.slug}" rejected: contractVersion="${declaredVersion}" ` +
          `(expected "${PROVISIONER_PLUGIN_CONTRACT_VERSION}"). See ADR-077 §6.`,
      );
      return;
    }

    if (!/^[a-z][a-z0-9-]*$/.test(plugin.slug)) {
      this.logger.error(
        `Plugin slug "${plugin.slug}" rejected: must be kebab-case ([a-z][a-z0-9-]*).`,
      );
      return;
    }

    if (this.plugins.has(plugin.slug)) {
      this.logger.error(
        `Plugin slug "${plugin.slug}" already registered — duplicate rejected.`,
      );
      return;
    }

    if (plugin.capabilities.has_sso_panel && !plugin.capabilities.panel_label) {
      this.logger.error(
        `Plugin "${plugin.slug}" rejected: has_sso_panel=true requires panel_label.`,
      );
      return;
    }

    const slugs = new Set<string>();
    for (const action of plugin.inlineActions) {
      if (slugs.has(action.slug)) {
        this.logger.error(
          `Plugin "${plugin.slug}" rejected: duplicate inline action slug "${action.slug}".`,
        );
        return;
      }
      slugs.add(action.slug);
    }

    this.plugins.set(plugin.slug, plugin);
  }

  /** Devuelve el plugin o `null` si no está registrado. */
  get(slug: string): ProvisionerPlugin | null {
    return this.plugins.get(slug) ?? null;
  }

  /** Devuelve el plugin o lanza error si no está registrado. */
  getOrThrow(slug: string): ProvisionerPlugin {
    const plugin = this.plugins.get(slug);
    if (!plugin) {
      throw new Error(
        `Provisioner plugin "${slug}" not registered. Available: [${[...this.plugins.keys()].join(', ')}]`,
      );
    }
    return plugin;
  }

  /** Lista de slugs registrados (útil para tests + UI admin). */
  listSlugs(): string[] {
    return [...this.plugins.keys()];
  }
}
