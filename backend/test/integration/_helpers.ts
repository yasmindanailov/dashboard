/**
 * Sprint 15C.II Fase G.1.a — helpers del harness de integración contra
 * infraestructura REAL (Postgres del `docker/docker-compose.dev.yml`).
 *
 * Por qué un harness aparte de los `*.spec.ts` unit: la lección §A.2 del
 * dossier es que la suite unit reporta verde **en superficie** mockeando
 * Prisma — exactamente por eso el bug del `$queryRaw` del advisory lock pasó
 * los tests y falló contra Postgres real. Estos `*.e2e-spec.ts` arrancan un
 * `PrismaService` real (mismo `DATABASE_URL` 127.0.0.1 — Regla R-IPv6) y
 * orquestan concurrencia con `Promise.all`, que es la única forma de probar
 * garantías de serialización (advisory lock + isolation Serializable).
 *
 * Prerrequisito operativo: `docker compose -f docker/docker-compose.dev.yml
 * up -d postgres` + DB migrada y seedeada (`pnpm --dir backend seed`) — los
 * helpers reutilizan un `Role` del seed para el FK de los users de prueba.
 *
 * Aislamiento: los fixtures usan identificadores únicos (`g1a-<uuid>`) y se
 * limpian por id en `afterAll` (cascade FK). NO se truncan tablas — el spec
 * comparte la DB de desarrollo y debe ser quirúrgico con sus propias filas.
 */

// Carga `backend/.env` (DATABASE_URL) sin booteer AppModule completo.
import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { Prisma, ProductType, ServiceStatus } from '@prisma/client';

import { PrismaService } from '../../src/core/database/prisma.service';
import type { EnhanceApiClient } from '../../src/plugins/provisioners/enhance_cp/api';
import type { UserForEnhance } from '../../src/plugins/provisioners/enhance_cp/enhance-customers.service';

/** Master Org Enhance ficticia — no se usa contra un Enhance real (api mockeada). */
export const MASTER_ORG_ID = '00000000-0000-0000-0000-00000000aaaa';

/**
 * Instancia + conecta un `PrismaService` real contra el Postgres de dev.
 * Usar `prisma.onModuleDestroy()` en `afterAll` para cerrar conexión + pool
 * (evita el warning "Jest did not exit" por handles abiertos).
 */
export async function connectPrisma(): Promise<PrismaService> {
  const prisma = new PrismaService();
  await prisma.onModuleInit(); // $connect()
  return prisma;
}

/**
 * Crea un User mínimo válido reutilizando un Role del seed. Devuelve el
 * subset `UserForEnhance` que `ensureCustomer` consume.
 */
export async function createTestUser(
  prisma: PrismaService,
): Promise<UserForEnhance & { roleId: string }> {
  const role = await prisma.role.findFirst({ select: { id: true } });
  if (!role) {
    throw new Error(
      'Integración G.1.a: no hay Role seedeado. Corre `pnpm --dir backend seed` antes de test:e2e.',
    );
  }
  const email = `g1a-${randomUUID()}@aelium.test`;
  const user = await prisma.user.create({
    data: {
      email,
      password_hash: 'integration-test-not-a-real-hash',
      first_name: 'G1a',
      last_name: 'IntegTest',
      role_id: role.id,
    },
    select: { id: true, email: true },
  });
  return {
    id: user.id,
    email: user.email,
    displayName: 'G1a Integ, S.L.',
    roleId: role.id,
  };
}

/** Borra un user por id (cascade limpia `enhance_customers`). Idempotente. */
export async function deleteUser(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}

export interface ServiceFixture {
  serviceId: string;
  userId: string;
  productId: string;
}

/**
 * Crea User + Product + Service `active` mínimos para tests que necesitan un
 * `service_id` real (FK de `service_quota_alerts`). Patrón canónico heredado
 * del seed inline de `tests/e2e/sprint-15c-enhance-flow.spec.ts` (test 4).
 */
export async function createTestService(
  prisma: PrismaService,
): Promise<ServiceFixture> {
  const user = await createTestUser(prisma);
  const product = await prisma.product.create({
    data: {
      name: 'G1a Integ Product',
      slug: `g1a-${randomUUID()}`,
      type: ProductType.hosting_web,
      provisioner: 'enhance_cp',
    },
    select: { id: true },
  });
  const service = await prisma.service.create({
    data: {
      user_id: user.id,
      product_id: product.id,
      status: ServiceStatus.active,
      provisioner_slug: 'enhance_cp',
      amount: new Prisma.Decimal('10.00'),
    },
    select: { id: true },
  });
  return { serviceId: service.id, userId: user.id, productId: product.id };
}

/** Limpia un `ServiceFixture` respetando FKs. Idempotente. */
export async function cleanupService(
  prisma: PrismaService,
  fx: ServiceFixture,
): Promise<void> {
  await prisma.serviceQuotaAlert.deleteMany({
    where: { service_id: fx.serviceId },
  });
  await prisma.service
    .delete({ where: { id: fx.serviceId } })
    .catch(() => undefined);
  await prisma.product
    .delete({ where: { id: fx.productId } })
    .catch(() => undefined);
  await deleteUser(prisma, fx.userId);
}

/**
 * Mock del `EnhanceApiClient` para el flow 6-step de `ensureCustomer`.
 * `searchCustomersByEmail` devuelve vacío → fuerza el Step 3 (create). Cada
 * método de creación devuelve UUIDs frescos (las columnas `enhance_*` son
 * `@db.Uuid`). En el test de concurrencia el advisory lock garantiza que solo
 * una de las dos invocaciones llega a llamarlos.
 */
export function buildEnhanceApiMock(): jest.Mocked<
  Pick<
    EnhanceApiClient,
    | 'searchCustomersByEmail'
    | 'createCustomer'
    | 'createLogin'
    | 'addMember'
    | 'setOwner'
  >
> {
  return {
    searchCustomersByEmail: jest
      .fn()
      .mockResolvedValue({ total: 0, items: [] }),
    createCustomer: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ id: randomUUID() })),
    createLogin: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: randomUUID(),
        email: 'integ@aelium.test',
        name: 'G1a Integ',
      }),
    ),
    addMember: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ id: randomUUID() })),
    setOwner: jest.fn().mockResolvedValue(undefined),
  } as never;
}
