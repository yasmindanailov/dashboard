/**
 * Sprint 15C.II Fase G.1.a — §A.2 área 1: advisory lock concurrente.
 *
 * Gap cerrado: el spec unit `enhance-customers.service.spec.ts` solo espía
 * `$executeRaw` y asserta que el SQL contiene `pg_advisory_xact_lock` — NO
 * prueba que el lock serialice transacciones reales. Justo el bug original
 * (`$queryRaw` vs `$executeRaw`) pasó los mocks y falló contra Postgres real.
 *
 * Este test arranca Prisma real y dispara DOS `ensureCustomer` concurrentes
 * para el MISMO user con `Promise.all`. Garantía bajo prueba
 * (`enhance-customers.service.ts:115` — `pg_advisory_xact_lock`): la 2ª
 * transacción espera al lock de la 1ª; cuando entra, el Step 1 (cache) ya
 * encuentra la fila y retorna sin re-ejecutar el flow 6-step → exactamente
 * UNA fila `enhance_customers` y UNA creación remota.
 *
 * Prerrequisito: `docker compose -f docker/docker-compose.dev.yml up -d
 * postgres` + DB migrada/seedeada. Ejecutar con `pnpm --dir backend test:e2e`.
 */

import { PrismaService } from '../../src/core/database/prisma.service';
import { EnhanceCustomersService } from '../../src/plugins/provisioners/enhance_cp/enhance-customers.service';

import {
  MASTER_ORG_ID,
  buildEnhanceApiMock,
  connectPrisma,
  createTestUser,
  deleteUser,
} from './_helpers';

describe('Integración G.1.a — advisory lock concurrente (enhance_customers)', () => {
  let prisma: PrismaService;
  let svc: EnhanceCustomersService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = await connectPrisma();
    svc = new EnhanceCustomersService(prisma);
  });

  afterAll(async () => {
    for (const id of createdUserIds) {
      await deleteUser(prisma, id);
    }
    await prisma.onModuleDestroy();
  });

  it('2 ensureCustomer concurrentes para el mismo user → 1 fila + 1 creación remota', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const api = buildEnhanceApiMock();

    const [r1, r2] = await Promise.all([
      svc.ensureCustomer(user, api as never, MASTER_ORG_ID),
      svc.ensureCustomer(user, api as never, MASTER_ORG_ID),
    ]);

    // Ambas invocaciones convergen al MISMO mapping (no dos orgs distintas).
    expect(r1.user_id).toBe(user.id);
    expect(r2.user_id).toBe(user.id);
    expect(r1.enhance_org_id).toBe(r2.enhance_org_id);

    // Invariante de correctness: una sola fila persistida.
    const rows = await prisma.enhanceCustomer.findMany({
      where: { user_id: user.id },
    });
    expect(rows).toHaveLength(1);

    // El advisory lock serializó: solo la primera tx ejecutó el flow 6-step;
    // la segunda esperó el lock y resolvió por cache (Step 1).
    expect(api.createCustomer).toHaveBeenCalledTimes(1);
    expect(api.searchCustomersByEmail).toHaveBeenCalledTimes(1);
    expect(api.setOwner).toHaveBeenCalledTimes(1);
  }, 30_000);

  it('stress: 4 users distintos, cada uno con 2 invocaciones concurrentes → 1 fila por user', async () => {
    // 4 users × 2 invocaciones = 8 transacciones interactivas simultáneas;
    // el pool pg por defecto (max 10) deja margen. Cada par contiende solo
    // sobre su propio lock key → sin ciclos → sin deadlock.
    const users = await Promise.all(
      Array.from({ length: 4 }, () => createTestUser(prisma)),
    );
    users.forEach((u) => createdUserIds.push(u.id));

    await Promise.all(
      users.flatMap((u) => {
        const api = buildEnhanceApiMock();
        return [
          svc.ensureCustomer(u, api as never, MASTER_ORG_ID),
          svc.ensureCustomer(u, api as never, MASTER_ORG_ID),
        ];
      }),
    );

    for (const u of users) {
      const rows = await prisma.enhanceCustomer.findMany({
        where: { user_id: u.id },
      });
      expect(rows).toHaveLength(1);
    }
  }, 60_000);
});
