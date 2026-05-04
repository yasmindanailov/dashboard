'use client';

/**
 * SsoButton — Sprint 11 Fase 11.D (ADR-070 §B).
 * Sprint 13 §13.AUTH Fase E (Modelo A): Server Action requestSsoUrlAction.
 *
 * Botón cliente que pide al backend la URL SSO del panel del proveedor
 * y abre la URL en nueva pestaña (canónico ADR-077 §2.4 `opensIn: 'new_tab'`).
 */
import { useState } from 'react';
import { Button } from '../../components/ui';
import { requestSsoUrlAction } from './_actions';

interface SsoButtonProps {
  serviceId: string;
  panelLabel: string;
}

export function SsoButton({ serviceId, panelLabel }: SsoButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setLoading(true);
    setError(null);
    const result = await requestSsoUrlAction(serviceId);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!result.sso) {
      setError('El proveedor no devolvió una sesión válida. Inténtalo más tarde.');
      return;
    }
    /* ADR-077 §2.4 — opensIn === 'new_tab' canónico. */
    window.open(result.sso.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Button onClick={onClick} disabled={loading} variant="primary">
        {loading ? 'Abriendo…' : `Abrir ${panelLabel}`}
      </Button>
      {error && (
        <p style={{ fontSize: 12, color: 'var(--danger-600)', margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
