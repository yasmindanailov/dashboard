import { PresenceService } from './presence.service';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * PresenceService — Rediseño UI F3·E8. Verifica el upsert del heartbeat y la
 * derivación del estado (delega en presence.helper, ya testeado aparte).
 */
describe('PresenceService — F3·E8', () => {
  const now = new Date('2026-06-28T12:00:00.000Z');

  it('heartbeat hace upsert de last_seen_at del usuario', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      userPresence: { upsert },
    } as unknown as PrismaService;
    const service = new PresenceService(prisma);
    await service.heartbeat('u1');
    const arg = (
      upsert.mock.calls as Array<[{ where: { user_id: string } }]>
    )[0][0];
    expect(arg.where.user_id).toBe('u1');
  });

  it('getPresence deriva online si el último visto es reciente', async () => {
    const prisma = {
      userPresence: {
        findUnique: jest.fn().mockResolvedValue({
          last_seen_at: new Date('2026-06-28T11:59:00.000Z'),
        }),
      },
    } as unknown as PrismaService;
    const service = new PresenceService(prisma);
    await expect(service.getPresence('u1', now)).resolves.toBe('online');
  });

  it('getPresence sin fila → offline', async () => {
    const prisma = {
      userPresence: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new PresenceService(prisma);
    await expect(service.getPresence('u1', now)).resolves.toBe('offline');
  });

  it('getPresenceMap devuelve estado por usuario; los sin fila → offline', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        user_id: 'online-user',
        last_seen_at: new Date('2026-06-28T11:59:00.000Z'),
      },
      {
        user_id: 'away-user',
        last_seen_at: new Date('2026-06-28T11:50:00.000Z'),
      },
    ]);
    const prisma = {
      userPresence: { findMany },
    } as unknown as PrismaService;
    const service = new PresenceService(prisma);
    const map = await service.getPresenceMap(
      ['online-user', 'away-user', 'missing-user'],
      now,
    );
    expect(map).toEqual({
      'online-user': 'online',
      'away-user': 'away',
      'missing-user': 'offline',
    });
  });

  it('getPresenceMap con lista vacía → {} sin tocar BD', async () => {
    const findMany = jest.fn();
    const prisma = {
      userPresence: { findMany },
    } as unknown as PrismaService;
    const service = new PresenceService(prisma);
    await expect(service.getPresenceMap([], now)).resolves.toEqual({});
    expect(findMany).not.toHaveBeenCalled();
  });
});
