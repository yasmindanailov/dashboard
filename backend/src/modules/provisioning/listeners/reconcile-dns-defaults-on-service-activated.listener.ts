import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { getErrorMessage } from '../../../core/common/utils/error.util';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';
import { EnhanceDnsDefaultsService } from '../../../plugins/provisioners/enhance_cp/enhance-dns-defaults.service';

/**
 * Sprint 15C Fase 15C.D — listener reconcile DEFENSIVO post-provision.
 *
 * Materializa literalmente ADR-082 §5.
 *
 * Cuándo se dispara:
 *   - `provisioning-orchestrator.service.markActive()` emite
 *     `service.activated` cuando un service pasa a status='active'. Este
 *     listener observa el evento, filtra por plugin enhance_cp y verifica
 *     defensivamente que la zona DNS del dominio tenga los NS canónicos
 *     esperados.
 *
 * Por qué defensivo (no creación inline):
 *   - Caso normal: la zona se creó cuando los defaults globales del cluster
 *     (NS-sync C2) ya estaban en place → Enhance los aplicó automáticamente
 *     → la zona ya tiene los NS canónicos al crearse → no hay nada que
 *     hacer aquí. El listener es no-op en flow normal.
 *
 *   - Caso defensivo: si el setting C3 cambió DESPUÉS de que la zona ya
 *     estuviera creada, los nuevos NS NO se aplican retroactivamente a la
 *     zona existente — Enhance sólo los aplica a zonas creadas tras el
 *     cambio. Este listener detecta el drift y rellena los NS faltantes.
 *
 *   - Cero race condition: si la zona se creó hace 5ms y Enhance está
 *     procesando los defaults globales, este listener observa lo que sea
 *     que esté presente *en el momento*. Si faltan, los añade
 *     idempotentemente; si Enhance los añadió en paralelo, la API
 *     devolverá 409/200 que el cliente HTTP absorbe sin error.
 *
 * Filtrado:
 *   - `service.provisioner_slug === 'enhance_cp'` ∧ `service.metadata`
 *     contiene `enhance_org_id` + `enhance_website_id` ∧ `service.domain`
 *     no nulo. Cualquiera ausente → no-op silencioso.
 *
 * NO borra records inesperados (operador o cliente añadieron CNAME/MX/TXT
 * custom legítimos). Aelium NO espeja zone state — sólo aplica defaults
 * faltantes (DH-INV-6 + ADR-082 §5).
 *
 * Errores: degradación elegante. Log WARN si Enhance API falla — el cron
 * L3 (Sprint 15C Fase 15C.H) detectará drift persistente y alertará.
 */
@Injectable()
export class ReconcileDnsDefaultsOnServiceActivatedListener {
  private static readonly TARGET_PLUGIN_SLUG = 'enhance_cp';
  private static readonly DEFAULT_NS: readonly string[] = [
    'ns1.aelium.net',
    'ns2.aelium.net',
  ];

  private readonly logger = new Logger(
    ReconcileDnsDefaultsOnServiceActivatedListener.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly defaults: EnhanceDnsDefaultsService,
  ) {}

  @OnEvent('service.activated')
  async handle(payload: {
    service_id: string;
    user_id: string;
    correlation_id: string;
  }): Promise<void> {
    try {
      const service = await this.prisma.service.findUnique({
        where: { id: payload.service_id },
        select: {
          id: true,
          domain: true,
          provisioner_slug: true,
          metadata: true,
        },
      });

      if (!service) {
        // Service borrado entre activación y consumo del evento — no-op.
        return;
      }
      if (
        service.provisioner_slug !==
        ReconcileDnsDefaultsOnServiceActivatedListener.TARGET_PLUGIN_SLUG
      ) {
        return; // listener silencioso para otros plugins
      }

      const md = service.metadata as Record<string, unknown> | null | undefined;
      const orgId =
        typeof md?.enhance_org_id === 'string' ? md.enhance_org_id : null;
      const websiteId =
        typeof md?.enhance_website_id === 'string'
          ? md.enhance_website_id
          : null;

      if (!orgId || !websiteId || !service.domain) {
        this.logger.warn(
          `service.activated service=${service.id}: missing enhance refs ` +
            `(orgId=${orgId ?? 'null'}, websiteId=${websiteId ?? 'null'}, ` +
            `domain=${service.domain ?? 'null'}) — cannot reconcile DNS defaults.`,
        );
        return;
      }

      const nameservers = await this.settings.getJson<readonly string[]>(
        'provisioning',
        'default_nameservers',
        ReconcileDnsDefaultsOnServiceActivatedListener.DEFAULT_NS,
      );

      if (!Array.isArray(nameservers) || nameservers.length === 0) {
        this.logger.warn(
          `service.activated service=${service.id}: setting ` +
            `provisioning.default_nameservers empty/invalid — skipping reconcile.`,
        );
        return;
      }

      const result = await this.defaults.reconcileZoneDefaults(
        orgId,
        websiteId,
        service.domain,
        nameservers,
      );

      if (result.added.length > 0) {
        this.logger.log(
          `service.activated service=${service.id}: reconciled DNS defaults ` +
            `(added=${result.added.length}, preserved=${result.preserved.length}). ` +
            `NS=[${nameservers.join(', ')}]`,
        );
      } else {
        this.logger.debug(
          `service.activated service=${service.id}: DNS defaults already present ` +
            `(preserved=${result.preserved.length}) — no-op.`,
        );
      }
    } catch (err) {
      // Degradación elegante. La activación del service ya completó (este
      // listener escucha post-activate), así que un fallo aquí no rompe
      // el provisioning. El cron L3 (Sprint 15C Fase 15C.H) reintentará.
      this.logger.warn(
        `reconcile-dns-defaults-on-service-activated failed for service=${payload.service_id}: ` +
          getErrorMessage(err) +
          ` — drift will be picked up by cron L3 reconcile (Fase 15C.H).`,
      );
    }
  }
}
