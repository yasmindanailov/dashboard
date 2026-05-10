'use client';

/**
 * SsoButton — Sprint 11 Fase 11.D (ADR-070 §B).
 * Sprint 13 §13.AUTH Fase E (Modelo A): Server Action requestSsoUrlAction.
 * Sprint 15C.II Fase C round 5 (smoke real Yasmin 2026-05-10): error
 * codes discriminados — backend retorna `{ sso, errorCode }` para
 * distinguir caso legítimo (null sin errorCode) de drift detectable
 * (errorCode='INVALID_STATE').
 * Sprint 15C.II Fase C round 6: discriminación cliente vs admin en los
 * mensajes de error (UI_SPEC §1.2 P5 voz Aelium + P6 contenido
 * adaptativo por rol). El cliente NO ve tecnicismos ("drift", "metadata
 * desincronizada", "Reconciliar contra Enhance"); el admin sí, con CTA
 * concreto al recovery action.
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
  /**
   * `true` si el viewer es staff. El SC parent lo deriva con
   * `isStaffRole(session.user.role.slug)`. Default `false` por
   * seguridad — si el caller olvida pasarlo, el cliente ve mensajes
   * empáticos sin tecnicismos.
   */
  isAdmin?: boolean;
}

/**
 * Mapea errorCode canónico (backend wrapper GetSsoUrlResult) +
 * isAdmin a la i18n key discriminada por rol. Heredable a todos los
 * plugins SaaS (15D RC, 15E Docker, 15G Plesk).
 */
function selectSsoErrorKey(
  errorCode: string | null,
  isAdmin: boolean,
): string {
  const role = isAdmin ? 'admin' : 'client';
  if (errorCode === 'INVALID_STATE') return `sso.error.invalid_state.${role}`;
  if (errorCode === 'CIRCUIT_OPEN') return `sso.error.circuit_open.${role}`;
  return `sso.error.provider_internal.${role}`;
}

export function SsoButton({
  serviceId,
  panelLabel,
  isAdmin = false,
}: SsoButtonProps) {
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
      toast('error', t(selectSsoErrorKey(result.errorCode, isAdmin)));
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
