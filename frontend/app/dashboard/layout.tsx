import { redirect } from 'next/navigation';

import { getServerSession } from '../lib/server-auth';
import DashboardShell from './_components/DashboardShell';

/* ═══════════════════════════════════════
   Dashboard Layout — Portal de Cliente (`/dashboard/*`).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).

   Server Component async — guard simétrico al `/admin/layout.tsx`:
     - Si no hay sesión → redirect a `/?expired=true` (login).
     - Si rol es staff → redirect a `/admin` (su portal canónico).
     - Si rol es cliente / partner → hidrata `DashboardShell` (CC).

   ADR-066 §1: tres portales raíz canónicos. `/dashboard/*` es
   exclusivo del rol `client` (y `partner` hasta Sprint 19 que abrirá
   `/partner/*`). El staff entra a `/admin/*`. Permitir staff en
   `/dashboard` deja contadores y stats incoherentes (ven la inbox del
   cliente, no la suya — Sprint 13 §13.AUTH Fase F bug #4 reportado por
   Yasmin 2026-05-03).
   ═══════════════════════════════════════ */

const STAFF_ROLES = [
  'superadmin',
  'agent_full',
  'agent_billing',
  'agent_support',
] as const;

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect('/?expired=true');
  }
  if (
    STAFF_ROLES.includes(session.user.role.slug as (typeof STAFF_ROLES)[number])
  ) {
    redirect('/admin');
  }
  return <DashboardShell>{children}</DashboardShell>;
}
