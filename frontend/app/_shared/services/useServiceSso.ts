'use client';

/**
 * useServiceSso — Sprint F4·W3·U04.
 *
 * Hook compartido que encapsula el lanzamiento del SSO al panel del proveedor
 * (Server Action `requestSsoUrlAction` + toast + discriminación de errores por
 * rol, UI_SPEC §1.2 P5/P6). Fuente ÚNICA de esa lógica: la consumen tanto el
 * `<SsoButton>` del detalle como la quick-action "Abrir panel" del menú ⋯ de la
 * card ficha del hub "Mis servicios" (evita duplicar el selector de i18n de
 * error — DRY / anti-drift).
 *
 * ADR-077 §2.4 — `opensIn: 'new_tab'` canónico.
 */
import { useState } from 'react';

import { useToast } from '../../components/ui';
import { t } from '../i18n';
import { requestSsoUrlAction } from './_actions';

/**
 * Mapea `errorCode` canónico (backend wrapper `GetSsoUrlResult`) + `isAdmin` a
 * la i18n key discriminada por rol. Heredable a todos los plugins SaaS.
 */
function selectSsoErrorKey(errorCode: string | null, isAdmin: boolean): string {
  const role = isAdmin ? 'admin' : 'client';
  if (errorCode === 'INVALID_STATE') return `sso.error.invalid_state.${role}`;
  if (errorCode === 'CIRCUIT_OPEN') return `sso.error.circuit_open.${role}`;
  return `sso.error.provider_internal.${role}`;
}

export function useServiceSso(serviceId: string, isAdmin = false) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const launch = async () => {
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

  return { launch, loading };
}
