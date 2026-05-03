import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UnauthorizedException } from '@nestjs/common';

import { AuthTokenService } from './auth-token.service';
import { PrismaService } from '../../core/database/prisma.service';
import { SettingsService } from '../../core/settings/settings.service';
import type { JwtPayload } from './strategies/jwt.strategy';

/**
 * Tests unit AuthTokenService — Sprint 13 §13.AUTH Fase A (2026-05-03).
 *
 * Cobertura nueva en este sprint:
 *  - issueWsToken: payload shape (type='ws'), TTL 60s, rechaza usuarios
 *    inactivos / no encontrados.
 *  - Regresión Modelo A (ADR-078 Amendment A1): issueTokens NO toca cookies
 *    (solo body JSON). El test verifica que el shape de retorno coincide
 *    con el contrato esperado por la Server Action `loginAction` Next.js.
 *
 * Notas:
 *  - El módulo auth no tenía spec (deuda en docs/20-modules/auth/contract.md
 *    §17). Este es el primer .spec del módulo. Cobertura completa de
 *    login/refresh/recovery queda fuera de alcance Sprint 13.
 *  - Mock estilo Sprint 11 plugin-registry.spec.ts: TestingModule con
 *    providers fake mínimos.
 */

const FAKE_USER_ACTIVE = {
  id: 'user-uuid-1',
  email: 'cliente@aelium.test',
  first_name: 'Cliente',
  last_name: 'Demo',
  status: 'active',
  last_login_at: null,
  role: { slug: 'client', name: 'Cliente' },
};

describe('AuthTokenService — Sprint 13 §13.AUTH Fase A+B', () => {
  let service: AuthTokenService;
  let jwtSign: jest.Mock;
  let jwtVerify: jest.Mock;
  let prismaUserFindUnique: jest.Mock;
  let sessionFindUnique: jest.Mock;
  let sessionUpdate: jest.Mock;
  let sessionUpdateMany: jest.Mock;
  let sessionCreate: jest.Mock;
  let prismaTransaction: jest.Mock;
  let eventsEmit: jest.Mock;

  beforeEach(async () => {
    jwtSign = jest.fn().mockReturnValue('signed.jwt.token');
    jwtVerify = jest.fn();
    prismaUserFindUnique = jest.fn();
    sessionFindUnique = jest.fn();
    sessionUpdate = jest.fn();
    sessionUpdateMany = jest.fn();
    sessionCreate = jest.fn();
    eventsEmit = jest.fn();

    // Inline transaction mock que ejecuta el callback con un tx que delega
    // a los mocks individuales. Patrón simple porque el refresh solo usa
    // tx.session.create + tx.session.update.
    prismaTransaction = jest.fn(
      (
        cb: (tx: {
          session: { create: jest.Mock; update: jest.Mock };
        }) => Promise<unknown>,
      ) =>
        cb({
          session: { create: sessionCreate, update: sessionUpdate },
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: prismaUserFindUnique, update: jest.fn() },
            session: {
              create: sessionCreate,
              findUnique: sessionFindUnique,
              update: sessionUpdate,
              updateMany: sessionUpdateMany,
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            auditAccessLog: { create: jest.fn() },
            $transaction: prismaTransaction,
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jwtSign,
            verify: jwtVerify,
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
              return undefined;
            }),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getNumber: jest.fn().mockResolvedValue(15),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: eventsEmit },
        },
      ],
    }).compile();

    service = module.get(AuthTokenService);
  });

  describe('issueWsToken — token efímero handshake socket.io (ADR-078 Amendment A1 §6)', () => {
    it('firma JWT con type="ws" + TTL 60s para usuario activo', async () => {
      prismaUserFindUnique.mockResolvedValue(FAKE_USER_ACTIVE);

      const result = await service.issueWsToken('user-uuid-1');

      expect(result).toEqual({ token: 'signed.jwt.token', expiresIn: 60 });
      expect(jwtSign).toHaveBeenCalledTimes(1);
      const [payload, options] = jwtSign.mock.calls[0] as [
        JwtPayload,
        { expiresIn: string },
      ];
      expect(payload).toEqual({
        sub: 'user-uuid-1',
        email: 'cliente@aelium.test',
        role: 'client',
        type: 'ws',
      });
      expect(options.expiresIn).toBe('60s');
    });

    it('rechaza usuario no encontrado', async () => {
      prismaUserFindUnique.mockResolvedValue(null);
      await expect(service.issueWsToken('missing')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtSign).not.toHaveBeenCalled();
    });

    it('rechaza usuario blocked', async () => {
      prismaUserFindUnique.mockResolvedValue({
        ...FAKE_USER_ACTIVE,
        status: 'blocked',
      });
      await expect(service.issueWsToken('user-uuid-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtSign).not.toHaveBeenCalled();
    });

    it('rechaza usuario inactive', async () => {
      prismaUserFindUnique.mockResolvedValue({
        ...FAKE_USER_ACTIVE,
        status: 'inactive',
      });
      await expect(service.issueWsToken('user-uuid-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtSign).not.toHaveBeenCalled();
    });

    it('rechaza usuario pending_verification (no completó email verify)', async () => {
      prismaUserFindUnique.mockResolvedValue({
        ...FAKE_USER_ACTIVE,
        status: 'pending_verification',
      });
      await expect(service.issueWsToken('user-uuid-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(jwtSign).not.toHaveBeenCalled();
    });
  });

  describe('refresh — rotación + replay detection (ADR-078 §1.4 / Sprint 13 Fase B)', () => {
    const FAKE_SESSION_ACTIVE = {
      id: 'session-old-uuid',
      user_id: 'user-uuid-1',
      token_hash: 'old-token-hash',
      refresh_hash: 'old-refresh-hash',
      ip_address: '192.0.2.1',
      user_agent: 'Mozilla/5.0',
      device_label: 'Browser',
      is_active: true,
      last_used_at: new Date('2026-05-03T10:00:00Z'),
      expires_at: new Date('2026-05-10T10:00:00Z'),
      created_at: new Date('2026-05-03T10:00:00Z'),
      used_at: null as Date | null,
      replaced_by_session_id: null as string | null,
      revoked_reason: null as string | null,
    };
    const FAKE_REFRESH_PAYLOAD: JwtPayload = {
      sub: 'user-uuid-1',
      email: 'cliente@aelium.test',
      role: 'client',
      type: 'refresh',
    };

    beforeEach(() => {
      jwtVerify.mockReturnValue(FAKE_REFRESH_PAYLOAD);
      prismaUserFindUnique.mockResolvedValue(FAKE_USER_ACTIVE);
      sessionCreate.mockResolvedValue({ id: 'session-new-uuid' });
      sessionUpdate.mockResolvedValue({});
      sessionUpdateMany.mockResolvedValue({ count: 0 });
    });

    it('rota tokens en flow normal (sesión vigente + used_at NULL)', async () => {
      sessionFindUnique.mockResolvedValue(FAKE_SESSION_ACTIVE);

      const result = await service.refresh(
        'old-refresh-token',
        '192.0.2.99',
        'Mozilla/5.0 (Mac)',
      );

      expect(result).toMatchObject({
        access_token: 'signed.jwt.token',
        refresh_token: 'signed.jwt.token',
        expires_in: 15 * 60,
        session_id: 'session-new-uuid',
      });
      // Sesión vieja se marca rotated + apunta a la nueva.
      // Inspección directa de la llamada (evita objectContaining anidado que
      // dispara no-unsafe-assignment al ser tipado como any por Jest).
      expect(sessionUpdate).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const rawArg = sessionUpdate.mock.calls[0][0];
      const updateArg = rawArg as {
        where: { id: string };
        data: {
          is_active: boolean;
          revoked_reason: string;
          replaced_by_session_id: string;
        };
      };
      expect(updateArg.where.id).toBe('session-old-uuid');
      expect(updateArg.data.is_active).toBe(false);
      expect(updateArg.data.revoked_reason).toBe('rotated');
      expect(updateArg.data.replaced_by_session_id).toBe('session-new-uuid');
      // No se emite replay detection (flow legítimo).
      expect(eventsEmit).not.toHaveBeenCalledWith(
        'auth.refresh_replay_detected',
        expect.anything(),
      );
    });

    it('REPLAY: detecta refresh ya canjeado, revoca cadena + emite evento', async () => {
      sessionFindUnique.mockResolvedValue({
        ...FAKE_SESSION_ACTIVE,
        used_at: new Date('2026-05-03T10:30:00Z'),
        is_active: false, // ya rotada
        revoked_reason: 'rotated',
      });
      sessionUpdateMany.mockResolvedValue({ count: 3 });

      await expect(
        service.refresh('replayed-refresh', '203.0.113.5', 'curl/8.0'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(sessionUpdateMany).toHaveBeenCalledWith({
        where: { user_id: 'user-uuid-1', is_active: true },
        data: { is_active: false, revoked_reason: 'replay_detected' },
      });
      expect(eventsEmit).toHaveBeenCalledWith(
        'auth.refresh_replay_detected',
        expect.objectContaining({
          user_id: 'user-uuid-1',
          session_id: 'session-old-uuid',
          ip: '203.0.113.5',
          revoked_sessions_count: 3,
        }),
      );
      // No genera tokens nuevos.
      expect(sessionCreate).not.toHaveBeenCalled();
    });

    it('rechaza si session no encontrada', async () => {
      sessionFindUnique.mockResolvedValue(null);
      await expect(
        service.refresh('rogue-refresh', '203.0.113.5'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(sessionUpdateMany).not.toHaveBeenCalled();
      expect(eventsEmit).not.toHaveBeenCalled();
    });

    it('rechaza si session revocada (is_active=false sin used_at — caso logout)', async () => {
      sessionFindUnique.mockResolvedValue({
        ...FAKE_SESSION_ACTIVE,
        is_active: false,
        used_at: null, // logout no marca used_at, solo replay rotation lo hace
      });
      await expect(
        service.refresh('expired-refresh', '203.0.113.5'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      // No se emite replay (used_at NULL = no es reuso, es logout previo).
      expect(eventsEmit).not.toHaveBeenCalledWith(
        'auth.refresh_replay_detected',
        expect.anything(),
      );
    });

    it('rechaza si JWT no es type refresh', async () => {
      jwtVerify.mockReturnValue({ ...FAKE_REFRESH_PAYLOAD, type: 'access' });
      sessionFindUnique.mockResolvedValue(FAKE_SESSION_ACTIVE);
      await expect(
        service.refresh('wrong-type', '192.0.2.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rechaza si user blocked', async () => {
      sessionFindUnique.mockResolvedValue(FAKE_SESSION_ACTIVE);
      prismaUserFindUnique.mockResolvedValue({
        ...FAKE_USER_ACTIVE,
        status: 'blocked',
      });
      await expect(
        service.refresh('valid-refresh', '192.0.2.1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
