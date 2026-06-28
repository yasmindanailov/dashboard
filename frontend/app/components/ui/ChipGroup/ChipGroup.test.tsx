/**
 * Tests de la primitiva DS `ChipGroup` (F3·E10): refleja la selección activa
 * vía `aria-selected` y emite `onChange` con el value del chip pulsado.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ChipGroup } from './ChipGroup';

const options = [
  { value: '', label: 'Todas' },
  { value: 'facturacion', label: 'Facturación' },
  { value: 'dominios', label: 'Dominios' },
];

describe('<ChipGroup>', () => {
  it('marca el chip activo con aria-selected=true (y el resto false)', () => {
    render(<ChipGroup options={options} value="facturacion" onChange={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Facturación' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Todas' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('emite onChange con el value del chip pulsado', () => {
    const onChange = jest.fn();
    render(<ChipGroup options={options} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Dominios' }));
    expect(onChange).toHaveBeenCalledWith('dominios');
  });
});
