/**
 * Sprint 15D.II Fase G — smoke vertical de integración: **transfer-in** de dominio
 * end-to-end contra Postgres REAL + `MockResellerClubServer` (red de seguridad L20,
 * ADR-081 A7 + ADR-084 §4/A2 + DOM-INV-6).
 *
 * Las specs unit del plugin **mockean el cliente RC** (`jest.spyOn(getApiClient)`
 * devuelve un mock de `validateTransfer`/`transferDomain`/`getDomainDetailsByOrderId`),
 * así que NO se ejercita el round-trip HTTP real del `domains/transfer` ni la lectura
 * por HTTP del `actionstatus` que es el motor de la FSM (DH-INV-6), ni el lazy-create
 * REAL del registrante en Postgres (`resellerclub_customers`). Aquí, contra el mock
 * server real + Postgres real:
 *   1. Happy path: `provision(transfer_in)` con EPP auth-code → `submitted` +
 *      `provider_reference` (order-id) + registrante persistido en Postgres
 *      (`ensureRegistrant`, real) + NS por defecto. La FSM avanza por HTTP
 *      `submitted → completed` (`getTransferStatus` relee `domains/details`).
 *   2. `awaiting_auth`: sin EPP auth-code → no se envía nada al registrar.
 *   3. `INVALID_AUTH_CODE`: auth-code que no coincide → rechazo (R12: el código
 *      jamás se persiste — vive solo en `ProvisionContext`, en memoria).
 *   4. `TRANSFER_REJECTED`: dominio con lock en el registrar perdedor (no transferible)
 *      y sin transfer nuestro que adoptar.
 *   5. DOM-INV-6 (exactly-once): reintento con `provider_reference` ya persistido →
 *      idempotente, NO re-envía a RC (no doble-iniciación).
 *   6. `getTransferStatus` mapea TODAS las aristas de la FSM leídas por HTTP del
 *      registrar: submitted / failed / cancelled / completed / unknown (fail-soft R7).
 *
 * Prerrequisito: `docker compose -f docker/docker-compose.dev.yml up -d postgres`
 * + DB migrada + seedeada (`pnpm --dir backend seed` — los helpers reusan un `Role`
 * del seed para el FK de los users de prueba). Ejecutar con `pnpm --dir backend
 * test:e2e`. El cliente RC apunta SIEMPRE al mock (ADR-081 §11: CI nunca toca OT&E
 * live; el smoke OT&E real es manual, gate de la IP whitelisteada).
 *
 * Alcance: este spec cubre el tramo **plugin ↔ registrar ↔ Postgres** del ciclo
 * (igual nivel que `resellerclub-register/renew.e2e-spec.ts`). El cierre de la FSM
 * por el orquestador (`initiateTransferIn`), el motor reconcile (`advanceTransfer`),
 * el cobro al completar (`GenerateInvoiceOnDomainTransferCompletedListener`), los
 * eventos Outbox (`domain.transfer_*`) y la zona DNS quedan cubiertos por sus specs
 * unit; aquí se valida el round-trip real que aquéllas mockean.
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

const AUTH = { authUserId: 'uid-transfer', apiKey: 'key-transfer' };

/** NS por defecto que el `settingsStub` resuelve (fallback C3, ADR-082 §4). */
const DEFAULT_NS = ['ns1.aelium.net', 'ns2.aelium.net'];

describe('Integración 15D.II.G — transfer-in de dominio E2E (RC ↔ Postgres real + mock)', () => {
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

  interface TransferOpts {
    authCode?: string;
    providerReference?: string | null;
    dnsTargetHint?: 'aelium' | 'parking';
  }

  function transferCtx(
    userId: string,
    email: string,
    fqdn: string,
    opts: TransferOpts,
  ): ProvisionContext {
    return {
      service: {
        id: `svc-${fqdn}`,
        user_id: userId,
        domain: fqdn,
        provider_reference: opts.providerReference ?? null,
        metadata: {
          domain_operation: 'transfer_in',
          transfer_state: opts.providerReference ? 'submitted' : 'pending',
        },
      } as never,
      client: buildClient(userId, email),
      productConfig: {},
      serverId: null,
      correlationId: `cor-xfer-${fqdn}`,
      operation: 'transfer_in',
      transferAuthCode: opts.authCode,
      dnsTargetHint: opts.dnsTargetHint,
    };
  }

  /** Servicio mínimo que `getTransferStatus` consume (order-id + fqdn). */
  function statusService(orderId: string | null, fqdn: string): never {
    return { provider_reference: orderId, domain: fqdn } as never;
  }

  it('happy path: inicia el transfer (submitted), persiste el registrante en Postgres real, NS por defecto, y la FSM avanza submitted→completed por HTTP', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();
    const fqdn = 'movein-happy.com';
    mock.state.transferableDomains.add(fqdn);

    const result = await plugin.provision(
      transferCtx(user.id, user.email, fqdn, { authCode: 'EPP-VALID-001' }),
    );

    // Estado de la FSM + order-id + NS resueltos por el plugin.
    expect(result.metadata.transfer_state).toBe('submitted');
    expect(result.providerReference).toBeTruthy();
    expect(result.metadata.rc_customer_id).toBeTruthy();
    expect(result.metadata.nameservers).toEqual(DEFAULT_NS);
    const orderId = result.providerReference as string;

    // El mock refleja el transfer en curso.
    const d = mock.state.domainsByName.get(fqdn);
    expect(d?.transferStatus).toBe('submitted');
    expect(d?.orderid).toBe(orderId);

    // Postgres REAL: el registrante se materializó (lazy-create, lo que la unit mockea).
    const rcCustomer = await prisma.resellerclubCustomer.findUnique({
      where: { user_id: user.id },
    });
    expect(rcCustomer).not.toBeNull();

    // Motor de la FSM (DH-INV-6): lectura por HTTP del registrar.
    const svc = statusService(orderId, fqdn);
    expect(await plugin.getTransferStatus(svc)).toBe('submitted');

    // El registrar completa el transfer → el reconcile lo leería como completed.
    const now = Math.floor(Date.now() / 1000);
    d!.transferStatus = 'completed';
    d!.creationtime = now;
    d!.endtime = now + 365 * 24 * 3600; // el período del registro entrante
    expect(await plugin.getTransferStatus(svc)).toBe('completed');
    expect(mock.state.domainsByOrderId.get(orderId)!.endtime).toBeGreaterThan(
      mock.state.domainsByOrderId.get(orderId)!.creationtime,
    ); // expires_at derivable
  }, 30_000);

  it('sin EPP auth-code → awaiting_auth (no se envía nada al registrar)', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();
    const fqdn = 'movein-noauth.com';
    mock.state.transferableDomains.add(fqdn);

    const result = await plugin.provision(
      transferCtx(user.id, user.email, fqdn, {}), // sin authCode
    );

    expect(result.metadata.transfer_state).toBe('awaiting_auth');
    expect(result.providerReference).toBeNull();
    // No hubo round-trip al registrar: el dominio NO se creó en el mock.
    expect(mock.state.domainsByName.has(fqdn)).toBe(false);
  }, 30_000);

  it('EPP auth-code inválido → INVALID_AUTH_CODE (R12: el código nunca se persiste)', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();
    const fqdn = 'movein-badauth.com';
    mock.state.transferableDomains.add(fqdn);
    mock.state.transferAuthCodes.set(fqdn, 'CORRECT-EPP'); // exige coincidencia exacta

    await expect(
      plugin.provision(
        transferCtx(user.id, user.email, fqdn, { authCode: 'WRONG-EPP' }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_AUTH_CODE' });

    // El registrar rechazó antes de crear el transfer.
    expect(mock.state.domainsByName.has(fqdn)).toBe(false);
  }, 30_000);

  it('dominio no transferible (lock en el registrar perdedor) → TRANSFER_REJECTED', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();
    // El sld con 'locked' modela el lock en el registrar perdedor (mock isTransferable).
    const fqdn = 'lockedxfer.com';

    await expect(
      plugin.provision(
        transferCtx(user.id, user.email, fqdn, { authCode: 'EPP-X' }),
      ),
    ).rejects.toMatchObject({ code: 'TRANSFER_REJECTED' });

    expect(mock.state.domainsByName.has(fqdn)).toBe(false);
  }, 30_000);

  it('DOM-INV-6 (exactly-once): reintento con provider_reference ya persistido → idempotente, NO re-envía a RC', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();
    const fqdn = 'movein-idem.com';
    mock.state.transferableDomains.add(fqdn);

    const r1 = await plugin.provision(
      transferCtx(user.id, user.email, fqdn, { authCode: 'EPP-IDEM' }),
    );
    const orderId = r1.providerReference as string;
    expect(orderId).toBeTruthy();

    const orderCounterBefore = mock.state.nextOrderId;

    // Reintento con el provider_reference ya persistido (crash-retry / re-run).
    const r2 = await plugin.provision(
      transferCtx(user.id, user.email, fqdn, {
        authCode: 'EPP-IDEM',
        providerReference: orderId,
      }),
    );

    expect(r2.providerReference).toBe(orderId);
    // NO se creó un segundo order de transfer (no doble-iniciación).
    expect(mock.state.nextOrderId).toBe(orderCounterBefore);
  }, 30_000);

  it('getTransferStatus mapea las aristas de la FSM leídas por HTTP: submitted/failed/cancelled/completed + unknown fail-soft', async () => {
    const user = await createTestUser(prisma);
    createdUserIds.push(user.id);
    const plugin = buildPlugin();
    const fqdn = 'movein-fsm.com';
    mock.state.transferableDomains.add(fqdn);

    const r = await plugin.provision(
      transferCtx(user.id, user.email, fqdn, { authCode: 'EPP-FSM' }),
    );
    const orderId = r.providerReference as string;
    const svc = statusService(orderId, fqdn);
    const d = mock.state.domainsByOrderId.get(orderId)!;

    expect(await plugin.getTransferStatus(svc)).toBe('submitted');

    d.transferStatus = 'failed';
    expect(await plugin.getTransferStatus(svc)).toBe('failed');

    d.transferStatus = 'cancelled';
    expect(await plugin.getTransferStatus(svc)).toBe('cancelled');

    d.transferStatus = 'completed';
    expect(await plugin.getTransferStatus(svc)).toBe('completed');

    // Sin order-id ni FQDN válido → unknown sin tocar al registrar (fail-soft R7).
    expect(await plugin.getTransferStatus(statusService(null, ''))).toBe(
      'unknown',
    );
  }, 30_000);
});
