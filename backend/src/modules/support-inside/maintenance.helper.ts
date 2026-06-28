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
