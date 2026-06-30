import { Queue } from 'bullmq';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';

/**
 * F3·E10 — `findAllForUser` gana filtro por `category` server-side (correcto
 * con paginación). Estos tests blindan que el filtro se traslada al `where` de
 * Prisma solo cuando se pide, sin romper el filtro existente de `unread_only`
 * ni el scope canónico (user_id + channel='internal').
 */
describe('NotificationsService.findAllForUser — filtro category (F3·E10)', () => {
  let service: NotificationsService;
  let findMany: jest.Mock;
  let count: jest.Mock;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    count = jest.fn().mockResolvedValue(0);
    const prisma = {
      notification: { findMany, count },
    } as unknown as PrismaService;
    const settings = {} as unknown as SettingsService;
    const queue = {} as unknown as Queue;
    service = new NotificationsService(prisma, settings, queue);
  });

  const whereOf = (): Record<string, unknown> => {
    const calls = findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    return calls[0][0].where;
  };

  it('incluye category en el where cuando se pasa', async () => {
    await service.findAllForUser('u1', { category: 'dominios' });
    expect(whereOf()).toEqual({
      user_id: 'u1',
      channel: 'internal',
      category: 'dominios',
    });
  });

  it('omite category del where cuando no se pasa', async () => {
    await service.findAllForUser('u1', {});
    expect(whereOf()).toEqual({ user_id: 'u1', channel: 'internal' });
    expect(whereOf()).not.toHaveProperty('category');
  });

  it('combina category con unread_only', async () => {
    await service.findAllForUser('u1', {
      category: 'soporte',
      unread_only: true,
    });
    expect(whereOf()).toEqual({
      user_id: 'u1',
      channel: 'internal',
      category: 'soporte',
      read_at: null,
    });
  });
});
