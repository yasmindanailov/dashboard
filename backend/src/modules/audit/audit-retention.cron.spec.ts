import { Logger } from '@nestjs/common';

import { AuditRetentionCron } from './audit-retention.cron';

/**
 * Tests unit `AuditRetentionCron` — audit 2026-06-25 GL-5 / H3a.
 *
 * Foco: el cron de retención purga AMBAS tablas de auditoría
 * (`audit_access_log` + `audit_change_log`), cada una con su propio setting de
 * retención, y de forma INDEPENDIENTE (R7: un fallo en una no impide la otra).
 * Antes solo purgaba `access_log` → `change_log` acumulaba PII sin límite
 * (ADR-010 §Retención manda 2 años → borrado para ambas).
 */
describe('AuditRetentionCron — purga access + change (GL-5/H3a)', () => {
  let auditService: {
    cleanupOldAccessLogs: jest.Mock;
    cleanupOldChangeLogs: jest.Mock;
  };
  let settings: { getNumber: jest.Mock };
  let cron: AuditRetentionCron;

  beforeEach(() => {
    auditService = {
      cleanupOldAccessLogs: jest.fn().mockResolvedValue(0),
      cleanupOldChangeLogs: jest.fn().mockResolvedValue(0),
    };
    settings = {
      getNumber: jest
        .fn()
        .mockImplementation((_cat: string, key: string, def: number) =>
          Promise.resolve(
            key === 'access_retention_days'
              ? 730
              : key === 'change_retention_days'
                ? 365
                : def,
          ),
        ),
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    cron = new AuditRetentionCron(auditService as never, settings as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('purga AMBAS tablas con su propia retención (access_retention_days + change_retention_days)', async () => {
    await cron.cleanupOldAuditLogs();

    expect(auditService.cleanupOldAccessLogs).toHaveBeenCalledWith(730);
    expect(auditService.cleanupOldChangeLogs).toHaveBeenCalledWith(365);
  });

  it('usa el default 730 para cada tabla si el setting no existe', async () => {
    settings.getNumber.mockImplementation(
      (_cat: string, _key: string, def: number) => Promise.resolve(def),
    );

    await cron.cleanupOldAuditLogs();

    expect(auditService.cleanupOldAccessLogs).toHaveBeenCalledWith(730);
    expect(auditService.cleanupOldChangeLogs).toHaveBeenCalledWith(730);
  });

  it('si el purgado de access falla, igualmente purga change (R7 — independientes)', async () => {
    auditService.cleanupOldAccessLogs.mockRejectedValueOnce(
      new Error('DB down'),
    );

    await expect(cron.cleanupOldAuditLogs()).resolves.toBeUndefined();

    expect(auditService.cleanupOldChangeLogs).toHaveBeenCalledWith(365);
  });

  it('si el purgado de change falla, no relanza (el cron sigue vivo)', async () => {
    auditService.cleanupOldChangeLogs.mockRejectedValueOnce(
      new Error('DB down'),
    );

    await expect(cron.cleanupOldAuditLogs()).resolves.toBeUndefined();

    expect(auditService.cleanupOldAccessLogs).toHaveBeenCalledWith(730);
  });
});
