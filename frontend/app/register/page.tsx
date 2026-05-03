import { redirect } from 'next/navigation';

import { getServerSession } from '../lib/server-auth';
import { landingForRole } from '../lib/auth-routing';
import RegisterForm from './_components/RegisterForm';

/* ═══════════════════════════════════════════════════════════
   Register Page — Aelium Dashboard

   Server Component wrapper (Sprint 13 §13.AUTH Fase E — ADR-078 Amendment A1).
   Si la cookie httpOnly resuelve sesión válida → redirect al landing del rol.
   Si no, renderiza el Client `RegisterForm` (useActionState + registerAction).
   ═══════════════════════════════════════════════════════════ */

export default async function RegisterPage() {
  const session = await getServerSession();
  if (session) {
    redirect(landingForRole(session.user.role.slug));
  }
  return <RegisterForm />;
}
