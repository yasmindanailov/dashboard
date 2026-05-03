import { redirect } from 'next/navigation';

import { getServerSession } from '../lib/server-auth';
import DashboardShell from './_components/DashboardShell';

/* ═══════════════════════════════════════
   Dashboard Layout — Portal de Cliente / Partner (`/dashboard/*`).
   Sprint 13 §13.AUTH Fase E (Modelo A — ADR-078 Amendment A1).

   Server Component async:
     - Si no hay sesión válida → redirect a `/?expired=true`.
     - Si hay sesión → hidrata `DashboardShell` (CC) con todo el
       estado UI (sidebar, topbar, support panel, command palette).

   `/dashboard/*` es el shell genérico para cualquier autenticado
   no-staff (cliente + partner). El staff puede entrar por consistencia
   pero el `canAccessRoute` granular dentro del shell maneja qué
   páginas ve. ADR-066 (3 portales raíz) + DC.7 (landing por rol).
   ═══════════════════════════════════════ */

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  if (!session) {
    redirect('/?expired=true');
  }
  return <DashboardShell>{children}</DashboardShell>;
}
