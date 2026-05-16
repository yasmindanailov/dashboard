/**
 * Sprint 15C.II Fase B (ADR-083 Amendment A4.2 + gap G1) — tests unit
 * para `ReconcileRegistryService` (registry genérico de executors
 * reconcile-all admin endpoint).
 *
 * Cubre:
 *   - register(): primer registro + re-register (warning).
 *   - runFor(): happy path + slug sin executor (BadRequestException).
 *   - hasExecutor(): true/false.
 *   - listRegisteredSlugs(): orden alfabético determinista.
 */

import { BadRequestException } from '@nestjs/common';

import {
  ReconcileExecutor,
  ReconcileOneExecutor,
  ReconcileRegistryService,
  ReconcileResult,
} from './reconcile-registry.service';
import {
  ProvisionerPluginError,
  ServiceReconcileResult,
  ServiceWithRelations,
} from './types';

const FAKE_SERVICE = {
  id: 'svc-test',
  user_id: 'user-test',
  product_id: 'prod-test',
  status: 'active',
  label: 'Test',
  domain: null,
  server_id: null,
  provisioner_slug: 'plugin-x',
  provider_reference: '123',
  client: {
    id: 'user-test',
    email: 'test@aelium.test',
    first_name: 'Test',
    last_name: 'User',
    company_name: null,
    phone: null,
    locale: 'es',
    country_code: null,
  },
  product: {
    id: 'prod-test',
    slug: 'product-test',
    name: 'Product Test',
    type: 'hosting_web',
    provisioner: 'plugin-x',
    provisioner_config: null,
  },
} as unknown as ServiceWithRelations;

const EMPTY_RECONCILE_RESULT: ServiceReconcileResult = {
  driftsDetected: [],
  driftsApplied: [],
  reconciledAt: new Date('2026-05-16T13:00:00Z'),
};

describe('ReconcileRegistryService — Sprint 15C.II Fase B (ADR-083 Amendment A4.2)', () => {
  let registry: ReconcileRegistryService;

  beforeEach(() => {
    registry = new ReconcileRegistryService();
  });

  // ─── register() + hasExecutor() ───────────────────────────────────────

  it('register: primer registro queda activo + hasExecutor true', () => {
    expect(registry.hasExecutor('enhance_cp')).toBe(false);
    const exec: ReconcileExecutor = () =>
      Promise.resolve({
        servicesProcessed: 0,
        driftsDetected: 0,
        durationMs: 0,
      });
    registry.register('enhance_cp', exec);
    expect(registry.hasExecutor('enhance_cp')).toBe(true);
  });

  it('register: re-register reemplaza + loguea warning (idempotente)', async () => {
    const exec1: ReconcileExecutor = () =>
      Promise.resolve({
        servicesProcessed: 1,
        driftsDetected: 0,
        durationMs: 1,
      });
    const exec2: ReconcileExecutor = () =>
      Promise.resolve({
        servicesProcessed: 99,
        driftsDetected: 9,
        durationMs: 99,
      });

    registry.register('enhance_cp', exec1);
    registry.register('enhance_cp', exec2); // overwrite

    const result = await registry.runFor('enhance_cp');
    expect(result.servicesProcessed).toBe(99);
    expect(result.driftsDetected).toBe(9);
  });

  // ─── runFor() ─────────────────────────────────────────────────────────

  it('runFor: invoca executor + devuelve ReconcileResult', async () => {
    const expected: ReconcileResult = {
      servicesProcessed: 5,
      driftsDetected: 2,
      durationMs: 42,
      details: { subscription_missing: 1, status_divergence: 1 },
    };
    registry.register('plugin-x', () => Promise.resolve(expected));

    const result = await registry.runFor('plugin-x');
    expect(result).toEqual(expected);
  });

  it('runFor: BadRequestException si slug no tiene executor (mensaje cita slugs disponibles)', async () => {
    registry.register('enhance_cp', () =>
      Promise.resolve({
        servicesProcessed: 0,
        driftsDetected: 0,
        durationMs: 0,
      }),
    );
    registry.register('resellerclub', () =>
      Promise.resolve({
        servicesProcessed: 0,
        driftsDetected: 0,
        durationMs: 0,
      }),
    );

    await expect(registry.runFor('plugin-no-existe')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    try {
      await registry.runFor('plugin-no-existe');
    } catch (err) {
      expect((err as Error).message).toContain('plugin-no-existe');
      // Lista slugs disponibles para diagnóstico
      expect((err as Error).message).toContain('enhance_cp');
      expect((err as Error).message).toContain('resellerclub');
    }
  });

  it('runFor: propaga error del executor (no enmascara)', async () => {
    registry.register('plugin-broken', () =>
      Promise.reject(new Error('upstream down')),
    );
    await expect(registry.runFor('plugin-broken')).rejects.toThrow(
      'upstream down',
    );
  });

  // ─── listRegisteredSlugs() ────────────────────────────────────────────

  it('listRegisteredSlugs: orden alfabético determinista (útil para tests)', () => {
    const noop: ReconcileExecutor = () =>
      Promise.resolve({
        servicesProcessed: 0,
        driftsDetected: 0,
        durationMs: 0,
      });
    registry.register('zebra', noop);
    registry.register('alpha', noop);
    registry.register('mango', noop);
    expect(registry.listRegisteredSlugs()).toEqual(['alpha', 'mango', 'zebra']);
  });

  it('listRegisteredSlugs: vacío al inicio', () => {
    expect(registry.listRegisteredSlugs()).toEqual([]);
  });

  // ─── Sprint 15C.II Fase F.9 — reconcileOne (ADR-077 Amendment A8) ─────
  // R1 frozen + Amendment II DI (executor registrado por el cron del plugin).

  describe('reconcileOne F.9 (per-servicio)', () => {
    it('registerReconcileOne: primer registro queda activo + hasReconcileOneExecutor true', () => {
      expect(registry.hasReconcileOneExecutor('enhance_cp')).toBe(false);
      const exec: ReconcileOneExecutor = () =>
        Promise.resolve(EMPTY_RECONCILE_RESULT);
      registry.registerReconcileOne('enhance_cp', exec);
      expect(registry.hasReconcileOneExecutor('enhance_cp')).toBe(true);
    });

    it('registerReconcileOne: re-register reemplaza + loguea warning (idempotente)', async () => {
      const exec1: ReconcileOneExecutor = () =>
        Promise.resolve(EMPTY_RECONCILE_RESULT);
      const exec2: ReconcileOneExecutor = () =>
        Promise.resolve({
          ...EMPTY_RECONCILE_RESULT,
          driftsDetected: [
            {
              type: 'plan_divergence',
              before: 1,
              after: 2,
              applied: true,
            },
          ],
          driftsApplied: [
            {
              type: 'plan_divergence',
              before: 1,
              after: 2,
              applied: true,
            },
          ],
        });

      registry.registerReconcileOne('enhance_cp', exec1);
      registry.registerReconcileOne('enhance_cp', exec2); // overwrite

      const result = await registry.reconcileOne('enhance_cp', FAKE_SERVICE);
      expect(result.driftsApplied).toHaveLength(1);
    });

    it('reconcileOne: invoca executor + devuelve ServiceReconcileResult', async () => {
      const expected: ServiceReconcileResult = {
        driftsDetected: [
          {
            type: 'status_divergence',
            before: 'active',
            after: 'suspended',
            applied: true,
          },
        ],
        driftsApplied: [
          {
            type: 'status_divergence',
            before: 'active',
            after: 'suspended',
            applied: true,
          },
        ],
        reconciledAt: new Date('2026-05-16T13:30:00Z'),
      };
      registry.registerReconcileOne('plugin-x', () =>
        Promise.resolve(expected),
      );

      const result = await registry.reconcileOne('plugin-x', FAKE_SERVICE);
      expect(result).toEqual(expected);
    });

    it('reconcileOne: plugin sin executor → ProvisionerPluginError(RECONCILE_ONE_NOT_SUPPORTED) con module=reconcile', async () => {
      // Otros plugins registrados pero NO el target — no debe afectar.
      registry.registerReconcileOne('enhance_cp', () =>
        Promise.resolve(EMPTY_RECONCILE_RESULT),
      );

      let caught: unknown;
      try {
        await registry.reconcileOne('plugin-no-existe', FAKE_SERVICE);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ProvisionerPluginError);
      const err = caught as ProvisionerPluginError;
      expect(err.code).toBe('RECONCILE_ONE_NOT_SUPPORTED');
      expect(err.retriable).toBe(false);
      expect(err.module).toBe('reconcile'); // GAP-N F.3
      expect(err.message).toContain('plugin-no-existe');
    });

    it('reconcileOne: propaga error del executor sin enmascarar', async () => {
      registry.registerReconcileOne('plugin-broken', () =>
        Promise.reject(new Error('upstream provider down')),
      );
      await expect(
        registry.reconcileOne('plugin-broken', FAKE_SERVICE),
      ).rejects.toThrow('upstream provider down');
    });

    it('reconcileOne y runFor coexisten sin interferir (mappings independientes)', async () => {
      // El mismo slug puede tener executor reconcile-all Y reconcileOne — son maps separados.
      const reconcileAllResult: ReconcileResult = {
        servicesProcessed: 3,
        driftsDetected: 1,
        durationMs: 100,
      };
      const reconcileOneResult: ServiceReconcileResult = {
        ...EMPTY_RECONCILE_RESULT,
        driftsDetected: [
          {
            type: 'plan_divergence',
            before: 'starter',
            after: 'pro',
            applied: true,
          },
        ],
        driftsApplied: [
          {
            type: 'plan_divergence',
            before: 'starter',
            after: 'pro',
            applied: true,
          },
        ],
      };

      registry.register('enhance_cp', () =>
        Promise.resolve(reconcileAllResult),
      );
      registry.registerReconcileOne('enhance_cp', () =>
        Promise.resolve(reconcileOneResult),
      );

      expect(registry.hasExecutor('enhance_cp')).toBe(true);
      expect(registry.hasReconcileOneExecutor('enhance_cp')).toBe(true);

      const all = await registry.runFor('enhance_cp');
      expect(all.servicesProcessed).toBe(3);

      const single = await registry.reconcileOne('enhance_cp', FAKE_SERVICE);
      expect(single.driftsApplied).toHaveLength(1);
    });
  });
});
