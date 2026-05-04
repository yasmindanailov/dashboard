import { redirect } from 'next/navigation';

import { getServerSession } from '../lib/server-auth';
import AdminShell from './_components/AdminShell';

/* ═══════════════════════════════════════
   Admin Layout — Portal de Administración (`/admin/*`).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).

   Server Component async:
     - Si no hay sesión → redirect a `/?expired=true` (login).
     - Si hay sesión pero el rol no es staff → redirect a `/dashboard`.
     - Solo entonces hidrata el `AdminShell` (CC) con todo el estado UI.

   Defense in depth canónica:
     1. AdminOnlyGuard backend en /api/v1/admin/* (rechazo en API).
     2. Este SC redirige server-side antes del primer paint (sin
        loading flash, sin race con scripts cliente).
     3. `AdminShell.tsx` ejecuta route-level permission check granular
        via `canAccessRoute()` (NoPermission si CASL deniega).

   Sprint 9 Fase F (DC.7) + Sprint 9.6 Fase F.0 (shell unificado).
   ═══════════════════════════════════════ */

const STAFF_ROLES = [
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect('/?expired=true');
  }
  if (!STAFF_ROLES.includes(session.user.role.slug as (typeof STAFF_ROLES)[number])) {
    redirect('/dashboard');
  }
  return <AdminShell>{children}</AdminShell>;
}
