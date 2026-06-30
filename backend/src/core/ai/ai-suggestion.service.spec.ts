import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../database/prisma.service';
import { SecretVaultService } from '../security/secret-vault.service';
import { AnthropicAiPlugin } from '../../plugins/ai/anthropic/anthropic.plugin';
import { AiProviderRegistry } from './ai-provider-registry.service';
import {
  AiSuggestionService,
  AiUnavailableError,
} from './ai-suggestion.service';

/**
 * Tests unit del subsistema IA — Rediseño UI F3·E13.
 * Foco: AiProviderRegistry (valida contrato + activa desde plugin_installs,
 * AI-INV-2) + AiSuggestionService (resuelve proveedor + stub mock-first sin
 * api_key + guardas de no-disponibilidad). Sin red ni coste (stub).
 */

interface InstallRow {
  config: Record<string, unknown>;
  secrets: Record<string, unknown>;
  enabled: boolean;
}

function buildService(opts: { active: boolean; install: InstallRow | null }) {
  const plugin = new AnthropicAiPlugin();
  const registry = {
    getActive: jest.fn().mockReturnValue(opts.active ? plugin : null),
  };
  const prisma = {
    pluginInstall: {
      findUnique: jest.fn().mockResolvedValue(opts.install),
    },
  };
  const vault = { decrypt: jest.fn() };
  const service = new AiSuggestionService(
    registry as unknown as AiProviderRegistry,
    prisma as unknown as PrismaService,
    vault as unknown as SecretVaultService,
    new EventEmitter2(),
  );
  return { service, plugin };
}

describe('AiProviderRegistry — F3·E13', () => {
  function buildRegistry(installs: { slug: string }[]) {
    const plugin = new AnthropicAiPlugin();
    const prisma = {
      pluginInstall: { findMany: jest.fn().mockResolvedValue(installs) },
    };
    const registry = new AiProviderRegistry(
      [plugin],
      prisma as unknown as PrismaService,
    );
    return { registry, plugin };
  }

  it('valida el plugin Anthropic (contrato v1 + manifest ai) y lo activa si enabled', async () => {
    const { registry, plugin } = buildRegistry([{ slug: 'anthropic' }]);
    await registry.onModuleInit();
    expect(registry.listAvailableSlugs()).toEqual(['anthropic']);
    expect(registry.getActive()).toBe(plugin);
    expect(registry.getAvailable('anthropic')).toBe(plugin);
  });

  it('no activa ningún proveedor si no hay install enabled', async () => {
    const { registry } = buildRegistry([]);
    await registry.onModuleInit();
    expect(registry.listAvailableSlugs()).toEqual(['anthropic']);
    expect(registry.getActive()).toBeNull();
  });
});

describe('AiSuggestionService — F3·E13', () => {
  it('sin proveedor activo → isEnabled false + AiUnavailableError', async () => {
    const { service } = buildService({ active: false, install: null });
    expect(service.isEnabled()).toBe(false);
    await expect(service.suggestReply({ messages: [] })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });

  it('proveedor activo sin api_key → stub mock-first (sin red ni coste)', async () => {
    const { service } = buildService({
      active: true,
      install: { config: {}, secrets: {}, enabled: true },
    });
    expect(service.isEnabled()).toBe(true);

    const res = await service.suggestReply({
      messages: [{ role: 'customer', text: 'Mi web no carga' }],
    });

    expect(res.model).toBe('stub');
    expect(res.suggestion).toContain('Aelium');
    expect(res.suggestion).toContain('Mi web no carga');
  });

  it('install deshabilitado → AiUnavailableError', async () => {
    const { service } = buildService({
      active: true,
      install: { config: {}, secrets: {}, enabled: false },
    });
    await expect(service.suggestReply({ messages: [] })).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
  });
});
