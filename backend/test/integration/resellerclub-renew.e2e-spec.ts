/**
 * Sprint 15D Fase 15D.E — smoke vertical de integración: renovación de dominio
 * end-to-end contra Postgres REAL + `MockResellerClubServer` (red de seguridad
 * L20, ADR-081 §5 + ADR-084 DOM-INV-4).
 *
 * Las specs unit del plugin **mockean el cliente RC** (`jest.spyOn(getApiClient)`
 * devuelve un mock de `getDomainDetailsByOrderId`/`renewDomain`), así que la lectura
 * REAL del `endtime` por `domains/details` y el round-trip HTTP del `domains/renew`
 * NO se ejercitan. Aquí, contra el mock server real:
 *   1. register → renew: el `endtime` avanza de verdad → DOM-INV-4 OK
 *      (`domain_renew_performed=true`, nuevo `domain_expires_at`).
 *   2. Idempotencia por período: re-ejecutar con el ancla previa (crash-retry) NO
 *      vuelve a llamar a `domains/renew` (el `endtime` del mock no avanza 2ª vez).
 *   3. DOM-INV-4: un `renew` "congelado" (Success sin extender) →
 *      `PROVIDER_INTERNAL_ERROR` retriable, sin éxito falso.
 *
 * Prerrequisito: `docker compose -f docker/docker-compose.dev.yml up -d postgres`
 * + DB migrada. Ejecutar con `pnpm --dir backend test:e2e`. El cliente RC apunta al
 * mock (ADR-081 §11: CI usa SIEMPRE el mock, nunca OT&E live).
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

const AUTH = { authUserId: 'uid-renew', apiKey: 'key-renew' };

describe('Integración 15D.E — renovación de dominio E2E (RC ↔ Postgres real + mock)', () => {
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

  function buildPlugin(): ResellerclubProvisionerPlugin {
    const settingsStub = {
      getJson: <T>(_c: string, _k: string, fallback: T): Promise<T> =>
        Promise.resolve(fallback),
    };
    const plugin = new ResellerclubProvisionerPlugin(
      prisma,
      null as never,
      customers,
      settingsStub as never,
    );
    jest
      .spyOn(plugin, 'getApiClient')
      .mockResolvedValue({ client: apiClient, config: {} as never });
    return plugin;
  }

  async function registerDomain(
    plugin: ResellerclubProvisionerPlugin,
    userId: string,
    email: string,
    fqdn: string,
  ): Promise<string> {
    const ctx: ProvisionContext = {
      service: {
        id: `svc-${fqdn}`,
        user_id: userId,
        domain: fqdn,
        provider_reference: null,
        metadata: { domain_operation: 'register', domain_years: 1 },
      } as never,
      client: buildClient(userId, email),
      productConfig: {},
      serverId: null,
      correlationId: `cor-reg-${fqdn}`,
      operation: 'register',
    };
    const result = await plugin.provision(ctx);
    return result.providerReference as string;
  }

  function renewCtx(
    userId: string,
    email: string,
    fqdn: string,
    orderId: string,
    anchorEnd: number | null,
  ): ProvisionContext {
    return {
      service: {
        id: `svc-${fqdn}`,
        user_id: userId,
        domain: fqdn,
        provider_reference: orderId,
        billing_cycle: 'annual',
        expires_at: anchorEnd ? new Date(anchorEnd * 1000) : null,
        metadata: { domain_operation: 'register', domain_years: 1 },
      } as never,
      client: buildClient(userId, email),
      productConfig: {},
      serverId: null,
      correlationId: `cor-renew-${fqdn}`,
      operation: 'renew',
    };
  }

  it('register → renew: endtime avanza (DOM-INV-4 OK) + idempotencia por período', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();
    const fqdn = 'renewtest.com';

    const orderId = await registerDomain(plugin, user.id, user.email, fqdn);
    const endAfterRegister = mock.state.domainsByOrderId.get(orderId)!.endtime;

    // 1ª renovación: ancla = endtime post-registro → procede (avanza ~1 año).
    const r1 = await plugin.provision(
      renewCtx(user.id, user.email, fqdn, orderId, endAfterRegister),
    );
    expect(r1.metadata.domain_renew_performed).toBe(true);
    const endAfterRenew = mock.state.domainsByOrderId.get(orderId)!.endtime;
    expect(endAfterRenew).toBeGreaterThan(endAfterRegister);
    expect(r1.metadata.domain_expires_at).toBe(
      new Date(endAfterRenew * 1000).toISOString(),
    );

    // 2ª renovación con el MISMO ancla (crash-retry antes de persistir expires_at):
    // el endtime del registrar ya avanzó → idempotente, NO re-llama a domains/renew.
    const r2 = await plugin.provision(
      renewCtx(user.id, user.email, fqdn, orderId, endAfterRegister),
    );
    expect(r2.metadata.domain_renew_performed).toBe(false);
    expect(mock.state.domainsByOrderId.get(orderId)!.endtime).toBe(
      endAfterRenew,
    ); // no avanzó una 2ª vez
  }, 30_000);

  it('DOM-INV-4: renew "congelado" (Success sin extender) → PROVIDER_INTERNAL_ERROR retriable', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();
    const fqdn = 'frozenrenew.com';

    const orderId = await registerDomain(plugin, user.id, user.email, fqdn);
    const anchorEnd = mock.state.domainsByOrderId.get(orderId)!.endtime;
    // El mock responde Success a renew pero NO avanza el endtime (modela el fallo
    // silencioso que DOM-INV-4 debe atrapar).
    mock.state.frozenRenewOrderIds.add(orderId);

    await expect(
      plugin.provision(renewCtx(user.id, user.email, fqdn, orderId, anchorEnd)),
    ).rejects.toMatchObject({
      code: 'PROVIDER_INTERNAL_ERROR',
      retriable: true,
    });
  }, 30_000);
});
