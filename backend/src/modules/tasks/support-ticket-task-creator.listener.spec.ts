import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../core/database/prisma.service';
import { TasksService } from './tasks.service';
import { SupportTicketTaskCreatorListener } from './support-ticket-task-creator.listener';

/**
 * Tests unit SupportTicketTaskCreatorListener — Sprint 8 Fase B.10 (ADR-074).
 *
 * Cobertura:
 *   1. Conversación inexistente → no crea task (warn).
 *   2. Conversación tipo chat → no crea task (sólo tickets).
 *   3. Conversación sin user_id → no crea task (chat anónimo).
 *   4. Task activa ya existe → REASIGNA en lugar de crear duplicada.
 *   5. Task activa con mismo agente → idempotente (no hace nada).
 *   6. Path normal → crea task con shape canónico.
 */
describe('SupportTicketTaskCreatorListener — Sprint 8 Fase B.10', () => {
  let listener: SupportTicketTaskCreatorListener;
  let prisma: {
    conversation: { findUnique: jest.Mock };
    task: { findFirst: jest.Mock };
  };
  let tasksService: { create: jest.Mock; update: jest.Mock };

  const baseConv = {
    id: 'conv-1',
    type: 'ticket' as const,
    subject: 'Mi problema con el hosting',
    priority: 'high',
    user_id: 'client-1',
  };

  beforeEach(async () => {
    prisma = {
      conversation: { findUnique: jest.fn() },
      task: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    tasksService = {
      create: jest.fn().mockResolvedValue({ id: 'task-new' }),
      update: jest.fn().mockResolvedValue({ id: 'task-existing' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportTicketTaskCreatorListener,
        { provide: PrismaService, useValue: prisma },
        { provide: TasksService, useValue: tasksService },
      ],
    }).compile();

    listener = module.get(SupportTicketTaskCreatorListener);
  });

  it('NO crea task si la conversación no existe', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(null);
    await listener.handle({
      conversation_id: 'conv-fantasma',
      agent_id: 'agent-1',
      agent_name: 'Ana',
      assigned_by: 'admin-1',
    });
    expect(tasksService.create).not.toHaveBeenCalled();
    expect(tasksService.update).not.toHaveBeenCalled();
  });

  it('NO crea task si la conversación es chat (no ticket)', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce({
      ...baseConv,
      type: 'chat',
    });
    await listener.handle({
      conversation_id: 'conv-1',
      agent_id: 'agent-1',
      agent_name: 'Ana',
      assigned_by: 'admin-1',
    });
    expect(tasksService.create).not.toHaveBeenCalled();
  });

  it('NO crea task si la conversación no tiene user_id', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce({
      ...baseConv,
      user_id: null,
    });
    await listener.handle({
      conversation_id: 'conv-1',
      agent_id: 'agent-1',
      agent_name: 'Ana',
      assigned_by: 'admin-1',
    });
    expect(tasksService.create).not.toHaveBeenCalled();
  });

  it('REASIGNA task existente activa cuando cambia el agente', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(baseConv);
    prisma.task.findFirst.mockResolvedValueOnce({
      id: 'task-existing',
      assigned_to: 'agent-old',
    });
    await listener.handle({
      conversation_id: 'conv-1',
      agent_id: 'agent-new',
      agent_name: 'Berta',
      assigned_by: 'admin-1',
    });
    expect(tasksService.create).not.toHaveBeenCalled();
    expect(tasksService.update).toHaveBeenCalledWith(
      'task-existing',
      { assigned_to: 'agent-new' },
      'admin-1',
      true,
    );
  });

  it('IDEMPOTENTE: si la task activa ya tiene al agente, no hace nada', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(baseConv);
    prisma.task.findFirst.mockResolvedValueOnce({
      id: 'task-existing',
      assigned_to: 'agent-1',
    });
    await listener.handle({
      conversation_id: 'conv-1',
      agent_id: 'agent-1',
      agent_name: 'Ana',
      assigned_by: 'admin-1',
    });
    expect(tasksService.create).not.toHaveBeenCalled();
    expect(tasksService.update).not.toHaveBeenCalled();
  });

  it('CREA task nueva con shape canónico cuando no hay activa previa', async () => {
    prisma.conversation.findUnique.mockResolvedValueOnce(baseConv);
    prisma.task.findFirst.mockResolvedValueOnce(null);
    await listener.handle({
      conversation_id: 'conv-1',
      agent_id: 'agent-1',
      agent_name: 'Ana',
      assigned_by: 'admin-1',
    });
    expect(tasksService.create).toHaveBeenCalledTimes(1);
    const calls = tasksService.create.mock.calls as unknown as unknown[][];
    const dto = calls[0][0] as {
      type: string;
      title: string;
      conversation_id: string;
      client_id: string;
      assigned_to: string;
      priority: string;
      reason: string;
    };
    expect(dto.type).toBe('support_ticket');
    expect(dto.title).toBe('Mi problema con el hosting');
    expect(dto.conversation_id).toBe('conv-1');
    expect(dto.client_id).toBe('client-1');
    expect(dto.assigned_to).toBe('agent-1');
    expect(dto.priority).toBe('high');
    expect(dto.reason).toContain('Soporte:');
  });
});
