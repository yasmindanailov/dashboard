import {
  computeConversationSla,
  DEFAULT_RESPONSE_SLA_HOURS,
} from './support-sla.helper';

describe('computeConversationSla — Rediseño UI F3·E9 (SLA 1ª respuesta)', () => {
  const HOUR_MS = 3_600_000;
  const CREATED = new Date('2026-06-28T10:00:00.000Z');

  describe('SLA corriendo (sin 1ª respuesta, dentro de plazo)', () => {
    it('open con plan SI Medium (12h): due = created + 12h, estado running', () => {
      const now = new Date('2026-06-28T13:00:00.000Z'); // +3h de 12h
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: null,
        status: 'open',
        response_sla_hours: 12,
        now,
      });
      expect(sla.state).toBe('running');
      expect(sla.due_at).toBe('2026-06-28T22:00:00.000Z');
      expect(sla.response_sla_hours).toBe(12);
      expect(sla.first_response_pending).toBe(true);
      expect(sla.remaining_ms).toBe(9 * HOUR_MS);
      expect(sla.remaining_pct).toBe(75); // quedan 9 de 12h
      expect(sla.responded_in_ms).toBeNull();
      expect(sla.responded_within_sla).toBeNull();
    });

    it('waiting_agent sin 1ª respuesta también corre el reloj', () => {
      const now = new Date('2026-06-28T16:00:00.000Z'); // +6h de 12h
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: null,
        status: 'waiting_agent',
        response_sla_hours: 12,
        now,
      });
      expect(sla.state).toBe('running');
      expect(sla.remaining_pct).toBe(50);
    });

    it('sin plan SI → default 24h', () => {
      const now = new Date('2026-06-28T10:00:00.000Z'); // recién creado
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: null,
        status: 'open',
        response_sla_hours: null,
        now,
      });
      expect(sla.response_sla_hours).toBe(DEFAULT_RESPONSE_SLA_HOURS);
      expect(sla.due_at).toBe('2026-06-29T10:00:00.000Z');
      expect(sla.remaining_pct).toBe(100);
    });

    it('response_sla_hours = 0 se trata como sin plan (default 24h)', () => {
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: null,
        status: 'open',
        response_sla_hours: 0,
        now: CREATED,
      });
      expect(sla.response_sla_hours).toBe(DEFAULT_RESPONSE_SLA_HOURS);
    });
  });

  describe('SLA vencido (sin 1ª respuesta, fuera de plazo)', () => {
    it('open pasado el plazo → breached, remaining negativo, pct 0', () => {
      const now = new Date('2026-06-28T23:00:00.000Z'); // +13h de 12h → -1h
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: null,
        status: 'open',
        response_sla_hours: 12,
        now,
      });
      expect(sla.state).toBe('breached');
      expect(sla.first_response_pending).toBe(true);
      expect(sla.remaining_ms).toBe(-1 * HOUR_MS);
      expect(sla.remaining_pct).toBe(0);
    });
  });

  describe('SLA en pausa (waiting_client sin 1ª respuesta)', () => {
    it('paused: no expone remaining, sigue pendiente', () => {
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: null,
        status: 'waiting_client',
        response_sla_hours: 12,
        now: new Date('2026-06-28T23:00:00.000Z'),
      });
      expect(sla.state).toBe('paused');
      expect(sla.first_response_pending).toBe(true);
      expect(sla.remaining_ms).toBeNull();
      expect(sla.remaining_pct).toBeNull();
    });
  });

  describe('SLA cumplido (con 1ª respuesta)', () => {
    it('met dentro de plazo: responded_within_sla true + responded_in_ms', () => {
      const firstResponse = new Date('2026-06-28T14:00:00.000Z'); // +4h de 12h
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: firstResponse,
        status: 'waiting_client',
        response_sla_hours: 12,
        now: new Date('2026-06-29T00:00:00.000Z'),
      });
      expect(sla.state).toBe('met');
      expect(sla.first_response_pending).toBe(false);
      expect(sla.responded_in_ms).toBe(4 * HOUR_MS);
      expect(sla.responded_within_sla).toBe(true);
      expect(sla.remaining_ms).toBeNull();
      expect(sla.remaining_pct).toBeNull();
    });

    it('met fuera de plazo: responded_within_sla false', () => {
      const firstResponse = new Date('2026-06-29T00:00:00.000Z'); // +14h de 12h
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: firstResponse,
        status: 'waiting_agent',
        response_sla_hours: 12,
        now: new Date('2026-06-29T01:00:00.000Z'),
      });
      expect(sla.state).toBe('met');
      expect(sla.responded_within_sla).toBe(false);
      expect(sla.responded_in_ms).toBe(14 * HOUR_MS);
    });

    it('met manda aunque la conversación esté resuelta', () => {
      const firstResponse = new Date('2026-06-28T11:00:00.000Z');
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: firstResponse,
        status: 'resolved',
        response_sla_hours: 12,
        now: new Date('2026-06-29T01:00:00.000Z'),
      });
      expect(sla.state).toBe('met');
      expect(sla.responded_within_sla).toBe(true);
    });
  });

  describe('Sin SLA aplicable', () => {
    it('terminal sin 1ª respuesta (resolved) → state none', () => {
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: null,
        status: 'resolved',
        response_sla_hours: 12,
        now: new Date('2026-06-29T01:00:00.000Z'),
      });
      expect(sla.state).toBe('none');
      expect(sla.first_response_pending).toBe(false);
      expect(sla.remaining_pct).toBeNull();
    });

    it('terminal sin 1ª respuesta (closed) → state none', () => {
      const sla = computeConversationSla({
        created_at: CREATED,
        first_response_at: null,
        status: 'closed',
        response_sla_hours: null,
        now: new Date('2026-06-29T01:00:00.000Z'),
      });
      expect(sla.state).toBe('none');
    });
  });

  it('due_at siempre se calcula desde created_at + ventana, aun cuando no hay visual', () => {
    const sla = computeConversationSla({
      created_at: CREATED,
      first_response_at: null,
      status: 'closed',
      response_sla_hours: 12,
      now: CREATED,
    });
    expect(sla.due_at).toBe('2026-06-28T22:00:00.000Z');
  });
});
