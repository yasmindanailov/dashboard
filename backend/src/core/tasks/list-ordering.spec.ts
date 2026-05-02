import { applyCanonicalOrdering } from './list-ordering';
import { Task } from '@prisma/client';

type LiteTask = Pick<
  Task,
  'source_system' | 'priority' | 'status' | 'created_at' | 'due_date'
> & { id: string };

const t = (over: Partial<LiteTask> & { id: string }): LiteTask => ({
  source_system: 'support_ticket',
  priority: 'medium',
  status: 'pending',
  created_at: new Date('2026-05-02T10:00:00Z'),
  due_date: null,
  ...over,
});

/**
 * Tests unit applyCanonicalOrdering — Sprint 16 Fase 16.B (ADR-079 §3.3).
 *
 * Doctrina del orden:
 *   1. Vencidas (status='not_completed_in_time') arriba del todo.
 *   2. Bloque por source_system (support_ticket, support_inside_slot,
 *      provisioning_manual, client_lifecycle, project).
 *   3. Dentro de support_ticket: priority DESC, FIFO.
 *   4. Dentro de support_inside_slot: due_date ASC.
 *   5. Resto: FIFO created_at.
 */
describe('applyCanonicalOrdering — Sprint 16 Fase 16.B', () => {
  it('vencidas siempre primero', () => {
    const sorted = applyCanonicalOrdering([
      t({ id: 'a', source_system: 'support_ticket' }),
      t({
        id: 'b',
        source_system: 'project',
        status: 'not_completed_in_time',
      }),
    ]);
    expect(sorted[0].id).toBe('b');
  });

  it('orden de bloques: support_ticket → support_inside_slot → provisioning_manual → client_lifecycle → project', () => {
    const sorted = applyCanonicalOrdering([
      t({ id: 'project', source_system: 'project' }),
      t({ id: 'cl', source_system: 'client_lifecycle' }),
      t({ id: 'pm', source_system: 'provisioning_manual' }),
      t({ id: 'sis', source_system: 'support_inside_slot' }),
      t({ id: 'st', source_system: 'support_ticket' }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual([
      'st',
      'sis',
      'pm',
      'cl',
      'project',
    ]);
  });

  it('dentro de support_ticket ordena por priority DESC + FIFO', () => {
    const sorted = applyCanonicalOrdering([
      t({
        id: 'medium-old',
        priority: 'medium',
        created_at: new Date('2026-05-01'),
      }),
      t({
        id: 'critical-new',
        priority: 'critical',
        created_at: new Date('2026-05-02'),
      }),
      t({
        id: 'high-mid',
        priority: 'high',
        created_at: new Date('2026-05-01T12:00:00Z'),
      }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual([
      'critical-new',
      'high-mid',
      'medium-old',
    ]);
  });

  it('dentro de support_inside_slot ordena por due_date ASC', () => {
    const sorted = applyCanonicalOrdering([
      t({
        id: 'late',
        source_system: 'support_inside_slot',
        due_date: new Date('2026-05-10T23:59:00Z'),
      }),
      t({
        id: 'soon',
        source_system: 'support_inside_slot',
        due_date: new Date('2026-05-02T23:59:00Z'),
      }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['soon', 'late']);
  });

  it('dentro de project ordena por created_at ASC (FIFO)', () => {
    const sorted = applyCanonicalOrdering([
      t({
        id: 'newer',
        source_system: 'project',
        created_at: new Date('2026-05-02'),
      }),
      t({
        id: 'older',
        source_system: 'project',
        created_at: new Date('2026-05-01'),
      }),
    ]);
    expect(sorted.map((s) => s.id)).toEqual(['older', 'newer']);
  });
});
