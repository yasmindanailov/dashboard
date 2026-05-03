'use client';

import { useState, useActionState, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  loginAction,
  verify2faAction,
  resendVerificationAction,
  type LoginActionState,
  type Verify2faActionState,
  type SimpleAuthActionState,
} from '../lib/auth-actions';
import AuthLayout from '../AuthLayout';
import { EyeIcon } from '../auth-components';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Login Form — Sprint 13 §13.AUTH Fase E (Modelo A)

   Doctrina: ADR-078 Amendment A1 (cookies httpOnly Next.js).
   Flow:
     1. credentials → loginAction (Server Action)
        - éxito sin 2FA → action invoca redirect() server-side
        - éxito con 2FA → state.requires2fa.temp_token → step '2fa'
        - error → state.error
     2. 2fa → verify2faAction (Server Action)
        - éxito → action invoca redirect() server-side
        - error → state.error
   Cero localStorage, cero token cliente, cero useEffect+fetch.

   Ref: UI_SPEC §5.13, §4.4, §4.5, §4.6 (visual preservado).
   ═══════════════════════════════════════════════════════════ */

const VERIFICATION_HINTS = ['verificar tu email', 'pending_verification'] as const;

function isVerificationError(message: string | undefined): boolean {
  if (!message) return false;
  return VERIFICATION_HINTS.some((hint) => message.includes(hint));
}

export default function LoginForm() {
  return (
    <Suspense fallback={<AuthLayout><div /></AuthLayout>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === 'true';

  // Hook 1: credenciales → loginAction.
  const [credState, credAction, credPending] = useActionState<
    LoginActionState | null,
    FormData
  >(loginAction, null);

  // Hook 2: 2FA → verify2faAction.
  const [twofaState, twofaAction, twofaPending] = useActionState<
    Verify2faActionState | null,
    FormData
  >(verify2faAction, null);

  // Hook 3: resend verification (sin redirect, solo confirmación).
  const [resendState, resendAction, resendPending] = useActionState<
    SimpleAuthActionState | null,
    FormData
  >(resendVerificationAction, null);

  // Email local — necesario para resendVerification (formData reuse) + UX.
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  /*
   * Step se deriva del state: si loginAction devolvió temp_token, paso 2.
   * `backClicked` permite al usuario volver del paso 2FA al paso credenciales
   * sin resetear todo el componente (re-submit cred limpia el flag).
   */
  const tempToken = credState?.requires2fa?.temp_token;
  const [backClicked, setBackClicked] = useState(false);
  const showTwoFa = !!tempToken && !backClicked;
  const step: 'credentials' | '2fa' = showTwoFa ? '2fa' : 'credentials';

  const handleCredSubmit = (formData: FormData) => {
    setBackClicked(false);
    credAction(formData);
  };

  const credError = credState?.error;
  const twofaError = twofaState?.error;
  const showResend = isVerificationError(credError);

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
            <div className={styles.heading}>
              <h1 className={styles.headingTitle}>Bienvenido de vuelta</h1>
              <p className={styles.headingSubtitle}>Inicia sesión en tu panel de gestión</p>
            </div>

            {sessionExpired && !credError && (
              <div
                className={`${styles.alert} ${styles.alertInfo}`}
                style={{ marginBottom: 'var(--space-4)' }}
              >
                Tu sesión ha expirado. Inicia sesión de nuevo.
              </div>
            )}

            {credError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${styles.alert} ${styles.alertDanger}`}
                style={{ marginBottom: 'var(--space-4)' }}
              >
                {credError}
                {showResend && email && (
                  <form action={resendAction} style={{ display: 'inline' }}>
                    <input type="hidden" name="email" value={email} />
                    <button
                      type="submit"
                      disabled={resendPending}
                      className={styles.alertAction}
                    >
                      {resendPending ? 'Reenviando…' : 'Reenviar email de verificación'}
                    </button>
                  </form>
                )}
              </motion.div>
            )}

            {resendState?.success && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${styles.alert} ${styles.alertSuccess}`}
                style={{ marginBottom: 'var(--space-4)' }}
              >
                Si el email existe, recibirás un nuevo enlace de verificación.
              </motion.div>
            )}

            <form action={handleCredSubmit} className={styles.formStack}>
              <div className={styles.fieldGroup}>
                <label htmlFor="login-email" className={styles.fieldLabel}>Email</label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className={styles.authInput}
                />
              </div>

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
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
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

              <button type="submit" disabled={credPending} className={styles.submitButton}>
                {credPending ? (
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

        {step === '2fa' && tempToken && (
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

            {twofaError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`${styles.alert} ${styles.alertDanger}`}
                style={{ marginBottom: 'var(--space-4)' }}
              >
                {twofaError}
              </motion.div>
            )}

            <form action={twofaAction} className={styles.formStack}>
              <input type="hidden" name="temp_token" value={tempToken} />
              <div className={styles.fieldGroup}>
                <label htmlFor="login-2fa" className={styles.fieldLabel}>Código de verificación</label>
                <input
                  id="login-2fa"
                  name="code"
                  type="text"
                  autoComplete="one-time-code"
                  required
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  inputMode="numeric"
                  className={styles.authInput}
                />
              </div>

              <button type="submit" disabled={twofaPending} className={styles.submitButton}>
                {twofaPending ? (
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
                onClick={() => setBackClicked(true)}
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
