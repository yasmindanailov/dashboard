import { calculateTaskDueDate } from './sla-helper';

describe('calculateTaskDueDate — Sprint 16 Fase 16.B (ADR-079 §3.5)', () => {
  const NOW = new Date('2026-05-02T10:00:00.000Z');
  const HOUR_MS = 3_600_000;

  describe('support_ticket — SLA por tier SI', () => {
    it('Pro (max) → +4h', () => {
      const due = calculateTaskDueDate('support_ticket', 'max', NOW)!;
      expect(due.getTime() - NOW.getTime()).toBe(4 * HOUR_MS);
    });
    it('Medium (high) → +12h', () => {
      const due = calculateTaskDueDate('support_ticket', 'high', NOW)!;
      expect(due.getTime() - NOW.getTime()).toBe(12 * HOUR_MS);
    });
    it('Básico (standard) → +24h', () => {
      const due = calculateTaskDueDate('support_ticket', 'standard', NOW)!;
      expect(due.getTime() - NOW.getTime()).toBe(24 * HOUR_MS);
    });
    it('sin SI (null) → +24h', () => {
      const due = calculateTaskDueDate('support_ticket', null, NOW)!;
      expect(due.getTime() - NOW.getTime()).toBe(24 * HOUR_MS);
    });
  });

  it('support_inside_slot → fin del día UTC del createdAt', () => {
    const due = calculateTaskDueDate('support_inside_slot', null, NOW)!;
    expect(due.getUTCFullYear()).toBe(NOW.getUTCFullYear());
    expect(due.getUTCMonth()).toBe(NOW.getUTCMonth());
    expect(due.getUTCDate()).toBe(NOW.getUTCDate());
    expect(due.getUTCHours()).toBe(23);
    expect(due.getUTCMinutes()).toBe(59);
  });

  it('provisioning_manual → +24h', () => {
    const due = calculateTaskDueDate('provisioning_manual', null, NOW)!;
    expect(due.getTime() - NOW.getTime()).toBe(24 * HOUR_MS);
  });

  it('client_lifecycle → +48h', () => {
    const due = calculateTaskDueDate('client_lifecycle', null, NOW)!;
    expect(due.getTime() - NOW.getTime()).toBe(48 * HOUR_MS);
  });

  it('project → null (sin SLA)', () => {
    expect(calculateTaskDueDate('project', null, NOW)).toBeNull();
    expect(calculateTaskDueDate('project', 'max', NOW)).toBeNull();
  });
});
