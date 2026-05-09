import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';

import { NotificationsOnReconciliationThresholdExceededListener } from './notifications-on-reconciliation-threshold-exceeded.listener';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';

/**
 * Spec canónico — Sprint 15C Fase 15C.H (ADR-083 §6 decisión 24).
 *
 * Cubre:
 *   - Below threshold → no dispatch.
 *   - At/above threshold → dispatch + setting upsert.
 *   - Dedupe ventana 24h → ya alertado, skip.
 *   - Race condition: count + 1 (evento actual no persistido aún).
 *   - Degradación R7: errores no relanzan.
 */
describe('NotificationsOnReconciliationThresholdExceededListener', () => {
  let listener: NotificationsOnReconciliationThresholdExceededListener;
  let dispatchToSuperadmins: jest.Mock;
  let countAuditChange: jest.Mock;
  let upsertSetting: jest.Mock;
  let getSetting: jest.Mock;
  let getNumberSetting: jest.Mock;
  let invalidateCache: jest.Mock;

  const PAYLOAD = {
    service_id: 'svc-1',
    user_id: 'client-1',
    plugin_slug: 'enhance_cp',
    change_type: 'status_divergence' as const,
    expected: 'active',
    actual: 'suspended',
    detected_at: '2026-05-09T10:00:00.000Z',
  };

  beforeEach(async () => {
    dispatchToSuperadmins = jest.fn().mockResolvedValue(undefined);
    countAuditChange = jest.fn();
    upsertSetting = jest.fn().mockResolvedValue({});
    getSetting = jest.fn();
    getNumberSetting = jest.fn();
    invalidateCache = jest.fn();

    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsOnReconciliationThresholdExceededListener,
        {
          provide: NotificationsService,
          useValue: { dispatchToSuperadmins },
        },
        {
          provide: PrismaService,
          useValue: {
            auditChangeLog: { count: countAuditChange },
            setting: { upsert: upsertSetting },
          },
        },
        {
          provide: SettingsService,
          useValue: {
            get: getSetting,
            getNumber: getNumberSetting,
            invalidateCache,
          },
        },
      ],
    }).compile();

    listener = module.get(
      NotificationsOnReconciliationThresholdExceededListener,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('below threshold (count+1 < threshold) → no dispatch', async () => {
    getNumberSetting.mockResolvedValue(5);
    getSetting.mockResolvedValue(''); // never alerted
    countAuditChange.mockResolvedValue(3); // +1 = 4 < 5

    await listener.onReconciledExternalChange(PAYLOAD);

    expect(dispatchToSuperadmins).not.toHaveBeenCalled();
    expect(upsertSetting).not.toHaveBeenCalled();
  });

  it('at threshold (count+1 === threshold) → dispatch + upsert setting', async () => {
    getNumberSetting.mockResolvedValue(5);
    getSetting.mockResolvedValue('');
    countAuditChange.mockResolvedValue(4); // +1 = 5 === 5

    await listener.onReconciledExternalChange(PAYLOAD);

    expect(dispatchToSuperadmins).toHaveBeenCalledWith(
      'enhance.reconciliation_threshold_exceeded',
      expect.objectContaining({
        threshold: 5,
        count_in_last_24h: 5,
        plugin_slug: 'enhance_cp',
        last_change_type: 'status_divergence',
        last_service_id: 'svc-1',
      }),
    );
    expect(upsertSetting).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category_key: {
            category: 'provisioning',
            key: 'enhance_cp.reconciliation_last_alert_at',
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        create: expect.objectContaining({
          category: 'provisioning',
          key: 'enhance_cp.reconciliation_last_alert_at',
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        update: expect.objectContaining({ value: expect.any(String) }),
      }),
    );
    expect(invalidateCache).toHaveBeenCalledWith(
      'provisioning',
      'enhance_cp.reconciliation_last_alert_at',
    );
  });

  it('above threshold (count+1 > threshold) → dispatch', async () => {
    getNumberSetting.mockResolvedValue(5);
    getSetting.mockResolvedValue('');
    countAuditChange.mockResolvedValue(10); // +1 = 11 > 5

    await listener.onReconciledExternalChange(PAYLOAD);

    expect(dispatchToSuperadmins).toHaveBeenCalledWith(
      'enhance.reconciliation_threshold_exceeded',
      expect.objectContaining({ count_in_last_24h: 11 }),
    );
  });

  it('dedupe: ya alertado en últimas 24h → skip dispatch', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString(); // hace 1 min
    getNumberSetting.mockResolvedValue(5);
    getSetting.mockResolvedValue(recent);

    await listener.onReconciledExternalChange(PAYLOAD);

    expect(dispatchToSuperadmins).not.toHaveBeenCalled();
    expect(countAuditChange).not.toHaveBeenCalled();
    expect(upsertSetting).not.toHaveBeenCalled();
  });

  it('dedupe expirado: alerta hace >24h → re-dispatch si supera threshold', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // hace 25h
    getNumberSetting.mockResolvedValue(5);
    getSetting.mockResolvedValue(old);
    countAuditChange.mockResolvedValue(10); // +1 = 11 > 5

    await listener.onReconciledExternalChange(PAYLOAD);

    expect(dispatchToSuperadmins).toHaveBeenCalledTimes(1);
    expect(upsertSetting).toHaveBeenCalledTimes(1);
  });

  it('last_alert_at malformado (NaN) → trata como never alerted', async () => {
    getNumberSetting.mockResolvedValue(5);
    getSetting.mockResolvedValue('not-a-date');
    countAuditChange.mockResolvedValue(10);

    await listener.onReconciledExternalChange(PAYLOAD);

    expect(dispatchToSuperadmins).toHaveBeenCalled();
  });

  it('R7: dispatch falla → no relanza (degradación elegante)', async () => {
    getNumberSetting.mockResolvedValue(5);
    getSetting.mockResolvedValue('');
    countAuditChange.mockResolvedValue(10);
    dispatchToSuperadmins.mockRejectedValue(new Error('queue down'));

    await expect(
      listener.onReconciledExternalChange(PAYLOAD),
    ).resolves.toBeUndefined();
  });

  it('R7: prisma.count falla → no relanza', async () => {
    getNumberSetting.mockResolvedValue(5);
    getSetting.mockResolvedValue('');
    countAuditChange.mockRejectedValue(new Error('db down'));

    await expect(
      listener.onReconciledExternalChange(PAYLOAD),
    ).resolves.toBeUndefined();

    expect(dispatchToSuperadmins).not.toHaveBeenCalled();
  });
});
