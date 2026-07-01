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

import {
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  ActionResult,
  EMPTY_PLUGIN_SCHEMA,
  PluginManifest,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
  ProvisionerPlugin,
  ProvisionerPluginError,
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

import {
  DeprovisionReasonDto,
  SuspensionReasonDto,
} from './dto/provisioning.dto';
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
    // F4·U24 (feature C): lookup de cobertura Support Inside en getInfoForUser.
    supportInsideSlot: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let registry: jest.Mocked<PluginRegistryService>;
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
    invalidate: jest.Mock;
    tryAcquireRefreshCooldown: jest.Mock;
    // Sprint 15C.II F.9 — cooldown + cache per-servicio (commit feat 6).
    tryAcquireReconcileSingleCooldown: jest.Mock;
    cacheServiceReconcileResult: jest.Mock;
    getCachedServiceReconcileResult: jest.Mock;
  };
  let events: { emit: jest.Mock };
  // R8 (GL-17): las transiciones de lifecycle persisten su evento vía Outbox.
  let outbox: { enqueue: jest.Mock };
  let audit: {
    logAccess: jest.Mock;
    logChange: jest.Mock;
    getServiceTimeline: jest.Mock;
  };
  let settings: { getNumber: jest.Mock; getJson: jest.Mock };
  let orchestrator: {
    enqueueProvisioning: jest.Mock;
    emitDomainManagementEvent: jest.Mock;
  };
  // Sprint 15C.II F.6: ClientNotesService mockeado a nivel de describe para
  // que los tests puedan verificar `clientNotes.createFromServiceLifecycleAction`.
  let clientNotes: { createFromServiceLifecycleAction: jest.Mock };
  // Sprint 15C.II F.9 — registry per-servicio (commit feat 7).
  let reconcileRegistry: {
    reconcileOne: jest.Mock;
    registerReconcileOne: jest.Mock;
    register: jest.Mock;
    runFor: jest.Mock;
    hasExecutor: jest.Mock;
    hasReconcileOneExecutor: jest.Mock;
    getScheduleMeta: jest.Mock;
    listRegisteredSlugs: jest.Mock;
  };
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
        supports_suspend: false, // ADR-077 Amendment A4
        is_domain_registrar: false, // ADR-077 Amendment A10
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
          supports_suspend: false, // ADR-077 Amendment A4
          is_domain_registrar: false, // ADR-077 Amendment A10
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
      // F4·U24 (feature C): por defecto sin cobertura SI (findFirst → null).
      // Los tests de cobertura lo sobreescriben con un slot activo.
      supportInsideSlot: { findFirst: jest.fn().mockResolvedValue(null) },
      // Sprint 15C.II F.6 — `$transaction` soporta ambas formas: array
      // (`[$promise1, $promise2]`) y callback (`(tx) => ...`). El refactor
      // F.6 R3 de `suspend/unsuspend/deprovisionAsAdmin` usa la callback
      // form para encajar `service.update` + `clientNote.create` en un
      // solo commit; `tx === prisma` en el mock para que `tx.service.update`
      // siga apuntando al mismo `jest.fn()`.
      $transaction: jest.fn().mockImplementation(async (input: unknown) => {
        if (Array.isArray(input)) {
          return Promise.all(input.map((p) => p as Promise<unknown>));
        }
        if (typeof input === 'function') {
          return (input as (tx: typeof prisma) => Promise<unknown>)(prisma);
        }
        throw new Error('Unexpected $transaction input');
      }),
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
      // Sprint 15C.II Fase F.3 (B.1): por defecto la ventana se adquiere
      // (camino común — primer force-refresh tras el cooldown).
      tryAcquireRefreshCooldown: jest.fn().mockResolvedValue(true),
      // Sprint 15C.II Fase F.9 (R6): cooldown + cache per-servicio.
      // Por defecto la ventana se adquiere (camino común — primer reconcile).
      tryAcquireReconcileSingleCooldown: jest.fn().mockResolvedValue(true),
      cacheServiceReconcileResult: jest.fn().mockResolvedValue(undefined),
      getCachedServiceReconcileResult: jest.fn().mockResolvedValue(null),
    };
    events = { emit: jest.fn() };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    audit = {
      logAccess: jest.fn().mockResolvedValue(undefined),
      logChange: jest.fn().mockResolvedValue(undefined),
      getServiceTimeline: jest
        .fn()
        .mockResolvedValue({ items: [], next_cursor: null }),
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
      emitDomainManagementEvent: jest.fn().mockResolvedValue(undefined),
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

    // Sprint 15C.II F.6 — `ClientNotesService` mockeado. El servicio real
    // se testa en `client-notes.service.spec.ts`; aquí solo verificamos que
    // las transiciones admin lo invocan con los argumentos correctos.
    clientNotes = {
      createFromServiceLifecycleAction: jest
        .fn()
        .mockResolvedValue({ id: 'note-mock' }),
    };

    // Sprint 15C.II F.9 — `ReconcileRegistryService` mockeado. Los tests del
    // registry viven en `reconcile-registry.service.spec.ts`. Tests de
    // `reconcileServiceAsAdmin` overridean este mock con per-test behavior.
    reconcileRegistry = {
      reconcileOne: jest.fn(),
      registerReconcileOne: jest.fn(),
      register: jest.fn(),
      runFor: jest.fn(),
      hasExecutor: jest.fn().mockReturnValue(false),
      hasReconcileOneExecutor: jest.fn().mockReturnValue(false),
      getScheduleMeta: jest.fn().mockReturnValue(null),
      listRegisteredSlugs: jest.fn().mockReturnValue([]),
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
      clientNotes as never,
      reconcileRegistry as never,
      outbox as never,
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

  // ─── F4·U24 (feature C): badge de cobertura Support Inside ───────────────

  it('getInfoForUser (admin): servicio técnico cubierto → expone si_coverage_slot_type con UNA query indexada (SI-INV-8)', async () => {
    // Servicio técnico (hosting), no la propia suscripción SI.
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        product: {
          id: 'prod-hosting',
          slug: 'hosting-pro',
          name: 'Hosting Pro',
          type: 'hosting_web',
          provisioner: 'internal',
          provisioner_config: null,
        },
      }),
    );
    registry.get.mockReturnValue(null); // fallback: el summary igual se construye
    prisma.supportInsideSlot.findFirst.mockResolvedValueOnce({
      slot_type: 'maintenance_management',
    });

    const result = await service.getInfoForUser('svc-1', 'admin-1', true);

    expect(result.service.si_coverage_slot_type).toBe('maintenance_management');
    // PRESENCIA del slot activo, NUNCA por slug (R4) — una sola query indexada.
    expect(prisma.supportInsideSlot.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.supportInsideSlot.findFirst).toHaveBeenCalledWith({
      where: { service_id: 'svc-1', released_at: null },
      select: { slot_type: true },
    });
  });

  it('getInfoForUser (admin): servicio técnico sin slot activo → si_coverage_slot_type null', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        product: {
          id: 'prod-hosting',
          slug: 'hosting-pro',
          name: 'Hosting Pro',
          type: 'hosting_web',
          provisioner: 'internal',
          provisioner_config: null,
        },
      }),
    );
    registry.get.mockReturnValue(null);
    // findFirst → null por defecto (sin slot).

    const result = await service.getInfoForUser('svc-1', 'admin-1', true);

    expect(result.service.si_coverage_slot_type).toBeNull();
  });

  it('getInfoForUser (cliente): NO consulta cobertura SI (gating isAdmin) → null', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        product: {
          id: 'prod-hosting',
          slug: 'hosting-pro',
          name: 'Hosting Pro',
          type: 'hosting_web',
          provisioner: 'internal',
          provisioner_config: null,
        },
      }),
    );
    registry.get.mockReturnValue(null);

    const result = await service.getInfoForUser('svc-1', 'user-1', false);

    expect(result.service.si_coverage_slot_type).toBeNull();
    expect(prisma.supportInsideSlot.findFirst).not.toHaveBeenCalled();
  });

  it('getInfoForUser (admin): la propia suscripción SI no se cubre a sí misma → sin query, null', async () => {
    // buildServiceRow por defecto es un producto `support_inside`.
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    registry.get.mockReturnValue(null);

    const result = await service.getInfoForUser('svc-1', 'admin-1', true);

    expect(result.service.si_coverage_slot_type).toBeNull();
    expect(prisma.supportInsideSlot.findFirst).not.toHaveBeenCalled();
  });

  // Sprint 15C.II Fase F.3 (GAP-15CII-G4) — TTL del cache service_info.
  it('getInfoForUser: el TTL del cache viene del manifest si lo declara', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    registry.get.mockReturnValue(
      buildPlugin({
        manifest: { ...TEST_MANIFEST, serviceInfoCacheTtlSeconds: 10 },
      }),
    );
    cache.get.mockResolvedValue(null); // miss → fetch + set

    await service.getInfoForUser('svc-1', 'user-1', false);

    expect(cache.set).toHaveBeenCalledWith('svc-1', expect.anything(), 10);
  });

  it('getInfoForUser: TTL del manifest < 5 → sanity floor 5s', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    registry.get.mockReturnValue(
      buildPlugin({
        manifest: { ...TEST_MANIFEST, serviceInfoCacheTtlSeconds: 2 },
      }),
    );
    cache.get.mockResolvedValue(null);

    await service.getInfoForUser('svc-1', 'user-1', false);

    expect(cache.set).toHaveBeenCalledWith('svc-1', expect.anything(), 5);
  });

  it('getInfoForUser: sin TTL en manifest → usa el setting global (60s)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    registry.get.mockReturnValue(buildPlugin());
    cache.get.mockResolvedValue(null);

    await service.getInfoForUser('svc-1', 'user-1', false);

    expect(cache.set).toHaveBeenCalledWith('svc-1', expect.anything(), 60);
  });

  // Sprint 15C.II Fase F.3 (B.1) — cooldown server-side del force-refresh.
  it('getInfoForUser: forceRevalidate con ventana adquirida → re-fetch fresco (salta el cache)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    const plugin = buildPlugin();
    registry.get.mockReturnValue(plugin);

    await service.getInfoForUser('svc-1', 'user-1', false, {
      forceRevalidate: true,
    });

    // 15 = REFRESH_COOLDOWN_SECONDS.
    expect(cache.tryAcquireRefreshCooldown).toHaveBeenCalledWith('svc-1', 15);
    // forceRevalidate llega al wrapper como true → NO consulta el cache, re-fetch.
    expect(cache.get).not.toHaveBeenCalled();
    expect(plugin.getServiceInfo).toHaveBeenCalled();
  });

  it('getInfoForUser: forceRevalidate dentro de la ventana → degrada a lectura cacheada (coalescing, sin error)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    const plugin = buildPlugin();
    registry.get.mockReturnValue(plugin);
    // ventana ya activa → el caller debe servir el valor cacheado.
    cache.tryAcquireRefreshCooldown.mockResolvedValueOnce(false);
    cache.get.mockResolvedValueOnce({
      status: 'active',
      display: { primary: 'desde-cache', secondary: 'Plan Pro' },
      availableActions: [],
      fetchedAt: new Date().toISOString(),
    });

    const result = await service.getInfoForUser('svc-1', 'user-1', false, {
      forceRevalidate: true,
    });

    // coalescing: NO se consulta al proveedor; se devuelve el valor cacheado.
    expect(plugin.getServiceInfo).not.toHaveBeenCalled();
    expect(result.info.display.primary).toBe('desde-cache');
  });

  it('getInfoForUser: GET normal (sin forceRevalidate) NO consume el cooldown', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    registry.get.mockReturnValue(buildPlugin());

    await service.getInfoForUser('svc-1', 'user-1', false);

    expect(cache.tryAcquireRefreshCooldown).not.toHaveBeenCalled();
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

  // Sprint 15D Fase 15D.F.1 — emisión `domain.*_changed` vía Outbox (R8, ADR-084 §5).

  function buildRegistrarPlugin(
    actionResult: ActionResult,
    actionSlug = 'modify_nameservers',
  ): ProvisionerPlugin {
    return buildPlugin({
      slug: 'resellerclub',
      capabilities: {
        has_sso_panel: false,
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: false,
        supports_reconciliation: true,
        has_dns_management: false,
        supports_suspend: true,
        is_domain_registrar: true,
      },
      inlineActions: [
        {
          slug: actionSlug,
          label: 'x',
          confirmRequired: false,
          destructive: false,
        },
      ],
      executeAction: jest.fn().mockResolvedValue(actionResult),
    });
  }

  it('executeActionForUser: registrar + action de gestión OK → emite domain.*_changed (Outbox)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        provisioner_slug: 'resellerclub',
        provider_reference: '700123',
        domain: 'example.com',
      }),
    );
    registry.getOrThrow.mockReturnValue(
      buildRegistrarPlugin({
        success: true,
        data: { nameservers: ['a', 'b'] },
      }),
    );

    const res = await service.executeActionForUser(
      'svc-1',
      'modify_nameservers',
      { nameservers: ['a', 'b'] },
      'user-1',
      false,
      { ipAddress: '1.2.3.4' },
    );

    expect(res.success).toBe(true);
    expect(orchestrator.emitDomainManagementEvent).toHaveBeenCalledWith(
      'domain.nameservers_changed',
      {
        service_id: 'svc-1',
        user_id: 'user-1',
        fqdn: 'example.com',
        actor_user_id: 'user-1',
        correlation_id: null,
      },
    );
  });

  it('executeActionForUser: toggle_privacy OK → emite domain.privacy_changed', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        provisioner_slug: 'resellerclub',
        provider_reference: '700123',
        domain: 'example.com',
      }),
    );
    registry.getOrThrow.mockReturnValue(
      buildRegistrarPlugin(
        { success: true, data: { whoisPrivacy: false } },
        'toggle_privacy',
      ),
    );

    await service.executeActionForUser(
      'svc-1',
      'toggle_privacy',
      { enabled: false },
      'user-1',
      false,
      { ipAddress: '1.2.3.4' },
    );

    expect(orchestrator.emitDomainManagementEvent).toHaveBeenCalledWith(
      'domain.privacy_changed',
      expect.objectContaining({ service_id: 'svc-1', fqdn: 'example.com' }),
    );
  });

  it('executeActionForUser: action de gestión que FALLA → NO emite evento', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        provisioner_slug: 'resellerclub',
        provider_reference: '700123',
        domain: 'example.com',
      }),
    );
    registry.getOrThrow.mockReturnValue(
      buildRegistrarPlugin({
        success: false,
        message: 'action.provider_error',
      }),
    );

    await service.executeActionForUser(
      'svc-1',
      'modify_nameservers',
      { nameservers: ['a', 'b'] },
      'user-1',
      false,
      { ipAddress: '1.2.3.4' },
    );

    expect(orchestrator.emitDomainManagementEvent).not.toHaveBeenCalled();
  });

  it('executeActionForUser: plugin NO registrar → NO emite (gated por capability, R4)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
    registry.getOrThrow.mockReturnValue(
      buildPlugin({
        inlineActions: [
          {
            slug: 'modify_nameservers',
            label: 'x',
            confirmRequired: false,
            destructive: false,
          },
        ],
        executeAction: jest.fn().mockResolvedValue({ success: true }),
      }),
    );

    await service.executeActionForUser(
      'svc-1',
      'modify_nameservers',
      { nameservers: ['a', 'b'] },
      'user-1',
      false,
      { ipAddress: '1.2.3.4' },
    );

    expect(orchestrator.emitDomainManagementEvent).not.toHaveBeenCalled();
  });

  it('executeActionForUser: fallo al emitir el evento NO hace fallar la acción exitosa (R7)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        provisioner_slug: 'resellerclub',
        provider_reference: '700123',
        domain: 'example.com',
      }),
    );
    registry.getOrThrow.mockReturnValue(
      buildRegistrarPlugin({
        success: true,
        data: { nameservers: ['a', 'b'] },
      }),
    );
    // La acción YA tuvo efecto en RC + audit; el Outbox cae al emitir el evento.
    orchestrator.emitDomainManagementEvent.mockRejectedValueOnce(
      new Error('outbox down'),
    );
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const res = await service.executeActionForUser(
      'svc-1',
      'modify_nameservers',
      { nameservers: ['a', 'b'] },
      'user-1',
      false,
      { ipAddress: '1.2.3.4' },
    );

    // La acción NO falla (refleja el efecto en el registrar, no la durabilidad
    // de la notificación); el fallo de emisión se loguea.
    expect(res.success).toBe(true);
    expect(orchestrator.emitDomainManagementEvent).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
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

  it('deprovisionAsAdmin: status=cancelled + emit service.cancelled + audit + plugin.deprovision (GL-2)', async () => {
    const deprovisionSpy = jest.fn().mockResolvedValue(undefined);
    registry.get.mockReturnValue(
      buildPlugin({ slug: 'manual', deprovision: deprovisionSpy }),
    );
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        id: 'svc-1',
        status: 'active',
        provisioner_slug: 'manual',
      }),
    );
    prisma.service.update.mockResolvedValueOnce({
      id: 'svc-1',
      status: 'cancelled',
      cancellation_reason: 'admin_override: cliente lo solicito',
    });

    const result = await service.deprovisionAsAdmin(
      'svc-1',
      {
        reason: DeprovisionReasonDto.admin_override,
        notes: 'cliente lo solicito',
      },
      'admin-id',
      { ipAddress: '1.2.3.4' },
    );

    expect(result.status).toBe('cancelled');
    expect(result.cancellation_reason).toContain('admin_override');
    // audit GL-2: el recurso se destruye en el proveedor (cierra DC.46).
    expect(deprovisionSpy).toHaveBeenCalledTimes(1);
    // R8 (GL-17): el evento se persiste vía Outbox dentro de la tx (antes emit).
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
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
    registry.get.mockReturnValue(
      buildPlugin({
        slug: 'enhance_cp',
        deprovision: jest.fn().mockResolvedValue(undefined),
      }),
    );
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        id: 'svc-2',
        user_id: 'user-2',
        status: 'active',
        provisioner_slug: 'enhance_cp',
      }),
    );
    prisma.service.update.mockResolvedValueOnce({
      id: 'svc-2',
      status: 'cancelled',
      cancellation_reason: 'admin_override',
    });

    await service.deprovisionAsAdmin(
      'svc-2',
      {
        reason: DeprovisionReasonDto.admin_override,
        // Sprint 15C.II F.6 — R2: nota obligatoria para acciones admin.
        notes: 'cuenta de test',
        notify_client: false,
      },
      'admin-id',
      { ipAddress: '1.2.3.4' },
    );

    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      'service.cancelled',
      expect.objectContaining({ notify_client: false }),
    );
  });

  it('deprovisionAsAdmin: si plugin.deprovision falla, la cancelación NO se revierte (fail-soft, GL-2)', async () => {
    registry.get.mockReturnValue(
      buildPlugin({
        slug: 'enhance_cp',
        deprovision: jest.fn().mockRejectedValue(new Error('provider down')),
      }),
    );
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        id: 'svc-3',
        status: 'active',
        provisioner_slug: 'enhance_cp',
      }),
    );
    prisma.service.update.mockResolvedValueOnce({
      id: 'svc-3',
      status: 'cancelled',
      cancellation_reason: 'cancelled',
    });

    const result = await service.deprovisionAsAdmin(
      'svc-3',
      { reason: DeprovisionReasonDto.cancelled, notes: 'baja' },
      'admin-id',
      { ipAddress: '1.2.3.4' },
    );

    expect(result.status).toBe('cancelled');
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      'service.cancelled',
      expect.objectContaining({ service_id: 'svc-3' }),
    );
  });

  it('deprovisionAsAdmin: actor sistema (actorUserId=null) no exige nota y audita con actor label (GL-2 cron)', async () => {
    const deprovisionSpy = jest.fn().mockResolvedValue(undefined);
    registry.get.mockReturnValue(
      buildPlugin({ slug: 'enhance_cp', deprovision: deprovisionSpy }),
    );
    prisma.service.findUnique.mockResolvedValueOnce(
      buildServiceRow({
        id: 'svc-4',
        status: 'active',
        provisioner_slug: 'enhance_cp',
      }),
    );
    prisma.service.update.mockResolvedValueOnce({
      id: 'svc-4',
      status: 'cancelled',
      cancellation_reason: 'cancelled',
    });

    await service.deprovisionAsAdmin(
      'svc-4',
      { reason: DeprovisionReasonDto.cancelled, notes: 'auto' },
      null,
      undefined,
      { actorLabel: 'system:billing-cancellation-cron' },
    );

    expect(deprovisionSpy).toHaveBeenCalledTimes(1);
    expect(audit.logChange).toHaveBeenCalledWith(
      expect.objectContaining({
        changes_after: expect.objectContaining({
          actor: 'system:billing-cancellation-cron',
        }),
      }),
    );
    // R8 (GL-17): el spread condicional del actor sistema también viaja en el
    // payload Outbox de service.cancelled (simetría con suspend/unsuspend).
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      'service.cancelled',
      expect.objectContaining({
        service_id: 'svc-4',
        actor_user_id: null,
        actor: 'system:billing-cancellation-cron',
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

  // ─── suspendAsAdmin / unsuspendAsAdmin — Sprint 15C.II Fase F (ADR-077 A4) ───

  describe('suspendAsAdmin / unsuspendAsAdmin', () => {
    /** Plugin con `supports_suspend=true` + las 2 inline actions canónicas. */
    function buildSuspendablePlugin(
      executeAction: jest.Mock = jest
        .fn()
        .mockResolvedValue({ success: true, data: { suspended: true } }),
    ): ProvisionerPlugin {
      return buildPlugin({
        slug: 'enhance_cp',
        capabilities: {
          has_sso_panel: false,
          has_metrics: false,
          has_metrics_history: false,
          requires_server: false,
          provision_mode: 'sync',
          completes_via_task: false,
          supports_reconciliation: true,
          has_dns_management: false,
          supports_suspend: true,
          is_domain_registrar: false, // ADR-077 Amendment A10
        },
        inlineActions: [
          {
            slug: 'suspend_service',
            label: 'plugin.x.suspend',
            confirmRequired: true,
            destructive: true,
            adminOnly: true,
          },
          {
            slug: 'unsuspend_service',
            label: 'plugin.x.unsuspend',
            confirmRequired: true,
            destructive: false,
            adminOnly: true,
          },
        ],
        executeAction: executeAction as never,
      });
    }

    it('suspendAsAdmin: active → suspended, invoca plugin executeAction(suspend_service), emite service.suspended + audit', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'active', provisioner_slug: 'enhance_cp' }),
      );
      const executeAction = jest.fn().mockResolvedValue({
        success: true,
        message: 'plugin.enhance_cp.actions.suspend_service.success',
        data: { suspended: true },
      });
      registry.get.mockReturnValue(buildSuspendablePlugin(executeAction));
      prisma.service.update.mockResolvedValueOnce({
        id: 'svc-1',
        status: 'suspended',
        suspension_reason: 'overdue_payment: 3 avisos sin respuesta',
        suspended_at: new Date('2026-05-11T10:00:00Z'),
      });

      const result = await service.suspendAsAdmin(
        'svc-1',
        {
          reason: SuspensionReasonDto.overdue_payment,
          internal_note: '3 avisos sin respuesta',
          notify_client: true,
        },
        'admin-id',
        { ipAddress: '1.2.3.4', userAgent: 'jest' },
      );

      expect(executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'suspend_service',
        { reason: 'overdue_payment' },
      );
      // Sprint 15C.II F.6.2: `suspension_reason` guarda solo el enum.
      // La narrativa libre (`internal_note`) vive en `ClientNote.body`.
      expect(prisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'svc-1' },
          data: expect.objectContaining({
            status: 'suspended',
            suspension_reason: 'overdue_payment',
          }),
        }),
      );
      // Sprint 15C.II F.6: el orquestador crea el `ClientNote` en la misma
      // tx con `triggered_by_action='service.suspended'` y body con la nota.
      expect(clientNotes.createFromServiceLifecycleAction).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          author_id: 'admin-id',
          service_id: 'svc-1',
          triggered_by_action: 'service.suspended',
          body: '3 avisos sin respuesta',
        }),
        prisma, // tx === prisma en el mock $transaction
      );
      expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
      // R8 (GL-17): el evento se persiste vía Outbox dentro de la tx (antes emit).
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        'service.suspended',
        expect.objectContaining({
          service_id: 'svc-1',
          reason: 'overdue_payment',
          actor_user_id: 'admin-id',
          notify_client: true,
        }),
      );
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service.suspended',
          changes_after: expect.objectContaining({
            status: 'suspended',
            reason_code: 'overdue_payment',
            internal_note: '3 avisos sin respuesta',
          }),
        }),
      );
      expect(result.status).toBe('suspended');
    });

    it('suspendAsAdmin: ya suspended → no-op idempotente (alreadySuspended), sin plugin call ni evento', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'enhance_cp',
          suspension_reason: 'overdue_payment',
          suspended_at: new Date('2026-05-10T00:00:00Z'),
        }),
      );
      const executeAction = jest.fn();
      registry.get.mockReturnValue(buildSuspendablePlugin(executeAction));

      const result = await service.suspendAsAdmin(
        'svc-1',
        { reason: SuspensionReasonDto.abuse_investigation },
        'admin-id',
        { ipAddress: '1.2.3.4' },
      );

      expect(result.alreadySuspended).toBe(true);
      expect(result.status).toBe('suspended');
      expect(executeAction).not.toHaveBeenCalled();
      expect(prisma.service.update).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('suspendAsAdmin: estado no-active (pending) → ConflictException', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'pending', provisioner_slug: 'enhance_cp' }),
      );
      registry.get.mockReturnValue(buildSuspendablePlugin());

      await expect(
        service.suspendAsAdmin(
          'svc-1',
          { reason: SuspensionReasonDto.scheduled_maintenance },
          'admin-id',
          { ipAddress: '1.2.3.4' },
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it('suspendAsAdmin: plugin sin supports_suspend → ConflictException SUSPEND_NOT_SUPPORTED', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'active', provisioner_slug: 'internal' }),
      );
      // buildPlugin() por defecto: supports_suspend=false.
      registry.get.mockReturnValue(buildPlugin());

      await expect(
        service.suspendAsAdmin(
          'svc-1',
          {
            reason: SuspensionReasonDto.other,
            // Sprint 15C.II F.6 — R2: nota obligatoria. El guard de plugin
            // (SUSPEND_NOT_SUPPORTED) corre después, y este es el path que
            // este test ejercita.
            internal_note: 'probando plugin sin supports_suspend',
          },
          'admin-id',
          { ipAddress: '1.2.3.4' },
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it('unsuspendAsAdmin: suspended → active, invoca plugin executeAction(unsuspend_service), emite service.unsuspended + audit', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'enhance_cp',
          suspension_reason: 'overdue_payment: nota interna',
          suspended_at: new Date('2026-05-10T00:00:00Z'),
        }),
      );
      const executeAction = jest
        .fn()
        .mockResolvedValue({ success: true, data: { suspended: false } });
      registry.get.mockReturnValue(buildSuspendablePlugin(executeAction));
      prisma.service.update.mockResolvedValueOnce({
        id: 'svc-1',
        status: 'active',
      });

      const result = await service.unsuspendAsAdmin(
        'svc-1',
        { internal_note: 'cliente regularizó pago en banco' },
        'admin-id',
        { ipAddress: '1.2.3.4' },
      );

      expect(executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'unsuspend_service',
        {},
      );
      expect(prisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'svc-1' },
          data: {
            status: 'active',
            suspended_at: null,
            suspension_reason: null,
          },
        }),
      );
      expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
      // R8 (GL-17): el evento se persiste vía Outbox dentro de la tx (antes emit).
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        'service.unsuspended',
        expect.objectContaining({
          service_id: 'svc-1',
          actor_user_id: 'admin-id',
          previous_suspension_reason: 'overdue_payment: nota interna',
        }),
      );
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'service.unsuspended' }),
      );
      expect(result.status).toBe('active');
    });

    it('unsuspendAsAdmin: ya active → no-op idempotente (alreadyActive), sin plugin call', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'active', provisioner_slug: 'enhance_cp' }),
      );
      const executeAction = jest.fn();
      registry.get.mockReturnValue(buildSuspendablePlugin(executeAction));

      const result = await service.unsuspendAsAdmin(
        'svc-1',
        { internal_note: 'reactivación manual de prueba' },
        'admin-id',
        { ipAddress: '1.2.3.4' },
      );

      expect(result.alreadyActive).toBe(true);
      expect(executeAction).not.toHaveBeenCalled();
      expect(prisma.service.update).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
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
          supports_suspend: false, // ADR-077 Amendment A4
          is_domain_registrar: false, // ADR-077 Amendment A10
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

  // ─── getServiceTimelineForUser — Sprint 15C.II Fase F.3 (GAP-15CII-M) ───

  describe('getServiceTimelineForUser', () => {
    it('NotFoundException si el servicio no existe', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.getServiceTimelineForUser('svc-x', 'user-1', false, {}),
      ).rejects.toThrow(NotFoundException);
      expect(audit.getServiceTimeline).not.toHaveBeenCalled();
    });

    it('ForbiddenException si cliente accede a servicio ajeno', async () => {
      prisma.service.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        user_id: 'owner-1',
      });
      await expect(
        service.getServiceTimelineForUser('svc-1', 'other-user', false, {}),
      ).rejects.toThrow(ForbiddenException);
      expect(audit.getServiceTimeline).not.toHaveBeenCalled();
    });

    it('dueño: delega a audit.getServiceTimeline con isAdmin=false', async () => {
      prisma.service.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        user_id: 'user-1',
      });
      const page = await service.getServiceTimelineForUser(
        'svc-1',
        'user-1',
        false,
        { cursor: 'c1', limit: 10 },
      );
      expect(page).toEqual({ items: [], next_cursor: null });
      expect(audit.getServiceTimeline).toHaveBeenCalledWith('svc-1', {
        isAdmin: false,
        cursor: 'c1',
        limit: 10,
      });
    });

    it('admin: ignora ownership (servicio ajeno) y delega con isAdmin=true', async () => {
      prisma.service.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        user_id: 'owner-1',
      });
      await service.getServiceTimelineForUser('svc-1', 'admin-1', true, {});
      expect(audit.getServiceTimeline).toHaveBeenCalledWith('svc-1', {
        isAdmin: true,
        cursor: null,
        limit: undefined,
      });
    });
  });

  // ─── Fase F.4 — robustez del status de suspensión ────────────────────────
  describe('Fase F.4 — reconciliación del status administrativo + resync', () => {
    const SUSPEND_ACTION = {
      slug: 'suspend_service',
      label: 'plugin.x.suspend',
      confirmRequired: true,
      destructive: true,
      adminOnly: true,
    } as const;
    const UNSUSPEND_ACTION = {
      slug: 'unsuspend_service',
      label: 'plugin.x.unsuspend',
      confirmRequired: true,
      destructive: false,
      adminOnly: true,
    } as const;

    /**
     * Plugin con `supports_suspend=true`, las 2 inline actions canónicas, y un
     * `getServiceInfo` que reporta `providerStatus` (lo que el proveedor "ve").
     */
    function buildSuspendablePlugin(
      providerStatus:
        | 'active'
        | 'suspended'
        | 'cancelled'
        | 'unknown' = 'active',
      executeAction: jest.Mock = jest
        .fn()
        .mockResolvedValue({ success: true, data: {} }),
    ): ProvisionerPlugin {
      return buildPlugin({
        slug: 'enhance_cp',
        capabilities: {
          has_sso_panel: false,
          has_metrics: false,
          has_metrics_history: false,
          requires_server: false,
          provision_mode: 'sync',
          completes_via_task: false,
          supports_reconciliation: true,
          has_dns_management: false,
          supports_suspend: true,
          is_domain_registrar: false, // ADR-077 Amendment A10
        },
        inlineActions: [SUSPEND_ACTION, UNSUSPEND_ACTION],
        getServiceInfo: jest.fn().mockResolvedValue({
          status: providerStatus,
          display: { primary: 'mi-web.com', secondary: 'Plan Pro' },
          capabilities: {
            has_sso_panel: false,
            has_metrics: false,
            has_metrics_history: false,
            requires_server: false,
            provision_mode: 'sync',
            completes_via_task: false,
            supports_reconciliation: true,
            has_dns_management: false,
            supports_suspend: true,
            is_domain_registrar: false, // ADR-077 Amendment A10
            hasSsoPanel: false,
            inlineActions:
              providerStatus === 'suspended' ? [UNSUSPEND_ACTION] : [],
          },
          availableActions:
            providerStatus === 'active'
              ? [SUSPEND_ACTION]
              : providerStatus === 'suspended'
                ? [UNSUSPEND_ACTION]
                : [],
          fetchedAt: new Date().toISOString(),
        }) as never,
        executeAction: executeAction as never,
      });
    }

    // ── F.4.1 — getInfoForUser ──────────────────────────────────────────
    it('getInfoForUser: BD suspended + proveedor active → override status=suspended, availableActions=[unsuspend_service], provider_state_desync=true', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'enhance_cp',
          suspension_reason: 'overdue_payment: nota interna',
          suspended_at: new Date('2026-05-11T00:00:00Z'),
        }),
      );
      registry.get.mockReturnValue(buildSuspendablePlugin('active'));

      const result = await service.getInfoForUser('svc-1', 'user-1', true);

      expect(result.info.status).toBe('suspended');
      expect(result.info.availableActions.map((a) => a.slug)).toEqual([
        'unsuspend_service',
      ]);
      expect(result.info.capabilities.inlineActions.map((a) => a.slug)).toEqual(
        ['unsuspend_service'],
      );
      expect(result.service.provider_state_desync).toBe(true);
    });

    it('getInfoForUser: BD active + proveedor suspended → conserva status=suspended (cliente bloqueado de verdad), availableActions=[suspend_service], provider_state_desync=true', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'active', provisioner_slug: 'enhance_cp' }),
      );
      registry.get.mockReturnValue(buildSuspendablePlugin('suspended'));

      const result = await service.getInfoForUser('svc-1', 'user-1', true);

      expect(result.info.status).toBe('suspended');
      expect(result.info.availableActions.map((a) => a.slug)).toEqual([
        'suspend_service',
      ]);
      expect(result.service.provider_state_desync).toBe(true);
    });

    it('getInfoForUser: BD suspended + proveedor cancelled (mock reiniciado → suscripción "deleted") → override status=suspended, availableActions=[unsuspend_service], provider_state_desync=true', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'enhance_cp',
          suspension_reason: 'overdue_payment',
          suspended_at: new Date('2026-05-12T07:24:09Z'),
        }),
      );
      registry.get.mockReturnValue(buildSuspendablePlugin('cancelled'));

      const result = await service.getInfoForUser('svc-1', 'user-1', true);

      expect(result.info.status).toBe('suspended');
      expect(result.info.availableActions.map((a) => a.slug)).toEqual([
        'unsuspend_service',
      ]);
      expect(result.service.provider_state_desync).toBe(true);
    });

    it('getInfoForUser: BD active + proveedor active → sin override, provider_state_desync=false', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'active', provisioner_slug: 'enhance_cp' }),
      );
      registry.get.mockReturnValue(buildSuspendablePlugin('active'));

      const result = await service.getInfoForUser('svc-1', 'user-1', true);

      expect(result.info.status).toBe('active');
      expect(result.service.provider_state_desync).toBe(false);
    });

    it('getInfoForUser: BD suspended + proveedor unknown (caído) → NO afirma desync, deja info.status tal cual (el admin ve el drift banner)', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'enhance_cp',
          suspension_reason: 'overdue_payment',
          suspended_at: new Date('2026-05-11T00:00:00Z'),
        }),
      );
      registry.get.mockReturnValue(buildSuspendablePlugin('unknown'));

      const result = await service.getInfoForUser('svc-1', 'user-1', true);

      expect(result.info.status).toBe('unknown');
      expect(result.service.provider_state_desync).toBe(false);
    });

    it('getInfoForUser: plugin SIN supports_suspend + BD suspended (impago, Fase F.5) → fuerza info.status=suspended (el cliente lo ve suspendido) PERO provider_state_desync=false (no hay estado de proveedor con el que sincronizar)', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'internal',
          suspension_reason: 'overdue_payment: Factura INV-2026-1',
        }),
      );
      // buildPlugin() por defecto: supports_suspend=false, getServiceInfo → active, inlineActions [].
      registry.get.mockReturnValue(buildPlugin());

      const result = await service.getInfoForUser('svc-1', 'user-1', true);

      expect(result.info.status).toBe('suspended');
      expect(result.info.availableActions).toEqual([]);
      expect(result.service.provider_state_desync).toBe(false);
    });

    // ── F.4.3 — resyncProviderStateAsAdmin ──────────────────────────────
    it('resyncProviderStateAsAdmin: BD suspended → invoca executeAction(suspend_service) + audit, SIN service.suspended/unsuspended ni prisma.update', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'enhance_cp',
          suspension_reason: 'abuse_investigation: DMCA pendiente',
          suspended_at: new Date('2026-05-11T00:00:00Z'),
        }),
      );
      const executeAction = jest
        .fn()
        .mockResolvedValue({ success: true, data: {} });
      registry.get.mockReturnValue(
        buildSuspendablePlugin('active', executeAction),
      );

      const result = await service.resyncProviderStateAsAdmin(
        'svc-1',
        'admin-id',
        { ipAddress: '1.2.3.4', userAgent: 'jest' },
      );

      expect(executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'suspend_service',
        { reason: 'abuse_investigation' },
      );
      expect(prisma.service.update).not.toHaveBeenCalled();
      // R8 (GL-17): resync NO es una transición de lifecycle → no persiste
      // `service.suspended`/`service.unsuspended` vía Outbox (sólo re-aplica la
      // inline action en el proveedor para alinear su estado con la BD).
      expect(outbox.enqueue).not.toHaveBeenCalledWith(
        expect.anything(),
        'service.suspended',
        expect.anything(),
      );
      expect(outbox.enqueue).not.toHaveBeenCalledWith(
        expect.anything(),
        'service.unsuspended',
        expect.anything(),
      );
      expect(audit.logAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service_provider_state_resync_admin',
          metadata: expect.objectContaining({
            resource_id: 'svc-1',
            target_state: 'suspended',
            action_slug: 'suspend_service',
          }),
        }),
      );
      expect(result).toEqual({
        id: 'svc-1',
        target_state: 'suspended',
        aligned: true,
      });
    });

    it('resyncProviderStateAsAdmin: BD active → invoca executeAction(unsuspend_service)', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'active', provisioner_slug: 'enhance_cp' }),
      );
      const executeAction = jest
        .fn()
        .mockResolvedValue({ success: true, data: {} });
      registry.get.mockReturnValue(
        buildSuspendablePlugin('suspended', executeAction),
      );

      const result = await service.resyncProviderStateAsAdmin(
        'svc-1',
        'admin-id',
        { ipAddress: '1.2.3.4' },
      );

      expect(executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'unsuspend_service',
        {},
      );
      expect(result.target_state).toBe('active');
    });

    it('resyncProviderStateAsAdmin: estado no realineables (pending) → ConflictException SERVICE_STATE_NOT_RESYNCABLE', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'pending', provisioner_slug: 'enhance_cp' }),
      );
      registry.get.mockReturnValue(buildSuspendablePlugin('active'));

      await expect(
        service.resyncProviderStateAsAdmin('svc-1', 'admin-id', {
          ipAddress: '1.2.3.4',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('resyncProviderStateAsAdmin: plugin sin supports_suspend → ConflictException SUSPEND_NOT_SUPPORTED', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'suspended', provisioner_slug: 'internal' }),
      );
      registry.get.mockReturnValue(buildPlugin());

      await expect(
        service.resyncProviderStateAsAdmin('svc-1', 'admin-id', {
          ipAddress: '1.2.3.4',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('resyncProviderStateAsAdmin: la inline action del plugin falla → ConflictException PROVIDER_RESYNC_FAILED', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'enhance_cp',
          suspension_reason: 'other',
        }),
      );
      registry.get.mockReturnValue(
        buildSuspendablePlugin(
          'active',
          jest.fn().mockResolvedValue({
            success: false,
            message: 'action.provider_error',
          }),
        ),
      );

      await expect(
        service.resyncProviderStateAsAdmin('svc-1', 'admin-id', {
          ipAddress: '1.2.3.4',
        }),
      ).rejects.toThrow(ConflictException);
    });

    // ── F.5 — billing-suspend-unify (actor sistema + allowUnsupported + reactivar al pagar) ──

    it('suspendAsAdmin: actor sistema (actorUserId=null + actorLabel) → audit.logChange con user_id=null + changes_after.actor; SIN audit.logAccess; evento service.suspended con actor + actor_user_id=null', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'active', provisioner_slug: 'enhance_cp' }),
      );
      const executeAction = jest
        .fn()
        .mockResolvedValue({ success: true, data: { suspended: true } });
      registry.get.mockReturnValue(
        buildSuspendablePlugin('active', executeAction),
      );
      prisma.service.update.mockResolvedValueOnce({
        id: 'svc-1',
        status: 'suspended',
        suspension_reason: 'overdue_payment: Factura INV-2026-1',
        suspended_at: new Date(),
      });

      await service.suspendAsAdmin(
        'svc-1',
        {
          reason: SuspensionReasonDto.overdue_payment,
          internal_note: 'Factura INV-2026-1',
          notify_client: true,
        },
        null,
        undefined,
        { actorLabel: 'system:billing-overdue-cron' },
      );

      expect(executeAction).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'svc-1' }),
        'suspend_service',
        { reason: 'overdue_payment' },
      );
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service.suspended',
          user_id: null,
          changes_after: expect.objectContaining({
            status: 'suspended',
            reason_code: 'overdue_payment',
            actor: 'system:billing-overdue-cron',
          }),
        }),
      );
      expect(audit.logAccess).not.toHaveBeenCalled();
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        'service.suspended',
        expect.objectContaining({
          service_id: 'svc-1',
          actor_user_id: null,
          actor: 'system:billing-overdue-cron',
          reason: 'overdue_payment',
        }),
      );
    });

    it('suspendAsAdmin: allowUnsupported=true sobre plugin SIN supports_suspend → transición de estado en BD sin invocar inline action', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'active', provisioner_slug: 'internal' }),
      );
      const plugin = buildPlugin(); // supports_suspend=false
      registry.get.mockReturnValue(plugin);
      prisma.service.update.mockResolvedValueOnce({
        id: 'svc-1',
        status: 'suspended',
        suspension_reason: 'overdue_payment: Factura INV-2026-1',
        suspended_at: new Date(),
      });

      const result = await service.suspendAsAdmin(
        'svc-1',
        {
          reason: SuspensionReasonDto.overdue_payment,
          internal_note: 'Factura INV-2026-1',
          notify_client: true,
        },
        null,
        undefined,
        { actorLabel: 'system:billing-overdue-cron', allowUnsupported: true },
      );

      expect(plugin.executeAction).not.toHaveBeenCalled();
      expect(prisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'suspended' }),
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        'service.suspended',
        expect.objectContaining({ actor_user_id: null }),
      );
      expect(audit.logAccess).not.toHaveBeenCalled();
      expect(result.status).toBe('suspended');
    });

    it('unsuspendAsAdmin: actor sistema + allowUnsupported sobre plugin SIN supports_suspend → transición a active sin inline action, sin logAccess', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({
          status: 'suspended',
          provisioner_slug: 'internal',
          suspension_reason: 'overdue_payment: Factura INV-2026-1',
          suspended_at: new Date(),
        }),
      );
      const plugin = buildPlugin();
      registry.get.mockReturnValue(plugin);
      prisma.service.update.mockResolvedValueOnce({
        id: 'svc-1',
        status: 'active',
      });

      const result = await service.unsuspendAsAdmin(
        'svc-1',
        {
          internal_note:
            'Reactivado automáticamente al pagar la factura INV-2026-1',
        },
        null,
        undefined,
        {
          actorLabel: 'system:billing-on-invoice-paid',
          allowUnsupported: true,
        },
      );

      expect(plugin.executeAction).not.toHaveBeenCalled();
      expect(prisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'active',
            suspended_at: null,
            suspension_reason: null,
          },
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        'service.unsuspended',
        expect.objectContaining({
          actor_user_id: null,
          actor: 'system:billing-on-invoice-paid',
        }),
      );
      expect(audit.logAccess).not.toHaveBeenCalled();
      expect(result.status).toBe('active');
    });

    it('reactivateSuspendedServiceOnPayment: servicio suspendido por overdue_payment → reactiva (status→active)', async () => {
      prisma.service.findUnique
        .mockResolvedValueOnce({
          id: 'svc-1',
          status: 'suspended',
          suspension_reason: 'overdue_payment: Factura INV-2026-1',
        })
        .mockResolvedValueOnce(
          buildServiceRow({
            status: 'suspended',
            provisioner_slug: 'internal',
            suspension_reason: 'overdue_payment: Factura INV-2026-1',
            suspended_at: new Date(),
          }),
        );
      registry.get.mockReturnValue(buildPlugin());
      prisma.service.update.mockResolvedValueOnce({
        id: 'svc-1',
        status: 'active',
      });

      await service.reactivateSuspendedServiceOnPayment('svc-1', 'INV-2026-1');

      expect(prisma.service.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: 'active',
            suspended_at: null,
            suspension_reason: null,
          },
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(
        expect.anything(),
        'service.unsuspended',
        expect.objectContaining({
          actor_user_id: null,
          actor: 'system:billing-on-invoice-paid',
        }),
      );
    });

    it('reactivateSuspendedServiceOnPayment: servicio suspendido por OTRO motivo (abuse) → NO reactiva (un pago no deshace una suspensión por abuso)', async () => {
      prisma.service.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        status: 'suspended',
        suspension_reason: 'abuse_investigation: DMCA pendiente',
      });

      await service.reactivateSuspendedServiceOnPayment('svc-1', 'INV-2026-1');

      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it('reactivateSuspendedServiceOnPayment: servicio ya active → no-op idempotente', async () => {
      prisma.service.findUnique.mockResolvedValueOnce({
        id: 'svc-1',
        status: 'active',
        suspension_reason: null,
      });

      await service.reactivateSuspendedServiceOnPayment('svc-1', 'INV-2026-1');

      expect(prisma.service.update).not.toHaveBeenCalled();
    });

    it('reactivateSuspendedServiceOnPayment: servicio no encontrado → no-op (log warn), no relanza', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.reactivateSuspendedServiceOnPayment('svc-missing', 'INV-X'),
      ).resolves.toBeUndefined();
      expect(prisma.service.update).not.toHaveBeenCalled();
    });
  });

  // ─── Sprint 15C.II Fase F.9 — reconcileServiceAsAdmin (DC.45) ────────
  // Materializa R1..R6 frozen + Amendments naming clash + DI.

  describe('reconcileServiceAsAdmin F.9 (DC.45)', () => {
    const FAKE_RECONCILE_RESULT_EMPTY = {
      driftsDetected: [],
      driftsApplied: [],
      reconciledAt: new Date('2026-05-16T13:30:00Z'),
    };
    const FAKE_RECONCILE_RESULT_WITH_DRIFTS = {
      driftsDetected: [
        {
          type: 'plan_divergence' as const,
          before: 'starter',
          after: 'pro',
          applied: true,
        },
        {
          type: 'status_divergence' as const,
          before: 'cancelled',
          after: 'cancelled',
          applied: false,
        },
      ],
      driftsApplied: [
        {
          type: 'plan_divergence' as const,
          before: 'starter',
          after: 'pro',
          applied: true,
        },
      ],
      reconciledAt: new Date('2026-05-16T13:30:00Z'),
    };
    const CTX = { ipAddress: '127.0.0.1', userAgent: 'Mozilla/5.0 Test' };

    it('404 NotFoundException si service no existe (loadServiceForView)', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.reconcileServiceAsAdmin('svc-missing', 'admin-1', CTX),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(reconcileRegistry.reconcileOne).not.toHaveBeenCalled();
    });

    it('409 SERVICE_TERMINAL_NOT_RECONCILABLE si service cancelled', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'cancelled' }),
      );
      await expect(
        service.reconcileServiceAsAdmin('svc-1', 'admin-1', CTX),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SERVICE_TERMINAL_NOT_RECONCILABLE',
        }),
      });
      expect(reconcileRegistry.reconcileOne).not.toHaveBeenCalled();
    });

    it('409 SERVICE_TERMINAL_NOT_RECONCILABLE si service terminated', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(
        buildServiceRow({ status: 'terminated' }),
      );
      await expect(
        service.reconcileServiceAsAdmin('svc-1', 'admin-1', CTX),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'SERVICE_TERMINAL_NOT_RECONCILABLE',
        }),
      });
    });

    it('cooldown denegado + cached result → devuelve coalesced:true con TODOS los campos del result cacheado', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
      cache.tryAcquireReconcileSingleCooldown.mockResolvedValueOnce(false);
      cache.getCachedServiceReconcileResult.mockResolvedValueOnce(
        FAKE_RECONCILE_RESULT_WITH_DRIFTS,
      );

      const result = await service.reconcileServiceAsAdmin(
        'svc-1',
        'admin-1',
        CTX,
      );

      // Polish F.9 (review T2): assertion estricta — el coalesced debe
      // exponer TODOS los campos del result cacheado (driftsDetected,
      // driftsApplied, reconciledAt) + el flag `coalesced:true`. Si el
      // orquestador rompiese el spread (`{ ...cached, coalesced: true }`)
      // perdiendo algún campo, este test lo detecta.
      expect(result).toEqual({
        ...FAKE_RECONCILE_RESULT_WITH_DRIFTS,
        coalesced: true,
      });
      expect(reconcileRegistry.reconcileOne).not.toHaveBeenCalled();
      expect(
        clientNotes.createFromServiceLifecycleAction,
      ).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
      // Cache NO debe haber sido re-escrita (es el flujo de lectura del cooldown).
      expect(cache.cacheServiceReconcileResult).not.toHaveBeenCalled();
      // Audit NO debe registrar el coalesced — solo el flujo fresh genera audit.
      expect(audit.logChange).not.toHaveBeenCalled();
      expect(audit.logAccess).not.toHaveBeenCalled();
    });

    it('cooldown denegado + sin cached result → 409 RECONCILE_IN_PROGRESS con retry_after_seconds', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
      cache.tryAcquireReconcileSingleCooldown.mockResolvedValueOnce(false);
      cache.getCachedServiceReconcileResult.mockResolvedValueOnce(null);

      await expect(
        service.reconcileServiceAsAdmin('svc-1', 'admin-1', CTX),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'RECONCILE_IN_PROGRESS',
          retry_after_seconds: 30,
        }),
      });
      expect(reconcileRegistry.reconcileOne).not.toHaveBeenCalled();
    });

    it('happy path con driftsApplied > 0: aplica + ClientNote + cache + emit + audit', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
      reconcileRegistry.reconcileOne.mockResolvedValueOnce(
        FAKE_RECONCILE_RESULT_WITH_DRIFTS,
      );

      const result = await service.reconcileServiceAsAdmin(
        'svc-1',
        'admin-1',
        CTX,
      );

      expect(result).toEqual(FAKE_RECONCILE_RESULT_WITH_DRIFTS);
      expect(reconcileRegistry.reconcileOne).toHaveBeenCalledWith(
        'internal',
        expect.objectContaining({ id: 'svc-1' }),
      );
      // Cache R6: resultado cacheado + service_info invalidado.
      expect(cache.cacheServiceReconcileResult).toHaveBeenCalledWith(
        'svc-1',
        FAKE_RECONCILE_RESULT_WITH_DRIFTS,
        30,
      );
      expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
      // R3: ClientNote creada con category=reconciliation + triggered_by_action canónico.
      expect(clientNotes.createFromServiceLifecycleAction).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          author_id: 'admin-1',
          service_id: 'svc-1',
          triggered_by_action: 'service.reconciled_single',
          category: 'reconciliation',
        }),
      );
      // R2: evento reusado con trigger='manual_single' discriminador.
      expect(events.emit).toHaveBeenCalledWith(
        'service.reconciled_external_change',
        expect.objectContaining({
          service_id: 'svc-1',
          plugin_slug: 'internal',
          trigger: 'manual_single',
          drifts_detected: 2,
          drifts_applied: 1,
          actor_user_id: 'admin-1',
        }),
      );
      // Audit completo: change_log + access_log con target_user_id.
      expect(audit.logChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'Service',
          entity_id: 'svc-1',
          action: 'service.reconciled_single',
          changes_after: expect.objectContaining({
            drifts_detected: 2,
            drifts_applied: 1,
          }),
        }),
      );
      expect(audit.logAccess).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'service_reconcile_admin',
          resource: 'Service',
          metadata: expect.objectContaining({
            resource_id: 'svc-1',
            target_user_id: 'user-1',
          }),
        }),
      );
    });

    it('happy path con driftsApplied === 0: cache + emit + audit, SIN ClientNote (R3 frozen)', async () => {
      prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
      reconcileRegistry.reconcileOne.mockResolvedValueOnce(
        FAKE_RECONCILE_RESULT_EMPTY,
      );

      const result = await service.reconcileServiceAsAdmin(
        'svc-1',
        'admin-1',
        CTX,
      );

      expect(result).toEqual(FAKE_RECONCILE_RESULT_EMPTY);
      // R3 frozen: SIN cambios aplicados, NO hay nota.
      expect(
        clientNotes.createFromServiceLifecycleAction,
      ).not.toHaveBeenCalled();
      // Pero SÍ hay evento + audit + cache (rastro operativo del intento).
      expect(events.emit).toHaveBeenCalled();
      expect(audit.logChange).toHaveBeenCalled();
      expect(audit.logAccess).toHaveBeenCalled();
      expect(cache.cacheServiceReconcileResult).toHaveBeenCalled();
    });

    it('plugin sin reconcileOne → propaga ProvisionerPluginError(RECONCILE_ONE_NOT_SUPPORTED) con module=reconcile', async () => {
      // Polish F.9 (review T1): el path canónico desde el registry es un
      // `ProvisionerPluginError` con `module='reconcile'` (ADR-077 +
      // GAP-N F.3). El test legacy usaba un `Error` plano + `.code` ad-hoc
      // que NO refleja el comportamiento real — si el wrap canónico se
      // rompiese, el test legacy no lo detectaba.
      prisma.service.findUnique.mockResolvedValueOnce(buildServiceRow());
      const pluginErr = new ProvisionerPluginError(
        'Plugin "internal" does not implement reconcileOne',
        'RECONCILE_ONE_NOT_SUPPORTED',
        false, // retriable
        undefined, // cause
        'reconcile',
      );
      reconcileRegistry.reconcileOne.mockRejectedValueOnce(pluginErr);

      let caught: unknown;
      try {
        await service.reconcileServiceAsAdmin('svc-1', 'admin-1', CTX);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ProvisionerPluginError);
      expect((caught as ProvisionerPluginError).code).toBe(
        'RECONCILE_ONE_NOT_SUPPORTED',
      );
      expect((caught as ProvisionerPluginError).module).toBe('reconcile');
      expect((caught as ProvisionerPluginError).retriable).toBe(false);
      // El service NO debe haber creado nota ni audit (el error sucedió antes).
      expect(
        clientNotes.createFromServiceLifecycleAction,
      ).not.toHaveBeenCalled();
      expect(audit.logChange).not.toHaveBeenCalled();
      expect(audit.logAccess).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  // ─── Sprint 15C.II Fase F.11.1 (R3 frozen §A.11.10.8.2) ───────────────
  describe('getPluginHealthForService F.11.1', () => {
    it('404 NotFound si service no existe', async () => {
      prisma.service.findUnique.mockResolvedValue(null);
      await expect(
        service.getPluginHealthForService('svc-404'),
      ).rejects.toThrow(NotFoundException);
    });

    it('service con provisioner_slug propio → derivePluginHealth con ese slug', async () => {
      prisma.service.findUnique.mockResolvedValue({
        provisioner_slug: 'enhance_cp',
        product: { provisioner: 'internal' },
      });

      const result = await service.getPluginHealthForService('svc-1');

      // Sin breakers conocidos (mock listNames=[]) → operational + array vacío.
      expect(result.pluginSlug).toBe('enhance_cp');
      expect(result.state).toBe('operational');
      expect(result.breakers).toEqual([]);
    });

    it('service sin provisioner_slug → fallback a product.provisioner', async () => {
      prisma.service.findUnique.mockResolvedValue({
        provisioner_slug: null,
        product: { provisioner: 'docker' },
      });

      const result = await service.getPluginHealthForService('svc-1');
      expect(result.pluginSlug).toBe('docker');
    });

    it('service sin slug ni product.provisioner → pluginSlug=""', async () => {
      prisma.service.findUnique.mockResolvedValue({
        provisioner_slug: null,
        product: { provisioner: null },
      });

      const result = await service.getPluginHealthForService('svc-1');
      expect(result.pluginSlug).toBe('');
      // El estado sigue siendo operational (sin breakers para slug vacío).
      expect(result.state).toBe('operational');
    });
  });
});
