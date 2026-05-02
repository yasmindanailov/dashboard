'use client';

/**
 * ActionsBar — Sprint 11 Fase 11.D (ADR-070 §C — acciones curadas inline).
 *
 * Renderiza los `info.availableActions` del plugin como botones. Cada
 * acción dispara `executeAction` con confirmación cuando aplique. El
 * resultado del plugin se muestra en línea (success.message o
 * data.logs_tail). Cache se invalida por el wrapper canónico backend
 * (ADR-077 §5).
 *
 * Plugins triviales `internal` y `manual` declaran `availableActions=[]`
 * → este componente NO se renderiza por ellos. Útil para Sprint 15
 * (Enhance, ResellerClub, Docker) donde sí hay acciones.
 *
 * TODO(ADR-078, Sprint 13): migrar a Server Action cuando cookies httpOnly
 * estén activas. Ref DC.28. Este archivo es la última excepción permitida
 * del patrón 'use client' + localStorage según ADR-078 §3.2.
 */
import { useState } from 'react';
import { Button, Card } from '../../components/ui';
import { servicesApi, type ServiceAction, type ActionResult } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';

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
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('access_token');
    if (!token) {
      setError('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }

    if (action.confirmRequired) {
      const text = action.confirmationText ?? `¿Confirmar acción "${action.label}"?`;
      if (!window.confirm(text)) return;
    }

    setRunning(action.slug);
    setError(null);
    setFeedback(null);
    try {
      const result = await servicesApi.executeAction(
        token,
        serviceId,
        action.slug,
        // Acciones triviales sin payload — futuros plugins con payloadSchema
        // definirán formularios inline propios (Sprint 15+).
        {},
      );
      setFeedback({ actionSlug: action.slug, result });
      onActionExecuted?.(result);
    } catch (err) {
      setError(getErrorMessage(err) ?? 'No se pudo ejecutar la acción');
    } finally {
      setRunning(null);
    }
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
        <p
          style={{
            marginTop: 12,
            fontSize: 13,
            color: 'var(--danger-600)',
          }}
        >
          {error}
        </p>
      )}
    </Card>
  );
}
