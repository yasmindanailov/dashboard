import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { PrismaService } from '../../core/database/prisma.service';
import {
  AiSuggestionService,
  AiUnavailableError,
} from '../../core/ai/ai-suggestion.service';
import { CircuitOpenError } from '../../core/provisioning/circuit-breaker';
import { AiSuggestionInput } from '../../core/ai/types';
import { SupportAiSuggestionService } from './support-ai-suggestion.service';

/**
 * Tests unit — IA copilot para agentes (F3·E13 Fase D).
 * Foco: ensamblado server-side (R5) — transcript SIN notas internas (SUPP-INV-3),
 * grounding v1 minimizado (RGPD), y mapeo de errores del subsistema IA → 503.
 * Sin red ni BD: prisma + AiSuggestionService mockeados.
 */

interface ConversationRow {
  id: string;
  user_id: string | null;
  messages: { sender_type: string; body: string }[];
}

function decimal(n: number) {
  return { toNumber: () => n };
}

/** Primer argumento (tipado) con que se llamó a `suggestReply`. */
function firstInput(suggest: jest.Mock): AiSuggestionInput {
  return (suggest.mock.calls as unknown as AiSuggestionInput[][])[0][0];
}

/** `where` de los mensajes en la query de la conversación. */
function messagesWhere(findUnique: jest.Mock): { is_internal: boolean } {
  const calls = findUnique.mock.calls as unknown as Array<
    [{ select: { messages: { where: { is_internal: boolean } } } }]
  >;
  return calls[0][0].select.messages.where;
}

function buildService(opts: {
  conversation: ConversationRow | null;
  user?: unknown;
  services?: unknown[];
  invoices?: unknown[];
  suggest?: jest.Mock;
}) {
  const findUnique = jest.fn().mockResolvedValue(opts.conversation);
  const userFindUnique = jest.fn().mockResolvedValue(opts.user ?? null);
  const serviceFindMany = jest.fn().mockResolvedValue(opts.services ?? []);
  const invoiceFindMany = jest.fn().mockResolvedValue(opts.invoices ?? []);

  const prisma = {
    conversation: { findUnique },
    user: { findUnique: userFindUnique },
    service: { findMany: serviceFindMany },
    invoice: { findMany: invoiceFindMany },
  };

  const suggest =
    opts.suggest ??
    jest.fn().mockResolvedValue({ suggestion: 'borrador', model: 'stub' });
  const ai = { suggestReply: suggest };

  const service = new SupportAiSuggestionService(
    prisma as unknown as PrismaService,
    ai as unknown as AiSuggestionService,
  );

  return {
    service,
    suggest,
    findUnique,
    userFindUnique,
    serviceFindMany,
    invoiceFindMany,
  };
}

describe('SupportAiSuggestionService — F3·E13 Fase D', () => {
  it('isEnabled() delega en AiSuggestionService (gatea el botón del composer, Fase F)', () => {
    const ai = { isEnabled: jest.fn().mockReturnValue(true) };
    const service = new SupportAiSuggestionService(
      {} as unknown as PrismaService,
      ai as unknown as AiSuggestionService,
    );
    expect(service.isEnabled()).toBe(true);
    expect(ai.isEnabled).toHaveBeenCalledTimes(1);
  });

  it('conversación inexistente → NotFoundException', async () => {
    const { service } = buildService({ conversation: null });
    await expect(service.generate('missing-id')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('excluye notas internas en la query (SUPP-INV-3) y mapea roles client→customer / agent→agent', async () => {
    const { service, suggest, findUnique } = buildService({
      conversation: {
        id: 'c1',
        user_id: null,
        messages: [
          { sender_type: 'client', body: 'Mi web no carga' },
          { sender_type: 'agent', body: '¿Desde cuándo?' },
        ],
      },
    });

    await service.generate('c1');

    // La exclusión de notas internas se enforza en la propia query.
    expect(messagesWhere(findUnique).is_internal).toBe(false);

    const input = firstInput(suggest);
    expect(input.messages).toEqual([
      { role: 'customer', text: 'Mi web no carga' },
      { role: 'agent', text: '¿Desde cuándo?' },
    ]);
    // Chat sin user_id (guest) → sin grounding.
    expect(input.context).toBeUndefined();
  });

  it('grounding v1: ensambla contexto minimizado (cliente + servicios + facturación) y locale', async () => {
    const { service, suggest, userFindUnique } = buildService({
      conversation: {
        id: 'c2',
        user_id: 'u1',
        messages: [{ sender_type: 'client', body: 'Hola' }],
      },
      user: {
        first_name: 'Ana',
        language: 'es',
        created_at: new Date('2024-03-10T00:00:00Z'),
        // PII que el SELECT NO lee — si algún día se colara al contexto, las
        // aserciones de abajo lo detectan (RGPD: no sale a un tercero).
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

    await service.generate('c2');

    expect(userFindUnique).toHaveBeenCalledTimes(1);
    const input = firstInput(suggest);
    expect(input.locale).toBe('es');
    expect(input.context?.client).toEqual({
      firstName: 'Ana',
      locale: 'es',
      clientSinceYear: 2024,
      supportTier: 'high',
      slaHours: 4,
    });
    expect(input.context?.services).toEqual([
      {
        label: 'ana.com',
        product: 'Hosting Pro',
        status: 'active',
        domain: 'ana.com',
        expiresAt: '2027-01-01',
      },
    ]);
    expect(input.context?.billing).toEqual({
      pendingCount: 1,
      pendingTotal: '12.00',
      currency: 'EUR',
      nextRenewalAt: '2027-01-01',
    });
    // RGPD: el contexto está minimizado — ningún PII del cliente se filtra.
    const serialized = JSON.stringify(input.context);
    expect(serialized).not.toContain('@'); // email
    expect(serialized).not.toContain('+34600111222'); // teléfono
    expect(serialized).not.toContain('B12345678'); // NIF
    // Whitelist agnóstica a la forma: solo claves permitidas en `client`.
    expect(Object.keys(input.context?.client ?? {}).sort()).toEqual([
      'clientSinceYear',
      'firstName',
      'locale',
      'slaHours',
      'supportTier',
    ]);
  });

  it('grounding: fallback label=product.name + suscripción no activa (sin tier/SLA) + sin facturas', async () => {
    const { service, suggest } = buildService({
      conversation: {
        id: 'c5',
        user_id: 'u2',
        messages: [{ sender_type: 'client', body: 'Hola' }],
      },
      user: {
        first_name: 'Beto',
        language: 'en',
        created_at: new Date('2025-06-01T00:00:00Z'),
        // status != 'active' → cfg null → sin tier/SLA.
        support_inside_subscription: {
          status: 'cancelled',
          product: {
            support_inside_config: {
              priority_tier: 'max',
              response_sla_hours: 1,
            },
          },
        },
      },
      services: [
        {
          status: 'suspended',
          label: null,
          domain: null,
          expires_at: null,
          next_due_date: null,
          product: { name: 'Dominio .com' },
        },
      ],
    });

    await service.generate('c5');

    const input = firstInput(suggest);
    expect(input.locale).toBe('en');
    expect(input.context?.client?.supportTier).toBeUndefined();
    expect(input.context?.client?.slaHours).toBeUndefined();
    // label null + domain null → fallback a product.name.
    expect(input.context?.services).toEqual([
      {
        label: 'Dominio .com',
        product: 'Dominio .com',
        status: 'suspended',
        domain: undefined,
        expiresAt: undefined,
      },
    ]);
    // Sin facturas pendientes → sin bloque billing.
    expect(input.context?.billing).toBeUndefined();
  });

  it('grounding: facturas pendientes en monedas distintas → omite importe, conserva count', async () => {
    const { service, suggest } = buildService({
      conversation: {
        id: 'c6',
        user_id: 'u3',
        messages: [{ sender_type: 'client', body: 'Hola' }],
      },
      user: {
        first_name: 'Cleo',
        language: 'es',
        created_at: new Date('2023-01-01T00:00:00Z'),
        support_inside_subscription: null,
      },
      services: [],
      invoices: [
        { total: decimal(10), currency: 'EUR' },
        { total: decimal(20), currency: 'USD' },
      ],
    });

    await service.generate('c6');

    const input = firstInput(suggest);
    // No sumamos entre monedas: solo el recuento, sin importe afirmable.
    expect(input.context?.billing?.pendingCount).toBe(2);
    expect(input.context?.billing?.pendingTotal).toBeUndefined();
    expect(input.context?.billing?.currency).toBeUndefined();
  });

  it('AiUnavailableError → 503 con code AI_UNAVAILABLE', async () => {
    const suggest = jest
      .fn()
      .mockRejectedValue(new AiUnavailableError('IA no activa'));
    const { service } = buildService({
      conversation: { id: 'c3', user_id: null, messages: [] },
      suggest,
    });

    expect.assertions(2);
    try {
      await service.generate('c3');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'AI_UNAVAILABLE',
      });
    }
  });

  it('CircuitOpenError → 503 con code AI_CIRCUIT_OPEN + retryAfterMs', async () => {
    const suggest = jest
      .fn()
      .mockRejectedValue(
        new CircuitOpenError('ai:generateReplySuggestion', 5000),
      );
    const { service } = buildService({
      conversation: { id: 'c4', user_id: null, messages: [] },
      suggest,
    });

    expect.assertions(2);
    try {
      await service.generate('c4');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceUnavailableException);
      expect((err as ServiceUnavailableException).getResponse()).toMatchObject({
        code: 'AI_CIRCUIT_OPEN',
        retryAfterMs: 5000,
      });
    }
  });
});
