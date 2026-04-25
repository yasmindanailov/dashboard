'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { authApi } from '../lib/api';
import AuthLayout from '../AuthLayout';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Forgot Password Page — Aelium Dashboard
   Layout: AuthLayout (split-screen §5.13)
   Ref: UI_SPEC §5.13, P5 tono
   ═══════════════════════════════════════════════════════════ */

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await authApi.forgotPassword(email);
      setSuccess(true);
    } catch (err) {
      console.warn('[ForgotPassword] request failed:', err);
      // Always show success to prevent email enumeration
      setSuccess(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      {!success ? (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className={styles.heading}>
            <h1 className={styles.headingTitle}>Recuperar contraseña</h1>
            <p className={styles.headingSubtitle}>
              Introduce tu email y te enviaremos un enlace para restablecer tu contraseña
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${styles.alert} ${styles.alertDanger}`}
              style={{ marginBottom: 'var(--space-4)' }}
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className={styles.formStack}>
            <div className={styles.fieldGroup}>
              <label htmlFor="forgot-email" className={styles.fieldLabel}>Email</label>
              <input
                id="forgot-email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com" className={styles.authInput}
              />
            </div>

            <button type="submit" disabled={isLoading} className={styles.submitButton}>
              {isLoading ? (
                <span className={styles.submitSpinner}>
                  <svg className={styles.spinnerIcon} viewBox="0 0 24 24">
                    <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Enviando...
                </span>
              ) : 'Enviar enlace de recuperación'}
            </button>
          </form>

          <p className={styles.footerText}>
            <Link href="/" className={styles.footerLink}>← Volver al login</Link>
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className={styles.successContainer}
        >
          <svg className={styles.successIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <h1 className={styles.successTitle}>Revisa tu email</h1>
          <p className={styles.successText}>
            Si existe una cuenta con <strong>{email}</strong>, recibirás un enlace para restablecer tu contraseña.
          </p>
          <Link href="/" className={styles.footerLink}>← Volver al login</Link>
        </motion.div>
      )}
    </AuthLayout>
  );
}
