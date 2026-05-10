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
  ReconcileRegistryService,
  ReconcileResult,
} from './reconcile-registry.service';

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
});
