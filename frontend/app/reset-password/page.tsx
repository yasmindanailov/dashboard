import { redirect } from 'next/navigation';
import Link from 'next/link';
import { XCircle } from 'lucide-react';

import { getServerSession } from '../lib/server-auth';
import { landingForRole } from '../lib/auth-routing';
import AuthLayout from '../AuthLayout';
import { RECOVER_PANEL } from '../auth-panels';
import ResetPasswordForm from './_components/ResetPasswordForm';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Reset Password Page — SC wrapper Sprint 13 §13.AUTH Fase E.

   - Si la cookie httpOnly resuelve sesión → redirect al landing.
   - Si no hay token en la URL → renderiza el estado "enlace inválido".
   - Si hay token → delega al Client `ResetPasswordForm`.

   Next.js 16: searchParams es Promise (cf. node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md).
   ═══════════════════════════════════════════════════════════ */

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ResetPasswordPage({ searchParams }: PageProps) {
  const session = await getServerSession();
  if (session) {
    redirect(landingForRole(session.user.role.slug));
  }

  const params = await searchParams;
  const tokenParam = params.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  if (!token) {
    return (
      <AuthLayout headline={RECOVER_PANEL.headline} valueProps={RECOVER_PANEL.valueProps}>
        <div className={styles.authResult}>
          <div className={`${styles.authResultIcon} ${styles.authResultDanger}`}>
            <XCircle size={30} strokeWidth={2} />
          </div>
          <h1 className={styles.authResultTitle}>Enlace inválido</h1>
          <p className={styles.authResultText}>
            Este enlace de recuperación no es válido o ha expirado.
          </p>
          <Link href="/forgot-password" className={styles.authResultCta}>
            Solicitar nuevo enlace
          </Link>
          <Link href="/" className={styles.authResultLinkMuted}>← Volver al login</Link>
        </div>
      </AuthLayout>
    );
  }

  return <ResetPasswordForm token={token} />;
}
