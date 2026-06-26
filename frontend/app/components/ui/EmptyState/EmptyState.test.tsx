/**
 * Tests de render del componente DS `EmptyState` (D8 — estados vacíos
 * siempre diseñados). Verifica el render condicional de icono / descripción
 * / acción: solo aparecen cuando se proveen.
 */
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('<EmptyState>', () => {
  it('renderiza el título como encabezado de nivel 3', () => {
    render(<EmptyState title="Sin facturas" />);
    expect(screen.getByRole('heading', { level: 3, name: 'Sin facturas' })).toBeInTheDocument();
  });

  it('muestra la descripción solo cuando se provee', () => {
    const { rerender } = render(<EmptyState title="Vacío" />);
    expect(screen.queryByText('Aún no hay nada aquí.')).not.toBeInTheDocument();

    rerender(<EmptyState title="Vacío" description="Aún no hay nada aquí." />);
    expect(screen.getByText('Aún no hay nada aquí.')).toBeInTheDocument();
  });

  it('renderiza la acción sugerida cuando se provee', () => {
    render(<EmptyState title="Vacío" action={<button>Crear</button>} />);
    expect(screen.getByRole('button', { name: 'Crear' })).toBeInTheDocument();
  });

  it('renderiza el icono cuando se provee', () => {
    render(<EmptyState title="Vacío" icon={<svg data-testid="icono" />} />);
    expect(screen.getByTestId('icono')).toBeInTheDocument();
  });
});
