import { PrismaClient } from '@prisma/client';

import { seedTestAccounts } from '../../../prisma/seeds/test-accounts';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

/**
 * Regresión audit 2026-06-25 GL-4 (seguridad/auth): el seed NUNCA debe crear
 * el superadmin con la contraseña por defecto pública en producción. Si
 * NODE_ENV=production y SUPERADMIN_PASSWORD no está definida, debe abortar
 * (fail-fast, R7) ANTES de tocar la base de datos.
 *
 * (Vive bajo src/ porque el rootDir de jest es `src`; importa el seed real
 * de prisma/seeds/ por ruta relativa.)
 */
describe('seedTestAccounts — fail-fast de superadmin en producción (GL-4)', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('aborta en producción si falta SUPERADMIN_PASSWORD (sin tocar la BD)', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.SUPERADMIN_PASSWORD;

    const roleFindUnique = jest.fn();
    const userUpsert = jest.fn();
    const prisma = {
      role: { findUnique: roleFindUnique },
      user: { findUnique: jest.fn(), upsert: userUpsert },
    } as unknown as PrismaClient;

    await expect(seedTestAccounts(prisma)).rejects.toThrow(
      /SUPERADMIN_PASSWORD/,
    );
    expect(roleFindUnique).not.toHaveBeenCalled();
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it('en producción con SUPERADMIN_PASSWORD definida, siembra solo el superadmin', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPERADMIN_PASSWORD = 'Un4-Contrasena-Fuerte!';

    const userUpsert = jest.fn().mockResolvedValue({});
    const prisma = {
      role: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'role-superadmin', slug: 'superadmin' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: userUpsert,
      },
    } as unknown as PrismaClient;

    await expect(seedTestAccounts(prisma)).resolves.toBeUndefined();
    // Solo el superadmin: las cuentas demo *.test no se siembran en prod.
    expect(userUpsert).toHaveBeenCalledTimes(1);
  });

  it('fuera de producción no exige SUPERADMIN_PASSWORD', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SUPERADMIN_PASSWORD;

    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue({ id: 'role-x', slug: 'x' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaClient;

    await expect(seedTestAccounts(prisma)).resolves.toBeUndefined();
  });
});
