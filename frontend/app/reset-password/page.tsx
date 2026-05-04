import { redirect } from 'next/navigation';
import Link from 'next/link';

import { getServerSession } from '../lib/server-auth';
import { landingForRole } from '../lib/auth-routing';
import AuthLayout from '../AuthLayout';
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
      <AuthLayout>
        <div className={styles.successContainer}>
          <svg
            className={styles.successIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: 'var(--danger)' }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h1 className={styles.successTitle}>Enlace inválido</h1>
          <p className={styles.successText}>
            Este enlace de recuperación no es válido o ha expirado.
          </p>
          <Link href="/forgot-password" className={styles.footerLink}>
            Solicitar nuevo enlace
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return <ResetPasswordForm token={token} />;
}
