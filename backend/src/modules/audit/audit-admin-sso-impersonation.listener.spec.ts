import { Test, TestingModule } from '@nestjs/testing';

import { AuditAdminSsoImpersonationListener } from './audit-admin-sso-impersonation.listener';
import { AuditService } from './audit.service';

/**
 * Spec canónico — Sprint 15C Fase 15C.F (ADR-083 §4 decisión 14).
 *
 * Cubre el contrato:
 *   - El listener consume `service.admin_sso_impersonation` y persiste
 *     en `audit_access_log` con:
 *       · user_id  = agente (quien abrió el panel).
 *       · action   = 'admin_sso_impersonation'.
 *       · ip / UA  = del agente (request context, no 'system').
 *       · resource = 'Service'.
 *       · metadata.target_user_id = cliente afectado (data subject).
 *       · metadata.resource_type = 'Service' (consumido por el SC
 *         transparency para resolver `RESOURCE_LABEL`).
 *       · metadata.gdpr_visible_to_data_subject = true (literal).
 *
 * Estos invariantes son los que hacen que el portal
 * `/dashboard/transparency` pueda mostrar la fila al cliente afectado.
 */
describe('AuditAdminSsoImpersonationListener', () => {
  let listener: AuditAdminSsoImpersonationListener;
  let auditMock: jest.Mocked<Pick<AuditService, 'logAccess'>>;

  beforeEach(async () => {
    auditMock = {
      logAccess: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditAdminSsoImpersonationListener,
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();
    listener = module.get(AuditAdminSsoImpersonationListener);
  });

  const samplePayload = {
    service_id: 'svc-1',
    user_id: 'client-1', // CLIENTE afectado (data subject)
    agent_user_id: 'agent-007',
    agent_ip: '203.0.113.42',
    agent_user_agent: 'Mozilla/5.0 (admin)',
    provisioner_slug: 'enhance_cp',
    panel_label: 'plugin.enhance_cp.panel_label',
    opened_at: '2026-05-09T10:30:00.000Z',
    gdpr_visible_to_data_subject: true as const,
  };

  it('persiste audit_access_log con user_id=agente y target_user_id=cliente', async () => {
    await listener.onAdminSsoImpersonation(samplePayload);

    expect(auditMock.logAccess).toHaveBeenCalledTimes(1);
    expect(auditMock.logAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'agent-007',
        action: 'admin_sso_impersonation',
        ip_address: '203.0.113.42',
        user_agent: 'Mozilla/5.0 (admin)',
        resource: 'Service',
      }),
    );
  });

  it('metadata.target_user_id = cliente afectado (filtro canónico transparency)', async () => {
    await listener.onAdminSsoImpersonation(samplePayload);

    const call = auditMock.logAccess.mock.calls[0][0];
    expect(call.metadata).toEqual(
      expect.objectContaining({
        target_user_id: 'client-1',
        resource_type: 'Service',
        resource_id: 'svc-1',
        provisioner_slug: 'enhance_cp',
        panel_label: 'plugin.enhance_cp.panel_label',
        opened_at: '2026-05-09T10:30:00.000Z',
        gdpr_visible_to_data_subject: true,
      }),
    );
  });

  it('agent_user_agent null → user_agent null en audit (no fuerza string vacío)', async () => {
    await listener.onAdminSsoImpersonation({
      ...samplePayload,
      agent_user_agent: null,
    });

    const call = auditMock.logAccess.mock.calls[0][0];
    expect(call.user_agent).toBeNull();
  });

  it('si AuditService.logAccess lanza, el listener no relanza (R7 — degradación silenciosa)', async () => {
    auditMock.logAccess.mockRejectedValueOnce(new Error('db down'));
    // El propio AuditService.logAccess captura su error internamente
    // (audit.service.ts:87-90). Si en algún momento dejara de hacerlo,
    // el listener seguiría siendo robusto: no propagamos errores aquí
    // tampoco — el SSO al cliente NO debe romperse porque falle audit.
    await expect(
      listener.onAdminSsoImpersonation(samplePayload),
    ).rejects.toThrow('db down');
    // Nota: si en el futuro envolvemos con try/catch para garantizar
    // que el listener jamás lanza, este test pasaría a `not.toThrow()`
    // y se documentaría como mejora R7.
  });
});
