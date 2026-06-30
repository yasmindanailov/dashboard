/**
 * Componentes admin de Support Inside gestionado (F3·E8 Fase D):
 *  - SupportInsidePlanCard (sección "Plan de soporte" del detalle de servicio).
 *  - ReassignTechnicianModal (picker DS-A18).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../../components/ui';
import type { SupportInsideManagedBlock } from '../../../../lib/api';
import { SupportInsidePlanCard } from './SupportInsidePlanCard';
import { ReassignTechnicianModal } from './ReassignTechnicianModal';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const listEligibleTechniciansAction = jest.fn();
const assignTechnicianAction = jest.fn();
jest.mock('../_actions', () => ({
  listEligibleTechniciansAction: () => listEligibleTechniciansAction(),
  assignTechnicianAction: (...args: unknown[]) => assignTechnicianAction(...args),
}));

const MANAGED: SupportInsideManagedBlock = {
  subscription_id: 'sub-1',
  service_id: 'svc-si',
  status: 'active',
  started_at: '2026-04-30T00:00:00.000Z',
  plan: {
    slug: 'support-inside-basic-plan',
    name: 'Básico',
    priority_tier: 'standard',
    response_sla_hours: 24,
  },
  technician: {
    id: 'tech-1',
    first_name: 'Luis',
    last_name: 'Ferrer',
    avatar_url: null,
    presence: 'online',
  },
  maintenance: {
    period_done: 1,
    period_total: 2,
    overdue_count: 0,
    slots: [],
  },
};

describe('<SupportInsidePlanCard>', () => {
  it('muestra plan, SLA, progreso y técnico con presencia', () => {
    render(<SupportInsidePlanCard managed={MANAGED} />);
    expect(screen.getByText('Plan de soporte')).toBeInTheDocument();
    expect(screen.getByText('Support Inside · Básico')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('Menos de 24 h')).toBeInTheDocument();
    expect(screen.getByText('Luis Ferrer')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'En línea' })).toBeInTheDocument();
  });

  it('sin técnico → badge "Sin asignar"', () => {
    render(<SupportInsidePlanCard managed={{ ...MANAGED, technician: null }} />);
    expect(screen.getByText('Sin asignar')).toBeInTheDocument();
  });
});

describe('<ReassignTechnicianModal>', () => {
  beforeEach(() => {
    refresh.mockClear();
    listEligibleTechniciansAction.mockReset();
    assignTechnicianAction.mockReset();
    listEligibleTechniciansAction.mockResolvedValue({
      ok: true,
      technicians: [
        {
          id: 'tech-1',
          first_name: 'Luis',
          last_name: 'Ferrer',
          full_name: 'Luis Ferrer',
          email: 'luis@aelium.com',
          role: 'agent_support',
          avatar_url: null,
          presence: 'online',
          active_maintenance_tasks: 2,
        },
        {
          id: 'tech-2',
          first_name: 'Marc',
          last_name: 'Oliver',
          full_name: 'Marc Oliver',
          email: 'marc@aelium.com',
          role: 'agent_full',
          avatar_url: null,
          presence: 'away',
          active_maintenance_tasks: 0,
        },
      ],
    });
    assignTechnicianAction.mockResolvedValue({
      ok: true,
      reassigned_pending_tasks: 1,
    });
  });

  function renderModal() {
    return render(
      <ToastProvider>
        <ReassignTechnicianModal
          open
          onClose={() => {}}
          serviceId="svc-si"
          subscriptionId="sub-1"
          currentTechnicianId="tech-1"
        />
      </ToastProvider>,
    );
  }

  it('carga los técnicos elegibles con presencia y carga', async () => {
    renderModal();
    expect(await screen.findByText('Marc Oliver')).toBeInTheDocument();
    expect(screen.getByText(/En línea · Soporte · 2 tareas activas/)).toBeInTheDocument();
    expect(screen.getByText(/· actual/)).toBeInTheDocument();
    expect(listEligibleTechniciansAction).toHaveBeenCalledTimes(1);
  });

  it('reasigna al seleccionar otro técnico y confirmar', async () => {
    renderModal();
    fireEvent.click(await screen.findByText('Marc Oliver'));
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    await waitFor(() =>
      expect(assignTechnicianAction).toHaveBeenCalledWith(
        'sub-1',
        'tech-2',
        'svc-si',
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('permite desasignar (Sin técnico)', async () => {
    renderModal();
    fireEvent.click(await screen.findByText('Sin técnico (desasignar)'));
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    await waitFor(() =>
      expect(assignTechnicianAction).toHaveBeenCalledWith('sub-1', null, 'svc-si'),
    );
  });
});
