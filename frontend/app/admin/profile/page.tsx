/**
 * /admin/profile — "Mi cuenta" del staff (ADR-085).
 *
 * El portal `/dashboard/*` es exclusivo de cliente (ADR-066): el staff que entra
 * ahí es redirigido a `/admin`. Por eso su página de cuenta vive aquí,
 * **reutilizando los mismos componentes self-service** de `_shared/account/`.
 * El backend `/account/*` + `/auth/*` es role-agnóstico. Para staff se muestran
 * **Cuenta + Seguridad** (sin facturación ni titular WHOIS, que son de cliente).
 */

import { ListPage, AlertBanner } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import AccountView from '../../_shared/account/AccountView';
import type { AccountMe, AccountSession } from '../../_shared/account/_actions';

export default async function AdminProfilePage() {
  let me: AccountMe | null = null;
  let meError: string | null = null;
  try {
    me = await serverFetch<AccountMe>('/auth/me');
  } catch (err) {
    meError =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar tu cuenta.';
  }

  if (!me) {
    return (
      <ListPage title="Mi cuenta" subtitle="Perfil y seguridad">
        <AlertBanner variant="danger">
          {meError ?? 'No se pudo cargar tu cuenta.'}
        </AlertBanner>
      </ListPage>
    );
  }

  let sessions: AccountSession[] = [];
  try {
    sessions = await serverFetch<AccountSession[]>('/auth/sessions');
  } catch {
    sessions = [];
  }

  return (
    <ListPage title="Mi cuenta" subtitle="Perfil y seguridad">
      <AccountView
        me={me}
        sessions={sessions}
        billingProfiles={[]}
        registrant={null}
        audience="staff"
      />
    </ListPage>
  );
}
