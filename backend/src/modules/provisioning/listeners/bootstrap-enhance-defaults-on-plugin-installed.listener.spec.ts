/* eslint-disable @typescript-eslint/unbound-method */
// Falsos positivos en `expect(mock.method).toHaveBeenCalled()` — patrón
// canónico de los specs Jest del proyecto.

/**
 * Sprint 15C Fase 15C.D — tests unit del listener
 * `bootstrap-enhance-defaults-on-plugin-installed`.
 */

import { SettingsService } from '../../../core/settings/settings.service';
import { EnhanceDnsDefaultsService } from '../../../plugins/provisioners/enhance_cp/enhance-dns-defaults.service';

import { BootstrapEnhanceDefaultsOnPluginInstalledListener } from './bootstrap-enhance-defaults-on-plugin-installed.listener';

describe('BootstrapEnhanceDefaultsOnPluginInstalledListener', () => {
  function build(over?: { settingsValue?: unknown; applyImpl?: jest.Mock }): {
    listener: BootstrapEnhanceDefaultsOnPluginInstalledListener;
    settings: SettingsService;
    defaults: EnhanceDnsDefaultsService;
  } {
    const settings = {
      getJson: jest
        .fn()
        .mockResolvedValue(
          over?.settingsValue ?? ['ns1.aelium.net', 'ns2.aelium.net'],
        ),
    } as unknown as SettingsService;
    const defaults = {
      applyClusterNameservers:
        over?.applyImpl ??
        jest.fn().mockResolvedValue({
          added: [],
          preserved: [
            { id: 'd1', kind: 'NS', name: '@', value: 'ns1.aelium.net' },
            { id: 'd2', kind: 'NS', name: '@', value: 'ns2.aelium.net' },
          ],
          stale: [],
        }),
    } as unknown as EnhanceDnsDefaultsService;
    const listener = new BootstrapEnhanceDefaultsOnPluginInstalledListener(
      settings,
      defaults,
    );
    return { listener, settings, defaults };
  }

  it('slug != enhance_cp → no-op', async () => {
    const { listener, defaults } = build();
    await listener.handle({
      slug: 'manual',
      installed_by: 'admin-1',
      installed_at: '2026-05-08T00:00:00Z',
    });
    expect(defaults.applyClusterNameservers).not.toHaveBeenCalled();
  });

  it('slug=enhance_cp → invoca applyClusterNameservers con setting C3', async () => {
    const { listener, defaults } = build();
    await listener.handle({
      slug: 'enhance_cp',
      installed_by: 'admin-1',
      installed_at: '2026-05-08T00:00:00Z',
    });
    expect(defaults.applyClusterNameservers).toHaveBeenCalledWith([
      'ns1.aelium.net',
      'ns2.aelium.net',
    ]);
  });

  it('setting empty → skip + warn (no lanza)', async () => {
    const { listener, defaults } = build({ settingsValue: [] });
    await listener.handle({
      slug: 'enhance_cp',
      installed_by: 'admin-1',
      installed_at: '2026-05-08T00:00:00Z',
    });
    expect(defaults.applyClusterNameservers).not.toHaveBeenCalled();
  });

  it('apply throws → degrada elegante (NO propaga)', async () => {
    const { listener } = build({
      applyImpl: jest.fn().mockRejectedValue(new Error('Enhance API down')),
    });
    await expect(
      listener.handle({
        slug: 'enhance_cp',
        installed_by: 'admin-1',
        installed_at: '2026-05-08T00:00:00Z',
      }),
    ).resolves.toBeUndefined();
  });
});
