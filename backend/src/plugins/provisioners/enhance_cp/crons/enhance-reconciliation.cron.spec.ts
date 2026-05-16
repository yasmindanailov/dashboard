/**
 * Sprint 15C Fase 15C.H â€” tests unit `EnhanceReconciliationCron`.
 *
 * Cubre los 3 change_type canÃ³nicos (subscription_missing, status_divergence,
 * plan_divergence) + happy path + edge cases (refs faltantes, status
 * fuera de safe-adopt set, error individual no aborta el cron).
 *
 * Mocks:
 *   - `PrismaService` con `service.findMany` y `service.update`.
 *   - `EnhanceProvisionerPlugin.getApiClient()` devuelve api fake con
 *     `getSubscription` mockeado.
 *   - `EventEmitter2.emit` capturado para verificar payloads.
 */

import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../../../core/database/prisma.service';
import { ProvisionerPluginError } from '../../../../core/provisioning/types';
import { QuotaThresholdDetectorService } from '../../../../core/provisioning/quota-threshold-detector.service';
import { ReconcileRegistryService } from '../../../../core/provisioning/reconcile-registry.service';

import { EnhanceProvisionerPlugin } from '../enhance.plugin';
import { EnhanceReconciliationCron } from './enhance-reconciliation.cron';

describe('EnhanceReconciliationCron â€” Sprint 15C Fase 15C.H (ADR-083 Â§6 decisiÃ³n 24)', () => {
  function buildApiMock(opts: {
    subscription?: {
      id: number;
      planId: number;
      planName?: string;
      status: string;
      suspendedBy?: string;
    };
    throwsNotFound?: boolean;
    throwsOther?: Error;
  }) {
    const getSubscriptionMock = jest.fn();
    if (opts.throwsNotFound) {
      getSubscriptionMock.mockRejectedValue(
        new ProvisionerPluginError(
          'Subscription 99 not found',
          'INVALID_STATE',
          false,
        ),
      );
    } else if (opts.throwsOther) {
      getSubscriptionMock.mockRejectedValue(opts.throwsOther);
    } else {
      getSubscriptionMock.mockResolvedValue(opts.subscription);
    }
    // Sprint 15C.II Fase F.8: `runAsExecutor()` también invoca
    // `api.calculateResourceUsage` en la pasada de detección de cuota.
    // Los tests del cron de F-anteriores NO verifican F.8 — basta con
    // un mock que devuelve listado vacío (el detector hará no-op por
    // M8 al no encontrar disco con total).
    const calculateResourceUsageMock = jest
      .fn()
      .mockResolvedValue({ items: [] });
    return {
      api: {
        getSubscription: getSubscriptionMock,
        calculateResourceUsage: calculateResourceUsageMock,
      },
      getSubscriptionMock,
      calculateResourceUsageMock,
    };
  }

  function buildPlugin(apiBundle: ReturnType<typeof buildApiMock>) {
    return {
      getApiClient: jest.fn().mockResolvedValue({
        client: apiBundle.api,
        config: {
          baseUrl: 'http://e',
          masterOrgId: 'master-org',
          reconciliationIntervalHours: 6,
        },
      }),
    } as unknown as EnhanceProvisionerPlugin;
  }

  function buildPrisma(servicesRows: Array<Record<string, unknown>>) {
    const updateMock = jest.fn().mockResolvedValue({});
    const findManyMock = jest.fn().mockResolvedValue(servicesRows);
    // Sprint 15C.II Fase F.8: `detectQuotaThresholds()` lee el threshold
    // del `plugin_installs.config`. Mock devuelve null (el detector cae
    // al default 85 — coherente con el manifest).
    const pluginInstallFindUniqueMock = jest.fn().mockResolvedValue(null);
    return {
      prisma: {
        service: { findMany: findManyMock, update: updateMock },
        pluginInstall: { findUnique: pluginInstallFindUniqueMock },
      } as unknown as PrismaService,
      updateMock,
      findManyMock,
      pluginInstallFindUniqueMock,
    };
  }

  function buildEvents() {
    const emitted: unknown[][] = [];
    const emitMock = jest.fn((event: string, payload: unknown) => {
      emitted.push([event, payload]);
      return true;
    });
    const events = { emit: emitMock } as unknown as EventEmitter2;
    return { events, emitMock, emitted };
  }

  /**
   * Sprint 15C.II Fase B (ADR-083 Amendment A4.2): el cron implementa
   * `OnModuleInit` y se registra en `ReconcileRegistryService` al boot.
   * Los tests instancian el cron manualmente (no via DI Nest), asÃ­ que
   * proveemos un registry real â€” `register()` es side-effect free y los
   * tests no dependen de Ã©l. El test dedicado de registro vive mÃ¡s abajo.
   */
  function buildReconcileRegistry(): ReconcileRegistryService {
    return new ReconcileRegistryService();
  }

  /**
   * Sprint 15C.II Fase F.8: el cron inyecta `QuotaThresholdDetectorService`
   * para la pasada adicional de detección de cuota en `runAsExecutor()`.
   * Los tests del cron de F-anteriores invocan `runOnce()` directamente —
   * NO pasan por `runAsExecutor()` — así que el detector no se invoca y
   * basta con un stub mínimo. La cobertura específica de F.8 vive en
   * `quota-threshold-detector.service.spec.ts`.
   */
  function buildQuotaDetector(): QuotaThresholdDetectorService {
    return {
      detectAndNotify: jest
        .fn()
        .mockResolvedValue({ action: 'no_transition' }),
    } as unknown as QuotaThresholdDetectorService;
  }

  const SAMPLE_SERVICE = {
    id: 'svc-1',
    user_id: 'user-1',
    status: 'active' as const,
    provider_reference: '42',
    metadata: {
      enhance_org_id: 'cust-org-uuid',
      enhance_subscription_id: '42',
      enhance_plan_id: 1,
      enhance_website_id: 'ws-1',
      primary_domain: 'foo.example.com',
    },
  };

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Happy path
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('happy path: status active match + planId match â†’ no event, no update', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 1, status: 'active' },
    });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitMock } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary).toEqual({
      servicesChecked: 1,
      subscriptionMissing: 0,
      statusDivergence: 0,
      planDivergence: 0,
      errors: 0,
    });
    expect(emitMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // subscription_missing
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('subscription_missing (404 Enhance) â†’ emit evento + NO update status (admin decide)', async () => {
    const apiBundle = buildApiMock({ throwsNotFound: true });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitMock, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary.subscriptionMissing).toBe(1);
    expect(summary.errors).toBe(0);
    expect(emitMock).toHaveBeenCalledTimes(1);
    const [eventName, payload] = emitted[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(eventName).toBe('service.reconciled_external_change');
    expect(payload.service_id).toBe('svc-1');
    expect(payload.user_id).toBe('user-1');
    expect(payload.plugin_slug).toBe('enhance_cp');
    expect(payload.change_type).toBe('subscription_missing');
    expect(typeof payload.detected_at).toBe('string');
    expect(updateMock).not.toHaveBeenCalled();
  });

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // status_divergence
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('status_divergence activeâ†’suspended â†’ emit + adopta status (DH-INV-6)', async () => {
    const apiBundle = buildApiMock({
      subscription: {
        id: 42,
        planId: 1,
        status: 'active',
        suspendedBy: 'admin-enhance',
      },
    });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary.statusDivergence).toBe(1);
    expect(summary.errors).toBe(0);
    const [eventName, payload] = emitted[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(eventName).toBe('service.reconciled_external_change');
    expect(payload.change_type).toBe('status_divergence');
    expect(payload.expected).toBe('active');
    expect(payload.actual).toBe('suspended');
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'svc-1' },
      data: { status: 'suspended' },
    });
  });

  it('status_divergence activeâ†’cancelled (out of safe-adopt) â†’ emit sin update', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 1, status: 'deleted' },
    });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary.statusDivergence).toBe(1);
    const [, payload] = emitted[0] as [string, Record<string, unknown>];
    expect(payload.change_type).toBe('status_divergence');
    expect(payload.actual).toBe('cancelled');
    // NO update â€” el caso out-of-safe-adopt-set no se auto-corrige.
    expect(updateMock).not.toHaveBeenCalled();
  });

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // plan_divergence
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('plan_divergence (Enhance planId 2 vs metadata 1) â†’ emit + NO update (billing implication)', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 2, status: 'active' },
    });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary.planDivergence).toBe(1);
    const [, payload] = emitted[0] as [string, Record<string, unknown>];
    expect(payload.change_type).toBe('plan_divergence');
    expect(payload.expected).toBe(1);
    expect(payload.actual).toBe(2);
    expect(updateMock).not.toHaveBeenCalled();
  });

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // edge cases
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('service sin enhance_org_id en metadata â†’ skip silencioso (warn log) sin event', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 1, status: 'active' },
    });
    const { prisma } = buildPrisma([
      { ...SAMPLE_SERVICE, metadata: { primary_domain: 'foo.example.com' } },
    ]);
    const { events, emitMock } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary.servicesChecked).toBe(1);
    expect(summary.subscriptionMissing).toBe(0);
    expect(summary.statusDivergence).toBe(0);
    expect(summary.planDivergence).toBe(0);
    expect(summary.errors).toBe(0);
    expect(emitMock).not.toHaveBeenCalled();
    expect(apiBundle.getSubscriptionMock).not.toHaveBeenCalled();
  });

  it('error en una iteraciÃ³n no aborta el cron â€” sigue procesando el resto', async () => {
    const getSubscriptionMock = jest
      .fn()
      // primer service: error inesperado
      .mockRejectedValueOnce(new Error('network down'))
      // segundo service: happy path
      .mockResolvedValueOnce({ id: 43, planId: 1, status: 'active' });
    const apiBundle = {
      api: { getSubscription: getSubscriptionMock },
      getSubscriptionMock,
    };
    const { prisma } = buildPrisma([
      SAMPLE_SERVICE,
      {
        ...SAMPLE_SERVICE,
        id: 'svc-2',
        provider_reference: '43',
        metadata: { ...SAMPLE_SERVICE.metadata, enhance_subscription_id: '43' },
      },
    ]);
    const { events } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle as unknown as ReturnType<typeof buildApiMock>),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary.servicesChecked).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.statusDivergence).toBe(0);
    expect(summary.planDivergence).toBe(0);
    expect(getSubscriptionMock).toHaveBeenCalledTimes(2);
  });

  it('plan_divergence NO se evalÃºa si status_divergence ya disparÃ³ (excluyentes)', async () => {
    const apiBundle = buildApiMock({
      subscription: {
        id: 42,
        planId: 99, // distinto del metadata.enhance_plan_id=1
        status: 'active',
        suspendedBy: 'admin-enhance', // fuerza status_divergence
      },
    });
    const { prisma } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitMock, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary.statusDivergence).toBe(1);
    expect(summary.planDivergence).toBe(0); // no se evalÃºa
    expect(emitMock).toHaveBeenCalledTimes(1);
    const [, payload] = emitted[0] as [string, Record<string, unknown>];
    expect(payload.change_type).toBe('status_divergence');
  });

  it('happy path con metadata.enhance_plan_id missing â†’ no plan_divergence', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 5, status: 'active' },
    });
    const { prisma } = buildPrisma([
      {
        ...SAMPLE_SERVICE,
        metadata: {
          enhance_org_id: 'cust-org-uuid',
          // no enhance_plan_id â‡’ no comparaciÃ³n
        },
      },
    ]);
    const { events, emitMock } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    const summary = await cron.runOnce();

    expect(summary.planDivergence).toBe(0);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('handleScheduled: invoca runOnce y captura errores top-level', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 1, status: 'active' },
    });
    const { prisma } = buildPrisma([SAMPLE_SERVICE]);
    const { events } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    await expect(cron.handleScheduled()).resolves.toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────────────────
  // Sprint 15C.II Fase F.2 — rollup `plugin.reconcile_completed` emitido
  // por el cron (trigger='cron') y por el executor manual (trigger='manual').
  // ──────────────────────────────────────────────────────────────────────

  it('handleScheduled emite plugin.reconcile_completed con trigger=cron', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 1, status: 'active' },
    });
    const { prisma } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      buildReconcileRegistry(),
      buildQuotaDetector(),
    );

    await cron.handleScheduled();

    const rollup = emitted.find(
      ([name]) => name === 'plugin.reconcile_completed',
    ) as [string, Record<string, unknown>] | undefined;
    expect(rollup).toBeDefined();
    expect(rollup![1]).toEqual(
      expect.objectContaining({
        plugin_slug: 'enhance_cp',
        trigger: 'cron',
        services_processed: 1,
        drifts_detected: 0,
        errors: 0,
      }),
    );
    expect(typeof rollup![1].duration_ms).toBe('number');
    expect(typeof rollup![1].completed_at).toBe('string');
  });

  it('executor manual emite plugin.reconcile_completed con trigger=manual + intervalo declarado al registry', async () => {
    const apiBundle = buildApiMock({ throwsNotFound: true });
    const { prisma } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitted } = buildEvents();
    const reconcileRegistry = buildReconcileRegistry();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      reconcileRegistry,
      buildQuotaDetector(),
    );
    cron.onModuleInit();

    expect(reconcileRegistry.getScheduleMeta('enhance_cp')).toEqual({
      intervalSeconds: 6 * 60 * 60,
    });

    await reconcileRegistry.runFor('enhance_cp');

    const rollup = emitted.find(
      ([name]) => name === 'plugin.reconcile_completed',
    ) as [string, Record<string, unknown>] | undefined;
    expect(rollup).toBeDefined();
    expect(rollup![1]).toEqual(
      expect.objectContaining({
        plugin_slug: 'enhance_cp',
        trigger: 'manual',
        services_processed: 1,
        drifts_detected: 1,
      }),
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1) —
  // onModuleInit registra executor reconcile-all en el registry global.
  // ──────────────────────────────────────────────────────────────────────

  it('onModuleInit: registra executor "enhance_cp" en ReconcileRegistryService', () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 1, status: 'active' },
    });
    const { prisma } = buildPrisma([]);
    const { events } = buildEvents();
    const reconcileRegistry = buildReconcileRegistry();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      reconcileRegistry,
      buildQuotaDetector(),
    );

    expect(reconcileRegistry.hasExecutor('enhance_cp')).toBe(false);
    cron.onModuleInit();
    expect(reconcileRegistry.hasExecutor('enhance_cp')).toBe(true);
    expect(reconcileRegistry.listRegisteredSlugs()).toContain('enhance_cp');
  });

  it('executor registrado invoca runOnce y devuelve ReconcileResult normalizado', async () => {
    const apiBundle = buildApiMock({ throwsNotFound: true });
    const { prisma } = buildPrisma([SAMPLE_SERVICE]);
    const { events } = buildEvents();
    const reconcileRegistry = buildReconcileRegistry();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
      reconcileRegistry,
      buildQuotaDetector(),
    );
    cron.onModuleInit();

    const result = await reconcileRegistry.runFor('enhance_cp');

    // Forma normalizada del shape canónico ReconcileResult
    expect(result.servicesProcessed).toBe(1);
    expect(result.driftsDetected).toBe(1); // 1 subscription_missing por throwsNotFound
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.details).toMatchObject({
      subscription_missing: 1,
      status_divergence: 0,
      plan_divergence: 0,
      errors: 0,
    });
  });
});
