import {
  nextMaintenanceDate,
  computeMaintenanceStatus,
} from './maintenance.helper';

describe('maintenance.helper — Rediseño UI F3·E8', () => {
  describe('nextMaintenanceDate', () => {
    it('si no se ha hecho este mes → día aniversario de este mes (06:00 UTC)', () => {
      const now = new Date('2026-06-10T09:00:00.000Z'); // día 10, aniversario 14
      const next = nextMaintenanceDate(14, now, null);
      expect(next.toISOString()).toBe('2026-06-14T06:00:00.000Z');
    });

    it('si ya se hizo este mes → día aniversario del mes siguiente', () => {
      const now = new Date('2026-06-20T09:00:00.000Z');
      const last = new Date('2026-06-14T06:30:00.000Z'); // hecho en junio
      const next = nextMaintenanceDate(14, now, last);
      expect(next.toISOString()).toBe('2026-07-14T06:00:00.000Z');
    });

    it('último mantenimiento de un mes anterior NO cuenta como hecho este mes', () => {
      const now = new Date('2026-06-20T09:00:00.000Z');
      const last = new Date('2026-05-14T06:30:00.000Z'); // mayo
      const next = nextMaintenanceDate(14, now, last);
      expect(next.toISOString()).toBe('2026-06-14T06:00:00.000Z');
    });

    it('acota el día aniversario fuera de rango a [1,28]', () => {
      const now = new Date('2026-06-10T09:00:00.000Z');
      expect(nextMaintenanceDate(31, now).getUTCDate()).toBe(28);
      expect(nextMaintenanceDate(0, now).getUTCDate()).toBe(1);
    });
  });

  describe('computeMaintenanceStatus', () => {
    const base = {
      now: new Date('2026-06-20T09:00:00.000Z'),
      anniversaryDay: 14,
    };

    it('log de este mes → up_to_date', () => {
      expect(
        computeMaintenanceStatus({
          ...base,
          lastMaintenanceAt: new Date('2026-06-14T06:30:00.000Z'),
          currentTaskStatus: null,
        }),
      ).toBe('up_to_date');
    });

    it('tarea del periodo completada → up_to_date (aunque no haya log aún)', () => {
      expect(
        computeMaintenanceStatus({
          ...base,
          lastMaintenanceAt: null,
          currentTaskStatus: 'completed',
        }),
      ).toBe('up_to_date');
    });

    it('tarea en curso → in_progress', () => {
      expect(
        computeMaintenanceStatus({
          ...base,
          lastMaintenanceAt: null,
          currentTaskStatus: 'in_progress',
        }),
      ).toBe('in_progress');
    });

    it('pendiente y el día aniversario ya pasó → overdue', () => {
      // hoy día 20, aniversario 14 → pasó
      expect(
        computeMaintenanceStatus({
          ...base,
          lastMaintenanceAt: null,
          currentTaskStatus: 'pending',
        }),
      ).toBe('overdue');
    });

    it('pendiente y el día aniversario es futuro este mes → due_soon', () => {
      expect(
        computeMaintenanceStatus({
          now: new Date('2026-06-10T09:00:00.000Z'), // día 10 < 14
          anniversaryDay: 14,
          lastMaintenanceAt: null,
          currentTaskStatus: 'pending',
        }),
      ).toBe('due_soon');
    });

    it('el día aniversario es hoy y aún pendiente → due_soon (no overdue)', () => {
      expect(
        computeMaintenanceStatus({
          now: new Date('2026-06-14T09:00:00.000Z'), // día 14 == aniversario
          anniversaryDay: 14,
          lastMaintenanceAt: null,
          currentTaskStatus: 'pending',
        }),
      ).toBe('due_soon');
    });

    it('tarea no completada a tiempo y sin log → overdue por fecha', () => {
      expect(
        computeMaintenanceStatus({
          ...base,
          lastMaintenanceAt: null,
          currentTaskStatus: 'not_completed_in_time',
        }),
      ).toBe('overdue');
    });

    it('log de un mes anterior no cuenta como hecho este mes', () => {
      expect(
        computeMaintenanceStatus({
          ...base,
          lastMaintenanceAt: new Date('2026-05-14T06:30:00.000Z'),
          currentTaskStatus: null,
        }),
      ).toBe('overdue');
    });
  });
});
