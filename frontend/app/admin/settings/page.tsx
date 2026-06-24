import {
  requireRole,
  serverFetch,
  ServerFetchError,
} from '../../lib/server-auth';
import {
  SettingsManager,
  type AdminSettingsGroup,
} from './_components/SettingsManager';

/**
 * /admin/settings — hub de configuración (Sprint 12, ADR-044).
 *
 * Reemplaza el redirect a `/plugins` (Sprint 15A Fase I.2) por el hub real:
 * secciones de settings de negocio (General, Marca con logo, Facturación,
 * Soporte, Notificaciones, DNS) + enlace a la gestión de plugins. Sólo
 * superadmin (defense in depth con el CASL del backend, `Subject.Setting`).
 */
export default async function AdminSettingsPage() {
  await requireRole(['superadmin']);

  let groups: AdminSettingsGroup[] = [];
  let logoUrl: string | null = null;
  let error: string | null = null;

  try {
    groups = await serverFetch<AdminSettingsGroup[]>('/admin/settings');
    const logo = await serverFetch<{
      logo_key: string | null;
      url: string | null;
    }>('/admin/settings/branding/logo');
    logoUrl = logo.url;
  } catch (err) {
    error =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudieron cargar los settings.';
  }

  return (
    <SettingsManager groups={groups} initialLogoUrl={logoUrl} error={error} />
  );
}
