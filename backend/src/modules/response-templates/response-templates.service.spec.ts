import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import { ResponseTemplatesService } from './response-templates.service';

/** Lee el primer argumento de la primera llamada de un mock, sin `any`. */
function firstArg<T>(fn: jest.Mock): T {
  const calls = fn.mock.calls as unknown[][];
  return calls[0][0] as T;
}

/**
 * Tests unit ResponseTemplatesService — Rediseño UI F3·E12.
 *
 * Foco: biblioteca de EQUIPO (sin ownership; `created_by` es trazabilidad) +
 * normalización (trim, categoría vacía→null) + guardas NotFound/BadRequest +
 * filtros de listado (categoría / búsqueda OR insensitive) + mapeo a DTO con
 * `creator_name`.
 */
describe('ResponseTemplatesService — F3·E12 (biblioteca de equipo)', () => {
  let prisma: {
    responseTemplate: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let service: ResponseTemplatesService;

  const row = (
    over: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    id: 't1',
    title: 'Saludo',
    body: 'Hola, soy del equipo de Aelium.',
    category: 'General',
    created_by: 'u1',
    created_at: new Date('2026-06-29T10:00:00Z'),
    updated_at: new Date('2026-06-29T10:00:00Z'),
    creator: { first_name: 'Ana', last_name: 'García' },
    ...over,
  });

  beforeEach(() => {
    prisma = {
      responseTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ResponseTemplatesService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('mapea filas a DTO con creator_name y ordena por categoría/título', async () => {
      prisma.responseTemplate.findMany.mockResolvedValue([row()]);

      const res = await service.findAll({});

      expect(prisma.responseTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
          orderBy: [{ category: 'asc' }, { title: 'asc' }],
        }),
      );
      expect(res[0]).toMatchObject({
        id: 't1',
        creator_name: 'Ana García',
        category: 'General',
      });
    });

    it('filtra por categoría y por búsqueda (OR title/body, insensitive)', async () => {
      prisma.responseTemplate.findMany.mockResolvedValue([]);

      await service.findAll({ category: 'Ventas', search: 'dominio' });

      const arg = firstArg<{ where: { category?: string; OR?: unknown } }>(
        prisma.responseTemplate.findMany,
      );
      expect(arg.where.category).toBe('Ventas');
      expect(arg.where.OR).toEqual([
        { title: { contains: 'dominio', mode: 'insensitive' } },
        { body: { contains: 'dominio', mode: 'insensitive' } },
      ]);
    });

    it('búsqueda en blanco no añade OR', async () => {
      prisma.responseTemplate.findMany.mockResolvedValue([]);

      await service.findAll({ search: '   ' });

      const arg = firstArg<{ where: { OR?: unknown } }>(
        prisma.responseTemplate.findMany,
      );
      expect(arg.where.OR).toBeUndefined();
    });

    it('creator null → creator_name null', async () => {
      prisma.responseTemplate.findMany.mockResolvedValue([
        row({ creator: null, created_by: null }),
      ]);

      const res = await service.findAll({});

      expect(res[0].creator_name).toBeNull();
    });
  });

  describe('create', () => {
    it('trim de campos + created_by = actor', async () => {
      prisma.responseTemplate.create.mockResolvedValue(row());

      await service.create(
        { title: '  Saludo  ', body: '  Hola  ', category: '  General  ' },
        'actor-1',
      );

      expect(prisma.responseTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            title: 'Saludo',
            body: 'Hola',
            category: 'General',
            created_by: 'actor-1',
          },
        }),
      );
    });

    it('categoría en blanco → null', async () => {
      prisma.responseTemplate.create.mockResolvedValue(row());

      await service.create({ title: 'A', body: 'B', category: '   ' }, 'u1');

      const { data } = firstArg<{ data: { category: string | null } }>(
        prisma.responseTemplate.create,
      );
      expect(data.category).toBeNull();
    });

    it('título vacío tras trim → BadRequest (no persiste)', async () => {
      await expect(
        service.create({ title: '   ', body: 'B' }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.responseTemplate.create).not.toHaveBeenCalled();
    });

    it('cuerpo vacío tras trim → BadRequest', async () => {
      await expect(
        service.create({ title: 'A', body: '   ' }, 'u1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('NotFound si no existe (no actualiza)', async () => {
      prisma.responseTemplate.findUnique.mockResolvedValue(null);

      await expect(service.update('x', { title: 'Z' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.responseTemplate.update).not.toHaveBeenCalled();
    });

    it('parcial: solo actualiza los campos presentes (con trim)', async () => {
      prisma.responseTemplate.findUnique.mockResolvedValue({ id: 't1' });
      prisma.responseTemplate.update.mockResolvedValue(row());

      await service.update('t1', { body: '  nuevo cuerpo  ' });

      expect(prisma.responseTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 't1' },
          data: { body: 'nuevo cuerpo' },
        }),
      );
    });

    it('cuerpo vacío tras trim → BadRequest', async () => {
      prisma.responseTemplate.findUnique.mockResolvedValue({ id: 't1' });

      await expect(
        service.update('t1', { body: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('remove', () => {
    it('NotFound si no existe (no borra)', async () => {
      prisma.responseTemplate.findUnique.mockResolvedValue(null);

      await expect(service.remove('x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.responseTemplate.delete).not.toHaveBeenCalled();
    });

    it('borra cuando existe', async () => {
      prisma.responseTemplate.findUnique.mockResolvedValue({ id: 't1' });
      prisma.responseTemplate.delete.mockResolvedValue(row());

      const res = await service.remove('t1');

      expect(prisma.responseTemplate.delete).toHaveBeenCalledWith({
        where: { id: 't1' },
      });
      expect(res).toEqual({ deleted: true });
    });
  });
});
