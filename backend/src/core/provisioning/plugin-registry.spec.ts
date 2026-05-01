import { Test, TestingModule } from '@nestjs/testing';

import { PluginRegistryService, PROVISIONER_PLUGINS } from './plugin-registry';
import {
  ProvisionerPlugin,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
} from './types';

/**
 * Tests unit PluginRegistryService — Sprint 11 Fase 11.B (ADR-077 §6).
 *
 * Cobertura:
 *  - Plugin con contractVersion incorrecto → rechazado.
 *  - Plugin con slug no kebab-case → rechazado.
 *  - Plugin duplicado (mismo slug) → segundo rechazado, primero gana.
 *  - has_sso_panel=true sin panel_label → rechazado.
 *  - Plugin con duplicate inline action slugs → rechazado.
 *  - Plugin válido → registrado y get(slug) lo devuelve.
 *  - getOrThrow con slug no registrado → throw.
 */
function buildValidPlugin(over: Partial<ProvisionerPlugin> = {}): ProvisionerPlugin {
  return {
    slug: 'internal',
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
    provision: jest.fn(),
    deprovision: jest.fn(),
    getStatus: jest.fn(),
    getServiceInfo: jest.fn(),
    getSsoUrl: jest.fn(),
    executeAction: jest.fn(),
    ...over,
  };
}

async function buildRegistry(plugins: ProvisionerPlugin[]): Promise<PluginRegistryService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PluginRegistryService,
      { provide: PROVISIONER_PLUGINS, useValue: plugins },
    ],
  }).compile();
  const svc = module.get(PluginRegistryService);
  svc.onModuleInit();
  return svc;
}

describe('PluginRegistryService — Sprint 11 Fase 11.B', () => {
  it('registra plugin válido y get(slug) lo devuelve', async () => {
    const plugin = buildValidPlugin({ slug: 'internal' });
    const registry = await buildRegistry([plugin]);
    expect(registry.get('internal')).toBe(plugin);
    expect(registry.listSlugs()).toEqual(['internal']);
  });

  it('rechaza plugin con contractVersion incorrecto (ADR-077 §6)', async () => {
    const bad = buildValidPlugin({
      slug: 'legacy',
      contractVersion: 'v1' as unknown as 'v2',
    });
    const registry = await buildRegistry([bad]);
    expect(registry.get('legacy')).toBeNull();
  });

  it('rechaza plugin con slug no kebab-case', async () => {
    const bad = buildValidPlugin({ slug: 'Bad_Slug' });
    const registry = await buildRegistry([bad]);
    expect(registry.get('Bad_Slug')).toBeNull();
  });

  it('rechaza plugin duplicado (segundo con mismo slug)', async () => {
    const first = buildValidPlugin({ slug: 'internal' });
    const second = buildValidPlugin({ slug: 'internal' });
    const registry = await buildRegistry([first, second]);
    expect(registry.get('internal')).toBe(first);
    expect(registry.listSlugs()).toEqual(['internal']);
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
    const registry = await buildRegistry([bad]);
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
    const registry = await buildRegistry([bad]);
    expect(registry.get('dup-actions')).toBeNull();
  });

  it('getOrThrow con slug no registrado lanza error explícito', async () => {
    const registry = await buildRegistry([]);
    expect(() => registry.getOrThrow('non-existent')).toThrow(
      /Provisioner plugin "non-existent" not registered/,
    );
  });
});
