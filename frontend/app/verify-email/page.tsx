'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { authApi } from '../lib/api';
import AuthLayout from '../AuthLayout';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Verify Email Page — Aelium Dashboard
   Layout: AuthLayout (split-screen §5.13)
   Auto-verifies on mount via token param
   Ref: UI_SPEC §5.13
   ═══════════════════════════════════════════════════════════ */

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('');
  const calledRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Token de verificación no proporcionado');
      return;
    }

    // Prevent double-fire in React Strict Mode
    if (calledRef.current) return;
    calledRef.current = true;

    authApi.verifyEmail(token)
      .then((res) => {
        setStatus('success');
        setMessage(res.message || 'Email verificado correctamente');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Error al verificar el email');
      });
  }, [token]);

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className={styles.successContainer}
      >
        {status === 'verifying' && (
          <>
            <svg className={styles.spinnerIcon} viewBox="0 0 24 24" style={{ width: 48, height: 48, margin: '0 auto var(--space-6)', color: 'var(--brand)' }}>
              <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <h1 className={styles.successTitle}>Verificando tu email...</h1>
            <p className={styles.successText}>Espera un momento</p>
          </>
        )}

        {status === 'success' && (
          <>
            <svg className={styles.successIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--success)' }}>
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <h1 className={styles.successTitle}>¡Email verificado!</h1>
            <p className={styles.successText}>{message}</p>
            <Link href="/" className={styles.submitButton} style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
              Iniciar sesión
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <svg className={styles.successIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--danger)' }}>
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <h1 className={styles.successTitle}>Error de verificación</h1>
            <p className={styles.successText}>{message}</p>
            <Link href="/" className={styles.footerLink}>← Volver al login</Link>
          </>
        )}
      </motion.div>
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className={styles.successContainer}>
          <svg className={styles.spinnerIcon} viewBox="0 0 24 24" style={{ width: 48, height: 48, margin: '0 auto', color: 'var(--brand)' }}>
            <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AuthLayout>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
