import { SupportInsideTechnicianRoutingListener } from './support-inside-technician-routing.listener';
import { PrismaService } from '../../../core/database/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * SupportInsideTechnicianRoutingListener — F3·E8 (dirigir tickets/chats al técnico).
 * Verifica: enruta al técnico elegible; ignora guests; respeta técnico inactivo/
 * no elegible; compare-and-swap (no pisa asignación previa).
 */
describe('SupportInsideTechnicianRoutingListener — F3·E8', () => {
  const ELIGIBLE_TECH = {
    id: 'tech-1',
    first_name: 'Luis',
    last_name: 'Ferrer',
    status: 'active',
    role: { slug: 'agent_support' },
  };

  function build(opts: { subscription?: unknown; updateCount?: number }) {
    const findUnique = jest.fn().mockResolvedValue(
      opts.subscription === undefined
        ? {
            status: 'active',
            assigned_technician_id: 'tech-1',
            technician: ELIGIBLE_TECH,
          }
        : opts.subscription,
    );
    const updateMany = jest
      .fn()
      .mockResolvedValue({ count: opts.updateCount ?? 1 });
    const emit = jest.fn();
    const prisma = {
      supportInsideSubscription: { findUnique },
      conversation: { updateMany },
    } as unknown as PrismaService;
    const events = { emit } as unknown as EventEmitter2;
    return {
      listener: new SupportInsideTechnicianRoutingListener(prisma, events),
      findUnique,
      updateMany,
      emit,
    };
  }

  const conv = {
    conversation_id: 'conv-1',
    user_id: 'client-1',
    type: 'ticket',
  };

  it('enruta la conversación al técnico elegible + emite conversation.assigned', async () => {
    const { listener, updateMany, emit } = build({});
    await listener.handleConversationCreated(conv);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'conv-1', assigned_agent_id: null },
      data: { assigned_agent_id: 'tech-1' },
    });
    expect(emit).toHaveBeenCalledWith(
      'conversation.assigned',
      expect.objectContaining({
        conversation_id: 'conv-1',
        agent_id: 'tech-1',
        agent_name: 'Luis Ferrer',
      }),
    );
  });

  it('chat guest (user_id null) → no consulta ni emite', async () => {
    const { listener, findUnique, emit } = build({});
    await listener.handleConversationCreated({
      ...conv,
      user_id: null,
      is_guest: true,
    });
    expect(findUnique).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('sin técnico asignado → no enruta', async () => {
    const { listener, updateMany, emit } = build({
      subscription: {
        status: 'active',
        assigned_technician_id: null,
        technician: null,
      },
    });
    await listener.handleConversationCreated(conv);
    expect(updateMany).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('técnico inactivo → no enruta (cae a la cola)', async () => {
    const { listener, emit } = build({
      subscription: {
        status: 'active',
        assigned_technician_id: 'tech-1',
        technician: { ...ELIGIBLE_TECH, status: 'inactive' },
      },
    });
    await listener.handleConversationCreated(conv);
    expect(emit).not.toHaveBeenCalled();
  });

  it('técnico con rol no elegible → no enruta', async () => {
    const { listener, emit } = build({
      subscription: {
        status: 'active',
        assigned_technician_id: 'tech-1',
        technician: { ...ELIGIBLE_TECH, role: { slug: 'agent_billing' } },
      },
    });
    await listener.handleConversationCreated(conv);
    expect(emit).not.toHaveBeenCalled();
  });

  it('ya asignada (compare-and-swap count 0) → no emite', async () => {
    const { listener, emit } = build({ updateCount: 0 });
    await listener.handleConversationCreated(conv);
    expect(emit).not.toHaveBeenCalled();
  });
});
