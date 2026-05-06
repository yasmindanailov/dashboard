import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../database/prisma.service';

import { PluginRegistryService, PROVISIONER_PLUGINS } from './plugin-registry';
import {
  EMPTY_PLUGIN_SCHEMA,
  PluginManifest,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPlugin,
} from './types';

/**
 * Tests unit PluginRegistryService — Sprint 15A Fase E (ADR-080 §4).
 *
 * Refactor de Sprint 11 Fase 11.B (validación de contrato) + nueva capa
 * de loader desde DB. La doctrina canónica:
 *   - Validación de contrato: invariantes ADR-077 §6 + §7 + ADR-080 §1.
 *     Inmutable durante la vida del proceso.
 *   - Activación desde DB: lee `plugin_installs` con enabled=true,
 *     intersecta con plugins validados, llena `activePlugins`.
 *   - Reload runtime: `@OnEvent('plugin.config_changed')` re-filtra el
 *     map sin re-validar el contrato.
 *
 * Cobertura mínima:
 *  Validación contract (heredados de Sprint 11):
 *  - Plugin con contractVersion incorrecto → rechazado.
 *  - Plugin con slug no kebab-case → rechazado.
 *  - Plugin duplicado (mismo slug) → segundo rechazado, primero gana.
 *  - has_sso_panel=true sin panel_label → rechazado.
 *  - Plugin con duplicate inline action slugs → rechazado.
 *  - Plugin con manifest.slug != plugin.slug → rechazado (ADR-080 §1).
 *  - Plugin válido + enabled en DB → registrado y get(slug) lo devuelve.
 *
 *  Activación desde DB (Sprint 15A):
 *  - Plugin válido pero enabled=false en DB → fuera de activePlugins,
 *    listSlugs vacío, listAvailableSlugs incluye slug.
 *  - Plugin enabled=true en DB pero ausente de DI → log error pero NO
 *    rompe boot.
 *  - handleConfigChanged() recarga activePlugins sin re-validar.
 *  - getOrThrow distingue 'not registered' de 'validated but not enabled'.
 */

interface MockPrismaPluginInstall {
  pluginInstall: {
    findMany: jest.Mock;
  };
}

/** Manifest mínimo canónico para tests (ADR-080 §1) — derivado del slug. */
function buildTestManifest(slug: string): PluginManifest {
  return {
    slug,
    version: '0.0.0-test',
    manifestVersion: 'v1',
    label: `plugin.${slug}.label`,
    description: `plugin.${slug}.description`,
    docsUrl: `docs/test/${slug}.md`,
    settingsCategory: 'provisioner',
    configSchema: EMPTY_PLUGIN_SCHEMA,
    secretsSchema: EMPTY_PLUGIN_SCHEMA,
    testConnectionMethod: null,
  };
}

function buildValidPlugin(
  over: Partial<ProvisionerPlugin> = {},
): ProvisionerPlugin {
  const slug = over.slug ?? 'internal';
  return {
    slug,
    contractVersion: PROVISIONER_PLUGIN_CONTRACT_VERSION,
    capabilities: {
      has_sso_panel: false,
      has_metrics: false,
      has_metrics_history: false,
      requires_server: false,
      provision_mode: 'sync',
      completes_via_task: false,
      supports_reconciliation: false,
    },
    inlineActions: [],
    manifest: buildTestManifest(slug),
    provision: jest.fn(),
    deprovision: jest.fn(),
    getStatus: jest.fn(),
    getServiceInfo: jest.fn(),
    getSsoUrl: jest.fn(),
    executeAction: jest.fn(),
    ...over,
  };
}

/**
 * Construye registry con mocks canónicos.
 * `enabledInDb` controla qué slugs devuelve el mock de Prisma como activos.
 * Si no se pasa, asume que TODOS los slugs registrados están enabled.
 */
async function buildRegistry(
  plugins: ProvisionerPlugin[],
  enabledInDb?: ReadonlyArray<string>,
): Promise<{
  registry: PluginRegistryService;
  prisma: MockPrismaPluginInstall;
}> {
  const enabledSet = enabledInDb ?? plugins.map((p) => p.slug);
  const prisma: MockPrismaPluginInstall = {
    pluginInstall: {
      findMany: jest
        .fn()
        .mockResolvedValue(enabledSet.map((slug) => ({ slug }))),
    },
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PluginRegistryService,
      { provide: PROVISIONER_PLUGINS, useValue: plugins },
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();

  const registry = module.get(PluginRegistryService);
  await registry.onModuleInit();
  return { registry, prisma };
}

describe('PluginRegistryService — Sprint 15A Fase E (ADR-080 §4)', () => {
  describe('contract validation (heredado Sprint 11)', () => {
    it('registra plugin válido y get(slug) lo devuelve', async () => {
      const plugin = buildValidPlugin({ slug: 'internal' });
      const { registry } = await buildRegistry([plugin]);
      expect(registry.get('internal')).toBe(plugin);
      expect(registry.listSlugs()).toEqual(['internal']);
      expect(registry.listAvailableSlugs()).toEqual(['internal']);
    });

    it('rechaza plugin con contractVersion incorrecto (ADR-077 §6)', async () => {
      const bad = buildValidPlugin({
        slug: 'legacy',
        contractVersion: 'v1' as unknown as 'v2',
      });
      const { registry } = await buildRegistry([bad]);
      expect(registry.get('legacy')).toBeNull();
      expect(registry.listAvailableSlugs()).toEqual([]);
    });

    it('rechaza plugin con slug no kebab-case', async () => {
      const bad = buildValidPlugin({ slug: 'Bad_Slug' });
      const { registry } = await buildRegistry([bad]);
      expect(registry.get('Bad_Slug')).toBeNull();
    });

    it('rechaza plugin duplicado (segundo con mismo slug)', async () => {
      const first = buildValidPlugin({ slug: 'internal' });
      const second = buildValidPlugin({ slug: 'internal' });
      const { registry } = await buildRegistry([first, second]);
      expect(registry.get('internal')).toBe(first);
      expect(registry.listAvailableSlugs()).toEqual(['internal']);
    });

    it('rechaza plugin con has_sso_panel=true sin panel_label', async () => {
      const bad = buildValidPlugin({
        slug: 'broken-sso',
        capabilities: {
          has_sso_panel: true,
          has_metrics: false,
          has_metrics_history: false,
          requires_server: false,
          provision_mode: 'sync',
          completes_via_task: false,
          supports_reconciliation: false,
        },
      });
      const { registry } = await buildRegistry([bad]);
      expect(registry.get('broken-sso')).toBeNull();
    });

    it('rechaza plugin con inline action slugs duplicados', async () => {
      const bad = buildValidPlugin({
        slug: 'dup-actions',
        inlineActions: [
          {
            slug: 'restart',
            label: 'Restart',
            confirmRequired: false,
            destructive: false,
          },
          {
            slug: 'restart',
            label: 'Restart 2',
            confirmRequired: false,
            destructive: false,
          },
        ],
      });
      const { registry } = await buildRegistry([bad]);
      expect(registry.get('dup-actions')).toBeNull();
    });

    it('rechaza plugin con manifest.slug != plugin.slug (ADR-080 §1)', async () => {
      const bad = buildValidPlugin({
        slug: 'plugin-a',
        manifest: buildTestManifest('plugin-b'),
      });
      const { registry } = await buildRegistry([bad]);
      expect(registry.get('plugin-a')).toBeNull();
      expect(registry.listAvailableSlugs()).toEqual([]);
    });
  });

  describe('activation desde DB (Sprint 15A)', () => {
    it('plugin validado pero enabled=false en DB → fuera de activePlugins', async () => {
      const plugin = buildValidPlugin({ slug: 'internal' });
      const { registry } = await buildRegistry([plugin], []);
      expect(registry.get('internal')).toBeNull();
      expect(registry.listSlugs()).toEqual([]);
      // Pero sigue disponible (DI + contrato OK).
      expect(registry.listAvailableSlugs()).toEqual(['internal']);
    });

    it('plugin enabled=true en DB pero ausente de DI → log error sin romper boot', async () => {
      const plugin = buildValidPlugin({ slug: 'internal' });
      // DB tiene `internal` (válido) y `ghost` (ausente de DI).
      const { registry } = await buildRegistry([plugin], ['internal', 'ghost']);
      // El plugin válido entra; el fantasma queda fuera sin tirar el boot.
      expect(registry.get('internal')).toBe(plugin);
      expect(registry.get('ghost')).toBeNull();
      expect(registry.listSlugs()).toEqual(['internal']);
    });

    it('handleConfigChanged() recarga activePlugins sin re-validar contrato', async () => {
      const plugin = buildValidPlugin({ slug: 'internal' });
      // Boot: enabled=true → activo.
      const { registry, prisma } = await buildRegistry([plugin], ['internal']);
      expect(registry.listSlugs()).toEqual(['internal']);

      // Admin deshabilita: el siguiente findMany devuelve vacío.
      prisma.pluginInstall.findMany.mockResolvedValueOnce([]);
      await registry.handleConfigChanged();
      expect(registry.listSlugs()).toEqual([]);
      expect(registry.get('internal')).toBeNull();
      // El plugin sigue VALIDADO — no se re-validó, sólo se re-filtró.
      expect(registry.listAvailableSlugs()).toEqual(['internal']);

      // Admin re-habilita.
      prisma.pluginInstall.findMany.mockResolvedValueOnce([
        { slug: 'internal' },
      ]);
      await registry.handleConfigChanged();
      expect(registry.listSlugs()).toEqual(['internal']);
      expect(registry.get('internal')).toBe(plugin);
    });

    it('getOrThrow distingue "not registered" de "validated but not enabled"', async () => {
      const plugin = buildValidPlugin({ slug: 'internal' });
      // `internal` validado pero NO enabled en DB.
      const { registry } = await buildRegistry([plugin], []);

      // Caso 1: validated pero deshabilitado.
      expect(() => registry.getOrThrow('internal')).toThrow(
        /validated but not enabled in plugin_installs/,
      );

      // Caso 2: nunca registrado.
      expect(() => registry.getOrThrow('non-existent')).toThrow(
        /not registered via DI or failed contract validation/,
      );
    });
  });
});
