/**
 * /dashboard/profile — "Mi perfil" — Sprint 15D Fase 15D.G·2.
 *
 * Server Component (Modelo A, ADR-078 A1): el `dashboard/layout.tsx` garantiza
 * sesión; aquí cargamos los datos de titular server-side (`GET /domains/registrant`,
 * self-scoped por JWT). Son los datos WHOIS de TODOS los dominios del cliente
 * (1 titular/cliente, ADR-081 A2): al editarlos se propagan al registrador.
 */

import { AlertBanner, ListPage } from '../../components/ui';
import { serverFetch, ServerFetchError } from '../../lib/server-auth';
import type { RegistrantProfile } from '../../_shared/domains/_registrant-actions';
import RegistrantForm from './_components/RegistrantForm';

export default async function ProfilePage() {
  let profile: RegistrantProfile | null = null;
  let errorMessage: string | null = null;
  try {
    profile = await serverFetch<RegistrantProfile>('/domains/registrant');
  } catch (err) {
    errorMessage =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudo cargar tu perfil.';
  }

  return (
    <ListPage
      title="Mi perfil"
      subtitle="Tus datos personales y de titular de dominios"
    >
      {profile ? (
        <RegistrantForm initial={profile} />
      ) : (
        <AlertBanner variant="danger">
          {errorMessage ?? 'No se pudo cargar tu perfil.'}
        </AlertBanner>
      )}
    </ListPage>
  );
}
