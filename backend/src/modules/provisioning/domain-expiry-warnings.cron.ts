import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../core/database/prisma.service';
import { getErrorMessage } from '../../core/common/utils/error.util';

/** Ventanas de aviso en días (descendente). La mayor acota la query. */
const WINDOWS = [30, 14, 7, 1] as const;
const MAX_WINDOW = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sprint 15D Fase 15D.E — `DomainExpiryWarningsCron` (avisos de expiración).
 *
 * Transversal a dominios (NO específico de ResellerClub — lee `services.expires_at`,
 * que cualquier registrar puebla vía su reconcile). Materializa ADR-084 §5: en v1 la
 * renovación es "factura + avisos", y estos son los avisos.
 *
 * Diario @09:00 UTC: por cada servicio de dominio `active` cuya `expires_at` cae en una
 * ventana de aviso (30/14/7/1 días), emite `domain.expiring_soon { service_id, user_id,
 * fqdn, days_left }` (alerta → **sin Outbox**, ADR-084 §5). Lo consume un listener de
 * notifications (commit siguiente) → email + campana al cliente.
 *
 * **Edge-trigger por ventana** (flag `services.metadata.domain_expiry_warned_window`):
 * emite UNA vez por ventana — no spamea a diario dentro de la misma ventana. Al renovar,
 * `expires_at` salta lejos → el dominio sale de las ventanas; el siguiente ciclo vuelve a
 * avisar porque la ventana activa cambia respecto a la última avisada (auto-reset).
 *
 * Fail-soft (R7): un servicio que falla no aborta el resto; el top-level se loguea.
 */
@Injectable()
export class DomainExpiryWarningsCron {
  private readonly logger = new Logger(DomainExpiryWarningsCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron('0 9 * * *', { name: 'domainExpiryWarnings', timeZone: 'UTC' })
  async handleScheduled(): Promise<void> {
    try {
      const summary = await this.runOnce();
      this.logger.log(
        `domainExpiryWarnings done: checked=${summary.checked} ` +
          `warned=${summary.warned} errors=${summary.errors}`,
      );
    } catch (err) {
      this.logger.error(
        `domainExpiryWarnings failed at top level: ${getErrorMessage(err)}`,
      );
    }
  }

  /** Una pasada. Público para trigger manual + tests deterministas. */
  async runOnce(now: Date = new Date()): Promise<ExpiryWarningsSummary> {
    const horizon = new Date(now.getTime() + MAX_WINDOW * DAY_MS);

    const services = await this.prisma.service.findMany({
      where: {
        product: { type: 'domain' },
        status: 'active',
        expires_at: { gt: now, lte: horizon },
      },
      select: {
        id: true,
        user_id: true,
        domain: true,
        expires_at: true,
        metadata: true,
      },
    });

    const summary: ExpiryWarningsSummary = {
      checked: services.length,
      warned: 0,
      errors: 0,
    };

    for (const service of services) {
      try {
        if (await this.warnIfWindowChanged(service, now)) summary.warned++;
      } catch (err) {
        summary.errors++;
        this.logger.error(
          `domainExpiryWarnings service=${service.id} failed: ${getErrorMessage(err)}`,
        );
      }
    }
    return summary;
  }

  private async warnIfWindowChanged(
    service: ExpiryRow,
    now: Date,
  ): Promise<boolean> {
    if (!service.expires_at) return false;
    const daysLeft = Math.ceil(
      (service.expires_at.getTime() - now.getTime()) / DAY_MS,
    );
    const window = activeWindow(daysLeft);
    if (window === null) return false; // fuera de toda ventana (>30d)

    const lastWarned = readWarnedWindow(service.metadata);
    if (lastWarned === window) return false; // ya avisado en esta ventana

    // Persistir la ventana avisada (edge-trigger) + emitir el aviso (alerta, sin Outbox).
    await this.prisma.service.update({
      where: { id: service.id },
      data: {
        metadata: {
          ...toObject(service.metadata),
          domain_expiry_warned_window: window,
        } as Prisma.InputJsonValue,
      },
    });
    this.events.emit('domain.expiring_soon', {
      service_id: service.id,
      user_id: service.user_id,
      fqdn: service.domain,
      days_left: daysLeft,
    });
    this.logger.log(
      `domain.expiring_soon service=${service.id} (${service.domain ?? '?'}): ` +
        `${daysLeft}d (ventana ${window}).`,
    );
    return true;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (file-private)
// ────────────────────────────────────────────────────────────────────────────

export interface ExpiryWarningsSummary {
  checked: number;
  warned: number;
  errors: number;
}

interface ExpiryRow {
  id: string;
  user_id: string;
  domain: string | null;
  expires_at: Date | null;
  metadata: unknown;
}

/**
 * Ventana de aviso activa para `daysLeft`: la MENOR ventana ≥ daysLeft (la más
 * cercana que el dominio acaba de cruzar). Ej. 20d→30, 10d→14, 5d→7, 1d/0d→1.
 * `null` si daysLeft > 30 (fuera de toda ventana). Garantiza un aviso por ventana.
 */
function activeWindow(daysLeft: number): number | null {
  let chosen: number | null = null;
  for (const w of WINDOWS) {
    if (w >= daysLeft) chosen = w; // recorre 30,14,7,1 → se queda con la menor ≥ daysLeft
  }
  return chosen;
}

function readWarnedWindow(metadata: unknown): number | null {
  const v = toObject(metadata).domain_expiry_warned_window;
  return typeof v === 'number' ? v : null;
}

function toObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}
