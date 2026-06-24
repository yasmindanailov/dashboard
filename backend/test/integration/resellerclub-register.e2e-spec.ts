/**
 * Sprint 15D Fase 15D.D — smoke vertical de integración: registro de dominio
 * end-to-end contra Postgres REAL + `MockResellerClubServer` (red de seguridad
 * L20, ADR-081 §10/§11).
 *
 * Gap que cierra (mismo razonamiento que `advisory-lock-concurrency.e2e-spec.ts`):
 * las specs unit del plugin/servicio **mockean Prisma**, así que el
 * `pg_advisory_xact_lock` + la persistencia real de `resellerclub_customers`
 * (PK `user_id`) / `resellerclub_contact_handles` NO se ejercitan contra
 * Postgres real — justo la clase de bug (`$queryRaw` vs `$executeRaw`) que pasó
 * los mocks y falló en producción en 15C. Aquí:
 *   1. `provision(register)` E2E: pre-flight availability + customer/contact lazy
 *      (cliente RC real → mock) + `domains/register` → persistencia real.
 *   2. Concurrencia: 2 `ensureRegistrant` simultáneos del MISMO user → el
 *      advisory lock serializa → exactamente 1 customer (sin la PK `user_id`
 *      reventaría con unique violation) + 4 contact handles.
 *
 * Prerrequisito: `docker compose -f docker/docker-compose.dev.yml up -d postgres`
 * + DB migrada/seedeada. Ejecutar con `pnpm --dir backend test:e2e`.
 * El cliente RC apunta al mock vía `jest.spyOn(plugin, 'getApiClient')` — no se
 * golpea OT&E real (ADR-081 §11: CI usa SIEMPRE el mock).
 */

import { PrismaService } from '../../src/core/database/prisma.service';
import {
  ClientPublicData,
  ProvisionContext,
} from '../../src/core/provisioning/types';
import { ResellerClubApiClient } from '../../src/plugins/provisioners/resellerclub/api';
import { ResellerclubCustomersService } from '../../src/plugins/provisioners/resellerclub/resellerclub-customers.service';
import { ResellerclubProvisionerPlugin } from '../../src/plugins/provisioners/resellerclub/resellerclub.plugin';

import { connectPrisma, createTestUser, deleteUser } from './_helpers';
import { startMockResellerClubServer } from '../mocks/resellerclub-server';

const AUTH = { authUserId: 'uid-integ', apiKey: 'key-integ' };

describe('Integración 15D.D — registro de dominio E2E (RC ↔ Postgres real + mock)', () => {
  let prisma: PrismaService;
  let mock: Awaited<ReturnType<typeof startMockResellerClubServer>>;
  let apiClient: ResellerClubApiClient;
  let customers: ResellerclubCustomersService;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = await connectPrisma();
    mock = await startMockResellerClubServer({ seed: { ...AUTH } });
    apiClient = new ResellerClubApiClient({ baseUrl: mock.baseUrl, ...AUTH });
    customers = new ResellerclubCustomersService(prisma);
  });

  afterAll(async () => {
    for (const id of createdUserIds) await deleteUser(prisma, id);
    await mock.stop();
    await prisma.onModuleDestroy();
  });

  function buildClient(userId: string, email: string): ClientPublicData {
    return {
      id: userId,
      email,
      first_name: 'Carla',
      last_name: 'Pérez',
      company_name: null,
      phone: '600111222',
      locale: 'es',
      country_code: 'ES',
      address_line1: 'Calle Mayor 1',
      address_line2: null,
      city: 'Madrid',
      state: 'Madrid',
      postal_code: '28013',
      tax_id: '12345678Z',
    };
  }

  /** Plugin con Prisma + customers reales; `getApiClient` espiado al cliente@mock. */
  function buildPlugin(): ResellerclubProvisionerPlugin {
    const settingsStub = {
      getJson: <T>(_c: string, _k: string, fallback: T): Promise<T> =>
        Promise.resolve(fallback),
    };
    const plugin = new ResellerclubProvisionerPlugin(
      prisma,
      null as never, // vault — no se usa: getApiClient está espiado
      customers,
      settingsStub as never,
    );
    jest
      .spyOn(plugin, 'getApiClient')
      .mockResolvedValue({ client: apiClient, config: {} as never });
    return plugin;
  }

  it('provision(register) E2E → order-id + customer + 4 contactos persistidos', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();

    const ctx: ProvisionContext = {
      service: {
        id: 'svc-integ-1',
        user_id: user.id,
        domain: 'aeliumtest.com',
        provider_reference: null,
        metadata: { domain_operation: 'register', domain_years: 1 },
      } as never,
      client: buildClient(user.id, user.email),
      productConfig: {},
      serverId: null,
      correlationId: 'cor-integ-1',
      operation: 'register',
    };

    const result = await plugin.provision(ctx);

    // order-id del registrar (provider_reference) — string numérico no vacío.
    expect(result.providerReference).toMatch(/^\d+$/);
    expect(result.followUp).toEqual(['mark_active']);
    expect(result.metadata).toMatchObject({
      domain_operation: 'register',
      domain_years: 1,
      whois_privacy: true,
      // F.3 (PR #115) renombró la clave de metadata de `rc_nameservers` (CSV,
      // que nadie leía → bug latente) a `nameservers` (array, lo lee el
      // dns-authority-resolver). El plugin + spec unit se actualizaron; esta
      // aserción del e2e quedó stale (estos *.e2e-spec.ts no corren en el CI de
      // GitHub — solo manual con Postgres) y se corrige en el cierre 15D.G.
      nameservers: ['ns1.aelium.net', 'ns2.aelium.net'],
    });

    // Persistencia REAL del mapping (FK user_id → users).
    const customer = await prisma.resellerclubCustomer.findUnique({
      where: { user_id: user.id },
    });
    expect(customer).not.toBeNull();
    expect(customer!.resellerclub_customer_id).toMatch(/^\d+$/);

    const handles = await prisma.resellerclubContactHandle.findMany({
      where: { user_id: user.id },
    });
    expect(handles).toHaveLength(4);
    // v1: 1 contacto reutilizado en los 4 roles (Amendment A2).
    const contactIds = new Set(handles.map((h) => h.resellerclub_contact_id));
    expect(contactIds.size).toBe(1);
    expect(handles.map((h) => h.contact_type).sort()).toEqual([
      'admin',
      'billing',
      'registrant',
      'tech',
    ]);
  }, 30_000);

  it('2 ensureRegistrant concurrentes (mismo user) → advisory lock: 1 customer + 4 contactos', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const client = buildClient(user.id, user.email);

    // Sin el advisory lock, el 2º signup intentaría un 2º INSERT en
    // resellerclub_customers (PK user_id) → unique violation. El lock serializa:
    // el 2º espera, lee el mapping cacheado (Step 1) y converge.
    const [r1, r2] = await Promise.all([
      customers.ensureRegistrant(client, apiClient),
      customers.ensureRegistrant(client, apiClient),
    ]);

    expect(r1.customerId).toBe(r2.customerId);
    expect(r1.contacts.registrant).toBe(r2.contacts.registrant);

    const rows = await prisma.resellerclubCustomer.findMany({
      where: { user_id: user.id },
    });
    expect(rows).toHaveLength(1);

    const handles = await prisma.resellerclubContactHandle.findMany({
      where: { user_id: user.id },
    });
    expect(handles).toHaveLength(4);
  }, 30_000);
});
