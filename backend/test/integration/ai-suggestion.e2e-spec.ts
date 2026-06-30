/**
 * Integración E2E — IA copilot para agentes (Rediseño UI F3·E13, ADR-080 Amend. D).
 *
 * Ejercita la **cadena real** del subsistema IA paralelo end-to-end, con el único
 * límite mockeado en la frontera de red (el SDK de Anthropic) — "plugin real
 * mockeado":
 *
 *   SupportAiSuggestionService (grounding R5)
 *     → AiSuggestionService (resuelve proveedor + descifra secrets + breaker R11)
 *       → AiProviderRegistry (activa `anthropic` desde plugin_installs, AI-INV-2)
 *         → AnthropicAiPlugin (system-prompt voz de marca + user-prompt + SDK)
 *
 * Lo que NO cubren los unit specs (que mockean el colaborador `AiSuggestionService`):
 * que el grounding ensamblado por `SupportAiSuggestionService` realmente **llega al
 * prompt** que el plugin envía a Anthropic, y que la **PII del cliente NO sale a un
 * tercero** (RGPD) — verificado sobre el argumento real de `messages.create`.
 *
 * Sin red, BD ni Redis: Prisma + SecretVault como `useValue`; el SDK, `jest.mock`.
 * No requiere `docker compose` (a diferencia de los otros `*.e2e-spec.ts`).
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../../src/core/database/prisma.service';
import { SecretVaultService } from '../../src/core/security/secret-vault.service';
import { AI_PROVIDER_PLUGINS } from '../../src/core/ai/types';
import { AiProviderRegistry } from '../../src/core/ai/ai-provider-registry.service';
import { AiSuggestionService } from '../../src/core/ai/ai-suggestion.service';
import { AnthropicAiPlugin } from '../../src/plugins/ai/anthropic/anthropic.plugin';
import { ANTHROPIC_DEFAULT_MODEL } from '../../src/plugins/ai/anthropic/anthropic.manifest';
import { SupportAiSuggestionService } from '../../src/modules/support/support-ai-suggestion.service';

/* Mock del SDK en la frontera de red: capturamos los argumentos reales con que el
   plugin llama a `client.messages.create(...)` para afirmar el prompt ensamblado. */
const mockMessagesCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

/* ─── Tipos y helpers de aserción ─── */

interface CreateArg {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: string; content: string }[];
}

/** Argumento (tipado) con que el plugin llamó a `messages.create`. */
function firstCreateArg(): CreateArg {
  return (mockMessagesCreate.mock.calls as unknown as CreateArg[][])[0][0];
}

function decimal(n: number) {
  return { toNumber: () => n };
}

interface ConversationRow {
  id: string;
  user_id: string | null;
  messages: { sender_type: string; body: string }[];
}

interface HarnessData {
  /** Fila de `plugin_installs` para `anthropic`. `enabled` controla la activación. */
  install: {
    config?: Record<string, unknown>;
    secrets?: Record<string, unknown>;
    enabled: boolean;
  } | null;
  conversation?: ConversationRow | null;
  user?: unknown;
  services?: unknown[];
  invoices?: unknown[];
}

/**
 * Compone los proveedores REALES vía DI (Nest TestingModule) y activa el registry
 * desde el install mock — el mismo grafo que `AppModule` arma en producción.
 */
async function buildHarness(data: HarnessData) {
  const enabled = data.install?.enabled === true;
  const prisma = {
    pluginInstall: {
      // Registry.reloadActivation → activa anthropic solo si enabled.
      findMany: jest
        .fn()
        .mockResolvedValue(enabled ? [{ slug: 'anthropic' }] : []),
      // AiSuggestionService.buildContext → config + secrets del proveedor.
      findUnique: jest.fn().mockResolvedValue(data.install),
    },
    conversation: {
      findUnique: jest.fn().mockResolvedValue(data.conversation ?? null),
    },
    user: { findUnique: jest.fn().mockResolvedValue(data.user ?? null) },
    service: { findMany: jest.fn().mockResolvedValue(data.services ?? []) },
    invoice: { findMany: jest.fn().mockResolvedValue(data.invoices ?? []) },
  };
  const vault = { decrypt: jest.fn().mockReturnValue('sk-ant-e2e-key') };

  const mod = await Test.createTestingModule({
    providers: [
      AnthropicAiPlugin,
      {
        provide: AI_PROVIDER_PLUGINS,
        useFactory: (plugin: AnthropicAiPlugin) => [plugin],
        inject: [AnthropicAiPlugin],
      },
      AiProviderRegistry,
      AiSuggestionService,
      SupportAiSuggestionService,
      { provide: PrismaService, useValue: prisma },
      { provide: SecretVaultService, useValue: vault },
      { provide: EventEmitter2, useValue: new EventEmitter2() },
    ],
  }).compile();

  // Valida el contrato del plugin + activa `anthropic` desde el install mock.
  await mod.get(AiProviderRegistry).onModuleInit();

  return {
    support: mod.get(SupportAiSuggestionService),
    prisma,
    vault,
  };
}

describe('E2E F3·E13 — IA copilot (cadena real, SDK mockeado)', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset();
  });

  it('ruta API real: el grounding ensamblado llega al prompt y la PII del cliente NO (RGPD)', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Hola Ana, ya lo miro.' }],
      stop_reason: 'end_turn',
    });

    const { support } = await buildHarness({
      install: {
        config: {},
        secrets: { api_key: { ct: 'enc' } },
        enabled: true,
      },
      conversation: {
        id: 'c1',
        user_id: 'u1',
        messages: [
          { sender_type: 'client', body: 'Mi web ana.com va lentísima' },
          { sender_type: 'agent', body: '¿Desde cuándo lo notas?' },
        ],
      },
      user: {
        first_name: 'Ana',
        language: 'es',
        created_at: new Date('2024-03-10T00:00:00Z'),
        // PII que el SELECT del grounding NO lee — si se colara al prompt, las
        // aserciones de abajo lo detectan (RGPD: nunca sale a Anthropic).
        email: 'ana@example.com',
        phone: '+34600111222',
        tax_id: 'B12345678',
        support_inside_subscription: {
          status: 'active',
          product: {
            support_inside_config: {
              priority_tier: 'high',
              response_sla_hours: 4,
            },
          },
        },
      },
      services: [
        {
          status: 'active',
          label: null,
          domain: 'ana.com',
          expires_at: new Date('2027-01-01T00:00:00Z'),
          next_due_date: new Date('2027-01-01T00:00:00Z'),
          product: { name: 'Hosting Pro' },
        },
      ],
      invoices: [{ total: decimal(12), currency: 'EUR' }],
    });

    const result = await support.generate('c1', 'sé conciso');

    // El borrador proviene del plugin REAL (vía SDK mockeado), no de un stub.
    expect(result.suggestion).toBe('Hola Ana, ya lo miro.');
    expect(result.model).toBe(ANTHROPIC_DEFAULT_MODEL);
    expect(result.truncated).toBe(false);

    // Una sola llamada al proveedor, con el prompt ensamblado por la cadena real.
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    const arg = firstCreateArg();

    // System-prompt = voz de marca canónica (commit del prompt humano + rigor).
    expect(arg.system).toContain('equipo de soporte de Aelium');
    expect(arg.system).toContain('No escribas esto');

    // User-prompt = grounding real + transcript + instrucción del agente.
    const userPrompt = arg.messages[0].content;
    expect(userPrompt).toContain('DATOS DE CONTEXTO');
    expect(userPrompt).toContain('Ana'); // nombre del cliente
    expect(userPrompt).toContain('Hosting Pro'); // servicio
    expect(userPrompt).toContain('ana.com'); // dominio
    expect(userPrompt).toContain('12.00 EUR'); // facturación
    expect(userPrompt).toContain('Mi web ana.com va lentísima'); // transcript
    expect(userPrompt).toContain('sé conciso'); // instrucción adicional del agente

    // RGPD — la PII del cliente NO se envía al tercero (la minimiza el código real).
    expect(userPrompt).not.toContain('ana@example.com');
    expect(userPrompt).not.toContain('+34600111222');
    expect(userPrompt).not.toContain('B12345678');
  });

  it('mock-first: proveedor activo sin api_key → stub determinista, cero llamadas de red', async () => {
    const { support } = await buildHarness({
      install: { config: {}, secrets: {}, enabled: true }, // sin api_key
      conversation: {
        id: 'c2',
        user_id: null, // chat guest → sin grounding
        messages: [{ sender_type: 'client', body: 'Mi web no carga' }],
      },
    });

    const result = await support.generate('c2');

    expect(result.model).toBe('stub');
    expect(result.suggestion).toContain('Mi web no carga');
    expect(result.suggestion).toContain('Aelium');
    // Mock-first real: no se tocó el SDK de Anthropic (sin red ni coste).
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('sin proveedor IA activo (install deshabilitado) → isEnabled false + 503 AI_UNAVAILABLE', async () => {
    const { support } = await buildHarness({
      install: { config: {}, secrets: {}, enabled: false },
      conversation: {
        id: 'c3',
        user_id: null,
        messages: [{ sender_type: 'client', body: 'Hola' }],
      },
    });

    expect.assertions(4);
    expect(support.isEnabled()).toBe(false);

    try {
      await support.generate('c3');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'AI_UNAVAILABLE',
      });
    }
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('respeta el modelo configurado y propaga truncated cuando stop_reason=max_tokens', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [
        { type: 'text', text: 'Borrador ' },
        { type: 'text', text: 'largo…' },
      ],
      stop_reason: 'max_tokens',
    });

    const { support } = await buildHarness({
      install: {
        config: { model: 'claude-sonnet-4-6' },
        secrets: { api_key: { ct: 'enc' } },
        enabled: true,
      },
      conversation: {
        id: 'c4',
        user_id: null,
        messages: [{ sender_type: 'client', body: 'Necesito ayuda' }],
      },
    });

    const result = await support.generate('c4');

    // El plugin concatena los bloques `text` y mapea stop_reason→truncated.
    expect(result.suggestion).toBe('Borrador largo…');
    expect(result.truncated).toBe(true);
    // El modelo viene de la config del proveedor (no se degrada a la fuerza).
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(firstCreateArg().model).toBe('claude-sonnet-4-6');
  });
});
