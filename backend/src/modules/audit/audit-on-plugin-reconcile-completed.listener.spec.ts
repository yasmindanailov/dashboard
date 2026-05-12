import { Test, TestingModule } from '@nestjs/testing';

import { AuditOnPluginReconcileCompletedListener } from './audit-on-plugin-reconcile-completed.listener';
import { AuditService } from './audit.service';
import { deriveAuditEntityId } from '../../core/provisioning/plugin-audit-id.util';

/**
 * Spec — Sprint 15C.II Fase F.2 (ADR-083 §6 Amendment `plugin.reconcile_completed`).
 *
 * Cubre:
 *   - Persiste en `audit_change_log` con `user_id=null` (sistema),
 *     `entity_type='Plugin'`, `entity_id=deriveAuditEntityId(slug)`,
 *     `action='reconcile_completed'`.
 *   - `changes_after` lleva el rollup (trigger, services_processed,
 *     drifts_detected, errors, duration_ms, completed_at) + el slug legible.
 *   - R7: si el audit falla, el listener NO relanza.
 */
describe('AuditOnPluginReconcileCompletedListener', () => {
  let listener: AuditOnPluginReconcileCompletedListener;
  let auditMock: jest.Mocked<Pick<AuditService, 'logChange'>>;

  beforeEach(async () => {
    auditMock = { logChange: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditOnPluginReconcileCompletedListener,
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    listener = module.get(AuditOnPluginReconcileCompletedListener);
  });

  const payload = {
    plugin_slug: 'enhance_cp',
    trigger: 'cron' as const,
    services_processed: 7,
    drifts_detected: 2,
    errors: 0,
    duration_ms: 1234,
    completed_at: '2026-05-12T18:00:00.000Z',
  };

  it('persiste audit_change_log Plugin/reconcile_completed con user_id=null', async () => {
    await listener.onReconcileCompleted(payload);

    expect(auditMock.logChange).toHaveBeenCalledTimes(1);
    const call = auditMock.logChange.mock.calls[0][0];
    expect(call.user_id).toBeNull();
    expect(call.entity_type).toBe('Plugin');
    expect(call.entity_id).toBe(deriveAuditEntityId('enhance_cp'));
    expect(call.action).toBe('reconcile_completed');
    expect(call.changes_before).toBeNull();
    expect(call.changes_after).toEqual({
      slug: 'enhance_cp',
      trigger: 'cron',
      services_processed: 7,
      drifts_detected: 2,
      errors: 0,
      duration_ms: 1234,
      completed_at: '2026-05-12T18:00:00.000Z',
    });
  });

  it('trigger=manual se propaga al audit', async () => {
    await listener.onReconcileCompleted({ ...payload, trigger: 'manual' });
    const call = auditMock.logChange.mock.calls[0][0];
    expect((call.changes_after as Record<string, unknown>).trigger).toBe(
      'manual',
    );
  });

  it('R7: si logChange lanza, el listener no relanza', async () => {
    auditMock.logChange.mockRejectedValueOnce(new Error('db down'));
    await expect(
      listener.onReconcileCompleted(payload),
    ).resolves.toBeUndefined();
  });
});
