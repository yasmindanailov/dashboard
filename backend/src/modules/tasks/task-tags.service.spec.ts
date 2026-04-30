import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { TaskTagsService } from './task-tags.service';

/**
 * Tests unit TaskTagsService — Sprint 8 Fase B.7 (ADR-073).
 *
 * Cobertura:
 *   - list ordena por label asc.
 *   - create autogenera slug del label si no se pasa.
 *   - create rechaza si slug derivado no es válido (label sin chars utiles).
 *   - create traduce P2002 (unique violation) → 409 Conflict.
 *   - remove lanza NotFound si el id no existe.
 */
describe('TaskTagsService — Sprint 8 Fase B.7 (ADR-073)', () => {
  let service: TaskTagsService;
  let prisma: {
    taskTag: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  const CREATOR_ID = '00000000-0000-4000-8000-000000000001';

  beforeEach(async () => {
    prisma = {
      taskTag: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskTagsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TaskTagsService);
  });

  describe('list', () => {
    it('pide a Prisma orderBy label asc + select canónico', async () => {
      await service.list();
      expect(prisma.taskTag.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { label: 'asc' },
        }),
      );
    });
  });

  describe('create — slug auto-generado', () => {
    it('genera slug kebab-case desde el label cuando no se pasa', async () => {
      prisma.taskTag.create.mockResolvedValueOnce({ id: 'tag-id' });
      await service.create({ label: 'Renovación próxima' }, CREATOR_ID);
      const calls = prisma.taskTag.create.mock.calls as unknown as unknown[][];
      const callArg = calls[0][0] as {
        data: { slug: string; label: string; created_by: string };
      };
      expect(callArg.data.slug).toBe('renovacion-proxima');
      expect(callArg.data.label).toBe('Renovación próxima');
      expect(callArg.data.created_by).toBe(CREATOR_ID);
    });

    it('respeta el slug explícito si se pasa', async () => {
      prisma.taskTag.create.mockResolvedValueOnce({ id: 'tag-id' });
      await service.create(
        { label: 'Cualquier label', slug: 'custom-slug' },
        CREATOR_ID,
      );
      const calls = prisma.taskTag.create.mock.calls as unknown as unknown[][];
      const callArg = calls[0][0] as {
        data: { slug: string };
      };
      expect(callArg.data.slug).toBe('custom-slug');
    });

    it('rechaza si el label tiene sólo símbolos (slug derivado vacío)', async () => {
      await expect(
        service.create({ label: '!!!' }, CREATOR_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.taskTag.create).not.toHaveBeenCalled();
    });

    it('traduce P2002 (slug duplicado) a 409 Conflict', async () => {
      const err = Object.assign(new Error('Unique violation'), {
        code: 'P2002',
      });
      prisma.taskTag.create.mockRejectedValueOnce(err);
      await expect(
        service.create({ label: 'Bienvenida' }, CREATOR_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('lanza NotFound si el id no existe', async () => {
      prisma.taskTag.findUnique.mockResolvedValueOnce(null);
      await expect(service.remove('id-fantasma')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.taskTag.delete).not.toHaveBeenCalled();
    });

    it('borra cuando existe (cascada FK borra assignments)', async () => {
      prisma.taskTag.findUnique.mockResolvedValueOnce({
        id: 'tag-id',
        slug: 'foo',
      });
      const result = await service.remove('tag-id');
      expect(prisma.taskTag.delete).toHaveBeenCalledWith({
        where: { id: 'tag-id' },
      });
      expect(result).toEqual({ deleted: true });
    });
  });
});
