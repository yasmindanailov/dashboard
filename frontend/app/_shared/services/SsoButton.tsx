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
 * desincronizada", "reconciliar"); el admin sí, con CTA concreto al
 * recovery action ("Reconciliar todos los servicios" en la página settings
 * del plugin).
 *
 * Botón cliente que pide al backend la URL SSO del panel del proveedor
 * y abre la URL en nueva pestaña (canónico ADR-077 §2.4 `opensIn: 'new_tab'`).
 */
import { Button } from '../../components/ui';
import { t } from '../i18n';
import { useServiceSso } from './useServiceSso';

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

export function SsoButton({
  serviceId,
  panelLabel,
  isAdmin = false,
}: SsoButtonProps) {
  // F4·W3·U04 — la lógica SSO (action + toast + error-key por rol) vive en el
  // hook compartido `useServiceSso` (misma que consume la card ficha del hub).
  const { launch, loading } = useServiceSso(serviceId, isAdmin);

  return (
    <Button onClick={launch} disabled={loading} variant="primary">
      {loading ? 'Abriendo…' : `Abrir ${t(panelLabel)}`}
    </Button>
  );
}
