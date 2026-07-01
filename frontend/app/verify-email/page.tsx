import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';

import { verifyEmailAction } from '../lib/auth-actions';
import AuthLayout from '../AuthLayout';
import { RECOVER_PANEL } from '../auth-panels';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Verify Email Page — F4·W3 (reskin 1:1 con RecuperarContrasena.dc.html).

   Server Component puro: lee `?token=…`, invoca `verifyEmailAction(token)`
   server-side y renderiza el resultado (icon-well + h1 + CTA). No requiere
   session (el token es independiente de la sesión).
   ═══════════════════════════════════════════════════════════ */

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function VerifyError({ title, text }: { title: string; text: string }) {
  return (
    <AuthLayout headline={RECOVER_PANEL.headline} valueProps={RECOVER_PANEL.valueProps}>
      <div className={styles.authResult}>
        <div className={`${styles.authResultIcon} ${styles.authResultDanger}`}>
          <XCircle size={30} strokeWidth={2} />
        </div>
        <h1 className={styles.authResultTitle}>{title}</h1>
        <p className={styles.authResultText}>{text}</p>
        <Link href="/" className={styles.authResultLink}>← Volver al login</Link>
      </div>
    </AuthLayout>
  );
}

export default async function VerifyEmailPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tokenParam = params.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  if (!token) {
    return (
      <VerifyError
        title="Enlace inválido"
        text="El enlace de verificación está incompleto. Solicita uno nuevo desde el login."
      />
    );
  }

  const result = await verifyEmailAction(token);
  if (!result.success) {
    return (
      <VerifyError
        title="Error de verificación"
        text={
          result.error ??
          'No se pudo verificar el email. El enlace puede haber caducado o ya haber sido usado.'
        }
      />
    );
  }

  return (
    <AuthLayout headline={RECOVER_PANEL.headline} valueProps={RECOVER_PANEL.valueProps}>
      <div className={styles.authResult}>
        <div className={`${styles.authResultIcon} ${styles.authResultSuccess}`}>
          <CheckCircle2 size={30} strokeWidth={2.2} />
        </div>
        <h1 className={styles.authResultTitle}>¡Email verificado!</h1>
        <p className={styles.authResultText}>
          Tu email ha sido confirmado. Ya puedes iniciar sesión en tu panel.
        </p>
        <Link href="/" className={styles.authResultCta}>Iniciar sesión</Link>
      </div>
    </AuthLayout>
  );
}
