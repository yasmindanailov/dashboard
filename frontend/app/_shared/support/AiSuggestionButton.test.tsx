/**
 * Tests del botón "Sugerencia IA" del composer de soporte — F3·E13 Fase F.
 * Foco: genera el borrador y lo inserta vía `onInsert` (NUNCA auto-envía) +
 * ante error no inserta nada. El Server Action se mockea (R5: el componente
 * solo orquesta la inserción del snapshot del servidor).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../components/ui';
import { AiSuggestionButton } from './AiSuggestionButton';
import { generateAiSuggestionAction } from './_actions';

// Factory mock (no automock): `_actions.ts` importa `next/cache`
// (`revalidatePath`), que en jsdom rompe por `TextEncoder`. La factory evita
// cargar el módulo real — solo necesitamos la action que usa este componente.
jest.mock('./_actions', () => ({
  generateAiSuggestionAction: jest.fn(),
}));

const mockGen = generateAiSuggestionAction as jest.MockedFunction<
  typeof generateAiSuggestionAction
>;

function renderButton(onInsert: jest.Mock = jest.fn()) {
  render(
    <ToastProvider>
      <AiSuggestionButton conversationId="c1" onInsert={onInsert} />
    </ToastProvider>,
  );
  return onInsert;
}

describe('<AiSuggestionButton> — F3·E13 Fase F', () => {
  beforeEach(() => jest.clearAllMocks());

  it('genera el borrador y lo inserta en el composer (no auto-envía)', async () => {
    mockGen.mockResolvedValue({
      ok: true,
      suggestion: 'Hola, lo estamos revisando.',
      model: 'stub',
    });
    const onInsert = renderButton();

    fireEvent.click(screen.getByRole('button', { name: /sugerencia ia/i }));

    await waitFor(() =>
      expect(onInsert).toHaveBeenCalledWith('Hola, lo estamos revisando.'),
    );
    expect(mockGen).toHaveBeenCalledWith('c1');
  });

  it('ante error del backend NO inserta nada en el composer', async () => {
    mockGen.mockResolvedValue({
      ok: false,
      error: 'La sugerencia de IA no está activa.',
    });
    const onInsert = renderButton();

    fireEvent.click(screen.getByRole('button', { name: /sugerencia ia/i }));

    await waitFor(() => expect(mockGen).toHaveBeenCalled());
    expect(onInsert).not.toHaveBeenCalled();
  });
});
