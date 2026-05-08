import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { PrismaService } from '../database/prisma.service';

import {
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  PluginCapabilities,
  ProvisionerPlugin,
} from './types';

/**
 * Token DI canónico para inyectar el array de plugins registrados.
 * Cada plugin de provisioning se registra al `ProvisioningModule` como
 * `{ provide: PROVISIONER_PLUGINS, useExisting: <PluginClass>, multi: true }`.
 *
 * Sprint 15A Fase E (ADR-080 §4) — DI sigue siendo la fuente de
 * **disponibilidad** (qué clases existen). La tabla `plugin_installs` es
 * la fuente de **activación** (cuáles aplican). El registry combina ambas
 * fuentes: pasa contract validation ∧ está habilitado en DB → entra en
 * el map operativo.
 */
export const PROVISIONER_PLUGINS = Symbol('PROVISIONER_PLUGINS');

/**
 * PluginRegistryService — refactorizado en Sprint 15A Fase E (ADR-080 §4).
 *
 * Responsabilidades:
 *  1. Recibir todos los plugins registrados al boot vía DI multi-injection.
 *  2. Validar invariantes del contrato (ADR-077 §6 + §7 + Amendment A2 + ADR-080 §1):
 *     - `contractVersion === 'v2'`
 *     - slug en snake_case o kebab-case (regex `/^[a-z][a-z0-9_-]*$/`)
 *     - sin duplicados
 *     - `has_sso_panel=true → panel_label` declarado
 *     - inline action slugs únicos
 *     - `manifest.slug === plugin.slug` (ADR-080 §1)
 *  3. Leer `plugin_installs` de la DB y construir el map de plugins activos:
 *     - DI ∧ enabled=true en DB → en el map operativo (`activePlugins`).
 *     - DI ∧ enabled=false (o ausente en DB) → fuera del map.
 *     - DB enabled=true ∧ NO en DI → log ERROR, services huérfanos en
 *       `pending` (orquestador los detecta al fallar `getOrThrow`).
 *  4. Recargar runtime al recibir `plugin.config_changed` (emitido por
 *     `AdminPluginsService.update` — Sprint 15A Fase G) sin re-validar
 *     el contrato (eso es inmutable durante el proceso).
 *  5. Exponer `get(slug)` / `getOrThrow(slug)` / `listSlugs()` /
 *     `listAvailableSlugs()` al orquestador, provisioning service y UI admin.
 *
 * Doctrina canónica:
 *  - **Validación de contrato es inmutable**: se ejecuta UNA vez al boot.
 *    Si un plugin está mal codificado, no se registra ni se reintenta.
 *  - **Activación es runtime-mutable**: el admin puede habilitar/deshabilitar
 *    sin redeploy. Reload sólo re-filtra el map; no re-valida.
 *  - **Boot fail-soft con DI** (un plugin malformado no rompe el boot —
 *    el resto sigue, R7 + degradación elegante).
 *  - **Boot fail-loud con DB** (si Prisma no responde al boot, el backend
 *    NO debería operar — toda la lógica depende de la DB; fail-fast en
 *    `onModuleInit` es preferible a "registry vacío silencioso").
 */
@Injectable()
export class PluginRegistryService implements OnModuleInit {
  private readonly logger = new Logger(PluginRegistryService.name);

  /**
   * Plugins que pasaron contract validation. Cardinalidad estable durante
   * la vida del proceso — sólo cambia con redeploy. Los slugs aquí son los
   * únicos candidatos legítimos a entrar en `activePlugins`.
   */
  private readonly validatedPlugins = new Map<string, ProvisionerPlugin>();

  /**
   * Plugins ACTIVOS = validados ∧ enabled=true en `plugin_installs`.
   * Recargado al boot y en cada `plugin.config_changed`.
   */
  private readonly activePlugins = new Map<string, ProvisionerPlugin>();

  constructor(
    @Inject(PROVISIONER_PLUGINS)
    private readonly registered: ProvisionerPlugin[] = [],
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    // 1. Contract validation (síncrono, una sola vez al boot).
    for (const plugin of this.registered) {
      this.tryValidate(plugin);
    }
    this.logger.log(
      `Validated ${this.validatedPlugins.size}/${this.registered.length} ` +
        `provisioner plugin(s) against contract v2: ` +
        `[${[...this.validatedPlugins.keys()].join(', ')}]`,
    );

    // 2. Activation desde DB.
    await this.reloadActivation();
  }

  /**
   * Listener canónico para `plugin.config_changed` (emitido por
   * `AdminPluginsService` cuando un admin toggle/edit un plugin).
   * Recarga el set activo sin re-validar el contrato.
   */
  @OnEvent('plugin.config_changed')
  async handleConfigChanged(): Promise<void> {
    await this.reloadActivation();
  }

  /**
   * Lee `plugin_installs` y reconstruye el map activo.
   *
   * Contract:
   *  - DB enabled=true ∧ slug ∈ validatedPlugins → entra en map activo.
   *  - DB enabled=false → fuera del map (deshabilitado por admin).
   *  - DB no tiene fila para un slug DI → fuera del map (no instalado).
   *  - DB enabled=true ∧ slug ∉ validatedPlugins → log ERROR (servicios
   *    huérfanos quedarán en `pending` — el orquestador los detecta al
   *    invocar `getOrThrow`).
   */
  private async reloadActivation(): Promise<void> {
    const installs = await this.prisma.pluginInstall.findMany({
      where: { enabled: true },
      select: { slug: true },
    });

    const enabledSlugs = new Set(installs.map((i) => i.slug));

    this.activePlugins.clear();
    for (const slug of enabledSlugs) {
      const plugin = this.validatedPlugins.get(slug);
      if (plugin) {
        this.activePlugins.set(slug, plugin);
      } else {
        this.logger.error(
          `Plugin "${slug}" enabled in DB but not registered via DI ` +
            `(or failed contract validation). Services using this plugin ` +
            `will hang in 'pending' — investigate boot logs for rejection cause.`,
        );
      }
    }

    this.logger.log(
      `Active plugins: [${[...this.activePlugins.keys()].join(', ')}] ` +
        `(${this.activePlugins.size}/${this.validatedPlugins.size} validated · ` +
        `${enabledSlugs.size} enabled in DB)`,
    );
  }

  /**
   * Validación de contrato (ADR-077 §6 + §7 + ADR-080 §1). Plugins que
   * fallen quedan fuera de `validatedPlugins` y nunca entrarán en
   * `activePlugins`, aunque la DB los marque enabled=true.
   */
  private tryValidate(plugin: ProvisionerPlugin): void {
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

    // Slug naming convention canónica (Sprint 11 + Sprint 15C):
    // [a-z][a-z0-9_-]* — admite tanto kebab-case (`docker-engine`) como
    // snake_case (`enhance_cp`, `resellerclub`). La doctrina del proyecto
    // (ADR-018/021/070/077/080/082/083 + glossary) usa snake_case para
    // plugins multi-palabra; el regex original kebab-only era un bug que
    // habría rechazado `enhance_cp` en boot.
    if (!/^[a-z][a-z0-9_-]*$/.test(plugin.slug)) {
      this.logger.error(
        `Plugin slug "${plugin.slug}" rejected: must match [a-z][a-z0-9_-]* ` +
          `(snake_case or kebab-case, starting with lowercase letter).`,
      );
      return;
    }

    if (this.validatedPlugins.has(plugin.slug)) {
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

    const seenSlugs = new Set<string>();
    for (const action of plugin.inlineActions) {
      if (seenSlugs.has(action.slug)) {
        this.logger.error(
          `Plugin "${plugin.slug}" rejected: duplicate inline action slug "${action.slug}".`,
        );
        return;
      }
      seenSlugs.add(action.slug);
    }

    // ADR-080 §1 — invariante de coherencia del manifest declarativo.
    if (plugin.manifest.slug !== plugin.slug) {
      this.logger.error(
        `Plugin "${plugin.slug}" rejected: manifest.slug="${plugin.manifest.slug}" ` +
          `does not match plugin.slug. See ADR-080 §1.`,
      );
      return;
    }

    this.validatedPlugins.set(plugin.slug, plugin);
  }

  /** Devuelve el plugin activo o `null` si no está registrado/activo. */
  get(slug: string): ProvisionerPlugin | null {
    return this.activePlugins.get(slug) ?? null;
  }

  /**
   * Devuelve el plugin activo o lanza error si no está registrado/activo.
   * El mensaje distingue entre dos casos para diagnóstico rápido:
   *  - Plugin validado pero deshabilitado en DB ("validated but not enabled").
   *  - Plugin no registrado vía DI o que falló contract validation
   *    ("not registered via DI or failed contract validation").
   */
  getOrThrow(slug: string): ProvisionerPlugin {
    const plugin = this.activePlugins.get(slug);
    if (!plugin) {
      const validated = this.validatedPlugins.has(slug);
      const reason = validated
        ? 'validated but not enabled in plugin_installs'
        : 'not registered via DI or failed contract validation';
      throw new Error(
        `Provisioner plugin "${slug}" not active (${reason}). ` +
          `Active: [${[...this.activePlugins.keys()].join(', ')}]`,
      );
    }
    return plugin;
  }

  /** Lista de slugs ACTIVOS (validados ∧ enabled=true). */
  listSlugs(): string[] {
    return [...this.activePlugins.keys()];
  }

  /**
   * Lista de slugs DISPONIBLES (DI + contrato OK), independientemente de
   * si están enabled en DB. Útil para `/admin/plugins` (UI admin lista
   * TODOS los plugins disponibles, marca cuáles están activos).
   */
  listAvailableSlugs(): string[] {
    return [...this.validatedPlugins.keys()];
  }

  /**
   * Devuelve el plugin VALIDADO (DI + contrato OK) por slug, ignorando si
   * está enabled o no. Necesario para `/admin/plugins/:slug` donde el
   * superadmin necesita ver el manifest de plugins disabled para poder
   * habilitarlos. NO usarlo desde código operativo (orquestador) — usar
   * `get`/`getOrThrow` que respetan el flag enabled.
   */
  getAvailable(slug: string): ProvisionerPlugin | null {
    return this.validatedPlugins.get(slug) ?? null;
  }

  /**
   * Sprint 15C Fase 15C.D — ADR-082 §6 (cross-plugin DNS authority resolver).
   *
   * Devuelve el primer plugin ACTIVO que declare la capability `cap=true`.
   * Hoy típicamente hay un solo plugin activo con `has_dns_management=true`
   * (`enhance_cp`); si en el futuro hay varios (ej. `cloudflare_dns`
   * coexistiendo con `enhance_cp`), la resolución necesitará routing
   * adicional vía settings o metadata del service — hoy seleccionar el
   * primero es comportamiento aceptable porque el resolver
   * `dns-authority-resolver.ts` decide independientemente si la zona vive
   * en Aelium o externa.
   *
   * R4 intacto: el helper `dns-authority-resolver` vive en `core/provisioning/`
   * y consulta este método; los plugins NO se consultan entre sí.
   */
  getByCapability(cap: keyof PluginCapabilities): ProvisionerPlugin | null {
    for (const plugin of this.activePlugins.values()) {
      if (plugin.capabilities[cap]) return plugin;
    }
    return null;
  }
}
