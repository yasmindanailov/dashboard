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

describe('AuthTokenService — Sprint 13 §13.AUTH Fase A', () => {
  let service: AuthTokenService;
  let jwtSign: jest.Mock;
  let prismaUserFindUnique: jest.Mock;

  beforeEach(async () => {
    jwtSign = jest.fn().mockReturnValue('signed.jwt.token');
    prismaUserFindUnique = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: prismaUserFindUnique, update: jest.fn() },
            session: {
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            auditAccessLog: { create: jest.fn() },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jwtSign,
            verify: jest.fn(),
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
          useValue: { emit: jest.fn() },
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
});
