/* ═══════════════════════════════════════
   maintenance.helper — Rediseño UI · F3·E8 (Support Inside gestionado)
   Derivaciones puras para la vista gestionada de los slots de
   mantenimiento. Nada se persiste: `next_maintenance_at` y
   `maintenance_status` se DERIVAN de `anniversary_day` + el último
   `MaintenanceLog` + la tarea del periodo. Pura y determinista (acepta
   `now` inyectable). Espejo de la doctrina del cron mensual
   (`crons/maintenance-monthly.service.ts`): la revisión cae el
   `anniversary_day` a las 06:00 UTC.
   ═══════════════════════════════════════ */

import { PrismaService } from '../../core/database/prisma.service';

/** Hora UTC en que el cron diario dispara la tarea de mantenimiento. */
const MAINTENANCE_HOUR_UTC = 6;

/** Estado de mantenimiento de un slot, derivado (no persistido). */
export type SlotMaintenanceStatus =
  | 'up_to_date' // revisión del mes hecha
  | 'in_progress' // tarea del mes en curso
  | 'due_soon' // pendiente, el día aniversario es hoy o futuro este mes
  | 'overdue'; // pendiente y el día aniversario ya pasó

/** Estados de `Task` relevantes para el mantenimiento del periodo actual. */
export type MaintenanceTaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'not_completed_in_time'
  | 'cancelled';

/** Acota el día aniversario al rango válido [1, 28] (espejo del CHECK del slot). */
function clampAnniversary(day: number): number {
  if (day < 1) return 1;
  if (day > 28) return 28;
  return Math.trunc(day);
}

/** ¿Caen ambas fechas en el mismo mes/año UTC? */
export function sameUtcMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

/**
 * Próxima fecha de revisión de un slot, derivada de su `anniversary_day`.
 * Si la revisión de este mes ya se hizo (`lastMaintenanceAt` cae en el mes
 * de `now`), apunta al mes siguiente; si no, al día aniversario de este mes
 * (aunque ya haya pasado — el estado lo marcará `overdue`).
 */
export function nextMaintenanceDate(
  anniversaryDay: number,
  now: Date,
  lastMaintenanceAt: Date | null = null,
): Date {
  const day = clampAnniversary(anniversaryDay);
  const doneThisMonth =
    lastMaintenanceAt != null && sameUtcMonth(lastMaintenanceAt, now);
  const targetMonthOffset = doneThisMonth ? 1 : 0;
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + targetMonthOffset,
      day,
      MAINTENANCE_HOUR_UTC,
      0,
      0,
      0,
    ),
  );
}

/**
 * Estado de mantenimiento del slot para el periodo actual, derivado del
 * último log + la tarea del mes + el calendario. Sin columna persistida.
 */
export function computeMaintenanceStatus(input: {
  now: Date;
  anniversaryDay: number;
  lastMaintenanceAt: Date | null;
  currentTaskStatus: MaintenanceTaskStatus | null;
}): SlotMaintenanceStatus {
  const { now, anniversaryDay, lastMaintenanceAt, currentTaskStatus } = input;

  // Hecho este mes (hay log del mes, o la tarea del periodo está completada).
  const doneThisMonth =
    (lastMaintenanceAt != null && sameUtcMonth(lastMaintenanceAt, now)) ||
    currentTaskStatus === 'completed';
  if (doneThisMonth) return 'up_to_date';

  // En curso ahora mismo.
  if (currentTaskStatus === 'in_progress') return 'in_progress';

  // Pendiente: ¿ya pasó el día aniversario de este mes?
  const day = clampAnniversary(anniversaryDay);
  const passed = now.getUTCDate() > day;
  return passed ? 'overdue' : 'due_soon';
}

/**
 * F3·E8 — añade a cada slot `last_maintenance_at` (último `MaintenanceLog`
 * del servicio), `next_maintenance_at` y `maintenance_status` (derivados de
 * `anniversary_day` + la tarea del periodo). 2 queries acotadas (logs +
 * tareas), sin N+1. Compartido por la vista cliente (`getStatus`) y la vista
 * admin gestionada (`SupportInsideAdminService.getManagedByService`) — única
 * fuente de la derivación, cero divergencia entre ambas superficies.
 */
export async function enrichSlotsMaintenance<
  S extends { id: string; service_id: string; anniversary_day: number },
>(
  prisma: PrismaService,
  slots: S[],
  now: Date,
): Promise<
  Array<
    S & {
      last_maintenance_at: string | null;
      next_maintenance_at: string;
      maintenance_status: SlotMaintenanceStatus;
    }
  >
> {
  if (slots.length === 0) return [];
  const slotIds = slots.map((s) => s.id);
  const serviceIds = [...new Set(slots.map((s) => s.service_id))];

  const logs = await prisma.maintenanceLog.findMany({
    where: { service_id: { in: serviceIds } },
    orderBy: { performed_at: 'desc' },
    select: { service_id: true, performed_at: true },
  });
  const lastByService = new Map<string, Date>();
  for (const log of logs) {
    if (!lastByService.has(log.service_id)) {
      lastByService.set(log.service_id, log.performed_at);
    }
  }

  const tasks = await prisma.task.findMany({
    where: {
      source_system: 'support_inside_slot',
      source_id: { in: slotIds },
    },
    orderBy: { created_at: 'desc' },
    select: { source_id: true, status: true, created_at: true },
  });
  const latestTaskBySlot = new Map<
    string,
    { status: MaintenanceTaskStatus; created_at: Date }
  >();
  for (const task of tasks) {
    if (!latestTaskBySlot.has(task.source_id)) {
      latestTaskBySlot.set(task.source_id, {
        status: task.status,
        created_at: task.created_at,
      });
    }
  }

  return slots.map((slot) => {
    const lastMaintenanceAt = lastByService.get(slot.service_id) ?? null;
    const latestTask = latestTaskBySlot.get(slot.id);
    // La tarea cuenta como "del periodo actual" solo si se creó este mes.
    const currentTaskStatus =
      latestTask && sameUtcMonth(latestTask.created_at, now)
        ? latestTask.status
        : null;
    return {
      ...slot,
      last_maintenance_at: lastMaintenanceAt
        ? lastMaintenanceAt.toISOString()
        : null,
      next_maintenance_at: nextMaintenanceDate(
        slot.anniversary_day,
        now,
        lastMaintenanceAt,
      ).toISOString(),
      maintenance_status: computeMaintenanceStatus({
        now,
        anniversaryDay: slot.anniversary_day,
        lastMaintenanceAt,
        currentTaskStatus,
      }),
    };
  });
}
