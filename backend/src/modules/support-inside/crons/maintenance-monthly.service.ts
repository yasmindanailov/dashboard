import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

export interface MaintenanceMonthlyRunResult {
  billing_month: string;
  candidates: number;
  created: number;
  skipped_idempotent: number;
}

/**
 * MaintenanceMonthlyService — Sprint 8 Fase D (2026-05-01).
 *
 * Lógica del cron `maintenance-monthly` separada del processor BullMQ
 * para permitir testeo unitario sin Redis y disparo manual desde el
 * endpoint admin de smoke testing.
 *
 * Reglas canónicas (ADR-034 §"Recurrencia del mantenimiento" + Sprint 8
 * Fase D plan):
 *   - Se ejecuta el día 1 de cada mes a las 06:00 UTC (cron pattern
 *     `0 6 1 * *`). El día concreto del mes en que se hace el trabajo lo
 *     decide el agente cuando aborda la tarea — el cron sólo CREA la
 *     tarea para ese mes, no la ejecuta.
 *   - Por cada slot Support Inside ACTIVO (released_at IS NULL) cuya
 *     subscription está `active`, crea una `Task(type=maintenance_management)`
 *     vinculada al servicio que el slot cubre.
 *   - **Idempotencia obligatoria** por `(service_id, billing_month)` —
 *     UNIQUE compuesto en `tasks` (ADR-034 §"Idempotencia mensual" +
 *     migración Sprint 8 Fase A). Si el cron se reejecuta el mismo mes
 *     (recovery o disparo manual repetido), la 2ª pasada captura el
 *     P2002 de Prisma y suma a `skipped_idempotent`.
 *   - `assigned_to=null` (cola pública ADR-072) — el agente que tome la
 *     tarea de su scope "Sin asignar" se la auto-asigna. Esto preserva
 *     la doctrina "no asignar arbitrariamente" del ADR-072 §"Triggers
 *     automáticos sin owner determinable".
 *
 * Cumple R1 + R2 + R7 + R13 + ADR-034 + ADR-061 + ADR-072.
 */
@Injectable()
export class MaintenanceMonthlyService {
  private readonly logger = new Logger(MaintenanceMonthlyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Ejecuta una pasada del cron. Retorna stats agregadas para que el
   * endpoint admin las muestre y el test E2E las verifique.
   *
   * @param now Reloj inyectable para testing.
   */
  async run(now: Date = new Date()): Promise<MaintenanceMonthlyRunResult> {
    const billingMonth = this.formatBillingMonth(now);

    // 1. Recolectar slots activos en subscriptions activas. JOIN
    //    profundo para extraer client_id (= subscription.client_id) y
    //    metadata del servicio para el título de la task.
    const slots = await this.prisma.supportInsideSlot.findMany({
      where: {
        released_at: null,
        subscription: { status: 'active' },
      },
      include: {
        subscription: { select: { client_id: true, id: true } },
        service: {
          select: {
            id: true,
            label: true,
            domain: true,
            status: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    // 2. Filtrar servicios cancelados/suspendidos — el slot puede seguir
    //    activo administrativamente pero el servicio ya no opera.
    const eligibleSlots = slots.filter((s) => s.service.status === 'active');

    let created = 0;
    let skippedIdempotent = 0;

    for (const slot of eligibleSlots) {
      const serviceLabel =
        slot.service.label || slot.service.domain || slot.service.product.name;
      const taskTitle = `Mantenimiento ${this.formatMonthLabel(now)} — ${serviceLabel}`;

      try {
        const task = await this.prisma.task.create({
          data: {
            type: 'maintenance_management',
            title: taskTitle,
            priority: 'medium',
            client_id: slot.subscription.client_id,
            service_id: slot.service.id,
            // assigned_to: null — cola pública ADR-072. El agente que la
            // tome desde /admin/tasks?scope=unassigned se la auto-asigna.
            created_by: slot.subscription.client_id, // marcador "creado por sistema en nombre del cliente"
            billing_month: billingMonth,
            is_recurring: true,
            recurrence_day: 1,
            metadata: {
              source: 'support_inside_monthly_cron',
              subscription_id: slot.subscription.id,
              slot_id: slot.id,
              slot_type: slot.slot_type,
            },
          },
        });
        created += 1;
        this.events.emit('task.created', { task });
      } catch (err) {
        // P2002 = unique constraint violation → ya existe la task de
        // este mes para este servicio. Idempotencia OK.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          skippedIdempotent += 1;
          continue;
        }
        // Cualquier otro error: log + relanzar para que BullMQ retry.
        this.logger.error(
          `Failed to create monthly maintenance for slot ${slot.id} (service ${slot.service.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
        throw err;
      }
    }

    if (created > 0 || skippedIdempotent > 0) {
      this.logger.log(
        `maintenance-monthly: month=${billingMonth} candidates=${eligibleSlots.length} created=${created} skipped_idempotent=${skippedIdempotent}`,
      );
    } else {
      this.logger.debug(
        `maintenance-monthly: month=${billingMonth} no eligible slots`,
      );
    }

    return {
      billing_month: billingMonth,
      candidates: eligibleSlots.length,
      created,
      skipped_idempotent: skippedIdempotent,
    };
  }

  /** Formato YYYY-MM canónico (coincide con `tasks.billing_month VARCHAR(7)`). */
  private formatBillingMonth(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  /** Etiqueta humana "Mayo 2026" para el título de la task. */
  private formatMonthLabel(date: Date): string {
    return date.toLocaleDateString('es-ES', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
}
