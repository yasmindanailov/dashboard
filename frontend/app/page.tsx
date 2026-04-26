'use client';

import { useState, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from './lib/api';
import { getErrorMessage } from './lib/error';
import { useAuth } from './lib/auth-context';
import AuthLayout from './AuthLayout';
import { EyeIcon } from './auth-components';
import styles from './auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Login Page — Aelium Dashboard
   
   Layout: AuthLayout (split-screen §5.13)
   Steps: credentials → 2FA → success redirect
   DS compliance: zero hex, zero Tailwind, CSS module
   
   Ref: UI_SPEC §5.13, §4.4, §4.5, §4.6
   ═══════════════════════════════════════════════════════════ */

type LoginStep = 'credentials' | '2fa' | 'success';

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthLayout><div /></AuthLayout>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === 'true';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');

  // 2FA state
  const [step, setStep] = useState<LoginStep>('credentials');
  const [tempToken, setTempToken] = useState('');
  const [code2fa, setCode2fa] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setShowResendVerification(false);
    setResendSuccess('');
    setIsLoading(true);

    try {
      const res = await authApi.login(email, password);

      if (res.requires_2fa && res.temp_token) {
        setTempToken(res.temp_token);
        setStep('2fa');
      } else if (res.access_token) {
        login(res);
        setStep('success');
        router.push('/dashboard');
      }
    } catch (err) {
      const msg = getErrorMessage(err) || 'Error al iniciar sesión';
      if (
        msg.includes('verificar tu email') ||
        msg.includes('pending_verification')
      ) {
        setShowResendVerification(true);
      }
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await authApi.resendVerification(email);
      setResendSuccess('Email de verificación reenviado. Revisa tu bandeja de entrada.');
      setShowResendVerification(false);
    } catch (err) {
      console.warn('[Login] resendVerification failed:', err);
      setResendSuccess('Si el email existe, recibirás un nuevo enlace.');
    }
  };

  const handle2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await authApi.verify2fa(code2fa, tempToken);

      if (res.access_token) {
        login(res);
        setStep('success');
        router.push('/dashboard');
      }
    } catch (err) {
      setError(getErrorMessage(err) || 'Código incorrecto');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <AnimatePresence mode="wait">
        {step === 'credentials' && (
          <motion.div
            key="credentials"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {/* Heading (P5 tono) */}
            <div className={styles.heading}>
              <h1 className={styles.headingTitle}>Bienvenido de vuelta</h1>
              <p className={styles.headingSubtitle}>Inicia sesión en tu panel de gestión</p>
            </div>

            {/* Session expired alert (§4.3) */}
            {sessionExpired && !error && (
              <div className={`${styles.alert} ${styles.alertInfo}`}
                style={{ marginBottom: 'var(--space-4)' }}>
                Tu sesión ha expirado. Inicia sesión de nuevo.
              </div>
            )}

            {/* Error alert */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${styles.alert} ${styles.alertDanger}`}
                style={{ marginBottom: 'var(--space-4)' }}
              >
                {error}
                {showResendVerification && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    className={styles.alertAction}
                  >
                    Reenviar email de verificación
                  </button>
                )}
              </motion.div>
            )}

            {/* Success alert (resend verification) */}
            {resendSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${styles.alert} ${styles.alertSuccess}`}
                style={{ marginBottom: 'var(--space-4)' }}
              >
                {resendSuccess}
              </motion.div>
            )}

            <form onSubmit={handleLogin} className={styles.formStack}>
              {/* Email */}
              <div className={styles.fieldGroup}>
                <label htmlFor="login-email" className={styles.fieldLabel}>Email</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className={styles.authInput}
                />
              </div>

              {/* Password */}
              <div className={styles.fieldGroup}>
                <div className={styles.fieldLabelRow}>
                  <label htmlFor="login-password" className={styles.fieldLabel}>Contraseña</label>
                  <Link href="/forgot-password" className={styles.inlineLink}>
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <div className={styles.passwordWrapper}>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
              </div>

              {/* Submit */}
              <button type="submit" disabled={isLoading} className={styles.submitButton}>
                {isLoading ? (
                  <span className={styles.submitSpinner}>
                    <svg className={styles.spinnerIcon} viewBox="0 0 24 24">
                      <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Iniciando sesión...
                  </span>
                ) : 'Iniciar sesión'}
              </button>
            </form>

            <p className={styles.footerText}>
              ¿No tienes cuenta?{' '}
              <Link href="/register" className={styles.footerLink}>Crear cuenta</Link>
            </p>
          </motion.div>
        )}

        {step === '2fa' && (
          <motion.div
            key="2fa"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div className={styles.heading}>
              <h1 className={styles.headingTitle}>Verificación de seguridad</h1>
              <p className={styles.headingSubtitle}>
                Hemos enviado un código de 6 dígitos a tu email
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

            <form onSubmit={handle2fa} className={styles.formStack}>
              <div className={styles.fieldGroup}>
                <label htmlFor="login-2fa" className={styles.fieldLabel}>Código de verificación</label>
                <input
                  id="login-2fa"
                  type="text"
                  autoComplete="one-time-code"
                  required
                  value={code2fa}
                  onChange={(e) => setCode2fa(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  className={styles.authInput}
                />
              </div>

              <button type="submit" disabled={isLoading} className={styles.submitButton}>
                {isLoading ? (
                  <span className={styles.submitSpinner}>
                    <svg className={styles.spinnerIcon} viewBox="0 0 24 24">
                      <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verificando...
                  </span>
                ) : 'Verificar'}
              </button>

              <button
                type="button"
                onClick={() => { setStep('credentials'); setError(''); setCode2fa(''); }}
                className={styles.backButton}
              >
                ← Volver al login
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
