'use client';

import { useState } from 'react';

import { Button, useToast } from '../../components/ui';
import { generateAiSuggestionAction } from './_actions';

/* ═══════════════════════════════════════
   AiSuggestionButton — "Sugerencia IA" en el composer de soporte. F3·E13 Fase F.

   El agente pide a la IA (Claude/Anthropic, ADR-080 Amendment D) un BORRADOR de
   respuesta a partir de la conversación. El borrador se inserta en el composer
   de forma **no-destructiva** (mismo patrón que las macros E12, `onInsert`) para
   que el agente lo revise y edite — NUNCA se auto-envía.

   El padre solo lo renderiza si hay un proveedor IA activo
   (`getAiSuggestionEnabledAction`), así que aquí no re-gateamos. Errores del
   backend (503 IA no disponible / circuit abierto) llegan como toast.
   ═══════════════════════════════════════ */

interface AiSuggestionButtonProps {
  conversationId: string;
  /** Inserta el borrador en el composer (no-destructivo, igual que las macros). */
  onInsert: (text: string) => void;
  /** Deshabilita el botón (p.ej. mientras se está enviando un mensaje). */
  disabled?: boolean;
}

const SPARKLE_ICON = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 2l1.7 5.3a2 2 0 0 0 1.3 1.3L20.3 10l-5.3 1.7a2 2 0 0 0-1.3 1.3L12 18.3l-1.7-5.3a2 2 0 0 0-1.3-1.3L3.7 10l5.3-1.7a2 2 0 0 0 1.3-1.3L12 2z" />
  </svg>
);

export function AiSuggestionButton({
  conversationId,
  onInsert,
  disabled,
}: AiSuggestionButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleGenerate(): Promise<void> {
    setLoading(true);
    try {
      const res = await generateAiSuggestionAction(conversationId);
      if (res.ok) {
        onInsert(res.suggestion);
        toast('success', 'Borrador de IA insertado — revísalo antes de enviar.');
      } else {
        toast('error', res.error);
      }
    } catch {
      toast('error', 'No se pudo generar la sugerencia de IA.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={loading}
      disabled={disabled}
      leftIcon={SPARKLE_ICON}
      onClick={() => {
        void handleGenerate();
      }}
      title="Pide a la IA un borrador de respuesta a partir de la conversación"
    >
      {loading ? 'Generando…' : 'Sugerencia IA'}
    </Button>
  );
}
