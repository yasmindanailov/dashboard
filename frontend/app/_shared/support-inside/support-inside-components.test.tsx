/**
 * Componentes gestionados Support Inside (F3·E8): PresenceDot, TechnicianCard,
 * MaintenanceSlotCard. Verifican presencia, iniciales/fallback y el mapeo de
 * estado de mantenimiento a su badge.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { PresenceDot } from './PresenceDot';
import { TechnicianCard } from './TechnicianCard';
import { MaintenanceSlotCard } from './MaintenanceSlotCard';
import type { SupportInsideSlotPayload } from '../../lib/api';

describe('<PresenceDot>', () => {
  it('expone el estado vía aria-label', () => {
    render(<PresenceDot status="online" />);
    expect(screen.getByRole('img', { name: 'En línea' })).toBeInTheDocument();
  });
});

describe('<TechnicianCard>', () => {
  const tech = { id: 't1', first_name: 'Luis', last_name: 'Ferrer', presence: 'online' as const };

  it('muestra iniciales, nombre y "tu técnico" + presencia', () => {
    render(<TechnicianCard technician={tech} />);
    expect(screen.getByText('LF')).toBeInTheDocument();
    expect(screen.getByText(/Luis Ferrer/)).toBeInTheDocument();
    expect(screen.getByText(/tu técnico/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'En línea' })).toBeInTheDocument();
  });

  it('fallback cuando no hay técnico', () => {
    render(<TechnicianCard technician={null} />);
    expect(screen.getByText('Sin técnico asignado')).toBeInTheDocument();
  });
});

describe('<MaintenanceSlotCard>', () => {
  const baseSlot: SupportInsideSlotPayload = {
    id: 'slot-1',
    subscription_id: 'sub-1',
    service_id: 'svc-1',
    slot_type: 'maintenance',
    is_extra: false,
    assigned_at: '2026-04-14T00:00:00.000Z',
    released_at: null,
    service: {
      id: 'svc-1',
      label: 'Mi web',
      domain: 'sara.com',
      status: 'active',
      product: { name: 'Web Pro' },
    },
    last_maintenance_at: '2026-06-14T06:30:00.000Z',
    next_maintenance_at: '2026-07-14T06:00:00.000Z',
    maintenance_status: 'up_to_date',
  };

  it('mantenido → badge "Mantenido" + nombre + secciones de fecha', () => {
    render(
      <MaintenanceSlotCard
        slot={baseSlot}
        slotTypeLabel="Mantenimiento"
        onViewHistory={() => {}}
        onRelease={() => {}}
      />,
    );
    expect(screen.getByText('Mi web')).toBeInTheDocument();
    expect(screen.getByText('Mantenido')).toBeInTheDocument();
    expect(screen.getByText('Última revisión')).toBeInTheDocument();
    expect(screen.getByText('Próxima revisión')).toBeInTheDocument();
  });

  it('overdue → badge "Pendiente"', () => {
    render(
      <MaintenanceSlotCard
        slot={{ ...baseSlot, maintenance_status: 'overdue' }}
        slotTypeLabel="Mantenimiento"
        onViewHistory={() => {}}
        onRelease={() => {}}
      />,
    );
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('dispara onViewHistory y onRelease', () => {
    const onViewHistory = jest.fn();
    const onRelease = jest.fn();
    render(
      <MaintenanceSlotCard
        slot={baseSlot}
        slotTypeLabel="Mantenimiento"
        onViewHistory={onViewHistory}
        onRelease={onRelease}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver mantenimientos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Liberar slot' }));
    expect(onViewHistory).toHaveBeenCalledTimes(1);
    expect(onRelease).toHaveBeenCalledTimes(1);
  });
});
