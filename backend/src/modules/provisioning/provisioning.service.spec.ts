/* eslint-disable
   @typescript-eslint/unbound-method,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access
*/
// Doctrina canónica TS-ESLint para specs Jest, aplicada a nivel de archivo:
//
//  - `unbound-method`: falso positivo cuando se hace
//    `expect(mock.method).toHaveBeenCalled()`.
//  - `no-unsafe-assignment` / `no-unsafe-member-access`: falsos positivos
//    cuando se anidan `expect.objectContaining(...)` (devuelve `any`) o
//    se accede a `mock.calls[0][0]` (Jest tipa los args como `any`).
//
// Estos disables aplican SOLO a este spec; en código de producción las
// reglas siguen activas con severidad `warn`/`error`.

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  EMPTY_PLUGIN_SCHEMA,
  PluginManifest,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPlugin,
} from '../../core/provisioning/types';

const TEST_MANIFEST: PluginManifest = {
  slug: 'internal',
  version: '0.0.0-test',
  manifestVersion: 'v1',
  label: 'plugin.internal.label',
  description: 'plugin.internal.description',
  docsUrl: 'docs/test/internal.md',
  settingsCategory: 'provisioner',
  configSchema: EMPTY_PLUGIN_SCHEMA,
  secretsSchema: EMPTY_PLUGIN_SCHEMA,
  testConnectionMethod: null,
};

import { DeprovisionReasonDto } from './dto/provisioning.dto';
import { ProvisioningService } from './provisioning.service';

/**
 * Tests unit ProvisioningService — Sprint 11 Fase 11.D.
 *
 * Cobertura:
 *   - listForUser: filtra por user_id (ownership server-side).
 *   - listForAdmin: aplica filtros (provisioner_slug, status, search).
 *   - getInfoForUser: ownership 403 cuando user no es dueño.
 *   - getInfoForUser: plugin no registrado → fallback 'unknown'.
 *   - getInfoForUser: camino feliz invoca wrapper getServiceInfoWithCache.
 *   - getSsoForUser: ownership 403.
 *   - executeActionForUser: ownership 403.
 *   - reprovisionAsAdmin: enqueue + audit.
 *   - reprovisionAsAdmin: NotFoundException si service no existe.
 *   - deprovisionAsAdmin: status='cancelled' + emit service.cancelled + audit.
 */
describe('ProvisioningService — Sprint 11 Fase 11.D', () => {
  let prisma: {
    service: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let registry: jest.Mocked<PluginRegistryService>;
  let cache: { get: jest.Mock; set: jest.Mock; invalidate: jest.Mock };
  let events: { emit: jest.Mock };
  let audit: { logAccess: jest.Mock; logChange: jest.Mock };
  let settings: { getNumber: jest.Mock };
  let orchestrator: { enqueueProvisioning: jest.Mock };
  let service: ProvisioningService;

  function buildPlugin(
    over: Partial<ProvisionerPlugin> = {},
  ): ProvisionerPlugin {
    return {
      slug: 'internal',
      contractVersion: PROVISIONER_PLUGIN_CONTRACT_VERSION,
      capabilities: {
        has_sso_panel: false,
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: false,
        supports_reconciliation: false,
      },
      inlineActions: [],
      manifest: TEST_MANIFEST,
      provision: jest.fn(),
      deprovision: jest.fn(),
      getStatus: jest.fn(),
      getServiceInfo: jest.fn().mockResolvedValue({
        status: 'active',
        display: { primary: 'Test', secondary: 'Plan Pro' },
        capabilities: {
          has_sso_panel: false,
          has_metrics: false,
          has_metrics_history: false,
          requires_server: false,
          provision_mode: 'sync',
          completes_via_task: false,
          supports_reconciliation: false,
          hasSsoPanel: false,
          inlineActions: [],
        },
        availableActions: [],
        fetchedAt: new Date().toISOString(),
      }),
      getSsoUrl: jest.fn().mockResolvedValue(null),
      executeAction: jest.fn(),
      ...over,
    };
  }

  function buildServiceRow(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-1',
      status: 'active',
      label: 'mi-web.com',
      domain: 'mi-web.com',
      server_id: null,
      provisioner_slug: 'internal',
      provider_reference: null,
      created_at: new Date(),
      product: {
        id: 'prod-1',
        slug: 'support-inside-pro',
        name: 'Support Inside Pro',
        type: 'support_inside',
        provisioner: 'internal',
        provisioner_config: null,
      },
      ...over,
    };
  }

  beforeEach(() => {
    prisma = {
      service: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'cliente@aelium.test',
          first_name: 'Carla',
          last_name: 'Test',
          language: 'es',
        }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((arr: unknown[]) =>
          Promise.all(arr.map((promise) => promise as Promise<unknown>)),
        ),
    };
    registry = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
      listSlugs: jest.fn().mockReturnValue(['internal']),
    } as unknown as jest.Mocked<PluginRegistryService>;
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn().mockResolvedValue(undefined),
    };
    events = { emit: jest.fn() };
    audit = {
      logAccess: jest.fn().mockResolvedValue(undefined),
      logChange: jest.fn().mockResolvedValue(undefined),
    };
    settings = { getNumber: jest.fn().mockResolvedValue(60) };
    orchestrator = {
      enqueueProvisioning: jest.fn().mockResolvedValue(undefined),
    };
    // Sprint 15A Fase F (ADR-080 §5) — el registry de breakers se mockea
    // como noop: getOrCreate devuelve un breaker que ejecuta el fn como
    // closed (passthrough). No queremos test la lógica del breaker aquí
    // (eso vive en circuit-breaker.spec.ts) — solo que el wrapper acepta
    // el parámetro sin romper el flujo.
    const passthroughBreaker = {
      execute: <T>(fn: () => Promise<T>) => fn(),
      getState: () => 'closed' as const,
      reset: jest.fn(),
    };
    const breakers = {
      getOrCreate: jest.fn().mockReturnValue(passthroughBreaker),
      get: jest.fn().mockReturnValue(passthroughBreaker),
      listNames: jest.fn().mockReturnValue([]),
      resetAll: jest.fn(),
    };

    service = new ProvisioningService(
      prisma as never,
      registry,
      cache as never,
      events as unknown as EventEmitter2,
      audit as never,
      settings as never,
      orchestrator as never,
      breakers as never,
    );
  });

  // ─── listForUser ────────────────────────────────────────────────────

  it('listForUser: aplica where user_id (ownership server-side)', async () => {
    prisma.service.findMany.mockResolvedValueOnce([]);
    prisma.service.count.mockResolvedValueOnce(0);

    await service.listForUser('user-1', { page: 1, limit: 20 });

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: 'user-1' }),
      }),
    );
  });

  it('listForUser: incluye filtro status cuando llega', async () => {
    prisma.service.findMany.mockResolvedValueOnce([]);
    prisma.service.count.mockResolvedValueOnce(0);

    await service.listForUser('user-1', { status: 'active' });

    expect(prisma.service.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: 'user-1', status: 'active' }),
      }),
    );
  });

  // ─── listForAdmin ───────────────────────────────────────────────────

  it('listForAdmin: aplica filtros provisioner_slug + search', async () => {
    prisma.service.findMany.mockResolvedValueOnce([]);
    prisma.service.count.mockResolvedValueOnce(0);

    await service.listForAdmin({
      provisioner_slug: 'manual',
      search: 'mi-web',
    });

    const call = prisma.service.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.provisioner_slug).toBe('manual');
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.objectContaining({ contains: 'mi-web' }),
        }),
        expect.objectContaining({
          domain: expect.objectContaining({ contains: 'mi-web' }),
        }),
      ]),
    );
  });

  // ─── getInfoForUser ─────────────────────────────────────────────────

  it('getInfoForUser: lanza ForbiddenException si user no es dueño', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());

    await expect(
      service.getInfoForUser('svc-1', 'other-user', false),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getInfoForUser: plugin no registrado → fallback con status="unknown"', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    registry.get.mockReturnValue(null);

    const result = await service.getInfoForUser('svc-1', 'user-1', false);

    expect(result.info.status).toBe('unknown');
    expect(result.info.statusReason).toBe('Plugin no registrado');
    expect(result.service.id).toBe('svc-1');
  });

  it('getInfoForUser: camino feliz invoca plugin.getServiceInfo y devuelve info', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    const plugin = buildPlugin();
    registry.get.mockReturnValue(plugin);

    const result = await service.getInfoForUser('svc-1', 'user-1', false);

    expect(plugin.getServiceInfo).toHaveBeenCalled();
    expect(result.info.status).toBe('active');
    expect(result.service.product_slug).toBe('support-inside-pro');
  });

  it('getInfoForUser: admin bypassea ownership (isAdmin=true)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({ user_id: 'other-user' }),
    );
    registry.get.mockReturnValue(buildPlugin());

    await expect(
      service.getInfoForUser('svc-1', 'admin-id', true),
    ).resolves.toEqual(
      expect.objectContaining({
        service: expect.objectContaining({ user_id: 'other-user' }),
      }),
    );
  });

  // ─── getSsoForUser ──────────────────────────────────────────────────

  it('getSsoForUser: lanza ForbiddenException si user no es dueño', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());

    await expect(
      service.getSsoForUser('svc-1', 'other-user', false, {
        ipAddress: '1.2.3.4',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── executeActionForUser ──────────────────────────────────────────

  it('executeActionForUser: lanza ForbiddenException si user no es dueño', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());

    await expect(
      service.executeActionForUser(
        'svc-1',
        'reset_password',
        {},
        'other-user',
        false,
        { ipAddress: '1.2.3.4' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── reprovisionAsAdmin ─────────────────────────────────────────────

  it('reprovisionAsAdmin: enqueue + audit logChange + audit logAccess', async () => {
    prisma.service.findUnique.mockResolvedValueOnce({
      id: 'svc-1',
      user_id: 'user-1',
      status: 'cancelled',
    });

    const result = await service.reprovisionAsAdmin('svc-1', 'admin-id', {
      ipAddress: '1.2.3.4',
    });

    expect(result).toEqual({ enqueued: true });
    expect(orchestrator.enqueueProvisioning).toHaveBeenCalledWith('svc-1');
    expect(audit.logChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'Service',
        entity_id: 'svc-1',
        action: 'service.reprovision_requested',
      }),
    );
    expect(audit.logAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service_reprovision_admin',
      }),
    );
  });

  it('reprovisionAsAdmin: NotFoundException si service no existe', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.reprovisionAsAdmin('svc-missing', 'admin-id', {
        ipAddress: '1.2.3.4',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(orchestrator.enqueueProvisioning).not.toHaveBeenCalled();
  });

  // ─── deprovisionAsAdmin ────────────────────────────────────────────

  it('deprovisionAsAdmin: status=cancelled + emit service.cancelled + audit', async () => {
    prisma.service.findUnique.mockResolvedValueOnce({
      id: 'svc-1',
      user_id: 'user-1',
      status: 'active',
      provisioner_slug: 'manual',
    });
    prisma.service.update.mockResolvedValueOnce({
      id: 'svc-1',
      status: 'cancelled',
      cancellation_reason: 'admin_override: cliente lo solicitó',
    });

    const result = await service.deprovisionAsAdmin(
      'svc-1',
      {
        reason: DeprovisionReasonDto.admin_override,
        notes: 'cliente lo solicitó',
      },
      'admin-id',
      { ipAddress: '1.2.3.4' },
    );

    expect(result.status).toBe('cancelled');
    expect(result.cancellation_reason).toContain('admin_override');
    expect(events.emit).toHaveBeenCalledWith(
      'service.cancelled',
      expect.objectContaining({
        service_id: 'svc-1',
        reason: 'admin_override',
        actor_user_id: 'admin-id',
      }),
    );
    expect(audit.logChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service.deprovisioned_admin',
      }),
    );
  });

  it('deprovisionAsAdmin: NotFoundException si service no existe', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.deprovisionAsAdmin(
        'svc-missing',
        { reason: DeprovisionReasonDto.cancelled },
        'admin-id',
        { ipAddress: '1.2.3.4' },
      ),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.service.update).not.toHaveBeenCalled();
  });
});
