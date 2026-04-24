'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { authApi } from '../lib/api';
import AuthLayout from '../AuthLayout';
import { EyeIcon, PasswordCheck } from '../auth-components';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Reset Password Page — Aelium Dashboard
   Layout: AuthLayout (split-screen §5.13)
   Ref: UI_SPEC §5.13, §4.6 (validation)
   ═══════════════════════════════════════════════════════════ */

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    match: password.length > 0 && password === confirmPassword,
  };
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid || !token) return;
    setError('');
    setIsLoading(true);

    try {
      await authApi.resetPassword(token, password);
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Error al restablecer la contraseña');
    } finally {
      setIsLoading(false);
    }
  };

  // Invalid/missing token state
  if (!token) {
    return (
      <AuthLayout>
        <div className={styles.successContainer}>
          <svg className={styles.successIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--danger)' }}>
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h1 className={styles.successTitle}>Enlace inválido</h1>
          <p className={styles.successText}>Este enlace de recuperación no es válido o ha expirado.</p>
          <Link href="/forgot-password" className={styles.footerLink}>Solicitar nuevo enlace</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {!success ? (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className={styles.heading}>
            <h1 className={styles.headingTitle}>Nueva contraseña</h1>
            <p className={styles.headingSubtitle}>Elige una nueva contraseña segura</p>
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
            {/* New password */}
            <div className={styles.fieldGroup}>
              <label htmlFor="new-password" className={styles.fieldLabel}>Nueva contraseña</label>
              <div className={styles.passwordWrapper}>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password" required
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={styles.authInput}
                  style={{ paddingRight: 'var(--space-12)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={styles.passwordToggle}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>

              {password.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={styles.passwordChecks}
                >
                  <PasswordCheck passed={passwordChecks.length} text="Mínimo 8 caracteres" />
                  <PasswordCheck passed={passwordChecks.upper} text="Una mayúscula" />
                  <PasswordCheck passed={passwordChecks.lower} text="Una minúscula" />
                  <PasswordCheck passed={passwordChecks.number} text="Un número" />
                </motion.div>
              )}
            </div>

            {/* Confirm password */}
            <div className={styles.fieldGroup}>
              <label htmlFor="confirm-password" className={styles.fieldLabel}>Confirmar contraseña</label>
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password" required
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••" className={styles.authInput}
              />
              {confirmPassword.length > 0 && (
                <div className={styles.passwordChecks}>
                  <PasswordCheck passed={passwordChecks.match} text={passwordChecks.match ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'} />
                </div>
              )}
            </div>

            <button type="submit" disabled={isLoading || !passwordValid} className={styles.submitButton}>
              {isLoading ? (
                <span className={styles.submitSpinner}>
                  <svg className={styles.spinnerIcon} viewBox="0 0 24 24">
                    <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Restableciendo...
                </span>
              ) : 'Restablecer contraseña'}
            </button>
          </form>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className={styles.successContainer}
        >
          <svg className={styles.successIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--success)' }}>
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <h1 className={styles.successTitle}>Contraseña actualizada</h1>
          <p className={styles.successText}>
            Tu contraseña se ha restablecido correctamente. Ya puedes iniciar sesión.
          </p>
          <Link href="/" className={styles.submitButton} style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
            Iniciar sesión
          </Link>
        </motion.div>
      )}
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className={styles.successContainer}>
          <svg className={styles.spinnerIcon} viewBox="0 0 24 24" style={{ margin: '0 auto', color: 'var(--brand)' }}>
            <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </AuthLayout>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
