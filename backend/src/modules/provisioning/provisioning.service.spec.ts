/* eslint-disable
   @typescript-eslint/unbound-method,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/no-unsafe-member-access
*/
// Doctrina canÃ³nica TS-ESLint para specs Jest, aplicada a nivel de archivo:
//
//  - `unbound-method`: falso positivo cuando se hace
//    `expect(mock.method).toHaveBeenCalled()`.
//  - `no-unsafe-assignment` / `no-unsafe-member-access`: falsos positivos
//    cuando se anidan `expect.objectContaining(...)` (devuelve `any`) o
//    se accede a `mock.calls[0][0]` (Jest tipa los args como `any`).
//
// Estos disables aplican SOLO a este spec; en cÃ³digo de producciÃ³n las
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
 * Tests unit ProvisioningService â€” Sprint 11 Fase 11.D.
 *
 * Cobertura:
 *   - listForUser: filtra por user_id (ownership server-side).
 *   - listForAdmin: aplica filtros (provisioner_slug, status, search).
 *   - getInfoForUser: ownership 403 cuando user no es dueÃ±o.
 *   - getInfoForUser: plugin no registrado â†’ fallback 'unknown'.
 *   - getInfoForUser: camino feliz invoca wrapper getServiceInfoWithCache.
 *   - getSsoForUser: ownership 403.
 *   - executeActionForUser: ownership 403.
 *   - reprovisionAsAdmin: enqueue + audit.
 *   - reprovisionAsAdmin: NotFoundException si service no existe.
 *   - deprovisionAsAdmin: status='cancelled' + emit service.cancelled + audit.
 */
describe('ProvisioningService â€” Sprint 11 Fase 11.D', () => {
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
  let settings: { getNumber: jest.Mock; getJson: jest.Mock };
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
        has_dns_management: false, // ADR-077 Amendment A1
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
          has_dns_management: false, // ADR-077 Amendment A1
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
      // Sprint 15C Fase 15C.D — resolver DNS authority necesita esta lookup.
      getByCapability: jest.fn().mockReturnValue(null),
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
    settings = {
      getNumber: jest.fn().mockResolvedValue(60),
      // Sprint 15C Fase 15C.D — getJson<T> para arrays JSON (NS-sync C3).
      getJson: jest
        .fn()
        .mockResolvedValue(['ns1.aelium.net', 'ns2.aelium.net']),
    } as unknown as typeof settings;
    orchestrator = {
      enqueueProvisioning: jest.fn().mockResolvedValue(undefined),
    };
    // Sprint 15A Fase F (ADR-080 Â§5) â€” el registry de breakers se mockea
    // como noop: getOrCreate devuelve un breaker que ejecuta el fn como
    // closed (passthrough). No queremos test la lÃ³gica del breaker aquÃ­
    // (eso vive en circuit-breaker.spec.ts) â€” solo que el wrapper acepta
    // el parÃ¡metro sin romper el flujo.
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

  // â”€â”€â”€ listForUser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ listForAdmin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€â”€ getInfoForUser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('getInfoForUser: lanza ForbiddenException si user no es dueÃ±o', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());

    await expect(
      service.getInfoForUser('svc-1', 'other-user', false),
    ).rejects.toThrow(ForbiddenException);
  });

  it('getInfoForUser: plugin no registrado â†’ fallback con status="unknown"', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    registry.get.mockReturnValue(null);

    const result = await service.getInfoForUser('svc-1', 'user-1', false);

    expect(result.info.status).toBe('unknown');
    // Sprint 15C.II Fase B fix-up: statusReason del fallback ahora es i18n
    // key (frontend ServiceHeader aplica t(); compat retro vía fallback a la
    // key cruda si el translator no la tiene declarada).
    expect(result.info.statusReason).toBe(
      'service.status_reason.plugin_not_registered',
    );
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
    // Sprint 15C.II Fase C round 2: product_provisioner expone el plugin
    // del producto al frontend admin para mostrar el "effective slug"
    // cuando service.provisioner_slug es null (caso not_yet_provisioned).
    expect(result.service.product_provisioner).toBe('internal');
  });

  it('getInfoForUser: shortcircuit terminal — service.status=cancelled NO invoca al plugin', async () => {
    // Sprint 15C.II Fase C round 4 (smoke real Yasmin 2026-05-10): caso
    // canónico que reveló el bug de UI mostrando AlertBanner drift sobre
    // service ya cancelled. El shortcircuit retorna info.status='cancelled'
    // directamente con statusReason mapeado desde cancellation_reason.
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        status: 'cancelled',
        cancellation_reason: 'provisioning_failed:INVALID_PAYLOAD',
        cancelled_at: new Date('2026-05-10T15:48:38Z'),
      }),
    );
    const plugin = buildPlugin();
    registry.get.mockReturnValue(plugin);

    const result = await service.getInfoForUser('svc-1', 'user-1', false);

    // El plugin NO debe haberse invocado.
    expect(plugin.getServiceInfo).not.toHaveBeenCalled();
    // Shape correcto del shortcircuit canónico.
    expect(result.info.status).toBe('cancelled');
    expect(result.info.statusReason).toBe(
      'service.terminal.cancelled.reason.provisioning_failed',
    );
    expect(result.info.availableActions).toEqual([]);
    expect(result.info.capabilities.hasSsoPanel).toBe(false);
    // Cancellation fields propagados al frontend para banner explícito.
    expect(result.service.cancellation_reason).toBe(
      'provisioning_failed:INVALID_PAYLOAD',
    );
    expect(result.service.cancelled_at).toEqual(
      new Date('2026-05-10T15:48:38Z'),
    );
  });

  it('getInfoForUser: shortcircuit terminal — admin_action key cuando cancellation_reason no matchea provisioning_failed', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        status: 'cancelled',
        cancellation_reason: 'admin_request:cliente solicitó cancelación',
        cancelled_at: new Date(),
      }),
    );
    const plugin = buildPlugin();
    registry.get.mockReturnValue(plugin);

    const result = await service.getInfoForUser('svc-1', 'user-1', false);

    expect(plugin.getServiceInfo).not.toHaveBeenCalled();
    expect(result.info.statusReason).toBe(
      'service.terminal.cancelled.reason.admin_action',
    );
  });

  it('getInfoForUser: product_provisioner se expone aunque service.provisioner_slug sea null', async () => {
    // Caso canónico Sprint 15C.II Fase C round 2: smoke real Yasmin
    // detectó services con `provisioner_slug=null` pero plugin invocado
    // via fallback `service.product.provisioner`. La UI admin necesita
    // poder mostrar el plugin effective ("desde producto") en lugar de
    // "—" engañoso.
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        provisioner_slug: null,
        product: {
          id: 'prod-1',
          slug: 'hosting-pro',
          name: 'Hosting Pro',
          type: 'hosting_web',
          provisioner: 'enhance_cp',
          provisioner_config: null,
        },
      }),
    );
    registry.get.mockReturnValue(null); // plugin no registrado → fallback unknown

    const result = await service.getInfoForUser('svc-1', 'user-1', false);

    expect(result.service.provisioner_slug).toBeNull();
    expect(result.service.product_provisioner).toBe('enhance_cp');
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

  // â”€â”€â”€ getSsoForUser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('getSsoForUser: lanza ForbiddenException si user no es dueÃ±o', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());

    await expect(
      service.getSsoForUser('svc-1', 'other-user', false, {
        ipAddress: '1.2.3.4',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // â”€â”€â”€ executeActionForUser â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('executeActionForUser: lanza ForbiddenException si user no es dueÃ±o', async () => {
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

  // â”€â”€â”€ reprovisionAsAdmin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('reprovisionAsAdmin: reset status→provisioning + enqueue + audit logChange + audit logAccess', async () => {
    prisma.service.findUnique.mockResolvedValueOnce({
      id: 'svc-1',
      user_id: 'user-1',
      status: 'cancelled',
    });
    prisma.service.update.mockResolvedValueOnce({ id: 'svc-1' });

    const result = await service.reprovisionAsAdmin('svc-1', 'admin-id', {
      ipAddress: '1.2.3.4',
    });

    expect(result).toEqual({ enqueued: true });
    // Sprint 15C.II Fase C round 2: el reset canónico status→provisioning
    // antes del enqueue evita la guard idempotente del orquestador
    // (`provisioning-orchestrator.service.ts:151`) que skipea services
    // con status='active'. Sin esto, smoke real reveló que el botón
    // "Re-aprovisionar ahora" era no-op silencioso para drift
    // not_yet_provisioned con status canónico active.
    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { status: 'provisioning' },
    });
    // Sprint 15C.II Fase C round 3: invalidar cache `service_info:${id}`
    // tras reset status. El job corre async — sin invalidación, la UI
    // re-fetch (revalidatePath SC + auto-refresh frontend) seguiría
    // leyendo cached `not_yet_provisioned` mientras el worker
    // completa el provision real.
    expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
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

  it('reprovisionAsAdmin: reset funciona también cuando status=active (caso típico drift admin)', async () => {
    // Sprint 15C.II Fase C round 2: el caso canónico que motivó el fix
    // — service activo en Aelium pero no aprovisionado realmente en
    // Enhance (drift not_yet_provisioned). Antes el job se enqueueba
    // pero la guard idempotente del orquestador lo skipeaba silently.
    prisma.service.findUnique.mockResolvedValueOnce({
      id: 'svc-2',
      user_id: 'user-1',
      status: 'active',
    });
    prisma.service.update.mockResolvedValueOnce({ id: 'svc-2' });

    await service.reprovisionAsAdmin('svc-2', 'admin-id', {
      ipAddress: '1.2.3.4',
    });

    expect(prisma.service.update).toHaveBeenCalledWith({
      where: { id: 'svc-2' },
      data: { status: 'provisioning' },
    });
    expect(orchestrator.enqueueProvisioning).toHaveBeenCalledWith('svc-2');
  });

  it('reprovisionAsAdmin: NotFoundException si service no existe — NO toca status', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.reprovisionAsAdmin('svc-missing', 'admin-id', {
        ipAddress: '1.2.3.4',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(orchestrator.enqueueProvisioning).not.toHaveBeenCalled();
  });

  // â”€â”€â”€ deprovisionAsAdmin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      cancellation_reason: 'admin_override: cliente lo solicitÃ³',
    });

    const result = await service.deprovisionAsAdmin(
      'svc-1',
      {
        reason: DeprovisionReasonDto.admin_override,
        notes: 'cliente lo solicitÃ³',
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
        // Sprint 15C.II Fase E: notify_client default true (sin flag explícito).
        notify_client: true,
      }),
    );
    expect(audit.logChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service.deprovisioned_admin',
      }),
    );
  });

  it('deprovisionAsAdmin: notify_client=false → evento lleva notify_client=false (Sprint 15C.II Fase E)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce({
      id: 'svc-2',
      user_id: 'user-2',
      status: 'active',
      provisioner_slug: 'enhance_cp',
    });
    prisma.service.update.mockResolvedValueOnce({
      id: 'svc-2',
      status: 'cancelled',
      cancellation_reason: 'admin_override',
    });

    await service.deprovisionAsAdmin(
      'svc-2',
      { reason: DeprovisionReasonDto.admin_override, notify_client: false },
      'admin-id',
      { ipAddress: '1.2.3.4' },
    );

    expect(events.emit).toHaveBeenCalledWith(
      'service.cancelled',
      expect.objectContaining({ notify_client: false }),
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

  // ─── DNS records pipeline (Sprint 15C Fase 15C.D — ADR-082 §6) ─────────

  describe('DNS records — Sprint 15C Fase 15C.D', () => {
    function buildDnsPlugin(): ProvisionerPlugin {
      return buildPlugin({
        slug: 'enhance_cp',
        capabilities: {
          has_sso_panel: true,
          panel_label: 'plugin.enhance_cp.panel_label',
          has_metrics: true,
          has_metrics_history: false,
          requires_server: false,
          provision_mode: 'sync',
          completes_via_task: false,
          supports_reconciliation: true,
          has_dns_management: true,
        },
        inlineActions: [
          {
            slug: 'list_dns_records',
            label: 'list',
            confirmRequired: false,
            destructive: false,
          },
          {
            slug: 'add_dns_record',
            label: 'add',
            confirmRequired: false,
            destructive: false,
          },
          {
            slug: 'update_dns_record',
            label: 'update',
            confirmRequired: false,
            destructive: false,
          },
          {
            slug: 'delete_dns_record',
            label: 'delete',
            confirmRequired: true,
            destructive: true,
          },
        ],
        executeAction: jest.fn().mockResolvedValue({
          success: true,
          data: { records: [] },
        }),
      });
    }

    it('listDnsRecordsForUser → routea al plugin con has_dns_management=true', async () => {
      const dnsPlugin = buildDnsPlugin();
      registry.getByCapability.mockReturnValue(dnsPlugin);
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          product: {
            id: 'p',
            slug: 'hosting',
            name: 'Hosting',
            type: 'hosting_web',
            provisioner: 'enhance_cp',
            provisioner_config: null,
          },
        }),
      );

      const { resolution, result } = await service.listDnsRecordsForUser(
        'svc-1',
        'user-1',
        false,
        { ipAddress: '1.2.3.4' },
      );

      expect(registry.getByCapability).toHaveBeenCalledWith(
        'has_dns_management',
      );
      expect(resolution.authority).toBe('aelium');
      expect(resolution.plugin).toBe(dnsPlugin);
      expect(dnsPlugin.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'list_dns_records',
        {},
      );
      expect(result.success).toBe(true);
    });

    it('addDnsRecordForUser → invoca plugin.executeAction(add_dns_record, payload)', async () => {
      const dnsPlugin = buildDnsPlugin();
      registry.getByCapability.mockReturnValue(dnsPlugin);
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          product: {
            id: 'p',
            slug: 'hosting',
            name: 'Hosting',
            type: 'hosting_web',
            provisioner: 'enhance_cp',
            provisioner_config: null,
          },
        }),
      );

      const payload = {
        kind: 'A',
        name: 'www',
        value: '1.2.3.4',
        ttl: 3600,
      };
      await service.addDnsRecordForUser('svc-1', payload, 'user-1', false, {
        ipAddress: '1.2.3.4',
      });

      expect(dnsPlugin.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'add_dns_record',
        payload,
      );
    });

    it('updateDnsRecordForUser → injecta recordId al payload', async () => {
      const dnsPlugin = buildDnsPlugin();
      registry.getByCapability.mockReturnValue(dnsPlugin);
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          product: {
            id: 'p',
            slug: 'hosting',
            name: 'Hosting',
            type: 'hosting_web',
            provisioner: 'enhance_cp',
            provisioner_config: null,
          },
        }),
      );

      await service.updateDnsRecordForUser(
        'svc-1',
        'rec-9',
        { ttl: 7200 },
        'user-1',
        false,
        { ipAddress: '1.2.3.4' },
      );

      expect(dnsPlugin.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'update_dns_record',
        expect.objectContaining({ recordId: 'rec-9', ttl: 7200 }),
      );
    });

    it('deleteDnsRecordForUser → pasa recordId al plugin', async () => {
      const dnsPlugin = buildDnsPlugin();
      registry.getByCapability.mockReturnValue(dnsPlugin);
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          product: {
            id: 'p',
            slug: 'hosting',
            name: 'Hosting',
            type: 'hosting_web',
            provisioner: 'enhance_cp',
            provisioner_config: null,
          },
        }),
      );

      await service.deleteDnsRecordForUser('svc-1', 'rec-9', 'user-1', false, {
        ipAddress: '1.2.3.4',
      });

      expect(dnsPlugin.executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'delete_dns_record',
        { recordId: 'rec-9' },
      );
    });

    it('cliente que no es dueño del service → 403', async () => {
      const dnsPlugin = buildDnsPlugin();
      registry.getByCapability.mockReturnValue(dnsPlugin);
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          user_id: 'OTRO-USER',
          product: {
            id: 'p',
            slug: 'hosting',
            name: 'Hosting',
            type: 'hosting_web',
            provisioner: 'enhance_cp',
            provisioner_config: null,
          },
        }),
      );

      await expect(
        service.listDnsRecordsForUser('svc-1', 'user-1', false, {
          ipAddress: '1.2.3.4',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(dnsPlugin.executeAction).not.toHaveBeenCalled();
    });

    it('product type domain con NS externos → DnsExternallyManagedError', async () => {
      const dnsPlugin = buildDnsPlugin();
      registry.getByCapability.mockReturnValue(dnsPlugin);
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          metadata: {
            nameservers: ['ns1.cloudflare.com', 'ns2.cloudflare.com'],
          },
          product: {
            id: 'p',
            slug: 'domain-com',
            name: 'Dominio',
            type: 'domain',
            provisioner: 'resellerclub',
            provisioner_config: null,
          },
        }),
      );

      await expect(
        service.listDnsRecordsForUser('svc-1', 'user-1', false, {
          ipAddress: '1.2.3.4',
        }),
      ).rejects.toMatchObject({
        name: 'DnsExternallyManagedError',
        resolution: expect.objectContaining({
          authority: 'external',
          reason: 'domain_nameservers_external',
        }),
      });
      expect(dnsPlugin.executeAction).not.toHaveBeenCalled();
    });
  });
});
