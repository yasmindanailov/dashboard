/**
 * Tests de los helpers de agrupación temporal + tiempo relativo (F3·E10).
 * `now` se inyecta para que sean deterministas (sin depender del reloj real).
 */
import { groupNotificationsByDate, relativeTime } from './notification-groups';

describe('groupNotificationsByDate', () => {
  const now = new Date('2026-06-28T12:00:00');
  const mk = (created_at: string, id = created_at) => ({ created_at, id });

  it('reparte en hoy / esta semana / anteriores y omite buckets vacíos', () => {
    const groups = groupNotificationsByDate(
      [
        mk('2026-06-28T09:00:00'), // hoy
        mk('2026-06-25T09:00:00'), // hace 3 días → esta semana
        mk('2026-06-10T09:00:00'), // > 7 días → anteriores
      ],
      now,
    );
    expect(groups.map((g) => g.key)).toEqual(['hoy', 'semana', 'antes']);
    expect(groups.map((g) => g.label)).toEqual([
      'Hoy',
      'Esta semana',
      'Anteriores',
    ]);
    groups.forEach((g) => expect(g.items).toHaveLength(1));
  });

  it('omite los buckets sin elementos', () => {
    const groups = groupNotificationsByDate([mk('2026-06-28T08:00:00')], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('hoy');
  });

  it('preserva el orden de entrada dentro de un bucket', () => {
    const a = mk('2026-06-28T11:00:00', 'a');
    const b = mk('2026-06-28T10:00:00', 'b');
    const groups = groupNotificationsByDate([a, b], now);
    expect(groups[0].items).toEqual([a, b]);
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-06-28T12:00:00').getTime();

  it.each([
    ['2026-06-28T11:59:30', 'ahora'],
    ['2026-06-28T11:30:00', 'hace 30 min'],
    ['2026-06-28T09:00:00', 'hace 3 h'],
    ['2026-06-25T12:00:00', 'hace 3 d'],
  ])('%s → %s', (iso, expected) => {
    expect(relativeTime(iso, now)).toBe(expected);
  });

  it('cae a fecha corta para más de 7 días', () => {
    expect(relativeTime('2026-06-01T12:00:00', now)).not.toMatch(/hace/);
  });
});
