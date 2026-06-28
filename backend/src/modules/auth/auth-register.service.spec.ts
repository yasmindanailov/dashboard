import { AuthRegisterService } from './auth-register.service';
import type { PrismaService } from '../../core/database/prisma.service';
import type { ConfigService } from '@nestjs/config';
import type { SettingsService } from '../../core/settings/settings.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { EmailService } from '../../core/email/email.service';
import type { AuthTokenService } from './auth-token.service';
import type { RegisterDto } from './dto/auth.dto';

/**
 * Unit de `AuthRegisterService.register` enfocado en E11 (registro fiscal): qué
 * perfiles crea según el tipo de cuenta y la marca de aceptación de términos.
 * Mockea `$transaction(cb)` invocando el callback con un `tx` espía; el resto de
 * efectos (verificación de email, audit) se mockean para que no truenen.
 */

/** Extrae el `data` del primer `create(...)` de un mock (tipado, lint-safe). */
function createData(mock: jest.Mock): Record<string, unknown> {
  const firstCall = mock.mock.calls[0] as unknown[] | undefined;
  const arg = (firstCall?.[0] ?? {}) as { data?: Record<string, unknown> };
  return arg.data ?? {};
}

function makeService() {
  const tx = {
    user: { create: jest.fn() },
    clientProfile: { create: jest.fn().mockResolvedValue({}) },
    billingProfile: { create: jest.fn().mockResolvedValue({}) },
  };
  tx.user.create.mockResolvedValue({
    id: 'u1',
    email: 'sara@empresa.com',
    first_name: 'Sara',
  });

  const prisma = {
    user: { findUnique: jest.fn() },
    role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-client' }) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) =>
      cb(tx),
    ),
    emailVerification: {
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
    auditAccessLog: { create: jest.fn().mockResolvedValue({}) },
  };
  // 1ª llamada (chequeo de email existente) → null; 2ª (envío verificación) → user.
  prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValue({
    id: 'u1',
    email: 'sara@empresa.com',
    first_name: 'Sara',
  });

  const config = { get: jest.fn().mockReturnValue('http://localhost:3002') };
  const settings = { getNumber: jest.fn().mockResolvedValue(24) };
  const events = { emit: jest.fn() };
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const tokenService = { hashToken: jest.fn().mockReturnValue('hash') };

  const service = new AuthRegisterService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    settings as unknown as SettingsService,
    events as unknown as EventEmitter2,
    email as unknown as EmailService,
    tokenService as unknown as AuthTokenService,
  );
  return { service, tx };
}

const BASE = {
  first_name: 'Sara',
  last_name: 'Gómez',
  email: 'sara@empresa.com',
  password: 'Password1',
};

describe('AuthRegisterService.register (E11)', () => {
  it('personal: ClientProfile individual SIN BillingProfile y marca términos', async () => {
    const { service, tx } = makeService();
    await service.register(
      {
        ...BASE,
        account_type: 'personal',
        terms_accepted: true,
      } as RegisterDto,
      '127.0.0.1',
    );

    expect(createData(tx.user.create).terms_accepted_at).toBeInstanceOf(Date);
    expect(createData(tx.clientProfile.create)).toMatchObject({
      client_type: 'individual',
    });
    expect(tx.billingProfile.create).not.toHaveBeenCalled();
  });

  it('empresa: puebla ClientProfile fiscal + crea BillingProfile default', async () => {
    const { service, tx } = makeService();
    await service.register(
      {
        ...BASE,
        account_type: 'empresa',
        company_name: 'Estudio Sara S.L.',
        nif_cif: 'B12345678',
        address_line1: 'Calle Mayor 1',
        city: 'Madrid',
        postal_code: '28013',
        country: 'es',
        terms_accepted: true,
      } as RegisterDto,
      '127.0.0.1',
    );

    expect(createData(tx.clientProfile.create)).toMatchObject({
      client_type: 'company',
      tax_id: 'B12345678',
      country: 'ES', // normalizado a mayúsculas
    });
    expect(createData(tx.billingProfile.create)).toMatchObject({
      type: 'empresa',
      company_name: 'Estudio Sara S.L.',
      nif_cif: 'B12345678',
      address_line1: 'Calle Mayor 1',
      is_default: true,
    });
  });

  it('autónomo: ClientProfile individual con tax_id + BillingProfile', async () => {
    const { service, tx } = makeService();
    await service.register(
      {
        ...BASE,
        account_type: 'autonomo',
        nif_cif: '12345678Z',
        address_line1: 'Calle Mayor 1',
        city: 'Madrid',
        postal_code: '28013',
        terms_accepted: true,
      } as RegisterDto,
      '127.0.0.1',
    );

    expect(createData(tx.clientProfile.create)).toMatchObject({
      client_type: 'individual',
      tax_id: '12345678Z',
    });
    expect(createData(tx.billingProfile.create)).toMatchObject({
      type: 'autonomo',
      is_default: true,
    });
  });

  it('sin aceptar términos: terms_accepted_at queda null', async () => {
    const { service, tx } = makeService();
    await service.register(
      { ...BASE, account_type: 'personal' } as RegisterDto,
      '127.0.0.1',
    );
    expect(createData(tx.user.create).terms_accepted_at).toBeNull();
  });
});
