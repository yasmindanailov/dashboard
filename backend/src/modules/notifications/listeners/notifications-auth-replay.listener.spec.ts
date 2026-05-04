import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import { NotificationsAuthReplayListener } from './notifications-auth-replay.listener';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../core/database/prisma.service';

/**
 * Tests unit NotificationsAuthReplayListener — Sprint 13 §13.AUTH Fase B.
 *
 * Cobertura:
 *  - Caso normal: enriquece payload con email del user + dispatch a superadmins.
 *  - Enriquecimiento parcial: si Prisma falla, dispatch sigue (degradación elegante).
 *  - Dispatch falla: log a stderr, no relanza.
 */

describe('NotificationsAuthReplayListener — Sprint 13 §13.AUTH Fase B', () => {
  let listener: NotificationsAuthReplayListener;
  let dispatchToSuperadmins: jest.Mock;
  let userFindUnique: jest.Mock;

  const PAYLOAD = {
    user_id: 'user-uuid-1',
    session_id: 'session-uuid',
    original_used_at: '2026-05-03T10:30:00Z',
    attempted_at: '2026-05-03T10:35:00Z',
    ip: '203.0.113.5',
    revoked_sessions_count: 3,
  };

  beforeEach(async () => {
    dispatchToSuperadmins = jest.fn().mockResolvedValue(undefined);
    userFindUnique = jest.fn();

    // Silenciar logs durante tests (los warns/errors son intencionales en
    // los casos de fallo enriquecimiento + dispatch).
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsAuthReplayListener,
        {
          provide: NotificationsService,
          useValue: { dispatchToSuperadmins },
        },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: userFindUnique } },
        },
      ],
    }).compile();

    listener = module.get(NotificationsAuthReplayListener);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('enriquece con email + dispatch a superadmins', async () => {
    userFindUnique.mockResolvedValue({ email: 'cliente@aelium.test' });

    await listener.handleReplayDetected(PAYLOAD);

    expect(userFindUnique).toHaveBeenCalledWith({
      where: { id: 'user-uuid-1' },
      select: { email: true },
    });
    expect(dispatchToSuperadmins).toHaveBeenCalledWith(
      'auth.refresh_replay_detected',
      expect.objectContaining({
        ...PAYLOAD,
        attacked_user_email: 'cliente@aelium.test',
      }),
    );
  });

  it('si Prisma falla en enriquecimiento, dispatch sigue con email placeholder', async () => {
    userFindUnique.mockRejectedValue(new Error('DB down'));

    await listener.handleReplayDetected(PAYLOAD);

    expect(dispatchToSuperadmins).toHaveBeenCalledWith(
      'auth.refresh_replay_detected',
      expect.objectContaining({ attacked_user_email: '<email no disponible>' }),
    );
  });

  it('si dispatch falla, no relanza (degradación elegante R7)', async () => {
    userFindUnique.mockResolvedValue({ email: 'x@y.com' });
    dispatchToSuperadmins.mockRejectedValue(new Error('Notifications down'));

    await expect(
      listener.handleReplayDetected(PAYLOAD),
    ).resolves.toBeUndefined();
  });

  it('si user no existe, dispatch sigue con placeholder', async () => {
    userFindUnique.mockResolvedValue(null);

    await listener.handleReplayDetected(PAYLOAD);

    expect(dispatchToSuperadmins).toHaveBeenCalledWith(
      'auth.refresh_replay_detected',
      expect.objectContaining({ attacked_user_email: '<email no disponible>' }),
    );
  });
});
