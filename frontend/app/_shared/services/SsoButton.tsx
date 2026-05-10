'use client';

/**
 * SsoButton — Sprint 11 Fase 11.D (ADR-070 §B).
 * Sprint 13 §13.AUTH Fase E (Modelo A): Server Action requestSsoUrlAction.
 * Sprint 15C.II Fase C round 5 (smoke real Yasmin 2026-05-10): error
 * codes discriminados — backend retorna `{ sso, errorCode }` para
 * distinguir caso legítimo (null sin errorCode) de drift detectable
 * (errorCode='INVALID_STATE'). Mostramos toast útil según causa raíz.
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
      // Sprint 15C.II Fase C round 5: branch por errorCode para mensaje
      // útil. Mapeo canónico (heredable a 15D RC, 15E, 15G):
      //   - INVALID_STATE   → drift detectable, sugerencia force_resync.
      //   - PROVIDER_INTERNAL_ERROR → 5xx / red / unknown.
      //   - null            → caso legítimo "plugin no soporta SSO" o
      //                       "refs missing" (typically ya manejado
      //                       upstream por el banner drift; aquí es
      //                       defensivo — mostramos genérico).
      const key =
        result.errorCode === 'INVALID_STATE'
          ? 'sso.error.invalid_state'
          : result.errorCode === null
            ? 'sso.error.provider_internal'
            : 'sso.error.provider_internal';
      toast('error', t(key));
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
