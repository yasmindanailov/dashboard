'use client';

/**
 * ActionsBar — Sprint 11 Fase 11.D (ADR-070 §C — acciones curadas inline).
 * Sprint 13 §13.AUTH Fase E (Modelo A): Server Action executeServiceActionAction.
 *
 * Renderiza los `info.availableActions` del plugin como botones. Cada
 * acción dispara executeAction con confirmación cuando aplique. El
 * resultado del plugin se muestra en línea (success.message o
 * data.logs_tail). Cache se invalida por el wrapper canónico backend
 * (ADR-077 §5).
 *
 * Plugins triviales `internal` y `manual` declaran `availableActions=[]`
 * → este componente NO se renderiza por ellos.
 */
import { useState } from 'react';
import { Button, Card } from '../../components/ui';
import type { ActionResult, ServiceAction } from '../../lib/api';
import { executeServiceActionAction } from './_actions';

interface ActionsBarProps {
  serviceId: string;
  actions: readonly ServiceAction[];
  onActionExecuted?: (result: ActionResult) => void;
}

export function ActionsBar({ serviceId, actions, onActionExecuted }: ActionsBarProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    actionSlug: string;
    result: ActionResult;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (actions.length === 0) return null;

  const onAction = async (action: ServiceAction) => {
    if (action.confirmRequired) {
      const text = action.confirmationText ?? `¿Confirmar acción "${action.label}"?`;
      if (!window.confirm(text)) return;
    }

    setRunning(action.slug);
    setError(null);
    setFeedback(null);
    /*
     * Acciones triviales sin payload — futuros plugins con
     * payloadSchema definirán formularios inline propios (Sprint 15+).
     */
    const result = await executeServiceActionAction(serviceId, action.slug, {});
    setRunning(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setFeedback({ actionSlug: action.slug, result: result.result });
    onActionExecuted?.(result.result);
  };

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, marginBottom: 12 }}>
        Acciones rápidas
      </h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {actions.map((action) => (
          <Button
            key={action.slug}
            onClick={() => onAction(action)}
            disabled={running === action.slug}
            variant={action.destructive ? 'danger' : 'secondary'}
          >
            {running === action.slug ? 'Ejecutando…' : action.label}
          </Button>
        ))}
      </div>
      {feedback && (
        <p
          style={{
            marginTop: 12,
            fontSize: 13,
            color: feedback.result.success
              ? 'var(--success-600)'
              : 'var(--warning-600)',
          }}
        >
          {feedback.result.message ??
            (feedback.result.success
              ? `Acción "${feedback.actionSlug}" completada.`
              : `Acción "${feedback.actionSlug}" no se completó.`)}
        </p>
      )}
      {error && (
        <p style={{ marginTop: 12, fontSize: 13, color: 'var(--danger-600)' }}>
          {error}
        </p>
      )}
    </Card>
  );
}
