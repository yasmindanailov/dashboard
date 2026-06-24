import { BadRequestException } from '@nestjs/common';

import {
  DomainPricingSyncRegistryService,
  DomainPricingSyncSummary,
} from './domain-pricing-sync-registry.service';

/**
 * Sprint 15D Fase 15D.G·1 — `DomainPricingSyncRegistryService` (registry genérico
 * capability-routed para "sincronizar precios ahora").
 */
describe('DomainPricingSyncRegistryService', () => {
  let registry: DomainPricingSyncRegistryService;

  const summary: DomainPricingSyncSummary = {
    total: 3,
    written: 3,
    skippedManual: 0,
    skippedNotOffered: 0,
    skippedCurrency: 0,
    skippedInvalid: 0,
  };

  beforeEach(() => {
    registry = new DomainPricingSyncRegistryService();
  });

  it('register + runFor delega en el executor del registrar', async () => {
    const exec = jest.fn().mockResolvedValue(summary);
    registry.register('resellerclub', exec);

    expect(registry.hasExecutor('resellerclub')).toBe(true);
    await expect(registry.runFor('resellerclub')).resolves.toEqual(summary);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('runFor de un slug sin executor → BadRequestException', async () => {
    await expect(registry.runFor('ghost')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('re-register reemplaza el executor (último gana)', async () => {
    registry.register('resellerclub', jest.fn().mockResolvedValue(summary));
    const second = jest.fn().mockResolvedValue({ ...summary, written: 99 });
    registry.register('resellerclub', second);

    const result = await registry.runFor('resellerclub');
    expect(result.written).toBe(99);
    expect(registry.listRegisteredSlugs()).toEqual(['resellerclub']);
  });
});
