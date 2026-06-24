// `unbound-method` da falsos positivos en specs Jest con
// `expect(mock.method).toHaveBeenCalled()`. Deshabilitado a nivel de archivo.

import { ResellerclubReconciliationCron } from './resellerclub-reconciliation.cron';

/**
 * Tests unit `ResellerclubReconciliationCron` — Fase 15D.E.
 *
 * Cobertura:
 *   - onModuleInit registra el executor reconcile-all en el registry.
 *   - puebla services.expires_at desde DomainInfo.expiresAt.
 *   - lifecycle edge-trigger: active→expired → domain.expired (Outbox);
 *     active→redemption → domain.entered_redemption; sin cambio → no emite.
 *   - safe-adopt status active↔suspended (DH-INV-6); nunca toca enum con expired.
 *   - sin cambios → no escribe (evita churn cada 6h).
 *   - RC inaccesible (getServiceInfo sin domain) → skip fail-soft.
 *   - un servicio que lanza no aborta el resto (errors contados).
 */
describe('ResellerclubReconciliationCron — Fase 15D.E', () => {
  const FUTURE_ISO = '2027-07-01T00:00:00.000Z';

  let prisma: {
    service: { findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let plugin: { getServiceInfo: jest.Mock; getTransferStatus: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let registry: { register: jest.Mock };
  let cron: ResellerclubReconciliationCron;

  beforeEach(() => {
    prisma = {
      service: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    plugin = { getServiceInfo: jest.fn(), getTransferStatus: jest.fn() };
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined) };
    registry = { register: jest.fn() };

    cron = new ResellerclubReconciliationCron(
      prisma as never,
      plugin as never,
      outbox as never,
      registry as never,
    );
  });

  function row(over: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      user_id: 'user-1',
      status: 'active',
      domain: 'example.com',
      label: 'example.com',
      provider_reference: '700123',
      expires_at: null,
      metadata: {},
      ...over,
    };
  }

  function info(status: string, lifecycle: string | null, expiresAt?: string) {
    return {
      status,
      domain: lifecycle
        ? { fqdn: 'example.com', lifecycle, expiresAt, nameservers: [] }
        : undefined,
    };
  }

  it('onModuleInit registra el executor reconcile-all (slug resellerclub)', () => {
    cron.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(
      'resellerclub',
      expect.any(Function),
      expect.objectContaining({ intervalSeconds: 6 * 60 * 60 }),
    );
  });

  it('puebla services.expires_at desde DomainInfo.expiresAt', async () => {
    prisma.service.findMany.mockResolvedValue([row()]);
    plugin.getServiceInfo.mockResolvedValue(
      info('active', 'active', FUTURE_ISO),
    );

    const summary = await cron.runOnce();

    expect(summary.expiresAtUpdated).toBe(1);
    const updateArg = (
      prisma.service.update.mock.calls as Array<
        [{ data: { expires_at?: Date } }]
      >
    )[0][0];
    expect(updateArg.data.expires_at).toEqual(new Date(FUTURE_ISO));
  });

  it('persiste metadata.nameservers cuando el registrar reporta NS distintos (F.3)', async () => {
    prisma.service.findMany.mockResolvedValue([
      row({
        metadata: {
          domain_lifecycle: 'active',
          nameservers: ['ns1.old.net', 'ns2.old.net'],
        },
      }),
    ]);
    plugin.getServiceInfo.mockResolvedValue({
      status: 'active',
      domain: {
        fqdn: 'example.com',
        lifecycle: 'active',
        expiresAt: undefined,
        nameservers: ['ns1.aelium.net', 'ns2.aelium.net'],
      },
    });

    await cron.runOnce();

    const updateArg = (
      prisma.service.update.mock.calls as Array<
        [{ data: { metadata: { nameservers: string[] } } }]
      >
    )[0][0];
    expect(updateArg.data.metadata.nameservers).toEqual([
      'ns1.aelium.net',
      'ns2.aelium.net',
    ]);
  });

  it('NO reescribe si los NS no cambian (ignora orden/case — evita churn)', async () => {
    prisma.service.findMany.mockResolvedValue([
      row({
        metadata: {
          domain_lifecycle: 'active',
          nameservers: ['ns2.aelium.net', 'NS1.aelium.net'],
        },
      }),
    ]);
    plugin.getServiceInfo.mockResolvedValue({
      status: 'active',
      domain: {
        fqdn: 'example.com',
        lifecycle: 'active',
        expiresAt: undefined,
        nameservers: ['ns1.aelium.net', 'ns2.aelium.net'],
      },
    });

    await cron.runOnce();

    expect(prisma.service.update).not.toHaveBeenCalled();
  });

  it('lifecycle active→expired → emite domain.expired (Outbox) y persiste lifecycle', async () => {
    prisma.service.findMany.mockResolvedValue([
      row({ metadata: { domain_lifecycle: 'active' } }),
    ]);
    plugin.getServiceInfo.mockResolvedValue(
      info('expired', 'expired', FUTURE_ISO),
    );

    const summary = await cron.runOnce();

    expect(summary.lifecycleTransitions).toBe(1);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'domain.expired',
      expect.objectContaining({ service_id: 'svc-1', fqdn: 'example.com' }),
    );
    const updateArg = (
      prisma.service.update.mock.calls as Array<
        [{ data: { metadata: { domain_lifecycle: string } } }]
      >
    )[0][0];
    expect(updateArg.data.metadata.domain_lifecycle).toBe('expired');
  });

  it('lifecycle active→redemption → emite domain.entered_redemption', async () => {
    prisma.service.findMany.mockResolvedValue([
      row({ metadata: { domain_lifecycle: 'active' } }),
    ]);
    plugin.getServiceInfo.mockResolvedValue(
      info('expired', 'redemption', FUTURE_ISO),
    );

    await cron.runOnce();

    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'domain.entered_redemption',
      expect.objectContaining({ service_id: 'svc-1' }),
    );
  });

  it('lifecycle sin cambio (expired→expired, expires igual) → NO emite ni escribe', async () => {
    prisma.service.findMany.mockResolvedValue([
      row({
        expires_at: new Date(FUTURE_ISO),
        metadata: { domain_lifecycle: 'expired' },
      }),
    ]);
    plugin.getServiceInfo.mockResolvedValue(
      info('active', 'expired', FUTURE_ISO),
    );

    const summary = await cron.runOnce();

    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(summary.lifecycleTransitions).toBe(0);
  });

  it('safe-adopt: registrar suspended + Aelium active → status=suspended (DH-INV-6)', async () => {
    prisma.service.findMany.mockResolvedValue([
      row({
        status: 'active',
        expires_at: new Date(FUTURE_ISO),
        metadata: { domain_lifecycle: 'active' },
      }),
    ]);
    plugin.getServiceInfo.mockResolvedValue(
      info('suspended', 'active', FUTURE_ISO),
    );

    const summary = await cron.runOnce();

    expect(summary.statusAdopted).toBe(1);
    const updateArg = (
      prisma.service.update.mock.calls as Array<[{ data: { status?: string } }]>
    )[0][0];
    expect(updateArg.data.status).toBe('suspended');
  });

  it('expired NO se escribe en services.status (A2.3): solo expires_at/lifecycle', async () => {
    prisma.service.findMany.mockResolvedValue([
      row({ metadata: { domain_lifecycle: 'active' } }),
    ]);
    plugin.getServiceInfo.mockResolvedValue(
      info('expired', 'expired', FUTURE_ISO),
    );

    await cron.runOnce();

    const updateArg = (
      prisma.service.update.mock.calls as Array<[{ data: { status?: string } }]>
    )[0][0];
    expect(updateArg.data.status).toBeUndefined();
  });

  it('RC inaccesible (getServiceInfo sin domain) → skip fail-soft', async () => {
    prisma.service.findMany.mockResolvedValue([row()]);
    plugin.getServiceInfo.mockResolvedValue(info('unknown', null));

    const summary = await cron.runOnce();

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(summary.errors).toBe(0);
  });

  it('un servicio que lanza no aborta el resto (errors contados)', async () => {
    prisma.service.findMany.mockResolvedValue([
      row({ id: 'svc-boom' }),
      row({ id: 'svc-ok', metadata: { domain_lifecycle: 'active' } }),
    ]);
    plugin.getServiceInfo
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(info('active', 'active', FUTURE_ISO));

    const summary = await cron.runOnce();

    expect(summary.errors).toBe(1);
    expect(summary.servicesChecked).toBe(2);
    expect(summary.expiresAtUpdated).toBe(1);
  });

  // ─── 15D.II.T2b — motor de la FSM de transfer-in ────────────────────────────

  function transferRow(over: Record<string, unknown> = {}) {
    return row({
      status: 'provisioning',
      metadata: {
        domain_operation: 'transfer_in',
        transfer_state: 'submitted',
      },
      ...over,
    });
  }

  it('transfer submitted→completed → status=active + expires_at + transfer_state=completed', async () => {
    prisma.service.findMany.mockResolvedValue([transferRow()]);
    plugin.getTransferStatus.mockResolvedValue('completed');
    plugin.getServiceInfo.mockResolvedValue({
      status: 'active',
      domain: {
        fqdn: 'example.com',
        lifecycle: 'active',
        expiresAt: FUTURE_ISO,
        nameservers: ['ns1.aelium.net', 'ns2.aelium.net'],
      },
    });

    const summary = await cron.runOnce();

    expect(summary.transfersCompleted).toBe(1);
    const updateArg = (
      prisma.service.update.mock.calls as Array<
        [
          {
            data: {
              status?: string;
              expires_at?: Date;
              metadata: Record<string, unknown>;
            };
          },
        ]
      >
    )[0][0];
    expect(updateArg.data.status).toBe('active');
    expect(updateArg.data.expires_at).toEqual(new Date(FUTURE_ISO));
    expect(updateArg.data.metadata.transfer_state).toBe('completed');
    expect(updateArg.data.metadata.nameservers).toEqual([
      'ns1.aelium.net',
      'ns2.aelium.net',
    ]);
    // Cobro al completar + zona DNS: emite domain.transfer_completed en la tx (T2c.2).
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'domain.transfer_completed',
      expect.objectContaining({ service_id: 'svc-1', fqdn: 'example.com' }),
    );
  });

  it('transfer submitted→failed → cierra la FSM (transfer_state=failed), NO toca status + emite domain.transfer_failed', async () => {
    prisma.service.findMany.mockResolvedValue([transferRow()]);
    plugin.getTransferStatus.mockResolvedValue('failed');

    const summary = await cron.runOnce();

    expect(summary.transfersFailed).toBe(1);
    const updateArg = (
      prisma.service.update.mock.calls as Array<
        [{ data: { status?: string; metadata: Record<string, unknown> } }]
      >
    )[0][0];
    expect(updateArg.data.status).toBeUndefined();
    expect(updateArg.data.metadata.transfer_state).toBe('failed');
    // Un transfer en curso NO pasa por el lifecycle (getServiceInfo).
    expect(plugin.getServiceInfo).not.toHaveBeenCalled();
    // T3: emite domain.transfer_failed (Outbox, misma tx) con el motivo.
    expect(outbox.enqueue).toHaveBeenCalledWith(
      prisma,
      'domain.transfer_failed',
      expect.objectContaining({ service_id: 'svc-1', reason: 'failed' }),
    );
  });

  it('transfer aún submitted → sin cambios (no escribe)', async () => {
    prisma.service.findMany.mockResolvedValue([transferRow()]);
    plugin.getTransferStatus.mockResolvedValue('submitted');

    const summary = await cron.runOnce();

    expect(prisma.service.update).not.toHaveBeenCalled();
    expect(summary.transfersCompleted).toBe(0);
    expect(summary.transfersFailed).toBe(0);
  });

  it('transfer con RC caído (unknown) → skip fail-soft', async () => {
    prisma.service.findMany.mockResolvedValue([transferRow()]);
    plugin.getTransferStatus.mockResolvedValue('unknown');

    await cron.runOnce();

    expect(prisma.service.update).not.toHaveBeenCalled();
  });
});
