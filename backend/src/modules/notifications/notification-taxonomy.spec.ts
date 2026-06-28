import {
  categoryForEvent,
  NOTIFICATION_EVENT_CATEGORY,
} from './notification-taxonomy';

/**
 * F3·E10 — la taxonomía es la fuente única `event_type → categoría`. Estos
 * tests blindan: (1) el mapeo representativo por categoría, (2) el fallback
 * robusto a `general`, y (3) que TODO evento con plantilla `internal` seedeada
 * tiene categoría explícita (guard de drift: si se añade un evento `internal`
 * al seed y no aquí, este test lo caza).
 */
describe('notification-taxonomy', () => {
  describe('categoryForEvent — mapeo representativo', () => {
    it.each([
      ['invoice.paid', 'facturacion'],
      ['service.suspended', 'servicios'],
      ['maintenance.completed', 'servicios'],
      ['domain.renewed', 'dominios'],
      ['domain.transfer_failed', 'dominios'],
      ['domain.nameservers_changed', 'seguridad'],
      ['auth.refresh_replay_detected', 'seguridad'],
      ['conversation.resolved', 'soporte'],
      ['message.created', 'soporte'],
      ['task.completed', 'soporte'],
      ['task.assigned', 'tareas'],
      ['task.unassigned_overdue', 'tareas'],
      ['dlq.job_failed', 'sistema'],
      ['system.error', 'sistema'],
      ['plugin.circuit_opened', 'plugins'],
      ['plugin.circuit_closed', 'plugins'],
    ])('%s → %s', (event, expected) => {
      expect(categoryForEvent(event)).toBe(expected);
    });
  });

  describe('categoryForEvent — fallback robusto', () => {
    it.each([
      ['evento desconocido', 'foo.bar'],
      ['cadena vacía', ''],
      ['null', null],
      ['undefined', undefined],
    ])('%s → general', (_label, value) => {
      expect(categoryForEvent(value)).toBe('general');
    });
  });

  describe('cobertura del seed `internal`', () => {
    // Lista canónica de event_type con plantilla channel='internal'
    // (prisma/seeds/notification-templates.ts). Si añades uno nuevo al seed,
    // añádelo aquí y al mapa de taxonomía.
    const INTERNAL_EVENTS = [
      'invoice.paid',
      'task.assigned',
      'maintenance.completed',
      'task.completed',
      'conversation.resolved',
      'conversation.auto_closed',
      'conversation.created',
      'message.created',
      'conversation.assigned',
      'outbox.event_failed',
      'dlq.job_failed',
      'task.overdue',
      'task.unassigned_overdue',
      'maintenance.critical',
      'system.error',
      'auth.refresh_replay_detected',
      'plugin.circuit_opened',
      'plugin.circuit_closed',
      'service.password_reset',
      'service.cancelled',
      'service.cancellation_scheduled',
      'service.suspended',
      'service.unsuspended',
      'service.quota_threshold_crossed',
      'domain.renewed',
      'domain.expiring_soon',
      'domain.expired',
      'domain.entered_redemption',
      'domain.restored',
      'domain.transfer_initiated',
      'domain.transfer_completed',
      'domain.transfer_failed',
      'domain.nameservers_changed',
      'domain.lock_changed',
    ];

    it('todo evento internal tiene categoría explícita (no cae en general)', () => {
      const sinCategoria = INTERNAL_EVENTS.filter(
        (e) => categoryForEvent(e) === 'general',
      );
      expect(sinCategoria).toEqual([]);
    });

    it('el mapa no tiene entradas huérfanas fuera de la lista internal', () => {
      const huerfanos = Object.keys(NOTIFICATION_EVENT_CATEGORY).filter(
        (e) => !INTERNAL_EVENTS.includes(e),
      );
      expect(huerfanos).toEqual([]);
    });
  });
});
