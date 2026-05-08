/* eslint-disable @typescript-eslint/unbound-method */
// Falsos positivos en `expect(mock.method).toHaveBeenCalled()`.

/**
 * Sprint 15C Fase 15C.D — tests unit del listener
 * `sync-default-nameservers-to-enhance`. NS-sync C3 → C2.
 */

import { EnhanceDnsDefaultsService } from '../../../plugins/provisioners/enhance_cp/enhance-dns-defaults.service';

import { SyncDefaultNameserversToEnhanceListener } from './sync-default-nameservers-to-enhance.listener';

describe('SyncDefaultNameserversToEnhanceListener', () => {
  function build(over?: { applyImpl?: jest.Mock }): {
    listener: SyncDefaultNameserversToEnhanceListener;
    defaults: EnhanceDnsDefaultsService;
  } {
    const defaults = {
      applyClusterNameservers:
        over?.applyImpl ??
        jest.fn().mockResolvedValue({
          added: [],
          preserved: [],
          stale: [],
        }),
    } as unknown as EnhanceDnsDefaultsService;
    const listener = new SyncDefaultNameserversToEnhanceListener(defaults);
    return { listener, defaults };
  }

  it('newValue válido → invoca applyClusterNameservers', async () => {
    const { listener, defaults } = build();
    await listener.handle({
      newValue: ['ns1.aelium.net', 'ns2.aelium.net'],
      oldValue: ['ns1.legacy.aelium.net', 'ns2.legacy.aelium.net'],
      changedBy: 'admin-1',
    });
    expect(defaults.applyClusterNameservers).toHaveBeenCalledWith([
      'ns1.aelium.net',
      'ns2.aelium.net',
    ]);
  });

  it('newValue vacío → skip silencioso', async () => {
    const { listener, defaults } = build();
    await listener.handle({
      newValue: [],
      oldValue: ['ns1.aelium.net'],
      changedBy: 'admin-1',
    });
    expect(defaults.applyClusterNameservers).not.toHaveBeenCalled();
  });

  it('apply throws → degrada elegante (NO propaga)', async () => {
    const { listener } = build({
      applyImpl: jest.fn().mockRejectedValue(new Error('Enhance unreachable')),
    });
    await expect(
      listener.handle({
        newValue: ['ns1.aelium.net'],
        oldValue: [],
        changedBy: 'admin-1',
      }),
    ).resolves.toBeUndefined();
  });
});
