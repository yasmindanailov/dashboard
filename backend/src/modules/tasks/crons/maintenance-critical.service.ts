import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../core/database/prisma.service';
import { SettingsService } from '../../../core/settings/settings.service';

const MS_PER_DAY = 86_400_000;
const DEFAULT_THRESHOLD_DAYS = 60;

export interface MaintenanceCriticalServiceRef {
  service_id: string;
  client_id: string;
  label: string | null;
  product_name: string;
  days_since_last_maintenance: number | null; // null = nunca
}

export interface MaintenanceCriticalRunResult {
  total: number;
  threshold_days: number;
}

/**
 * MaintenanceCriticalService — Sprint 8 Fase C (2026-05-01).
 *
 * Implementa el cron `maintenance-critical`: detecta servicios activos
 * con checklist contratado (`service_checklist_items` no vacío) que
 * llevan más de `support.maintenance_critical_threshold_days` (default 60)
 * sin un `maintenance_log` registrado. Emite evento agregado
 * `maintenance.critical` al superadmin con summary pre-renderizado.
 *
 * Filtro `service_checklist_items` no vacío:
 *   - Es el proxy canónico de "este servicio tiene mantenimiento contratado"
 *     hasta que Sprint 8 Fase D (Support Inside) introduzca
 *     `support_inside_subscriptions` con su propio enlace.
 *   - Mientras nadie tenga checklist (Fase D no implementada), el cron NO
 *     alerta nada — degradación elegante por construcción.
 *   - Cuando Fase D se cierre, el cron empieza a alertar automáticamente
 *     porque la activación de Support Inside copia el checklist semilla
 *     a `service_checklist_items`.
 *
 * Cumple R1, R2, R7. Coherente con ADR-061 (Support Inside) y la doctrina
 * Fase C del Sprint 8 (current.md §10).
 */
@Injectable()
export class MaintenanceCriticalService {
  private readonly logger = new Logger(MaintenanceCriticalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly settings: SettingsService,
  ) {}

  async run(now: Date = new Date()): Promise<MaintenanceCriticalRunResult> {
    const thresholdDays = await this.settings.getNumber(
      'support',
      'maintenance_critical_threshold_days',
      DEFAULT_THRESHOLD_DAYS,
    );
    const cutoff = new Date(now.getTime() - thresholdDays * MS_PER_DAY);

    // Subquery semántica: servicios activos con checklist contratado.
    // Prisma resuelve `checklist_items: { some: {} }` como EXISTS (...).
    const services = await this.prisma.service.findMany({
      where: {
        status: 'active',
        checklist_items: { some: {} },
      },
      select: {
        id: true,
        user_id: true,
        label: true,
        product: { select: { name: true } },
        maintenance_logs: {
          orderBy: { performed_at: 'desc' },
          take: 1,
          select: { performed_at: true },
        },
      },
    });

    const critical: MaintenanceCriticalServiceRef[] = [];
    for (const svc of services) {
      const last = svc.maintenance_logs[0];
      // Crítico si NUNCA se hizo mantenimiento, o si el último fue antes
      // del cutoff.
      const isCritical = !last || last.performed_at < cutoff;
      if (!isCritical) continue;

      const days = last
        ? Math.floor((now.getTime() - last.performed_at.getTime()) / MS_PER_DAY)
        : null;
      critical.push({
        service_id: svc.id,
        client_id: svc.user_id,
        label: svc.label,
        product_name: svc.product.name,
        days_since_last_maintenance: days,
      });
    }

    if (critical.length === 0) {
      this.logger.debug(
        `maintenance-critical: no critical services (${services.length} with checklist, all within threshold ${thresholdDays}d)`,
      );
      return { total: 0, threshold_days: thresholdDays };
    }

    // Summary pre-renderizado, mismo patrón que TasksUnassignedOverdueService:
    // hasta 20 entradas + sufijo "y N más". El admin investiga el resto en
    // /admin/services o /admin/tasks?type=maintenance.
    const MAX_LINES = 20;
    const summaryLines = critical.slice(0, MAX_LINES).map((s) => {
      const ageLabel =
        s.days_since_last_maintenance === null
          ? 'NUNCA'
          : `${s.days_since_last_maintenance}d`;
      const display = s.label || s.product_name;
      return `• ${display} (${s.product_name}) — último mantenimiento: ${ageLabel}`;
    });
    if (critical.length > MAX_LINES) {
      summaryLines.push(`… y ${critical.length - MAX_LINES} más`);
    }
    const summary = summaryLines.join('\n');

    this.events.emit('maintenance.critical', {
      total: critical.length,
      threshold_days: thresholdDays,
      service_ids: critical.map((s) => s.service_id),
      summary,
    });

    this.logger.warn(
      `maintenance-critical: ${critical.length} services without maintenance >${thresholdDays}d`,
    );

    return { total: critical.length, threshold_days: thresholdDays };
  }
}
