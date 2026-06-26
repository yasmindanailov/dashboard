/**
 * Tests de render del componente DS `Badge` — valida el harness RTL + jsdom
 * (transform SWC de JSX, auto-mock de CSS modules de next/jest) y el contrato
 * básico del componente. Se asertan comportamiento y estructura, no los
 * nombres de clase CSS-module (detalle de implementación).
 */
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('<Badge>', () => {
  it('renderiza sus children como contenido', () => {
    render(<Badge>Activo</Badge>);
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('renderiza un elemento <span> (badge inline)', () => {
    render(<Badge>X</Badge>);
    expect(screen.getByText('X').tagName).toBe('SPAN');
  });

  it('reenvía el className extra recibido por props', () => {
    render(<Badge className="mi-clase-extra">X</Badge>);
    expect(screen.getByText('X')).toHaveClass('mi-clase-extra');
  });
});
