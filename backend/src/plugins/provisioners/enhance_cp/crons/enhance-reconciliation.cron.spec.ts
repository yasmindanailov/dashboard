/**
 * Sprint 15C Fase 15C.H — tests unit `EnhanceReconciliationCron`.
 *
 * Cubre los 3 change_type canónicos (subscription_missing, status_divergence,
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

import { EnhanceProvisionerPlugin } from '../enhance.plugin';
import { EnhanceReconciliationCron } from './enhance-reconciliation.cron';

describe('EnhanceReconciliationCron — Sprint 15C Fase 15C.H (ADR-083 §6 decisión 24)', () => {
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
    return {
      api: { getSubscription: getSubscriptionMock },
      getSubscriptionMock,
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
    return {
      prisma: {
        service: { findMany: findManyMock, update: updateMock },
      } as unknown as PrismaService,
      updateMock,
      findManyMock,
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

  // ──────────────────────────────────────────────────────────────────────
  // Happy path
  // ──────────────────────────────────────────────────────────────────────

  it('happy path: status active match + planId match → no event, no update', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 1, status: 'active' },
    });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitMock } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
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

  // ──────────────────────────────────────────────────────────────────────
  // subscription_missing
  // ──────────────────────────────────────────────────────────────────────

  it('subscription_missing (404 Enhance) → emit evento + NO update status (admin decide)', async () => {
    const apiBundle = buildApiMock({ throwsNotFound: true });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitMock, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
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

  // ──────────────────────────────────────────────────────────────────────
  // status_divergence
  // ──────────────────────────────────────────────────────────────────────

  it('status_divergence active→suspended → emit + adopta status (DH-INV-6)', async () => {
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

  it('status_divergence active→cancelled (out of safe-adopt) → emit sin update', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 1, status: 'deleted' },
    });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
    );

    const summary = await cron.runOnce();

    expect(summary.statusDivergence).toBe(1);
    const [, payload] = emitted[0] as [string, Record<string, unknown>];
    expect(payload.change_type).toBe('status_divergence');
    expect(payload.actual).toBe('cancelled');
    // NO update — el caso out-of-safe-adopt-set no se auto-corrige.
    expect(updateMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // plan_divergence
  // ──────────────────────────────────────────────────────────────────────

  it('plan_divergence (Enhance planId 2 vs metadata 1) → emit + NO update (billing implication)', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 2, status: 'active' },
    });
    const { prisma, updateMock } = buildPrisma([SAMPLE_SERVICE]);
    const { events, emitted } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
    );

    const summary = await cron.runOnce();

    expect(summary.planDivergence).toBe(1);
    const [, payload] = emitted[0] as [string, Record<string, unknown>];
    expect(payload.change_type).toBe('plan_divergence');
    expect(payload.expected).toBe(1);
    expect(payload.actual).toBe(2);
    expect(updateMock).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────────────────────────────────
  // edge cases
  // ──────────────────────────────────────────────────────────────────────

  it('service sin enhance_org_id en metadata → skip silencioso (warn log) sin event', async () => {
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

  it('error en una iteración no aborta el cron — sigue procesando el resto', async () => {
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
    );

    const summary = await cron.runOnce();

    expect(summary.servicesChecked).toBe(2);
    expect(summary.errors).toBe(1);
    expect(summary.statusDivergence).toBe(0);
    expect(summary.planDivergence).toBe(0);
    expect(getSubscriptionMock).toHaveBeenCalledTimes(2);
  });

  it('plan_divergence NO se evalúa si status_divergence ya disparó (excluyentes)', async () => {
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
    );

    const summary = await cron.runOnce();

    expect(summary.statusDivergence).toBe(1);
    expect(summary.planDivergence).toBe(0); // no se evalúa
    expect(emitMock).toHaveBeenCalledTimes(1);
    const [, payload] = emitted[0] as [string, Record<string, unknown>];
    expect(payload.change_type).toBe('status_divergence');
  });

  it('happy path con metadata.enhance_plan_id missing → no plan_divergence', async () => {
    const apiBundle = buildApiMock({
      subscription: { id: 42, planId: 5, status: 'active' },
    });
    const { prisma } = buildPrisma([
      {
        ...SAMPLE_SERVICE,
        metadata: {
          enhance_org_id: 'cust-org-uuid',
          // no enhance_plan_id ⇒ no comparación
        },
      },
    ]);
    const { events, emitMock } = buildEvents();
    const cron = new EnhanceReconciliationCron(
      prisma,
      buildPlugin(apiBundle),
      events,
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
    );

    await expect(cron.handleScheduled()).resolves.toBeUndefined();
  });
});
