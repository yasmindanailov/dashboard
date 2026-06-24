/**
 * Sprint 15D Fase 15D.G (cierre core) — smoke vertical de integración: el switch
 * de NS "dominio-solo aparca en el registrar → conmuta a Aelium al añadir hosting"
 * (ADR-082 Amendment F.3) end-to-end contra Postgres REAL + `MockResellerClubServer`
 * + el WRAPPER canónico real (`executeActionWithCacheInvalidation`).
 *
 * Gap que cierra (red de seguridad L20):
 *   - El spec unit (`domain-ns-lifecycle.service.spec.ts`) **mockea por completo**
 *     `executeActionWithCacheInvalidation` (`jest.mock(... )`), así que el camino
 *     REAL nunca se ejercita: wrapper (breaker + cache + audit + evento) → plugin
 *     RC → round-trip HTTP `domains/modify-ns` contra el mock → `domains/details`
 *     verify-after-write → persistencia de `metadata.nameservers` en Postgres.
 *   - Aquí, contra infra real:
 *       1. parking → switch → el registrar (mock) queda en NS de Aelium **y**
 *          `services.metadata.nameservers` se persiste (lo que lee el
 *          `dns-authority-resolver`), preservando la metadata previa.
 *       2. idempotencia: 2ª llamada (ya == Aelium) → no-op (sin 2º modify-ns).
 *       3. no-clobber: NS custom del cliente → no se tocan.
 *       4. ya-Aelium (comprado con hosting): no-op.
 *     Además confirma que el rastro durable es el `service.action_executed`
 *     de SISTEMA (`actor_user_id=null`), NO `domain.nameservers_changed` (que
 *     dispararía la alerta de seguridad "¿fuiste tú?", engañosa aquí).
 *
 * Prerrequisito: `docker compose -f docker/docker-compose.dev.yml up -d postgres`
 * + DB migrada/seedeada. Ejecutar con `pnpm --dir backend test:e2e`. El cliente RC
 * apunta al mock vía `jest.spyOn(plugin, 'getApiClient')` (ADR-081 §11: CI usa
 * SIEMPRE el mock, nunca OT&E live).
 */

import { randomUUID } from 'node:crypto';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, ProductType, ServiceStatus } from '@prisma/client';

import { PrismaService } from '../../src/core/database/prisma.service';
import { CircuitBreakerRegistry } from '../../src/core/provisioning/circuit-breaker';
import {
  ClientPublicData,
  ProvisionContext,
} from '../../src/core/provisioning/types';
import { DomainNsLifecycleService } from '../../src/modules/provisioning/domain-ns-lifecycle.service';
import { ResellerClubApiClient } from '../../src/plugins/provisioners/resellerclub/api';
import { ResellerclubCustomersService } from '../../src/plugins/provisioners/resellerclub/resellerclub-customers.service';
import { ResellerclubProvisionerPlugin } from '../../src/plugins/provisioners/resellerclub/resellerclub.plugin';

import { connectPrisma, createTestUser, deleteUser } from './_helpers';
import { startMockResellerClubServer } from '../mocks/resellerclub-server';

const AUTH = { authUserId: 'uid-nsswitch', apiKey: 'key-nsswitch' };
const AELIUM = ['ns1.aelium.net', 'ns2.aelium.net'];
const PARKING = ['dns1.resellerclub.com', 'dns2.resellerclub.com'];

/** Subset del evento `service.action_executed` que capturamos del emisor real. */
interface ActionExecutedEvent {
  service_id: string;
  actor_user_id: string | null;
  provisioner_slug: string;
  action_slug: string;
  success: boolean;
}

describe('Integración 15D.G — switch de NS al activar hosting (F.3, wrapper real + Postgres + mock)', () => {
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

  /** Settings stub: parking key → NS de parking; cualquier otra → NS de Aelium. */
  const settingsStub = {
    getJson: (_cat: string, key: string): Promise<string[]> =>
      Promise.resolve(
        key === 'registrar_parking_nameservers' ? PARKING : AELIUM,
      ),
  };

  /** Plugin RC real (Prisma + customers reales); `getApiClient` espiado al cliente@mock. */
  function buildPlugin(): ResellerclubProvisionerPlugin {
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

  /** `DomainNsLifecycleService` con el WRAPPER real; cache/audit stub, events real (capturado). */
  function buildLifecycle(plugin: ResellerclubProvisionerPlugin): {
    lifecycle: DomainNsLifecycleService;
    captured: ActionExecutedEvent[];
  } {
    const events = new EventEmitter2();
    const captured: ActionExecutedEvent[] = [];
    events.on('service.action_executed', (payload: unknown) => {
      captured.push(payload as ActionExecutedEvent);
    });
    const cacheStub = {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      invalidate: () => Promise.resolve(),
    };
    const auditStub = {
      logChange: jest.fn().mockResolvedValue(undefined),
      logAccess: jest.fn().mockResolvedValue(undefined),
    };
    const registryStub = { get: () => plugin };
    const breakers = new CircuitBreakerRegistry(new EventEmitter2());
    const lifecycle = new DomainNsLifecycleService(
      prisma,
      registryStub as never,
      cacheStub as never,
      events,
      auditStub as never,
      settingsStub as never,
      breakers,
    );
    return { lifecycle, captured };
  }

  /** Registra un dominio vía el plugin (persiste customer/contacts en Postgres) → order-id. */
  async function register(
    plugin: ResellerclubProvisionerPlugin,
    userId: string,
    email: string,
    fqdn: string,
    hint: 'aelium' | 'parking',
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
      dnsTargetHint: hint,
    };
    const result = await plugin.provision(ctx);
    return result.providerReference as string;
  }

  /** Crea Product(type=domain) + Service(active, RC) reales con la metadata de NS dada. */
  async function createDomainService(
    orderId: string,
    fqdn: string,
    userId: string,
    nameservers: string[],
  ): Promise<string> {
    const product = await prisma.product.create({
      data: {
        name: 'NS-switch domain',
        slug: `nsswitch-${randomUUID()}`,
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
        metadata: {
          nameservers,
          domain_operation: 'register',
          domain_years: 1,
        },
      },
      select: { id: true },
    });
    createdServiceIds.push(service.id);
    return service.id;
  }

  it('parking → añadir hosting conmuta a NS Aelium + persiste metadata + evento de sistema (idempotente)', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();

    const orderId = await register(
      plugin,
      user.id,
      user.email,
      'parked.com',
      'parking',
    );
    expect(mock.state.domainsByOrderId.get(orderId)!.ns).toEqual(PARKING);

    const serviceId = await createDomainService(
      orderId,
      'parked.com',
      user.id,
      PARKING,
    );
    const { lifecycle, captured } = buildLifecycle(plugin);

    await lifecycle.switchToAeliumIfParked(serviceId);

    // 1) Conmutado en el registrar (mock) vía el camino real wrapper→plugin→HTTP.
    expect(mock.state.domainsByOrderId.get(orderId)!.ns).toEqual(AELIUM);
    // 2) Persistido en Postgres (clave que lee el dns-authority-resolver), metadata previa intacta.
    const row = await prisma.service.findUnique({ where: { id: serviceId } });
    const meta = row!.metadata as {
      nameservers?: string[];
      domain_operation?: string;
    };
    expect(meta.nameservers).toEqual(AELIUM);
    expect(meta.domain_operation).toBe('register');
    // 3) Rastro durable: evento de acción de SISTEMA (no domain.nameservers_changed).
    const evts = captured.filter((e) => e.action_slug === 'modify_nameservers');
    expect(evts).toHaveLength(1);
    expect(evts[0]).toMatchObject({
      provisioner_slug: 'resellerclub',
      actor_user_id: null,
      success: true,
      service_id: serviceId,
    });

    // Idempotente: 2ª llamada (ya == Aelium) → no-op (sin 2º modify-ns ni 2º evento).
    await lifecycle.switchToAeliumIfParked(serviceId);
    expect(
      captured.filter((e) => e.action_slug === 'modify_nameservers'),
    ).toHaveLength(1);
    expect(mock.state.domainsByOrderId.get(orderId)!.ns).toEqual(AELIUM);
  }, 30_000);

  it('NS custom del cliente → no-clobber (no conmuta, no evento)', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();

    const orderId = await register(
      plugin,
      user.id,
      user.email,
      'customns.com',
      'parking',
    );
    const CUSTOM = ['ns1.cloudflare.com', 'ns2.cloudflare.com'];
    const serviceId = await createDomainService(
      orderId,
      'customns.com',
      user.id,
      CUSTOM,
    );
    const { lifecycle, captured } = buildLifecycle(plugin);

    await lifecycle.switchToAeliumIfParked(serviceId);

    expect(captured).toHaveLength(0);
    // El registrar conserva los NS del registro (no se tocó).
    expect(mock.state.domainsByOrderId.get(orderId)!.ns).toEqual(PARKING);
    const row = await prisma.service.findUnique({ where: { id: serviceId } });
    expect((row!.metadata as { nameservers?: string[] }).nameservers).toEqual(
      CUSTOM,
    );
  }, 30_000);

  it('dominio ya delega a Aelium (comprado con hosting) → no-op idempotente', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();

    const orderId = await register(
      plugin,
      user.id,
      user.email,
      'withhosting.com',
      'aelium',
    );
    expect(mock.state.domainsByOrderId.get(orderId)!.ns).toEqual(AELIUM);
    const serviceId = await createDomainService(
      orderId,
      'withhosting.com',
      user.id,
      AELIUM,
    );
    const { lifecycle, captured } = buildLifecycle(plugin);

    await lifecycle.switchToAeliumIfParked(serviceId);

    expect(captured).toHaveLength(0);
    expect(mock.state.domainsByOrderId.get(orderId)!.ns).toEqual(AELIUM);
  }, 30_000);
});
