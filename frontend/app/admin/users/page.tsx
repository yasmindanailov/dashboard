import {
  requireRole,
  serverFetch,
  ServerFetchError,
} from '../../lib/server-auth';
import { AlertBanner } from '../../components/ui';
import type { Pagination } from '../../lib/types';
import StaffManager from './_components/StaffManager';
import type { StaffMember } from './types';
import s from './staff.module.css';

/**
 * /admin/users — gestión de cuentas de staff/agentes (GL-21, audit 2026-06-25
 * §6 Tier 3). Solo superadmin (defense in depth con el CASL del backend,
 * `Manage.Agent`). Cierra el riesgo operativo/seguridad de hacer altas/bajas de
 * agentes únicamente en BD (offboarding manual).
 */
export default async function AdminStaffPage() {
  const session = await requireRole(['superadmin']);

  let staff: StaffMember[] = [];
  let error: string | null = null;
  try {
    const res = await serverFetch<Pagination<StaffMember>>(
      '/admin/users/staff?limit=100',
    );
    staff = res.data;
  } catch (err) {
    error =
      err instanceof ServerFetchError
        ? err.message
        : 'No se pudieron cargar las cuentas de staff.';
  }

  return (
    <div>
      <header className={s.header}>
        <h1 className={s.title}>Equipo</h1>
        <p className={s.subtitle}>
          Gestiona las cuentas internas (agentes y administradores). Dar de baja
          a un agente desactiva su acceso y cierra sus sesiones al instante. Las
          cuentas nunca se borran físicamente: la desactivación preserva la
          integridad del historial (tareas, auditoría).
        </p>
      </header>

      {error && (
        <div className={s.toolbar}>
          <AlertBanner variant="danger">{error}</AlertBanner>
        </div>
      )}

      <StaffManager staff={staff} currentUserId={session.user.id} />
    </div>
  );
}
