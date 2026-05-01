import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Prisma,
  ConversationPriority,
  SupportInsidePriorityTier,
} from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * SupportInsidePriorityListener — Sprint 8 Fase D.12.2 (ADR-061 §canales y
 * prioridad + ADR-034 §"tier de cuenta").
 *
 * Cuando un cliente con Support Inside activo abre un chat o ticket, su
 * `priority_tier` del plan (standard/high/max) se traduce automáticamente a
 * `conversation.priority` (low/normal/high/urgent). El agente ve la
 * prioridad correcta sin tener que comprobar manualmente si el cliente
 * tiene Support Inside.
 *
 * Reglas canónicas:
 *   - Solo actúa si la conversación tiene `priority='normal'` (default).
 *     **Defense in depth EC-T8-47**: si el cliente o un agente especificó
 *     una prioridad distinta al crear (ej. cliente Pro reportando algo no
 *     urgente, agente bajando un caso a `low`), respetamos la elección.
 *     El listener escala SOLO el default automático.
 *   - Solo actúa si `user_id != null` (chats guest no tienen owner conocido).
 *   - Solo actúa si la suscripción está `active`.
 *
 * Mapeo canónico tier → priority:
 *   standard → normal (no-op, el default ya es normal).
 *   high     → high.
 *   max      → urgent.
 *
 * Cumple R1 (módulos por eventos) — escucha el bus en lugar de acoplar
 * `support` con `support-inside`. Si un día se quita Support Inside, el
 * listener queda dormido sin romper nada.
 */
@Injectable()
export class SupportInsidePriorityListener {
  private readonly logger = new Logger(SupportInsidePriorityListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('conversation.created')
  async handleConversationCreated(payload: {
    conversation_id: string;
    user_id: string | null;
    type: string;
    is_guest?: boolean;
  }): Promise<void> {
    if (!payload.user_id || payload.is_guest) {
      // Guest sin user_id → no hay subscription posible.
      return;
    }

    try {
      // 1. Resolver subscription activa del cliente.
      const subscription =
        await this.prisma.supportInsideSubscription.findUnique({
          where: { client_id: payload.user_id },
          select: {
            status: true,
            product: {
              select: {
                support_inside_config: { select: { priority_tier: true } },
              },
            },
          },
        });
      if (
        !subscription ||
        subscription.status !== 'active' ||
        !subscription.product.support_inside_config
      ) {
        return;
      }

      const tier = subscription.product.support_inside_config.priority_tier;
      const targetPriority = mapTierToPriority(tier);
      if (targetPriority === ConversationPriority.normal) {
        // standard → normal: no-op (la conversación ya está en normal).
        return;
      }

      // 2. Compare-and-swap: solo subir si sigue en `normal` (default).
      //    Si el agente ya la cambió manualmente entre el create y este
      //    listener, NO la pisamos (EC-T8-47).
      const result = await this.prisma.conversation.updateMany({
        where: {
          id: payload.conversation_id,
          priority: ConversationPriority.normal,
        },
        data: { priority: targetPriority },
      });

      if (result.count === 1) {
        this.logger.log(
          `support-inside-priority: conversation=${payload.conversation_id} client=${payload.user_id} tier=${tier} → priority=${targetPriority}`,
        );
      } else {
        this.logger.debug(
          `support-inside-priority: conversation=${payload.conversation_id} skipped (priority manualmente alterada o ya escalada)`,
        );
      }
    } catch (err) {
      // R13: listeners no relanzan; log + continuar.
      // P2025 = record not found (conversación borrada antes de procesar
      // el evento), no es error real.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return;
      }
      this.logger.error(
        `support-inside-priority listener failed for conversation ${payload.conversation_id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}

/**
 * Mapeo canónico Support Inside priority_tier → ConversationPriority.
 * Exportado para que tests lo verifiquen sin instanciar el listener.
 */
export function mapTierToPriority(
  tier: SupportInsidePriorityTier,
): ConversationPriority {
  switch (tier) {
    case SupportInsidePriorityTier.max:
      return ConversationPriority.urgent;
    case SupportInsidePriorityTier.high:
      return ConversationPriority.high;
    case SupportInsidePriorityTier.standard:
    default:
      return ConversationPriority.normal;
  }
}
