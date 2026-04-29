import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../core/database/prisma.service';
import { TasksService } from './tasks.service';
import { CreateTaskDto, TaskTypeDto, TaskPriorityDto } from './dto/task.dto';

/**
 * Tests unit TasksService — Sprint 8 Fase B EC-T8-12 / EC-T8-13 (2026-04-29).
 *
 * Cobertura específica de las validaciones defensivas que NO viven en el
 * DTO porque requieren reloj actual o lookup en BD:
 *   - EC-T8-12 → `due_date` no puede estar en el pasado salvo `allowOverdue`.
 *   - EC-T8-13 → `service.user_id` debe coincidir con `client_id`.
 *
 * EC-T8-14/15/16 viven en `dto/task.dto.spec.ts` (validación declarativa).
 */
describe('TasksService — EC-T8-12 / EC-T8-13 (validaciones defensivas)', () => {
  let service: TasksService;
  let prisma: {
    task: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    service: { findUnique: jest.Mock };
  };
  let events: { emit: jest.Mock };

  const CLIENT_ID = '11111111-1111-1111-1111-111111111111';
  const SERVICE_ID = '22222222-2222-2222-2222-222222222222';
  const CREATOR_ID = '33333333-3333-3333-3333-333333333333';

  beforeEach(async () => {
    prisma = {
      task: {
        create: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Record<string, unknown> }) => ({
              id: 'task-id',
              ...data,
              assignee: null,
              creator: null,
              client: null,
            }),
          ),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      service: { findUnique: jest.fn() },
    };
    events = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: events },
      ],
    }).compile();

    service = module.get(TasksService);
  });

  function makeDto(extra: Partial<CreateTaskDto> = {}): CreateTaskDto {
    return {
      type: TaskTypeDto.custom_work,
      title: 'EC test',
      client_id: CLIENT_ID,
      priority: TaskPriorityDto.medium,
      ...extra,
    } as CreateTaskDto;
  }

  /* ── EC-T8-12 ── */
  describe('EC-T8-12 — due_date no puede ser pasada al crear', () => {
    it('rechaza due_date de ayer con BadRequestException', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(12, 0, 0, 0);

      await expect(
        service.create(
          makeDto({ due_date: yesterday.toISOString() }),
          CREATOR_ID,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('acepta due_date de hoy aunque sean las 23:00 (límite a 00:00 de hoy)', async () => {
      const todayLate = new Date();
      todayLate.setHours(0, 5, 0, 0);

      await service.create(
        makeDto({ due_date: todayLate.toISOString() }),
        CREATOR_ID,
      );
      expect(prisma.task.create).toHaveBeenCalled();
    });

    it('acepta due_date futura', async () => {
      const future = new Date();
      future.setDate(future.getDate() + 7);

      await service.create(
        makeDto({ due_date: future.toISOString() }),
        CREATOR_ID,
      );
      expect(prisma.task.create).toHaveBeenCalled();
    });

    it('bypassa la validación cuando se pasa allowOverdue=true (cron retroactivo)', async () => {
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      await service.create(
        makeDto({ due_date: lastMonth.toISOString() }),
        CREATOR_ID,
        { allowOverdue: true },
      );
      expect(prisma.task.create).toHaveBeenCalled();
    });

    it('omite la validación cuando no se pasa due_date', async () => {
      await service.create(makeDto(), CREATOR_ID);
      expect(prisma.task.create).toHaveBeenCalled();
    });
  });

  /* ── EC-T8-13 ── */
  describe('EC-T8-13 — service_id debe pertenecer al client_id', () => {
    it('rechaza si el servicio pertenece a otro cliente', async () => {
      prisma.service.findUnique.mockResolvedValueOnce({
        id: SERVICE_ID,
        user_id: 'otro-cliente-uuid',
      });

      await expect(
        service.create(makeDto({ service_id: SERVICE_ID }), CREATOR_ID),
      ).rejects.toThrow(/no pertenece al cliente/i);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('rechaza si el servicio no existe', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.create(makeDto({ service_id: SERVICE_ID }), CREATOR_ID),
      ).rejects.toThrow(/no existe/i);
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('acepta si el servicio pertenece al cliente declarado', async () => {
      prisma.service.findUnique.mockResolvedValueOnce({
        id: SERVICE_ID,
        user_id: CLIENT_ID,
      });

      await service.create(makeDto({ service_id: SERVICE_ID }), CREATOR_ID);
      expect(prisma.task.create).toHaveBeenCalled();
    });

    it('omite la verificación cuando no se pasa service_id', async () => {
      await service.create(makeDto(), CREATOR_ID);
      expect(prisma.service.findUnique).not.toHaveBeenCalled();
      expect(prisma.task.create).toHaveBeenCalled();
    });
  });
});
