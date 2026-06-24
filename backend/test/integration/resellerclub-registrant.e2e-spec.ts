/**
 * Sprint 15D Fase 15D.G·2 — smoke vertical de integración: actualización del
 * contacto de titular (WHOIS) end-to-end contra Postgres REAL + `MockResellerClubServer`.
 *
 * Modelo "1 titular/cliente" (ADR-081 A2): el cliente tiene 1 contacto RC
 * compartido por todos sus dominios → un solo `contacts/modify` propaga el WHOIS
 * a todos. Aquí, contra infra real:
 *   1. registrar (crea el contacto) → updateRegistrantContact con datos nuevos →
 *      el contacto del registrar (mock) refleja el cambio (verify-after-write) +
 *      `nameChanged=true` cuando cambia el nombre + `domainsAffected` cuenta los
 *      dominios del cliente.
 *   2. re-aplicar los mismos datos → `nameChanged=false`.
 *   3. cliente sin contacto (sin dominios) → `propagated=false` (no-op, no error).
 *
 * Prerrequisito: Postgres del docker dev migrado/seedeado. `pnpm --dir backend test:e2e`.
 */

import { randomUUID } from 'node:crypto';

import { Prisma, ProductType, ServiceStatus } from '@prisma/client';

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

const AUTH = { authUserId: 'uid-registrant', apiKey: 'key-registrant' };

describe('Integración 15D.G·2 — updateRegistrantContact E2E (RC ↔ Postgres real + mock)', () => {
  let prisma: PrismaService;
  let mock: Awaited<ReturnType<typeof startMockResellerClubServer>>;
  let apiClient: ResellerClubApiClient;
  let customers: ResellerclubCustomersService;
  const createdUserIds: string[] = [];
  const createdServiceIds: string[] = [];
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    prisma = await connectPrisma();
    mock = await startMockResellerClubServer({ seed: { ...AUTH } });
    apiClient = new ResellerClubApiClient({ baseUrl: mock.baseUrl, ...AUTH });
    customers = new ResellerclubCustomersService(prisma);
  });

  afterAll(async () => {
    for (const id of createdServiceIds) {
      await prisma.service.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of createdProductIds) {
      await prisma.product.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of createdUserIds) await deleteUser(prisma, id);
    await mock.stop();
    await prisma.onModuleDestroy();
  });

  function buildClient(
    userId: string,
    email: string,
    overrides: Partial<ClientPublicData> = {},
  ): ClientPublicData {
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
      ...overrides,
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
      correlationId: `cor-${fqdn}`,
      operation: 'register',
    };
    const result = await plugin.provision(ctx);
    return result.providerReference as string;
  }

  async function createDomainService(
    orderId: string,
    fqdn: string,
    userId: string,
  ): Promise<void> {
    const product = await prisma.product.create({
      data: {
        name: 'Registrant domain',
        slug: `registrant-${randomUUID()}`,
        type: ProductType.domain,
        provisioner: 'resellerclub',
      },
      select: { id: true },
    });
    createdProductIds.push(product.id);
    const service = await prisma.service.create({
      data: {
        user_id: userId,
        product_id: product.id,
        status: ServiceStatus.active,
        provisioner_slug: 'resellerclub',
        amount: new Prisma.Decimal('9.00'),
        domain: fqdn,
        provider_reference: orderId,
      },
      select: { id: true },
    });
    createdServiceIds.push(service.id);
  }

  it('register → updateRegistrantContact propaga el WHOIS + detecta cambio de nombre', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();

    const orderId = await registerDomain(
      plugin,
      user.id,
      user.email,
      'titular.com',
    );
    await createDomainService(orderId, 'titular.com', user.id);

    // Cambio de nombre + dirección.
    const updated = buildClient(user.id, user.email, {
      last_name: 'Gómez',
      address_line1: 'Calle Nueva 2',
      postal_code: '28001',
    });
    const result = await plugin.updateRegistrantContact(updated);

    expect(result.propagated).toBe(true);
    expect(result.nameChanged).toBe(true); // Pérez → Gómez
    expect(result.domainsAffected).toBe(1);

    // El contacto del registrar (mock) refleja el cambio.
    const handle = await prisma.resellerclubContactHandle.findFirst({
      where: { user_id: user.id },
      select: { resellerclub_contact_id: true },
    });
    const details = await apiClient.getContactDetails(
      handle!.resellerclub_contact_id,
    );
    expect(details.name).toBe('Carla Gómez');
    expect(details.address1).toBe('Calle Nueva 2');

    // Re-aplicar lo mismo → no hay cambio de nombre.
    const again = await plugin.updateRegistrantContact(updated);
    expect(again.nameChanged).toBe(false);
    expect(again.propagated).toBe(true);
  }, 30_000);

  it('cliente sin contacto (sin dominios) → propagated=false (no-op)', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();

    const result = await plugin.updateRegistrantContact(
      buildClient(user.id, user.email),
    );
    expect(result.propagated).toBe(false);
    expect(result.domainsAffected).toBe(0);
    expect(result.nameChanged).toBe(false);
  }, 30_000);
});
