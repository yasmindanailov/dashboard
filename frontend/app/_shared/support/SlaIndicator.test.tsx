/**
 * Tests de SlaIndicator (Rediseño UI F3·E9): presenta el SLA de 1ª respuesta
 * según estado × variante × audiencia. El cálculo es server-side; aquí
 * verificamos el copy y el ocultado por estado/variante.
 */
import { render, screen } from '@testing-library/react';
import SlaIndicator from './SlaIndicator';
import type { ConversationSla } from './types';

const HOUR = 3_600_000;

function makeSla(partial: Partial<ConversationSla>): ConversationSla {
  return {
    state: 'running',
    due_at: '2026-06-28T22:00:00.000Z',
    response_sla_hours: 12,
    first_response_pending: true,
    remaining_ms: 3 * HOUR,
    remaining_pct: 75,
    responded_in_ms: null,
    responded_within_sla: null,
    ...partial,
  };
}

describe('<SlaIndicator>', () => {
  it('no renderiza nada sin sla', () => {
    const { container } = render(<SlaIndicator sla={null} />);
    expect(container.firstChild).toBeNull();
  });

  describe('variante inline (pill de bandeja, admin)', () => {
    it('running → "SLA en …"', () => {
      render(<SlaIndicator sla={makeSla({ state: 'running' })} variant="inline" />);
      expect(screen.getByText(/SLA en/)).toBeInTheDocument();
    });

    it('breached → "SLA vencido"', () => {
      render(
        <SlaIndicator
          sla={makeSla({ state: 'breached', remaining_ms: -HOUR, remaining_pct: 0 })}
          variant="inline"
        />,
      );
      expect(screen.getByText('SLA vencido')).toBeInTheDocument();
    });

    it('paused → se oculta (null)', () => {
      const { container } = render(
        <SlaIndicator sla={makeSla({ state: 'paused', remaining_ms: null, remaining_pct: null })} variant="inline" />,
      );
      expect(container.firstChild).toBeNull();
    });

    it('met → se oculta (null)', () => {
      const { container } = render(
        <SlaIndicator
          sla={makeSla({ state: 'met', first_response_pending: false, responded_in_ms: HOUR, responded_within_sla: true })}
          variant="inline"
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('variante detail, audiencia admin', () => {
    it('running → "Responder antes de … · quedan …"', () => {
      render(<SlaIndicator sla={makeSla({ state: 'running' })} variant="detail" audience="admin" />);
      expect(screen.getByText(/Responder antes de/)).toBeInTheDocument();
      expect(screen.getByText(/quedan/)).toBeInTheDocument();
    });

    it('breached → "SLA vencido hace …"', () => {
      render(
        <SlaIndicator
          sla={makeSla({ state: 'breached', remaining_ms: -HOUR, remaining_pct: 0 })}
          variant="detail"
          audience="admin"
        />,
      );
      expect(screen.getByText(/SLA vencido hace/)).toBeInTheDocument();
    });

    it('paused → "SLA en pausa"', () => {
      render(
        <SlaIndicator
          sla={makeSla({ state: 'paused', remaining_ms: null, remaining_pct: null })}
          variant="detail"
          audience="admin"
        />,
      );
      expect(screen.getByText(/SLA en pausa/)).toBeInTheDocument();
    });

    it('met dentro de plazo → "Primera respuesta a tiempo"', () => {
      render(
        <SlaIndicator
          sla={makeSla({ state: 'met', first_response_pending: false, remaining_ms: null, remaining_pct: null, responded_in_ms: HOUR, responded_within_sla: true })}
          variant="detail"
          audience="admin"
        />,
      );
      expect(screen.getByText(/Primera respuesta a tiempo/)).toBeInTheDocument();
    });
  });

  describe('variante detail, audiencia client (nunca "vencido")', () => {
    it('running holgado → "Dentro de plazo …"', () => {
      render(
        <SlaIndicator
          sla={makeSla({ state: 'running', remaining_pct: 80 })}
          variant="detail"
          audience="client"
        />,
      );
      expect(screen.getByText(/Dentro de plazo/)).toBeInTheDocument();
    });

    it('running ajustado (<=25%) → "Quedan … para responderte"', () => {
      render(
        <SlaIndicator
          sla={makeSla({ state: 'running', remaining_pct: 10, remaining_ms: HOUR })}
          variant="detail"
          audience="client"
        />,
      );
      expect(screen.getByText(/para responderte/)).toBeInTheDocument();
    });

    it('breached → enmarcado como prioridad, sin la palabra "vencido"', () => {
      render(
        <SlaIndicator
          sla={makeSla({ state: 'breached', remaining_ms: -HOUR, remaining_pct: 0 })}
          variant="detail"
          audience="client"
        />,
      );
      expect(screen.getByText('Estamos priorizando tu respuesta')).toBeInTheDocument();
      expect(screen.queryByText(/vencido/i)).not.toBeInTheDocument();
    });
  });
});
