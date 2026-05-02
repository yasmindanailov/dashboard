'use client';

/**
 * SsoButton — Sprint 11 Fase 11.D (ADR-070 §B).
 *
 * Botón cliente que pide al backend la URL SSO del panel del proveedor
 * y abre la URL en nueva pestaña (canónico ADR-077 §2.4 `opensIn: 'new_tab'`).
 *
 * TODO(ADR-078, Sprint 13): migrar a Server Action cuando cookies httpOnly
 * estén activas. Ref DC.28. Este archivo es la última excepción permitida
 * del patrón 'use client' + localStorage según ADR-078 §3.2.
 */
import { useState } from 'react';
import { Button } from '../../components/ui';
import { servicesApi } from '../../lib/api';
import { getErrorMessage } from '../../lib/error';

interface SsoButtonProps {
  serviceId: string;
  panelLabel: string;
}

export function SsoButton({ serviceId, panelLabel }: SsoButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('access_token');
    if (!token) {
      setError('Sesión expirada. Vuelve a iniciar sesión.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await servicesApi.sso(token, serviceId);
      if (!res.sso) {
        setError(
          'El proveedor no devolvió una sesión válida. Inténtalo más tarde.',
        );
        return;
      }
      // ADR-077 §2.4 — opensIn === 'new_tab' canónico.
      window.open(res.sso.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(getErrorMessage(err) ?? 'No se pudo abrir el panel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Button onClick={onClick} disabled={loading} variant="primary">
        {loading ? 'Abriendo…' : `Abrir ${panelLabel}`}
      </Button>
      {error && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--danger-600)',
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
