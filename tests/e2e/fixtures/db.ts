/**
 * Helpers de base de datos para tests E2E.
 *
 * Limpieza entre tests: las tablas se truncan en orden seguro respetando FKs.
 * No tocamos roles, settings ni superadmin (datos del seed que asumimos
 * presentes y estables).
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { TEST_CONFIG } from './test-config';

let prismaInstance: PrismaClient | null = null;

/**
 * Cliente Prisma singleton para tests. Se conecta usando DATABASE_URL del
 * entorno (mismo que usa el backend NestJS).
 */
export function getPrisma(): PrismaClient {
  if (!prismaInstance) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL no definido. Los tests E2E requieren conexión directa a la DB para fixtures y cleanup.',
      );
    }
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    prismaInstance = new PrismaClient({ adapter });
  }
  return prismaInstance;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}

/**
 * Limpia datos de tests previos manteniendo seed (roles, settings, superadmin).
 * Borra usuarios creados durante tests (todos excepto superadmin), facturas,
 * conversaciones, mensajes, perfiles de cliente, etc.
 *
 * Llamar en `beforeEach` o `beforeAll` según necesidad.
 */
export async function resetTestData(): Promise<void> {
  const prisma = getPrisma();
  const superadminEmail = TEST_CONFIG.superadmin.email;

  // Orden importa: borrar dependientes antes que padres.
  // Usamos $executeRaw para velocidad y evitar callbacks Prisma.
  await prisma.$transaction([
    prisma.message.deleteMany({}),
    prisma.conversation.deleteMany({}),
    prisma.invoice.deleteMany({}),
    prisma.service.deleteMany({}),
    prisma.billingProfile.deleteMany({}),
    prisma.clientNote.deleteMany({}),
    prisma.clientProfile.deleteMany({}),
    prisma.session.deleteMany({}),
    prisma.token.deleteMany({}),
    prisma.loginAttempt.deleteMany({}),
    // Borrar usuarios excepto superadmin
    prisma.user.deleteMany({
      where: { email: { not: superadminEmail } },
    }),
  ]);
}

/**
 * Borra un usuario por email (idempotente). Útil para test setup específico.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.user.deleteMany({ where: { email } });
}
