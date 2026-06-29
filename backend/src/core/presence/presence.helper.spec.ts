import { derivePresence } from './presence.helper';

describe('presence.helper — Rediseño UI F3·E8', () => {
  const now = new Date('2026-06-28T12:00:00.000Z');

  it('nunca visto (null) → offline', () => {
    expect(derivePresence(null, now)).toBe('offline');
    expect(derivePresence(undefined, now)).toBe('offline');
  });

  it('visto hace 1 min → online', () => {
    expect(derivePresence(new Date('2026-06-28T11:59:00.000Z'), now)).toBe(
      'online',
    );
  });

  it('justo en el límite de 5 min → online (inclusive)', () => {
    expect(derivePresence(new Date('2026-06-28T11:55:00.000Z'), now)).toBe(
      'online',
    );
  });

  it('visto hace 10 min → away', () => {
    expect(derivePresence(new Date('2026-06-28T11:50:00.000Z'), now)).toBe(
      'away',
    );
  });

  it('justo en el límite de 15 min → away (inclusive)', () => {
    expect(derivePresence(new Date('2026-06-28T11:45:00.000Z'), now)).toBe(
      'away',
    );
  });

  it('visto hace 20 min → offline', () => {
    expect(derivePresence(new Date('2026-06-28T11:40:00.000Z'), now)).toBe(
      'offline',
    );
  });
});
