/**
 * Sprint 15C.II Fase G.1.b — §A.2 área 5: change_package metadata sync.
 *
 * Gap cerrado + hardening (ADR-083 Amendment A10, decisión Yasmin 2026-05-21
 * "error semántico + retry idempotente"): el unit `enhance.plugin.spec.ts`
 * solo cubre el happy path de change_package (PATCH ok + update ok). NO cubre
 * el escenario crítico: el PATCH a Enhance tiene éxito (Enhance = ground truth,
 * queda en el plan nuevo) pero el `prisma.service.update` local falla.
 *
 * Antes del hardening, ese fallo propagaba un error crudo de Prisma → el
 * wrapper lo colapsaba a `action.provider_error` genérico, sin indicar que el
 * PATCH ya había ocurrido ni que el retry es seguro. Tras el hardening,
 * `actionChangePackage` envuelve el update y lanza un `ProvisionerPluginError`
 * SEMÁNTICO y retriable: la operación es idempotente y el retry converge; la
 * `plan_divergence` transitoria la expone el cron L3 (`AdminDriftBanner`).
 *
 * Este test usa Prisma REAL: la fase 1 fuerza el fallo del update con un
 * `mockRejectedValueOnce` (deja la fila real en el plan viejo); la fase 2
 * reintenta con el update real → la fila converge al plan nuevo. El PATCH a
 * Enhance se mockea (no hay Enhance real) — el valor de integración es el
 * comportamiento transaccional/estado de la fila contra Postgres.
 *
 * Prerrequisito: `docker compose -f docker/docker-compose.dev.yml up -d
 * postgres` + DB migrada/seedeada. Ejecutar con `pnpm --dir backend test:e2e`.
 */

import { randomUUID } from 'node:crypto';

import { ProductType, ServiceStatus } from '@prisma/client';

import { PrismaService } from '../../src/core/database/prisma.service';
import { EnhanceProvisionerPlugin } from '../../src/plugins/provisioners/enhance_cp/enhance.plugin';
import { ProvisionerPluginError } from '../../src/core/provisioning/types';

import { connectPrisma, createTestUser, deleteUser } from './_helpers';

const ORG_ID = '99999999-8888-7777-6666-555555555555';
const SUBSCRIPTION_REF = '1000'; // provider_reference → subscriptionId

function buildApiMock() {
  return { patchSubscription: jest.fn().mockResolvedValue(undefined) };
}

function buildPlugin(
  prisma: PrismaService,
  api: ReturnType<typeof buildApiMock>,
): EnhanceProvisionerPlugin {
  const vault = { decrypt: jest.fn() };
  const customers = { ensureCustomer: jest.fn() };
  const plugin = new EnhanceProvisionerPlugin(
    prisma as never,
    vault as never,
    customers as never,
  );
  // Patrón canónico del spec unit: inyecta el cliente HTTP fake reemplazando
  // getApiClient() (evita construir un EnhanceApiClient real).
  Object.defineProperty(plugin, 'getApiClient', {
    value: jest
      .fn()
      .mockResolvedValue({ client: api, config: { masterOrgId: ORG_ID } }),
  });
  return plugin;
}

describe('Integración G.1.b — change_package metadata sync rollback (§A.2 área 5)', () => {
  let prisma: PrismaService;
  let api: ReturnType<typeof buildApiMock>;
  let plugin: EnhanceProvisionerPlugin;

  let userId: string;
  let productId: string;
  let serviceId: string;
  let svc: unknown; // ServiceWithRelations-like — solo los campos que lee el path.

  beforeAll(async () => {
    prisma = await connectPrisma();
    api = buildApiMock();
    plugin = buildPlugin(prisma, api);

    const user = await createTestUser(prisma);
    userId = user.id;
    const product = await prisma.product.create({
      data: {
        name: 'G1b ChangePackage Product',
        slug: `g1b-${randomUUID()}`,
        type: ProductType.hosting_web,
        provisioner: 'enhance_cp',
      },
      select: { id: true },
    });
    productId = product.id;
    const service = await prisma.service.create({
      data: {
        user_id: userId,
        product_id: productId,
        status: ServiceStatus.active,
        provisioner_slug: 'enhance_cp',
        provider_reference: SUBSCRIPTION_REF,
        amount: '10.00',
        metadata: { enhance_org_id: ORG_ID, enhance_plan_id: 1 },
      },
      select: { id: true },
    });
    serviceId = service.id;

    svc = {
      id: serviceId,
      user_id: userId,
      product_id: productId,
      status: 'active',
      provisioner_slug: 'enhance_cp',
      provider_reference: SUBSCRIPTION_REF,
      metadata: { enhance_org_id: ORG_ID, enhance_plan_id: 1 },
    };
  });

  afterAll(async () => {
    await prisma.service
      .delete({ where: { id: serviceId } })
      .catch(() => undefined);
    await prisma.product
      .delete({ where: { id: productId } })
      .catch(() => undefined);
    await deleteUser(prisma, userId);
    await prisma.onModuleDestroy();
  });

  async function readPlanId(): Promise<unknown> {
    const row = await prisma.service.findUniqueOrThrow({
      where: { id: serviceId },
      select: { metadata: true },
    });
    return (row.metadata as Record<string, unknown>).enhance_plan_id;
  }

  it('PATCH ok + update local falla → error semántico retriable; retry idempotente converge', async () => {
    // ── Fase 1: el update local falla tras un PATCH exitoso ──────────────────
    const updateSpy = jest
      .spyOn(prisma.service, 'update')
      .mockRejectedValueOnce(new Error('simulated transient DB failure'));

    const err = await plugin
      .executeAction(svc as never, 'change_package', { planId: 2 })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProvisionerPluginError);
    expect((err as ProvisionerPluginError).code).toBe(
      'PROVIDER_INTERNAL_ERROR',
    );
    expect((err as ProvisionerPluginError).retriable).toBe(true);
    // El mensaje es accionable: indica que el retry es seguro (idempotente).
    expect((err as ProvisionerPluginError).message).toMatch(/idempotent/i);
    expect((err as ProvisionerPluginError).module).toBe('enhance_cp');

    // El PATCH a Enhance SÍ ocurrió (Enhance ground truth = plan 2)…
    expect(api.patchSubscription).toHaveBeenCalledTimes(1);
    // …pero el snapshot local NO se movió → divergencia transitoria (la marca
    // el cron L3, no es estado corrupto ni una segunda escritura).
    expect(await readPlanId()).toBe(1);

    updateSpy.mockRestore();

    // ── Fase 2: retry idempotente — mismo planId, update local ya real ───────
    const result = await plugin.executeAction(svc as never, 'change_package', {
      planId: 2,
    });
    expect(result.success).toBe(true);
    // PATCH re-aplicado (idempotente en Enhance — mismo planId).
    expect(api.patchSubscription).toHaveBeenCalledTimes(2);
    // La fila REAL converge al plan nuevo → fin de la divergencia.
    expect(await readPlanId()).toBe(2);
  }, 30_000);
});
