'use client';

/**
 * SsoButton — Sprint 11 Fase 11.D (ADR-070 §B).
 * Sprint 13 §13.AUTH Fase E (Modelo A): Server Action requestSsoUrlAction.
 *
 * Botón cliente que pide al backend la URL SSO del panel del proveedor
 * y abre la URL en nueva pestaña (canónico ADR-077 §2.4 `opensIn: 'new_tab'`).
 */
import { useState } from 'react';
import { Button, useToast } from '../../components/ui';
import { t } from '../i18n';
import { requestSsoUrlAction } from './_actions';

interface SsoButtonProps {
  serviceId: string;
  panelLabel: string;
}

export function SsoButton({ serviceId, panelLabel }: SsoButtonProps) {
  // Sprint 15C Fase 15C.I: feedback de error via toast canónico
  // (UI_SPEC §4.3). Antes Sprint 11 Fase 11.D usaba <p> inline; ese
  // patrón violaba la doctrina y daba feedback poco visible.
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    const result = await requestSsoUrlAction(serviceId);
    setLoading(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    if (!result.sso) {
      toast(
        'error',
        'El proveedor no devolvió una sesión válida. Inténtalo más tarde.',
      );
      return;
    }
    /* ADR-077 §2.4 — opensIn === 'new_tab' canónico. */
    window.open(result.sso.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Button onClick={onClick} disabled={loading} variant="primary">
      {loading ? 'Abriendo…' : `Abrir ${t(panelLabel)}`}
    </Button>
  );
}
