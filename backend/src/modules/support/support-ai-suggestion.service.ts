import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InvoiceStatus, MessageSender, ServiceStatus } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import {
  AiSuggestionService,
  AiUnavailableError,
} from '../../core/ai/ai-suggestion.service';
import { CircuitOpenError } from '../../core/provisioning/circuit-breaker';
import {
  AiClientContext,
  AiMessage,
  AiSuggestionResult,
} from '../../core/ai/types';

/**
 * SupportAiSuggestionService — orquesta el "IA copilot para agentes"
 * (Rediseño UI F3·E13 Fase D · ADR-080 Amendment D).
 *
 * Responsabilidad: armar **server-side (R5)** la entrada de la sugerencia desde
 * el `id` de la conversación (el front NUNCA construye el prompt) y delegar en
 * `AiSuggestionService` (core/ai), que resuelve el proveedor IA activo + breaker.
 * NUNCA auto-envía: devuelve un borrador que el agente revisa e inserta.
 *
 * Lo que ensambla:
 *   1. **Transcript** — mensajes `client`/`agent` NO internos (SUPP-INV-3:
 *      las notas internas jamás salen al borrador del cliente), en orden.
 *   2. **Locale** — idioma del cliente para la respuesta.
 *   3. **Grounding v1** — contexto fáctico MINIMIZADO (servicios + facturación +
 *      datos básicos) leído directo de Prisma (mismo patrón de lectura legítima
 *      que el resto de `support` sobre `users`/`services`; R1). Sin email/NIF
 *      (RGPD: sale a un tercero). Sin llamada live al proveedor (NS/métricas →
 *      v1.1). Ver `docs/20-modules/support/contract.md §Sugerencia IA`.
 */
@Injectable()
export class SupportAiSuggestionService {
  private readonly logger = new Logger(SupportAiSuggestionService.name);

  /** Tope de mensajes del transcript (acota tamaño/coste del prompt). */
  private static readonly MAX_TRANSCRIPT_MESSAGES = 40;
  /** Tope de servicios listados en el grounding. */
  private static readonly MAX_SERVICES = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiSuggestionService,
  ) {}

  /**
   * ¿Hay un proveedor IA activo? El front lo usa para gatear el botón
   * "Sugerencia IA" del composer (F3·E13 Fase F) — sin proveedor activo, no se
   * muestra. Síncrono (consulta el registry en memoria).
   */
  isEnabled(): boolean {
    return this.ai.isEnabled();
  }

  async generate(
    conversationId: string,
    instructions?: string,
  ): Promise<AiSuggestionResult> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        user_id: true,
        messages: {
          // SUPP-INV-3: las notas internas no se vuelcan al borrador del cliente.
          where: {
            is_internal: false,
            sender_type: { in: [MessageSender.client, MessageSender.agent] },
          },
          orderBy: { created_at: 'asc' },
          select: { sender_type: true, body: true },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversación no encontrada.');
    }

    const messages: AiMessage[] = conversation.messages
      .filter((m) => m.body.trim().length > 0)
      .slice(-SupportAiSuggestionService.MAX_TRANSCRIPT_MESSAGES)
      .map((m) => ({
        role: m.sender_type === MessageSender.client ? 'customer' : 'agent',
        text: m.body.trim(),
      }));

    let locale: string | undefined;
    let context: AiClientContext | undefined;
    if (conversation.user_id) {
      const assembled = await this.assembleContext(conversation.user_id);
      locale = assembled.locale;
      context = assembled.context;
    }

    try {
      return await this.ai.suggestReply({
        messages,
        locale,
        instructions,
        context,
      });
    } catch (err) {
      // R7/R14: errores semánticos del subsistema IA → HTTP elegante.
      if (err instanceof AiUnavailableError) {
        throw new ServiceUnavailableException({
          code: 'AI_UNAVAILABLE',
          message: err.message,
        });
      }
      if (err instanceof CircuitOpenError) {
        throw new ServiceUnavailableException({
          code: 'AI_CIRCUIT_OPEN',
          message:
            'El proveedor de IA está temporalmente no disponible. Inténtalo en unos segundos.',
          retryAfterMs: err.retryAfterMs,
        });
      }
      throw err;
    }
  }

  /**
   * Ensambla el grounding v1 desde el `user_id` (R5). Lecturas mínimas y
   * directas (R1: lectura legítima cross-módulo, igual que ya hace `support`).
   * Datos minimizados — NUNCA email/teléfono/NIF/dirección (RGPD).
   */
  private async assembleContext(
    userId: string,
  ): Promise<{ locale?: string; context: AiClientContext }> {
    const [user, services, pendingInvoices] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          first_name: true,
          language: true,
          created_at: true,
          support_inside_subscription: {
            select: {
              status: true,
              product: {
                select: {
                  support_inside_config: {
                    select: {
                      priority_tier: true,
                      response_sla_hours: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.service.findMany({
        where: {
          user_id: userId,
          status: {
            notIn: [ServiceStatus.cancelled, ServiceStatus.terminated],
          },
        },
        orderBy: { created_at: 'desc' },
        take: SupportAiSuggestionService.MAX_SERVICES,
        select: {
          status: true,
          label: true,
          domain: true,
          expires_at: true,
          next_due_date: true,
          product: { select: { name: true } },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          user_id: userId,
          status: { in: [InvoiceStatus.pending, InvoiceStatus.overdue] },
        },
        orderBy: { due_date: 'asc' },
        select: { total: true, currency: true },
      }),
    ]);

    const context: AiClientContext = {};
    const locale = user?.language || undefined;

    if (user) {
      const sub = user.support_inside_subscription;
      const cfg =
        sub && sub.status === 'active'
          ? sub.product.support_inside_config
          : null;
      context.client = {
        firstName: user.first_name || undefined,
        locale,
        clientSinceYear: user.created_at.getUTCFullYear(),
        supportTier: cfg?.priority_tier ?? undefined,
        slaHours: cfg?.response_sla_hours ?? undefined,
      };
    }

    if (services.length > 0) {
      context.services = services.map((s) => ({
        label: s.label ?? s.domain ?? s.product.name,
        product: s.product.name,
        status: s.status,
        domain: s.domain ?? undefined,
        expiresAt: s.expires_at ? toDateOnly(s.expires_at) : undefined,
      }));
    }

    if (pendingInvoices.length > 0) {
      const nextRenewal = earliestFutureRenewal(
        services.map((s) => s.next_due_date),
      );
      const billing: NonNullable<AiClientContext['billing']> = {
        pendingCount: pendingInvoices.length,
        nextRenewalAt: nextRenewal ? toDateOnly(nextRenewal) : undefined,
      };
      // Solo afirmamos un importe total si TODAS las pendientes comparten
      // moneda. Sumar entre monedas daría un total sin sentido que la IA
      // afirmaría como hecho (el system-prompt manda apoyarse en estos datos).
      const currencies = new Set(pendingInvoices.map((inv) => inv.currency));
      if (currencies.size === 1) {
        const total = pendingInvoices.reduce(
          (sum, inv) => sum + inv.total.toNumber(),
          0,
        );
        billing.pendingTotal = total.toFixed(2);
        billing.currency = pendingInvoices[0].currency;
      }
      context.billing = billing;
    }

    return { locale, context };
  }
}

/** Fecha sin hora (`YYYY-MM-DD`) — minimización del dato temporal. */
function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Mínima `next_due_date` futura (próxima renovación), o `null`. */
function earliestFutureRenewal(dates: (Date | null)[]): Date | null {
  const now = Date.now();
  const future = dates.filter(
    (d): d is Date => d !== null && d.getTime() >= now,
  );
  if (future.length === 0) return null;
  return future.reduce((min, d) => (d.getTime() < min.getTime() ? d : min));
}
