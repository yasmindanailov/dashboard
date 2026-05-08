/* eslint-disable @typescript-eslint/unbound-method */
// Falsos positivos en `expect(mock.method).toHaveBeenCalled()`.

/**
 * Sprint 15C Fase 15C.D — tests unit del listener
 * `reconcile-dns-defaults-on-service-activated`. ADR-082 §5.
 */

import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { EnhanceDnsDefaultsService } from '../../../plugins/provisioners/enhance_cp/enhance-dns-defaults.service';

import { ReconcileDnsDefaultsOnServiceActivatedListener } from './reconcile-dns-defaults-on-service-activated.listener';

describe('ReconcileDnsDefaultsOnServiceActivatedListener', () => {
  function build(serviceRow: unknown): {
    listener: ReconcileDnsDefaultsOnServiceActivatedListener;
    prisma: PrismaService;
    settings: SettingsService;
    defaults: EnhanceDnsDefaultsService;
  } {
    const prisma = {
      service: {
        findUnique: jest.fn().mockResolvedValue(serviceRow),
      },
    } as unknown as PrismaService;
    const settings = {
      getJson: jest
        .fn()
        .mockResolvedValue(['ns1.aelium.net', 'ns2.aelium.net']),
    } as unknown as SettingsService;
    const defaults = {
      reconcileZoneDefaults: jest
        .fn()
        .mockResolvedValue({ added: [], preserved: [] }),
    } as unknown as EnhanceDnsDefaultsService;
    const listener = new ReconcileDnsDefaultsOnServiceActivatedListener(
      prisma,
      settings,
      defaults,
    );
    return { listener, prisma, settings, defaults };
  }

  const VALID_SERVICE = {
    id: 'svc-1',
    domain: 'foo.example.com',
    provisioner_slug: 'enhance_cp',
    metadata: {
      enhance_org_id: 'org-uuid',
      enhance_website_id: 'ws-uuid',
    },
  };

  it('service no encontrado → no-op silencioso', async () => {
    const { listener, defaults } = build(null);
    await listener.handle({
      service_id: 'svc-x',
      user_id: 'u-1',
      correlation_id: 'cor-1',
    });
    expect(defaults.reconcileZoneDefaults).not.toHaveBeenCalled();
  });

  it('plugin != enhance_cp → no-op silencioso', async () => {
    const { listener, defaults } = build({
      ...VALID_SERVICE,
      provisioner_slug: 'manual',
    });
    await listener.handle({
      service_id: 'svc-1',
      user_id: 'u-1',
      correlation_id: 'cor-1',
    });
    expect(defaults.reconcileZoneDefaults).not.toHaveBeenCalled();
  });

  it('refs Enhance ausentes en metadata → warn + no-op', async () => {
    const { listener, defaults } = build({
      ...VALID_SERVICE,
      metadata: { unrelated: 'value' },
    });
    await listener.handle({
      service_id: 'svc-1',
      user_id: 'u-1',
      correlation_id: 'cor-1',
    });
    expect(defaults.reconcileZoneDefaults).not.toHaveBeenCalled();
  });

  it('service plenamente válido → invoca reconcileZoneDefaults con args correctos', async () => {
    const { listener, defaults } = build(VALID_SERVICE);
    await listener.handle({
      service_id: 'svc-1',
      user_id: 'u-1',
      correlation_id: 'cor-1',
    });
    expect(defaults.reconcileZoneDefaults).toHaveBeenCalledWith(
      'org-uuid',
      'ws-uuid',
      'foo.example.com',
      ['ns1.aelium.net', 'ns2.aelium.net'],
    );
  });

  it('setting empty → skip', async () => {
    const { listener, defaults, settings } = build(VALID_SERVICE);
    (settings.getJson as jest.Mock).mockResolvedValueOnce([]);
    await listener.handle({
      service_id: 'svc-1',
      user_id: 'u-1',
      correlation_id: 'cor-1',
    });
    expect(defaults.reconcileZoneDefaults).not.toHaveBeenCalled();
  });

  it('reconcile throws → degrada elegante', async () => {
    const { listener, defaults } = build(VALID_SERVICE);
    (defaults.reconcileZoneDefaults as jest.Mock).mockRejectedValue(
      new Error('Enhance API down'),
    );
    await expect(
      listener.handle({
        service_id: 'svc-1',
        user_id: 'u-1',
        correlation_id: 'cor-1',
      }),
    ).resolves.toBeUndefined();
  });
});
