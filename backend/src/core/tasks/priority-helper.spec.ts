import { calculateTaskPriority } from './priority-helper';

describe('calculateTaskPriority — Sprint 16 Fase 16.B (ADR-079 §3.3)', () => {
  describe('source_system=support_ticket — priorización por tier SI', () => {
    it('Pro (max) → critical', () => {
      expect(calculateTaskPriority('support_ticket', 'max')).toBe('critical');
    });
    it('Medium (high) → high', () => {
      expect(calculateTaskPriority('support_ticket', 'high')).toBe('high');
    });
    it('Básico (standard) → high', () => {
      expect(calculateTaskPriority('support_ticket', 'standard')).toBe('high');
    });
    it('sin SI (null) → medium', () => {
      expect(calculateTaskPriority('support_ticket', null)).toBe('medium');
    });
  });

  describe('resto de source_system → siempre medium', () => {
    it('support_inside_slot → medium', () => {
      expect(calculateTaskPriority('support_inside_slot', 'max')).toBe(
        'medium',
      );
      expect(calculateTaskPriority('support_inside_slot', null)).toBe('medium');
    });
    it('provisioning_manual → medium', () => {
      expect(calculateTaskPriority('provisioning_manual', 'max')).toBe(
        'medium',
      );
    });
    it('client_lifecycle → medium', () => {
      expect(calculateTaskPriority('client_lifecycle', 'high')).toBe('medium');
    });
    it('project → medium', () => {
      expect(calculateTaskPriority('project', null)).toBe('medium');
    });
  });
});
