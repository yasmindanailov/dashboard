import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { AuthLoginService } from './auth-login.service';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt') as { compare: jest.Mock };

/**
 * Tests unit `AuthLoginService` — GL-26 (audit 2026-06-25 §6 Tier 4): el camino
 * login/lockout/2FA era la superficie de auth más sensible SIN spec (auth
 * contract §18). Ancla el comportamiento de seguridad: bloqueo por intentos,
 * gates de estado, reto 2FA por rol obligatorio o opt-in, y la verificación 2FA.
 */
describe('AuthLoginService — GL-26 login/lockout/2FA', () => {
  const USER = '11111111-1111-1111-1111-111111111111';
  const IP = '127.0.0.1';

  type Over = Record<string, unknown>;
  const userRow = (over: Over = {}): Over => ({
    id: USER,
    email: 'u@aelium.net',
    password_hash: 'stored-hash',
    first_name: 'Uxue',
    status: 'active',
    login_attempts: 0,
    blocked_until: null,
    two_factor_enabled: false,
    two_factor_secret: null,
    role: { slug: 'client' },
    ...over,
  });

  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    auditAccessLog: { create: jest.Mock };
  };
  let jwt: { verify: jest.Mock; sign: jest.Mock };
  let settings: { getNumber: jest.Mock };
  let events: { emit: jest.Mock };
  let email: { send: jest.Mock };
  let tokenService: {
    hashToken: jest.Mock;
    generate2FACode: jest.Mock;
    issueTokens: jest.Mock;
  };
  let service: AuthLoginService;

  beforeEach(() => {
    bcrypt.compare.mockReset();
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(userRow()),
        update: jest.fn().mockResolvedValue({}),
      },
      auditAccessLog: { create: jest.fn().mockResolvedValue({}) },
    };
    jwt = { verify: jest.fn(), sign: jest.fn().mockReturnValue('temp-jwt') };
    // getNumber(category, key, default) → devuelve el default (5 intentos, 15 min, 5 min).
    settings = {
      getNumber: jest.fn((_c: string, _k: string, def: number) => def),
    };
    events = { emit: jest.fn() };
    email = { send: jest.fn().mockResolvedValue(undefined) };
    tokenService = {
      hashToken: jest.fn((t: string) => `hash:${t}`),
      generate2FACode: jest.fn().mockReturnValue('123456'),
      issueTokens: jest
        .fn()
        .mockResolvedValue({ access_token: 'AT', refresh_token: 'RT' }),
    };
    service = new AuthLoginService(
      prisma as never,
      jwt as never,
      settings as never,
      events as never,
      email as never,
      tokenService as never,
    );
  });

  const login = (over: Over = {}, pwOk = true) => {
    prisma.user.findUnique.mockResolvedValue(userRow(over));
    bcrypt.compare.mockResolvedValue(pwOk);
    return service.login(
      { email: 'U@Aelium.net', password: 'pw' } as never,
      IP,
      'jest',
    );
  };

  describe('login — gates', () => {
    it('email desconocido → 401 (sin filtrar existencia)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.login({ email: 'x@y.z', password: 'pw' } as never, IP),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('cuenta bloqueada (blocked_until futuro) → 403', async () => {
      await expect(
        login({ blocked_until: new Date(Date.now() + 10 * 60_000) }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('status pending_verification → 403', async () => {
      await expect(
        login({ status: 'pending_verification' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('status blocked → 403', async () => {
      await expect(login({ status: 'blocked' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('status inactive → 403', async () => {
      await expect(login({ status: 'inactive' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('login — password incorrecto + lockout', () => {
    it('cuenta intento + audita + emite login_failed, sin bloquear aún', async () => {
      await expect(login({ login_attempts: 0 }, false)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const upd = (
        prisma.user.update.mock.calls as Array<[{ data: Over }]>
      )[0][0].data;
      expect(upd.login_attempts).toBe(1);
      expect(upd.blocked_until).toBeUndefined();
      const auditArg = (
        prisma.auditAccessLog.create.mock.calls as Array<
          [{ data: { action: string } }]
        >
      )[0][0];
      expect(auditArg.data.action).toBe('login_failed');
      expect(events.emit).toHaveBeenCalledWith(
        'auth.login_failed',
        expect.any(Object),
      );
      expect(events.emit).not.toHaveBeenCalledWith(
        'auth.account_blocked',
        expect.anything(),
      );
    });

    it('al alcanzar max_login_attempts → fija blocked_until + emite account_blocked', async () => {
      await expect(login({ login_attempts: 4 }, false)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const upd = (
        prisma.user.update.mock.calls as Array<[{ data: Over }]>
      )[0][0].data;
      expect(upd.login_attempts).toBe(5);
      expect(upd.blocked_until).toBeInstanceOf(Date);
      expect(events.emit).toHaveBeenCalledWith(
        'auth.account_blocked',
        expect.objectContaining({ attempts: 5 }),
      );
    });
  });

  describe('login — éxito', () => {
    it('rol sin 2FA (client) → resetea intentos + emite tokens, sin 2FA', async () => {
      const result = await login({ role: { slug: 'client' } }, true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { login_attempts: 0, blocked_until: null },
        }),
      );
      expect(tokenService.issueTokens).toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      expect(result).toEqual({ access_token: 'AT', refresh_token: 'RT' });
    });

    it('rol con 2FA obligatorio (superadmin) → inicia 2FA (no emite tokens)', async () => {
      const result = (await login({ role: { slug: 'superadmin' } }, true)) as {
        requires_2fa?: boolean;
        temp_token?: string;
      };
      expect(result.requires_2fa).toBe(true);
      expect(result.temp_token).toBe('temp-jwt');
      expect(email.send).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalledWith(
        'auth.2fa_required',
        expect.any(Object),
      );
      // El secreto 2FA (hash del código) se persiste.
      const updateCalls = prisma.user.update.mock.calls as Array<
        [{ data: Over }]
      >;
      const secretCall = updateCalls.find(
        (c) => c[0].data.two_factor_secret !== undefined,
      );
      expect(secretCall?.[0].data.two_factor_secret).toBe('hash:123456');
      expect(tokenService.issueTokens).not.toHaveBeenCalled();
    });

    it('cliente con 2FA opt-in (two_factor_enabled) → inicia 2FA', async () => {
      const result = (await login(
        { role: { slug: 'client' }, two_factor_enabled: true },
        true,
      )) as { requires_2fa?: boolean };
      expect(result.requires_2fa).toBe(true);
      expect(tokenService.issueTokens).not.toHaveBeenCalled();
    });
  });

  describe('verify2fa', () => {
    const verify = (code = '123456') =>
      service.verify2fa({ code, temp_token: 'tok' } as never, IP, 'jest');

    it('token expirado/ inválido (jwt.verify lanza) → 401', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      await expect(verify()).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('tipo de token != temp_2fa → 401', async () => {
      jwt.verify.mockReturnValue({ type: 'access', sub: USER });
      await expect(verify()).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('usuario sin two_factor_secret → 401', async () => {
      jwt.verify.mockReturnValue({ type: 'temp_2fa', sub: USER });
      prisma.user.findUnique.mockResolvedValueOnce(
        userRow({ two_factor_secret: null }),
      );
      await expect(verify()).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('código incorrecto → 401 (compara por hash)', async () => {
      jwt.verify.mockReturnValue({ type: 'temp_2fa', sub: USER });
      prisma.user.findUnique.mockResolvedValueOnce(
        userRow({ two_factor_secret: 'hash:123456' }),
      );
      await expect(verify('999999')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(tokenService.issueTokens).not.toHaveBeenCalled();
    });

    it('código correcto → limpia el secreto + emite tokens', async () => {
      jwt.verify.mockReturnValue({ type: 'temp_2fa', sub: USER });
      prisma.user.findUnique.mockResolvedValueOnce(
        userRow({ two_factor_secret: 'hash:123456' }),
      );
      const result = await verify('123456');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER },
        data: { two_factor_secret: null },
      });
      expect(tokenService.issueTokens).toHaveBeenCalled();
      expect(result).toEqual({ access_token: 'AT', refresh_token: 'RT' });
    });
  });

  // F4·W3 Auth — reenvío del código 2FA (no revalida password: el temp_token
  // ya prueba el paso de credenciales). Regenera + reenvía + devuelve token fresco.
  describe('resend2fa', () => {
    it('token inválido (jwt.verify lanza) → 401', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });
      await expect(service.resend2fa('tok', IP)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(email.send).not.toHaveBeenCalled();
    });

    it('tipo de token != temp_2fa → 401', async () => {
      jwt.verify.mockReturnValue({ type: 'access', sub: USER });
      await expect(service.resend2fa('tok', IP)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('válido → regenera el código, reenvía email y devuelve un temp_token fresco', async () => {
      jwt.verify.mockReturnValue({ type: 'temp_2fa', sub: USER });
      prisma.user.findUnique.mockResolvedValueOnce(
        userRow({ role: { slug: 'client' }, two_factor_enabled: true }),
      );
      const result = (await service.resend2fa('tok', IP)) as {
        requires_2fa?: boolean;
        temp_token?: string;
      };
      expect(result.requires_2fa).toBe(true);
      expect(result.temp_token).toBe('temp-jwt');
      expect(email.send).toHaveBeenCalled();
      const updateCalls = prisma.user.update.mock.calls as Array<
        [{ data: Over }]
      >;
      const secretCall = updateCalls.find(
        (c) => c[0].data.two_factor_secret !== undefined,
      );
      expect(secretCall?.[0].data.two_factor_secret).toBe('hash:123456');
      // NO emite tokens (sigue en el reto 2FA).
      expect(tokenService.issueTokens).not.toHaveBeenCalled();
    });
  });
});
