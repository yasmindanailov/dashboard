'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import AuthLayout from '../../AuthLayout';
import { LOGIN_PANEL } from '../../auth-panels';
import styles from '../../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   WelcomeScreen — pantalla de bienvenida post-login (F4·W3, 1:1 mockup Login).

   Autenticada (cookies httpOnly ya fijadas por la Server Action). Saluda por
   nombre + spinner y **auto-navega** al panel del rol tras un instante; enlace
   de respaldo por si el JS tarda. Robusto: la sesión ya existe server-side.
   ═══════════════════════════════════════════════════════════ */

interface Props {
  firstName: string;
  redirectTo: string;
}

export default function WelcomeScreen({ firstName, redirectTo }: Props) {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace(redirectTo), 1100);
    return () => clearTimeout(t);
  }, [router, redirectTo]);

  return (
    <AuthLayout headline={LOGIN_PANEL.headline} valueProps={LOGIN_PANEL.valueProps}>
      <div className={styles.authResult}>
        <div className={styles.authSpinner} aria-hidden="true" />
        <h1 className={styles.authResultTitle}>¡Hola de nuevo, {firstName}!</h1>
        <p className={styles.authResultText}>Entrando a tu panel…</p>
        <Link href={redirectTo} className={styles.authResultLink}>Ir a tu panel →</Link>
      </div>
    </AuthLayout>
  );
}
