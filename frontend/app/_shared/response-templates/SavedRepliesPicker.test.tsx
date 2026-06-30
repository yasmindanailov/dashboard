/**
 * Tests del picker "Respuestas guardadas" (macros de soporte) — F3·E12.
 * Foco: carga perezosa al abrir, inserción del cuerpo elegido (onInsert) +
 * cierre del popover, y estado vacío. Los Server Actions se mockean (el
 * componente solo presenta el snapshot del servidor, R5).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider } from '../../components/ui';
import { SavedRepliesPicker } from './SavedRepliesPicker';
import { listResponseTemplatesAction } from './_actions';

jest.mock('./_actions');

const mockList = listResponseTemplatesAction as jest.MockedFunction<
  typeof listResponseTemplatesAction
>;

const TEMPLATES = [
  {
    id: 't1',
    title: 'Saludo',
    body: 'Hola, soy del equipo de Aelium.',
    category: 'Bienvenida',
    created_by: 'u1',
    creator_name: 'Ana García',
    created_at: '2026-06-29T10:00:00Z',
    updated_at: '2026-06-29T10:00:00Z',
  },
  {
    id: 't2',
    title: 'Cierre',
    body: '¿Te puedo ayudar en algo más?',
    category: null,
    created_by: null,
    creator_name: null,
    created_at: '2026-06-29T10:00:00Z',
    updated_at: '2026-06-29T10:00:00Z',
  },
];

function renderPicker(onInsert: jest.Mock = jest.fn()) {
  render(
    <ToastProvider>
      <SavedRepliesPicker onInsert={onInsert} />
    </ToastProvider>,
  );
  return onInsert;
}

describe('<SavedRepliesPicker> — F3·E12', () => {
  beforeEach(() => jest.clearAllMocks());

  it('carga las respuestas perezosamente (solo al abrir) y las lista', async () => {
    mockList.mockResolvedValue({ ok: true, templates: TEMPLATES });
    renderPicker();

    expect(mockList).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: /^respuestas guardadas$/i }),
    );

    expect(
      await screen.findByRole('menuitem', { name: /Saludo/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Cierre/ })).toBeInTheDocument();
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('al elegir una respuesta inserta su cuerpo y cierra el popover', async () => {
    mockList.mockResolvedValue({ ok: true, templates: TEMPLATES });
    const onInsert = renderPicker();

    fireEvent.click(
      screen.getByRole('button', { name: /^respuestas guardadas$/i }),
    );
    fireEvent.click(await screen.findByRole('menuitem', { name: /Saludo/ }));

    expect(onInsert).toHaveBeenCalledWith('Hola, soy del equipo de Aelium.');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('muestra estado vacío cuando la biblioteca está vacía', async () => {
    mockList.mockResolvedValue({ ok: true, templates: [] });
    renderPicker();

    fireEvent.click(
      screen.getByRole('button', { name: /^respuestas guardadas$/i }),
    );

    expect(await screen.findByText(/Aún no hay respuestas/)).toBeInTheDocument();
  });
});
