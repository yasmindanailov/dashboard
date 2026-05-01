import { Test, TestingModule } from '@nestjs/testing';
import {
  SupportInsidePriorityListener,
  mapTierToPriority,
} from './support-inside-priority.listener';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  ConversationPriority,
  SupportInsidePriorityTier,
} from '@prisma/client';

/**
 * Tests unit SupportInsidePriorityListener — Sub-fase 8.D.12.2.
 *
 * Cobertura:
 *   - mapTierToPriority: standard→normal, high→high, max→urgent.
 *   - guest sin user_id no consulta BD.
 *   - cliente con plan max → updateMany filtra priority='normal' y escala a 'urgent'.
 *   - compare-and-swap: si la conversación ya tiene priority distinta, NO la pisa (EC-T8-47).
 *   - cliente sin subscription activa: no actúa.
 */
describe('SupportInsidePriorityListener — Sprint 8 Fase D.12.2', () => {
  let listener: SupportInsidePriorityListener;
  let prisma: {
    supportInsideSubscription: { findUnique: jest.Mock };
    conversation: { updateMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      supportInsideSubscription: { findUnique: jest.fn() },
      conversation: { updateMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportInsidePriorityListener,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    listener = module.get(SupportInsidePriorityListener);
  });

  it('mapTierToPriority — standard→normal, high→high, max→urgent', () => {
    expect(mapTierToPriority(SupportInsidePriorityTier.standard)).toBe(
      ConversationPriority.normal,
    );
    expect(mapTierToPriority(SupportInsidePriorityTier.high)).toBe(
      ConversationPriority.high,
    );
    expect(mapTierToPriority(SupportInsidePriorityTier.max)).toBe(
      ConversationPriority.urgent,
    );
  });

  it('handler — guest sin user_id NO consulta BD', async () => {
    await listener.handleConversationCreated({
      conversation_id: 'C1',
      user_id: null,
      type: 'chat',
    });
    expect(prisma.supportInsideSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('handler — flag is_guest=true tampoco consulta BD', async () => {
    await listener.handleConversationCreated({
      conversation_id: 'C1',
      user_id: 'U1',
      type: 'chat',
      is_guest: true,
    });
    expect(prisma.supportInsideSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('handler — cliente con plan max + priority normal → escala a urgent', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      status: 'active',
      product: {
        support_inside_config: { priority_tier: SupportInsidePriorityTier.max },
      },
    });
    prisma.conversation.updateMany.mockResolvedValue({ count: 1 });

    await listener.handleConversationCreated({
      conversation_id: 'C1',
      user_id: 'U1',
      type: 'ticket',
    });

    expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'C1', priority: ConversationPriority.normal },
      data: { priority: ConversationPriority.urgent },
    });
  });

  it('handler — plan standard → no actúa (target=normal=current default)', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      status: 'active',
      product: {
        support_inside_config: {
          priority_tier: SupportInsidePriorityTier.standard,
        },
      },
    });

    await listener.handleConversationCreated({
      conversation_id: 'C1',
      user_id: 'U1',
      type: 'chat',
    });

    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('handler — cliente sin subscription → no actúa', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue(null);

    await listener.handleConversationCreated({
      conversation_id: 'C1',
      user_id: 'U1',
      type: 'chat',
    });

    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('handler — subscription cancelled → no actúa', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      status: 'cancelled',
      product: {
        support_inside_config: { priority_tier: SupportInsidePriorityTier.max },
      },
    });

    await listener.handleConversationCreated({
      conversation_id: 'C1',
      user_id: 'U1',
      type: 'chat',
    });

    expect(prisma.conversation.updateMany).not.toHaveBeenCalled();
  });

  it('handler — compare-and-swap: count=0 (priority ya alterada) NO falla, log debug', async () => {
    prisma.supportInsideSubscription.findUnique.mockResolvedValue({
      status: 'active',
      product: {
        support_inside_config: {
          priority_tier: SupportInsidePriorityTier.high,
        },
      },
    });
    prisma.conversation.updateMany.mockResolvedValue({ count: 0 });

    // EC-T8-47: si el agente ya cambió la priority manualmente entre el
    // create y este listener, updateMany devuelve count=0 y no peta.
    await expect(
      listener.handleConversationCreated({
        conversation_id: 'C1',
        user_id: 'U1',
        type: 'chat',
      }),
    ).resolves.not.toThrow();
  });
});
