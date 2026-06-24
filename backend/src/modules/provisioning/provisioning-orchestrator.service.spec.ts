/* eslint-disable @typescript-eslint/unbound-method */
// `unbound-method` produce falsos positivos en specs Jest cuando se hace
// `expect(mock.method).toHaveBeenCalled()`. Doctrina oficial TS-ESLint para
// specs: deshabilitar a nivel de archivo. Solo aplica a este `.spec.ts`.

import { EventEmitter2 } from '@nestjs/event-emitter';

import { PluginRegistryService } from '../../core/provisioning/plugin-registry';
import {
  EMPTY_PLUGIN_SCHEMA,
  PluginManifest,
  ProvisionerPlugin,
  ProvisionerPluginError,
  PROVISIONER_PLUGIN_CONTRACT_VERSION,
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

import { ProvisioningOrchestratorService } from './provisioning-orchestrator.service';

/**
 * Tests unit ProvisioningOrchestratorService â€” Sprint 11 Fase 11.B (ADR-077).
 *
 * Cobertura:
 *   - service no encontrado â†’ skip silencioso.
 *   - service ya 'active' â†’ skip idempotente.
 *   - service 'cancelled'/'terminated' â†’ skip terminal.
 *   - plugin no registrado â†’ emit service.provisioning_failed con reason='plugin_not_registered'.
 *   - provision OK con followUp=['mark_active'] â†’ updates status=active + emit service.activated.
 *   - provision OK con followUp=['create_setup_task'] â†’ llama tasks.create.
 *   - plugin lanza ProvisionerPluginError(retriable=true) â†’ re-throw para BullMQ retry.
 *   - plugin lanza ProvisionerPluginError(retriable=false) â†’ status='cancelled' + emit failed.
 *   - handleInvoicePaid encola un job por cada service en items.
 */
describe('ProvisioningOrchestratorService â€” Sprint 11 Fase 11.B', () => {
  let prisma: {
    service: { findUnique: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
    invoice: { findUnique: jest.Mock };
    supportInsideSubscription: { findUnique: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
    eventOutbox: { create: jest.Mock };
  };
  let registry: jest.Mocked<PluginRegistryService>;
  let tasks: { createFromTrigger: jest.Mock };
  let events: { emit: jest.Mock };
  let queue: { add: jest.Mock };
  let cache: { invalidate: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let orchestrator: ProvisioningOrchestratorService;

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
      getServiceInfo: jest.fn(),
      getSsoUrl: jest.fn(),
      executeAction: jest.fn(),
      ...over,
    };
  }

  function setupServiceRow(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      product_id: 'prod-1',
      status: 'pending',
      label: 'Web demo',
      domain: 'demo.aelium.net',
      server_id: null,
      product: {
        id: 'prod-1',
        slug: 'hosting-pro',
        name: 'Hosting Pro',
        type: 'hosting_web',
        provisioner: 'internal',
        provisioner_config: null,
      },
      ...over,
    };
  }

  beforeEach(() => {
    prisma = {
      // Sprint 15D.F.3: findFirst lo usa `resolveDnsTargetHint` (busca hosting
      // hermano). Default null = sin hosting → dnsTargetHint='parking'.
      service: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
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
      invoice: { findUnique: jest.fn() },
      supportInsideSubscription: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      // Sprint 15D — `$transaction(cb)` ejecuta cb con el propio `prisma` como
      // `tx`: así `tx.service.update === prisma.service.update` (el conteo de
      // updates se preserva) y `tx.eventOutbox.create` queda disponible.
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma)),
      eventOutbox: { create: jest.fn() },
    };
    registry = {
      get: jest.fn(),
      getOrThrow: jest.fn(),
      listSlugs: jest.fn().mockReturnValue([]),
    } as unknown as jest.Mocked<PluginRegistryService>;
    tasks = { createFromTrigger: jest.fn() };
    events = { emit: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    cache = { invalidate: jest.fn().mockResolvedValue(undefined) };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };

    orchestrator = new ProvisioningOrchestratorService(
      prisma as never,
      registry,
      tasks as never,
      events as unknown as EventEmitter2,
      queue as never,
      cache as never,
      outbox as never,
    );
  });

  it('service no encontrado â†’ skip silencioso (no throw, no emit)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(null);
    await orchestrator.provisionService('svc-missing', 'cor-1');
    expect(events.emit).not.toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('service ya active â†’ skip idempotente', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({ status: 'active' }),
    );
    await orchestrator.provisionService('svc-1', 'cor-1');
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('service en estado terminal (cancelled/terminated) â†’ skip', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({ status: 'cancelled' }),
    );
    await orchestrator.provisionService('svc-1', 'cor-1');
    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('plugin no registrado â†’ emit service.provisioning_failed', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    registry.get.mockReturnValue(null);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(events.emit).toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.objectContaining({
        service_id: 'svc-1',
        reason: 'plugin_not_registered',
      }),
    );
  });

  it('provision OK followUp=mark_active â†’ status=active + emit service.activated', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    const plugin = buildPlugin({
      provision: jest.fn().mockResolvedValue({
        providerReference: 'EXT-123',
        metadata: { region: 'eu-1' },
        followUp: ['mark_active'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(plugin.provision).toHaveBeenCalled();
    // 1Âª update: status=provisioning + provisioner_slug
    // 2Âª update: provider_reference + metadata
    // 3Âª update (mark_active): status=active
    expect(prisma.service.update).toHaveBeenCalledTimes(3);
    expect(events.emit).toHaveBeenCalledWith(
      'service.activated',
      expect.objectContaining({ service_id: 'svc-1', user_id: 'user-1' }),
    );
    // Sprint 15C.II Fase C round 3: invalidar cache `service_info:${id}`
    // tras persistir nueva metadata (linea ~221 orchestrator). Sin esto
    // el wrapper getServiceInfoWithCache devolvía cached versión vieja
    // hasta TTL 60s aunque el plugin ya hubiera creado refs externas.
    expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
  });

  // ─── Sprint 15D Fase 15D.D — operation + domain.registered (Outbox) ────────

  const REGISTRAR_CAPS = {
    has_sso_panel: false,
    has_metrics: false,
    has_metrics_history: false,
    requires_server: false,
    provision_mode: 'sync' as const,
    completes_via_task: false,
    supports_reconciliation: true,
    has_dns_management: false,
    supports_suspend: true,
    is_domain_registrar: true,
  };

  const DOMAIN_PRODUCT = {
    id: 'prod-dom',
    slug: 'dominio-com',
    name: 'Dominio .com',
    type: 'domain',
    provisioner: 'resellerclub',
    provisioner_config: null,
  };

  it('registrar + register fresco â†’ deriva operation + emite domain.registered vía Outbox', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({
        domain: 'example.com',
        provider_reference: null,
        metadata: { domain_operation: 'register', domain_years: 2 },
        product: DOMAIN_PRODUCT,
      }),
    );
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest.fn().mockResolvedValue({
        providerReference: '700123',
        metadata: {
          domain_operation: 'register',
          domain_years: 2,
          rc_customer_id: '700001',
        },
        followUp: ['mark_active'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    // `operation` se derivó de metadata.domain_operation y llegó al plugin.
    const ctxArg = (
      (plugin.provision as jest.Mock).mock.calls[0] as unknown[]
    )[0] as {
      operation?: string;
    };
    expect(ctxArg.operation).toBe('register');
    // domain.registered emitido transaccionalmente (tx === prisma en el mock).
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'domain.registered',
      expect.objectContaining({
        service_id: 'svc-1',
        user_id: 'user-1',
        fqdn: 'example.com',
        years: 2,
      }),
    );
  });

  it('F.3 dnsTargetHint: dominio-solo (sin hosting hermano) → parking', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({
        domain: 'solo.com',
        provider_reference: null,
        metadata: { domain_operation: 'register', domain_years: 1 },
        product: DOMAIN_PRODUCT,
      }),
    );
    prisma.service.findFirst.mockResolvedValueOnce(null); // sin hosting hermano
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest.fn().mockResolvedValue({
        providerReference: '700123',
        metadata: { domain_operation: 'register' },
        followUp: ['mark_active'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    const ctxArg = (
      (plugin.provision as jest.Mock).mock.calls[0] as unknown[]
    )[0] as { dnsTargetHint?: string };
    expect(ctxArg.dnsTargetHint).toBe('parking');
  });

  it('F.3 dnsTargetHint: dominio con hosting hermano (F1) → aelium', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({
        domain: 'conhosting.com',
        provider_reference: null,
        metadata: { domain_operation: 'register', domain_years: 1 },
        product: DOMAIN_PRODUCT,
      }),
    );
    prisma.service.findFirst.mockResolvedValueOnce({ id: 'host-sib' }); // hosting hermano
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest.fn().mockResolvedValue({
        providerReference: '700124',
        metadata: { domain_operation: 'register' },
        followUp: ['mark_active'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    const ctxArg = (
      (plugin.provision as jest.Mock).mock.calls[0] as unknown[]
    )[0] as { dnsTargetHint?: string };
    expect(ctxArg.dnsTargetHint).toBe('aelium');
  });

  it('registrar + register en reintento (provider_reference ya existe) â†’ NO re-emite', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({
        domain: 'example.com',
        provider_reference: '700123',
        metadata: { domain_operation: 'register', domain_years: 1 },
        product: DOMAIN_PRODUCT,
      }),
    );
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest.fn().mockResolvedValue({
        providerReference: '700123',
        metadata: {},
        followUp: ['mark_active'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  // ─── Sprint 15D Fase 15D.E — enrutado de renovación + domain.renewed ───────

  function setupActiveDomain(over: Record<string, unknown> = {}) {
    return setupServiceRow({
      status: 'active',
      domain: 'example.com',
      provider_reference: '700123',
      expires_at: new Date('2026-07-01T00:00:00.000Z'),
      metadata: { domain_operation: 'register', domain_years: 1 },
      product: DOMAIN_PRODUCT,
      ...over,
    });
  }

  it('renovación: dominio activo + invoice.paid → provision(renew) + domain.renewed + persiste expires_at', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupActiveDomain());
    const newExpiry = '2027-07-01T00:00:00.000Z';
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest.fn().mockResolvedValue({
        providerReference: '700123',
        metadata: {
          domain_operation: 'renew',
          domain_renew_performed: true,
          domain_expires_at: newExpiry,
        },
        followUp: [],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    // operation forzado a 'renew' (NO la metadata stale 'register').
    const ctxArg = (
      (plugin.provision as jest.Mock).mock.calls[0] as unknown[]
    )[0] as { operation?: string };
    expect(ctxArg.operation).toBe('renew');
    // NO flipa a 'provisioning' (servicio sigue active); 1 sola update (persist).
    const updateCalls = prisma.service.update.mock.calls as Array<
      [{ data?: Record<string, unknown> }]
    >;
    expect(updateCalls.some((c) => c[0].data?.status === 'provisioning')).toBe(
      false,
    );
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0].data?.expires_at).toEqual(new Date(newExpiry));
    // domain.renewed emitido vía Outbox; NO service.activated (followUp vacío).
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'domain.renewed',
      expect.objectContaining({
        service_id: 'svc-1',
        fqdn: 'example.com',
        new_expires_at: newExpiry,
      }),
    );
    expect(events.emit).not.toHaveBeenCalledWith(
      'service.activated',
      expect.anything(),
    );
    expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
  });

  it('renovación idempotente (performed=false) → persiste expires_at pero NO emite domain.renewed', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupActiveDomain());
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest.fn().mockResolvedValue({
        providerReference: '700123',
        metadata: {
          domain_operation: 'renew',
          domain_renew_performed: false,
          domain_expires_at: '2027-07-01T00:00:00.000Z',
        },
        followUp: [],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(outbox.enqueue).not.toHaveBeenCalledWith(
      prisma,
      'domain.renewed',
      expect.anything(),
    );
  });

  it('renovación fallida no-retriable (redemption) → NO cancela el dominio activo, alerta', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupActiveDomain());
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest
        .fn()
        .mockRejectedValue(
          new ProvisionerPluginError(
            'en redemption',
            'DOMAIN_IN_REDEMPTION',
            false,
          ),
        ),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    const updateCalls = prisma.service.update.mock.calls as Array<
      [{ data?: { status?: string } }]
    >;
    expect(updateCalls.some((c) => c[0].data?.status === 'cancelled')).toBe(
      false,
    );
    expect(events.emit).toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.objectContaining({
        service_id: 'svc-1',
        reason: 'renew_failed:DOMAIN_IN_REDEMPTION',
      }),
    );
  });

  it('provision OK followUp=create_setup_task â†’ llama tasks.create', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    const plugin = buildPlugin({
      slug: 'manual',
      capabilities: {
        has_sso_panel: false,
        has_metrics: false,
        has_metrics_history: false,
        requires_server: false,
        provision_mode: 'sync',
        completes_via_task: true,
        supports_reconciliation: false,
        has_dns_management: false, // ADR-077 Amendment A1
        supports_suspend: false, // ADR-077 Amendment A4
        is_domain_registrar: false, // ADR-077 Amendment A10
      },
      provision: jest.fn().mockResolvedValue({
        providerReference: null,
        metadata: {},
        followUp: ['create_setup_task'],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    expect(tasks.createFromTrigger).toHaveBeenCalledWith(
      expect.objectContaining({
        source_system: 'provisioning_manual',
        source_id: 'svc-1',
        client_id: 'user-1',
      }),
    );
  });

  it('plugin lanza ProvisionerPluginError(retriable=true) â†’ re-throw para BullMQ retry', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    const plugin = buildPlugin({
      provision: jest
        .fn()
        .mockRejectedValue(
          new ProvisionerPluginError('timeout', 'PROVIDER_TIMEOUT', true),
        ),
    });
    registry.get.mockReturnValue(plugin);

    await expect(
      orchestrator.provisionService('svc-1', 'cor-1'),
    ).rejects.toThrow(ProvisionerPluginError);

    // No marca cancelled â€” el reintento decidirÃ¡.
    expect(events.emit).not.toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.anything(),
    );
  });

  it('plugin lanza ProvisionerPluginError(retriable=false) â†’ status=cancelled + emit failed', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupServiceRow());
    const plugin = buildPlugin({
      provision: jest
        .fn()
        .mockRejectedValue(
          new ProvisionerPluginError(
            'auth fail',
            'PROVIDER_AUTH_FAILED',
            false,
          ),
        ),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.provisionService('svc-1', 'cor-1');

    // Debe haberse llamado update con status=cancelled tras el fallo.
    const updateCalls = prisma.service.update.mock.calls as Array<
      [{ data?: { status?: string } }]
    >;
    const cancelCall = updateCalls.find(
      (c) => c[0].data?.status === 'cancelled',
    );
    expect(cancelCall).toBeDefined();
    expect(events.emit).toHaveBeenCalledWith(
      'service.provisioning_failed',
      expect.objectContaining({
        service_id: 'svc-1',
        reason: 'PROVIDER_AUTH_FAILED',
      }),
    );
    // Sprint 15C.II Fase C round 3: invalidar cache también tras failure
    // permanente (status pasa a cancelled, UI debe ver el cambio inmediato
    // sin esperar TTL).
    expect(cache.invalidate).toHaveBeenCalledWith('svc-1');
  });

  it('handleInvoicePaid encola un job por cada service en items', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-1',
      items: [
        { service_id: 'svc-A' },
        { service_id: 'svc-B' },
        { service_id: null },
      ],
    });

    await orchestrator.handleInvoicePaid({
      invoice_id: 'inv-1',
      user_id: 'user-1',
    });

    expect(queue.add).toHaveBeenCalledTimes(2);
    const addCalls = queue.add.mock.calls as Array<
      [unknown, { service_id: string }]
    >;
    const enqueuedServiceIds = addCalls.map((c) => c[1].service_id).sort();
    expect(enqueuedServiceIds).toEqual(['svc-A', 'svc-B']);
  });

  it('handleInvoicePaid sin items service â†’ no encola (debug log)', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce({
      id: 'inv-2',
      items: [{ service_id: null }, { service_id: null }],
    });

    await orchestrator.handleInvoicePaid({
      invoice_id: 'inv-2',
      user_id: 'user-1',
    });

    expect(queue.add).not.toHaveBeenCalled();
  });

  // ─── Sprint 15D.II.T2c — initiateTransferIn (iniciación síncrona) ───────────

  function setupTransferDomain(over: Record<string, unknown> = {}) {
    return setupServiceRow({
      status: 'pending',
      domain: 'movein.com',
      provider_reference: null,
      metadata: { domain_operation: 'transfer_in', transfer_state: 'pending' },
      product: DOMAIN_PRODUCT,
      ...over,
    });
  }

  it('initiateTransferIn: authCode EN el ctx + operation=transfer_in; persiste submitted sin activar', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupTransferDomain());
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest.fn().mockResolvedValue({
        providerReference: '900123',
        metadata: {
          domain_operation: 'transfer_in',
          transfer_state: 'submitted',
        },
        followUp: [],
      }),
    });
    registry.get.mockReturnValue(plugin);

    await orchestrator.initiateTransferIn('svc-1', 'EPP-OK', 'cor-x');

    const ctxArg = (
      (plugin.provision as jest.Mock).mock.calls[0] as unknown[]
    )[0] as { operation?: string; transferAuthCode?: string };
    expect(ctxArg.operation).toBe('transfer_in');
    expect(ctxArg.transferAuthCode).toBe('EPP-OK');

    const updateArg = (
      prisma.service.update.mock.calls as Array<
        [{ data: { provider_reference?: string; status?: string } }]
      >
    )[0][0];
    expect(updateArg.data.provider_reference).toBe('900123');
    expect(updateArg.data.status).toBe('provisioning');
    // Asíncrono: NO activa el servicio (lo activa el reconcile al completar).
    expect(events.emit).not.toHaveBeenCalledWith(
      'service.activated',
      expect.anything(),
    );
    // T3: el transfer se envió (submitted) → domain.transfer_initiated (Outbox, misma tx).
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'domain.transfer_initiated',
      expect.objectContaining({ service_id: 'svc-1', fqdn: 'movein.com' }),
    );
  });

  it('initiateTransferIn: auth-code inválido → FSM a awaiting_auth + re-lanza', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(setupTransferDomain());
    const plugin = buildPlugin({
      slug: 'resellerclub',
      capabilities: { ...REGISTRAR_CAPS },
      provision: jest
        .fn()
        .mockRejectedValue(
          new ProvisionerPluginError('bad code', 'INVALID_AUTH_CODE', false),
        ),
    });
    registry.get.mockReturnValue(plugin);

    await expect(
      orchestrator.initiateTransferIn('svc-1', 'WRONG'),
    ).rejects.toMatchObject({ code: 'INVALID_AUTH_CODE' });

    const updateArg = (
      prisma.service.update.mock.calls as Array<
        [{ data: { metadata?: Record<string, unknown> } }]
      >
    )[0][0];
    expect(updateArg.data.metadata?.transfer_state).toBe('awaiting_auth');
    // T3: el transfer NO arrancó en el registrar → NO emite domain.transfer_initiated.
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('initiateTransferIn: plugin no-registrar → INVALID_STATE (no llama provision)', async () => {
    prisma.service.findUnique.mockResolvedValueOnce(
      setupServiceRow({
        product: { ...DOMAIN_PRODUCT, provisioner: 'internal' },
      }),
    );
    const plugin = buildPlugin(); // is_domain_registrar:false
    registry.get.mockReturnValue(plugin);

    await expect(
      orchestrator.initiateTransferIn('svc-1', 'EPP-OK'),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(plugin.provision).not.toHaveBeenCalled();
  });
});
