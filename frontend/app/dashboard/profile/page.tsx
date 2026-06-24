/**
 * /dashboard/profile — "Mi cuenta" (ADR-085).
 *
 * Server Component (Modelo A, ADR-078 A1): el `dashboard/layout.tsx` garantiza
 * sesión. Cargamos server-side, self-scoped por el JWT:
 *   - `/auth/me`               → identidad + estado de seguridad (2FA, email)
 *   - `/auth/sessions`         → sesiones activas
 *   - `/account/billing-profiles` → perfiles de facturación (los que facturan)
 *   - `/domains/registrant`    → datos de titular WHOIS (sección Dominios)
 *
 * Sólo `/auth/me` es obligatorio; el resto degrada con gracia (null/[]).
 */

import { ListPage, AlertBanner } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { RegistrantProfile } from '../../_shared/domains/_registrant-actions';
import type { AccountMe, AccountSession, BillingProfile } from './_actions';
import AccountView from './_components/AccountView';

async function safe<T>(path: string): Promise<T | null> {
  try {
    return await serverFetch<T>(path);
  } catch {
    return null;
  }
}

export default async function ProfilePage() {
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
      <ListPage title="Mi cuenta" subtitle="Perfil, seguridad y facturación">
        <AlertBanner variant="danger">
          {meError ?? 'No se pudo cargar tu cuenta.'}
        </AlertBanner>
      </ListPage>
    );
  }

  const [sessions, billingProfiles, registrant] = await Promise.all([
    safe<AccountSession[]>('/auth/sessions'),
    safe<BillingProfile[]>('/account/billing-profiles'),
    safe<RegistrantProfile>('/domains/registrant'),
  ]);

  return (
    <ListPage title="Mi cuenta" subtitle="Perfil, seguridad y facturación">
      <AccountView
        me={me}
        sessions={sessions ?? []}
        billingProfiles={billingProfiles ?? []}
        registrant={registrant}
      />
    </ListPage>
  );
}
