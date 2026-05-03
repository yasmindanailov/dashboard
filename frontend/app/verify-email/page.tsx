import Link from 'next/link';

import { verifyEmailAction } from '../lib/auth-actions';
import AuthLayout from '../AuthLayout';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Verify Email Page — Sprint 13 §13.AUTH Fase E (Modelo A).

   Server Component puro. Lee `?token=…` de la URL, invoca el Server
   Action `verifyEmailAction(token)` server-side y renderiza el
   resultado. NO requiere session check (el verify-email es válido
   para anónimos y autenticados — el token es independiente).

   El antiguo `useEffect+useRef` para evitar double-fire en Strict Mode
   ya no aplica: en SC el render server-side ocurre 1 sola vez por
   request HTTP, sin dobles invocaciones.
   ═══════════════════════════════════════════════════════════ */

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
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
          <h1 className={styles.successTitle}>Token no proporcionado</h1>
          <p className={styles.successText}>
            El enlace de verificación está incompleto. Solicita uno nuevo desde el login.
          </p>
          <Link href="/" className={styles.footerLink}>← Volver al login</Link>
        </div>
      </AuthLayout>
    );
  }

  const result = await verifyEmailAction(token);
  const success = !!result.success;

  return (
    <AuthLayout>
      <div className={styles.successContainer}>
        {success ? (
          <>
            <svg
              className={styles.successIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ color: 'var(--success)' }}
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <h1 className={styles.successTitle}>¡Email verificado!</h1>
            <p className={styles.successText}>
              {result.success?.message ?? 'Email verificado correctamente'}
            </p>
            <Link
              href="/"
              className={styles.submitButton}
              style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}
            >
              Iniciar sesión
            </Link>
          </>
        ) : (
          <>
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
            <h1 className={styles.successTitle}>Error de verificación</h1>
            <p className={styles.successText}>
              {result.error ?? 'No se pudo verificar el email.'}
            </p>
            <Link href="/" className={styles.footerLink}>← Volver al login</Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
