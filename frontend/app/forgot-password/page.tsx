import { redirect } from 'next/navigation';

import { getServerSession } from '../lib/server-auth';
import { landingForRole } from '../lib/auth-routing';
import ForgotPasswordForm from './_components/ForgotPasswordForm';

/* ═══════════════════════════════════════════════════════════
   Forgot Password Page — SC wrapper Sprint 13 §13.AUTH Fase E.
   Si la cookie httpOnly resuelve sesión válida → redirect al landing.
   ═══════════════════════════════════════════════════════════ */

export default async function ForgotPasswordPage() {
  const session = await getServerSession();
  if (session) {
    redirect(landingForRole(session.user.role.slug));
  }
  return <ForgotPasswordForm />;
}
