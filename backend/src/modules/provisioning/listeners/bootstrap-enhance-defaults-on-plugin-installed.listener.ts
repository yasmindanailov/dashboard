import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { SettingsService } from '../../../core/settings/settings.service';
import { EnhanceDnsDefaultsService } from '../../../plugins/provisioners/enhance_cp/enhance-dns-defaults.service';

/**
 * Sprint 15C Fase 15C.D — listener de bootstrap del cluster Enhance.
 *
 * Materializa ADR-082 §4 (NS-sync C2 vía API) + ADR-083 §5 decisión 20
 * (bootstrap defaults onActivated).
 *
 * Cuándo se dispara:
 *   - `AdminPluginsService.update` emite `plugin.installed` la primera
 *     vez que un admin habilita un plugin (o re-habilita uno previamente
 *     deshabilitado). Para el plugin `enhance_cp` ése es el único momento
 *     donde el cluster Enhance todavía no tiene los default DNS records
 *     globales seteados.
 *
 * Qué hace:
 *   - Si `slug === 'enhance_cp'`: lee el setting `provisioning.default_nameservers`
 *     (NS-sync C3) y propaga a Enhance vía
 *     `EnhanceDnsDefaultsService.applyClusterNameservers(...)`.
 *
 * Idempotencia:
 *   - El servicio interno revisa qué records existen y sólo añade los que
 *     faltan. Re-emisión del evento no genera duplicados.
 *
 * Errores:
 *   - Si Enhance no responde o el plugin no está bien configurado
 *     (apiToken faltante), loguea WARN y deja el sistema operativo. El
 *     siguiente cron L3 reconcile (Sprint 15C Fase 15C.H) detectará el
 *     drift y reintentará. R7 + R13 (fallos no desaparecen — quedan en logs).
 *
 * R4: el listener vive en `modules/provisioning/listeners/` (NO en core).
 * Importa el servicio del módulo `EnhanceCpModule` que exporta
 * `EnhanceDnsDefaultsService`. Esto es coherente con el patrón ya
 * establecido en `provisioning.module.ts` que importa el plugin Enhance
 * directamente.
 */
@Injectable()
export class BootstrapEnhanceDefaultsOnPluginInstalledListener {
  private static readonly TARGET_PLUGIN_SLUG = 'enhance_cp';
  private static readonly DEFAULT_NS: readonly string[] = [
    'ns1.aelium.net',
    'ns2.aelium.net',
  ];

  private readonly logger = new Logger(
    BootstrapEnhanceDefaultsOnPluginInstalledListener.name,
  );

  constructor(
    private readonly settings: SettingsService,
    private readonly defaults: EnhanceDnsDefaultsService,
  ) {}

  @OnEvent('plugin.installed')
  async handle(payload: {
    slug: string;
    installed_by: string;
    installed_at: string;
  }): Promise<void> {
    if (
      payload.slug !==
      BootstrapEnhanceDefaultsOnPluginInstalledListener.TARGET_PLUGIN_SLUG
    ) {
      return; // listener silencioso para otros plugins
    }

    try {
      const nameservers = await this.settings.getJson<readonly string[]>(
        'provisioning',
        'default_nameservers',
        BootstrapEnhanceDefaultsOnPluginInstalledListener.DEFAULT_NS,
      );

      if (!Array.isArray(nameservers) || nameservers.length === 0) {
        this.logger.warn(
          `plugin.installed slug=${payload.slug}: ` +
            `setting provisioning.default_nameservers is empty/invalid — skipping bootstrap.`,
        );
        return;
      }

      const result = await this.defaults.applyClusterNameservers(nameservers);

      this.logger.log(
        `plugin.installed slug=${payload.slug}: bootstrap defaults completed ` +
          `(added=${result.added.length}, preserved=${result.preserved.length}, ` +
          `stale=${result.stale.length}). NS=[${nameservers.join(', ')}]`,
      );
    } catch (err) {
      // Degradación elegante: no rompe la activación del plugin. El
      // siguiente cron L3 reconcile (Sprint 15C Fase 15C.H) detectará el
      // drift y reintentará. La activación misma del plugin ya completó
      // (la persistencia en plugin_installs.enabled=true ocurrió antes
      // de emitir este evento, ADR-080 §G).
      this.logger.warn(
        `plugin.installed slug=${payload.slug} bootstrap defaults failed: ` +
          getErrorMessage(err) +
          ` — manual reconcile or wait for cron L3 (Sprint 15C Fase 15C.H).`,
      );
    }
  }
}
