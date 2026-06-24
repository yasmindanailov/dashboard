import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { AuthAccountService } from './auth-account.service';
import { AuthTokenService } from './auth-token.service';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Tests unit AuthAccountService — Sprint Cuenta (ADR-085 + Amendment A1 de
 * ADR-013). Cubre la lógica sensible self-service: cambio de contraseña
 * (verifica actual + revoca otras sesiones), 2FA opt-in (confirma password +
 * bloqueo para roles obligatorios) y logout-all.
 */

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));
const mockCompare = bcrypt.compare as unknown as jest.Mock;
const mockHash = bcrypt.hash as unknown as jest.Mock;

const CTX = { ip: '192.0.2.1', userAgent: 'Mozilla/5.0' };

describe('AuthAccountService — cuenta self-service (ADR-085)', () => {
  let service: AuthAccountService;
  let userFindUnique: jest.Mock;
  let userUpdate: jest.Mock;
  let sessionUpdateMany: jest.Mock;
  let auditCreate: jest.Mock;
  let txUserUpdate: jest.Mock;
  let txSessionUpdateMany: jest.Mock;
  let getMe: jest.Mock;
  let hashToken: jest.Mock;
  let eventsEmit: jest.Mock;

  beforeEach(async () => {
    userFindUnique = jest.fn();
    userUpdate = jest.fn().mockResolvedValue({});
    sessionUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    auditCreate = jest.fn().mockResolvedValue({});
    txUserUpdate = jest.fn().mockResolvedValue({});
    txSessionUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    getMe = jest.fn().mockResolvedValue({ id: 'u1', first_name: 'Nuevo' });
    hashToken = jest.fn((t: string) => `hash:${t}`);
    eventsEmit = jest.fn();

    mockCompare.mockReset();
    mockHash.mockReset().mockResolvedValue('new-bcrypt-hash');

    const transaction = jest.fn(
      (
        cb: (tx: {
          user: { update: jest.Mock };
          session: { updateMany: jest.Mock };
        }) => Promise<unknown>,
      ) =>
        cb({
          user: { update: txUserUpdate },
          session: { updateMany: txSessionUpdateMany },
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthAccountService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: userFindUnique, update: userUpdate },
            session: { updateMany: sessionUpdateMany },
            auditAccessLog: { create: auditCreate },
            $transaction: transaction,
          },
        },
        { provide: AuthTokenService, useValue: { getMe, hashToken } },
        { provide: EventEmitter2, useValue: { emit: eventsEmit } },
      ],
    }).compile();

    service = module.get(AuthAccountService);
  });

  describe('updateMe', () => {
    it('persiste sólo los campos provistos y devuelve el perfil fresco', async () => {
      const result = await service.updateMe('u1', { first_name: 'Nuevo' });

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { first_name: 'Nuevo' },
      });
      expect(getMe).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ id: 'u1', first_name: 'Nuevo' });
    });

    it('no llama a update si el DTO está vacío', async () => {
      await service.updateMe('u1', {});
      expect(userUpdate).not.toHaveBeenCalled();
      expect(getMe).toHaveBeenCalledWith('u1');
    });
  });

  describe('changePassword', () => {
    const dto = { current_password: 'OldPass1', new_password: 'NewPass1' };
    const ctx = { ...CTX, currentAccessToken: 'access-tok' };

    it('rechaza con la contraseña actual incorrecta (sin tocar la BD)', async () => {
      userFindUnique.mockResolvedValue({ id: 'u1', password_hash: 'h' });
      mockCompare.mockResolvedValueOnce(false); // current != hash

      await expect(
        service.changePassword('u1', dto, ctx),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(txUserUpdate).not.toHaveBeenCalled();
    });

    it('rechaza si la nueva contraseña es igual a la actual', async () => {
      userFindUnique.mockResolvedValue({ id: 'u1', password_hash: 'h' });
      mockCompare
        .mockResolvedValueOnce(true) // current == hash
        .mockResolvedValueOnce(true); // new == hash

      await expect(
        service.changePassword('u1', dto, ctx),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(txUserUpdate).not.toHaveBeenCalled();
    });

    it('actualiza el hash y revoca las demás sesiones (mantiene la actual)', async () => {
      userFindUnique.mockResolvedValue({ id: 'u1', password_hash: 'h' });
      mockCompare
        .mockResolvedValueOnce(true) // current ok
        .mockResolvedValueOnce(false); // new distinta

      await service.changePassword('u1', dto, ctx);

      expect(txUserUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { password_hash: 'new-bcrypt-hash' },
      });
      expect(txSessionUpdateMany).toHaveBeenCalledWith({
        where: {
          user_id: 'u1',
          is_active: true,
          token_hash: { not: 'hash:access-tok' },
        },
        data: { is_active: false, revoked_reason: 'password_changed' },
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const pwAudit = auditCreate.mock.calls[0][0] as {
        data: { user_id: string; action: string };
      };
      expect(pwAudit.data).toMatchObject({
        user_id: 'u1',
        action: 'password_changed',
      });
    });
  });

  describe('enable2fa / disable2fa (ADR-013 Amendment A1)', () => {
    it('activa 2FA tras confirmar la contraseña', async () => {
      userFindUnique.mockResolvedValue({
        password_hash: 'h',
        role: { slug: 'client' },
      });
      mockCompare.mockResolvedValueOnce(true);

      const res = await service.enable2fa('u1', { password: 'Ok1' }, CTX);

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { two_factor_enabled: true },
      });
      expect(res.two_factor_enabled).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const enAudit = auditCreate.mock.calls[0][0] as {
        data: { action: string };
      };
      expect(enAudit.data.action).toBe('2fa_enabled');
    });

    it('rechaza activar 2FA con contraseña incorrecta', async () => {
      userFindUnique.mockResolvedValue({
        password_hash: 'h',
        role: { slug: 'client' },
      });
      mockCompare.mockResolvedValueOnce(false);

      await expect(
        service.enable2fa('u1', { password: 'bad' }, CTX),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('un cliente puede desactivar su 2FA', async () => {
      userFindUnique.mockResolvedValue({
        password_hash: 'h',
        role: { slug: 'client' },
      });
      mockCompare.mockResolvedValueOnce(true);

      const res = await service.disable2fa('u1', { password: 'Ok1' }, CTX);

      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { two_factor_enabled: false, two_factor_secret: null },
      });
      expect(res.two_factor_enabled).toBe(false);
    });

    it('un rol con 2FA obligatorio NO puede desactivarlo (Forbidden)', async () => {
      userFindUnique.mockResolvedValue({
        password_hash: 'h',
        role: { slug: 'superadmin' },
      });
      mockCompare.mockResolvedValueOnce(true); // password correcta

      await expect(
        service.disable2fa('u1', { password: 'Ok1' }, CTX),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(userUpdate).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('cierra todas las sesiones activas y reporta el conteo', async () => {
      sessionUpdateMany.mockResolvedValue({ count: 4 });

      const res = await service.logoutAll('u1', CTX);

      expect(sessionUpdateMany).toHaveBeenCalledWith({
        where: { user_id: 'u1', is_active: true },
        data: { is_active: false, revoked_reason: 'logout_all' },
      });
      expect(res.revoked).toBe(4);
      expect(eventsEmit).toHaveBeenCalledWith('auth.session_closed', {
        userId: 'u1',
        all: true,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const loAudit = auditCreate.mock.calls[0][0] as {
        data: { action: string };
      };
      expect(loAudit.data.action).toBe('logout_all');
    });
  });
});
