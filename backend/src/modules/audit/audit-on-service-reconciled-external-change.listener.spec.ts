import { Test, TestingModule } from '@nestjs/testing';

import { AuditOnServiceReconciledExternalChangeListener } from './audit-on-service-reconciled-external-change.listener';
import { AuditService } from './audit.service';

/**
 * Spec canónico — Sprint 15C Fase 15C.H (ADR-083 §6 decisión 24).
 *
 * Cubre:
 *   - Persiste en `audit_change_log` con user_id=null (sistema), entity
 *     Service, action 'reconciled_external_change'.
 *   - changes_before.value = expected; changes_after.value = actual.
 *   - changes_after._meta encapsula: plugin_slug, change_type,
 *     target_user_id, gdpr_visible_to_data_subject, detected_at.
 *   - Doctrina del flag GDPR (subscription_missing/status_divergence
 *     visible al cliente; plan_divergence solo admin).
 */
describe('AuditOnServiceReconciledExternalChangeListener', () => {
  let listener: AuditOnServiceReconciledExternalChangeListener;
  let auditMock: jest.Mocked<Pick<AuditService, 'logChange'>>;

  beforeEach(async () => {
    auditMock = {
      logChange: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditOnServiceReconciledExternalChangeListener,
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    listener = module.get(AuditOnServiceReconciledExternalChangeListener);
  });

  const basePayload = {
    service_id: 'svc-1',
    user_id: 'client-1',
    plugin_slug: 'enhance_cp',
    expected: 'active',
    actual: 'suspended',
    detected_at: '2026-05-09T10:30:00.000Z',
  };

  it('status_divergence: persiste audit_change_log con user_id=null + GDPR visible=true', async () => {
    await listener.onReconciledExternalChange({
      ...basePayload,
      change_type: 'status_divergence',
    });

    expect(auditMock.logChange).toHaveBeenCalledTimes(1);
    const call = auditMock.logChange.mock.calls[0][0];
    expect(call.user_id).toBeNull();
    expect(call.entity_type).toBe('Service');
    expect(call.entity_id).toBe('svc-1');
    expect(call.action).toBe('reconciled_external_change');
    expect(call.changes_before).toEqual({ value: 'active' });
    expect(call.changes_after).toEqual(
      expect.objectContaining({
        value: 'suspended',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        _meta: expect.objectContaining({
          plugin_slug: 'enhance_cp',
          change_type: 'status_divergence',
          target_user_id: 'client-1',
          gdpr_visible_to_data_subject: true,
          detected_at: '2026-05-09T10:30:00.000Z',
        }),
      }),
    );
  });

  it('subscription_missing: GDPR visible=true (afecta directamente al cliente)', async () => {
    await listener.onReconciledExternalChange({
      ...basePayload,
      change_type: 'subscription_missing',
      expected: { status: 'active' },
      actual: { status: 'missing_in_provider' },
    });

    const call = auditMock.logChange.mock.calls[0][0];
    expect((call.changes_after as Record<string, unknown>)._meta).toEqual(
      expect.objectContaining({
        change_type: 'subscription_missing',
        gdpr_visible_to_data_subject: true,
      }),
    );
  });

  it('plan_divergence: GDPR visible=false (solo admin — billing implication)', async () => {
    await listener.onReconciledExternalChange({
      ...basePayload,
      change_type: 'plan_divergence',
      expected: 1,
      actual: 2,
    });

    const call = auditMock.logChange.mock.calls[0][0];
    expect(call.changes_before).toEqual({ value: 1 });
    expect(call.changes_after).toEqual(
      expect.objectContaining({
        value: 2,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        _meta: expect.objectContaining({
          change_type: 'plan_divergence',
          gdpr_visible_to_data_subject: false,
        }),
      }),
    );
  });

  it('preserva detected_at del payload (NO genera timestamp propio)', async () => {
    await listener.onReconciledExternalChange({
      ...basePayload,
      change_type: 'status_divergence',
      detected_at: '2026-12-31T23:59:59.999Z',
    });

    const call = auditMock.logChange.mock.calls[0][0];
    const meta = (call.changes_after as Record<string, unknown>)
      ._meta as Record<string, unknown>;
    expect(meta.detected_at).toBe('2026-12-31T23:59:59.999Z');
  });
});
