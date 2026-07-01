'use client';

import {
  useState,
  useRef,
  useActionState,
  Suspense,
  type KeyboardEvent,
  type ClipboardEvent,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Info, Lock } from 'lucide-react';
import {
  loginAction,
  verify2faAction,
  resendVerificationAction,
  resend2faAction,
  type LoginActionState,
  type Verify2faActionState,
  type Resend2faActionState,
  type SimpleAuthActionState,
} from '../lib/auth-actions';
import AuthLayout from '../AuthLayout';
import { LOGIN_PANEL } from '../auth-panels';
import { EyeIcon, SubmitSpinner } from '../auth-components';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Login Form — F4·W3 (reskin 1:1 con Login.dc.html).

   Doctrina: ADR-078 Amendment A1 (Modelo A, cookies httpOnly). Flow:
     1. credenciales → loginAction (Server Action, fija cookies server-side)
        - éxito sin 2FA → state.success → pantalla bienvenida + navega en cliente
        - éxito con 2FA → state.requires2fa.temp_token → paso '2fa'
        - error → state.error
     2. 2fa → verify2faAction → state.success → bienvenida + navega
        - reenviar código → resend2faAction (nuevo temp_token)
   Cero localStorage, cero token cliente (R17).
   ═══════════════════════════════════════════════════════════ */

const VERIFICATION_HINTS = ['verificar tu email', 'pending_verification'] as const;

function isVerificationError(message: string | undefined): boolean {
  if (!message) return false;
  return VERIFICATION_HINTS.some((hint) => message.includes(hint));
}
function isBlockedError(message: string | undefined): boolean {
  return !!message && /bloquead/i.test(message);
}

export default function LoginForm() {
  return (
    <Suspense
      fallback={
        <AuthLayout headline={LOGIN_PANEL.headline} valueProps={LOGIN_PANEL.valueProps}>
          <div />
        </AuthLayout>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === 'true';

  const [credState, credAction, credPending] = useActionState<LoginActionState | null, FormData>(
    loginAction,
    null,
  );
  const [twofaState, twofaAction, twofaPending] = useActionState<Verify2faActionState | null, FormData>(
    verify2faAction,
    null,
  );
  const [resendState, resendAction, resendPending] = useActionState<SimpleAuthActionState | null, FormData>(
    resendVerificationAction,
    null,
  );
  const [resend2faState, resend2faDispatch, resend2faPending] = useActionState<
    Resend2faActionState | null,
    FormData
  >(resend2faAction, null);

  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  // temp_token: el del login, o el fresco que devuelve un reenvío. Al completar
  // (login sin 2FA o verify-2fa OK) la Server Action redirige a `/welcome`
  // server-side (fija cookies + saludo por nombre), así que aquí solo hay 2 pasos.
  const credToken = credState?.requires2fa?.temp_token;
  const activeToken = resend2faState?.tempToken ?? credToken;
  const [backClicked, setBackClicked] = useState(false);

  const showTwoFa = !!activeToken && !backClicked;
  const step: 'credentials' | '2fa' = showTwoFa ? '2fa' : 'credentials';

  const handleCredSubmit = (formData: FormData) => {
    setBackClicked(false);
    credAction(formData);
  };

  const setDigit = (i: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < 5) codeRefs.current[i + 1]?.focus();
  };
  const handleCodeKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) codeRefs.current[i - 1]?.focus();
  };
  const handleCodePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    setCode(next);
    codeRefs.current[Math.min(digits.length, 5)]?.focus();
  };

  const credError = credState?.error;
  const twofaError = twofaState?.error;
  const showResend = isVerificationError(credError);
  const codeValue = code.join('');

  return (
    <AuthLayout headline={LOGIN_PANEL.headline} valueProps={LOGIN_PANEL.valueProps}>
      {/* ═══ CREDENCIALES ═══ */}
      {step === 'credentials' && (
        <div>
          <div className={styles.heading}>
            <h1 className={styles.headingTitle}>Bienvenido de vuelta</h1>
            <p className={styles.headingSubtitle}>Entra a tu panel y sigue con lo tuyo.</p>
          </div>

          {sessionExpired && !credError && (
            <div className={`${styles.authBanner} ${styles.authBannerInfo}`}>
              <Info size={17} strokeWidth={2} className={styles.authBannerIcon} />
              <span>Tu sesión ha expirado. Inicia sesión de nuevo.</span>
            </div>
          )}

          {credError && (
            <div className={`${styles.authBanner} ${styles.authBannerDanger}`}>
              {isBlockedError(credError) ? (
                <Lock size={17} strokeWidth={2} className={styles.authBannerIcon} />
              ) : (
                <AlertCircle size={17} strokeWidth={2.2} className={styles.authBannerIcon} />
              )}
              <span>
                {credError}
                {showResend && email && (
                  <form action={resendAction} style={{ display: 'inline' }}>
                    <input type="hidden" name="email" value={email} />
                    <button type="submit" disabled={resendPending} className={styles.alertAction}>
                      {resendPending ? 'Reenviando…' : 'Reenviar email de verificación'}
                    </button>
                  </form>
                )}
              </span>
            </div>
          )}

          {resendState?.success && (
            <div className={`${styles.authBanner} ${styles.authBannerInfo}`}>
              <Info size={17} strokeWidth={2} className={styles.authBannerIcon} />
              <span>Si el email existe, recibirás un nuevo enlace de verificación.</span>
            </div>
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
                placeholder="tu@correo.com"
                className={styles.authInput}
              />
            </div>

            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabelRow}>
                <label htmlFor="login-password" className={styles.fieldLabel}>Contraseña</label>
                <Link href="/forgot-password" className={styles.inlineLink}>¿La olvidaste?</Link>
              </div>
              <div className={styles.passwordWrapper}>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="Tu contraseña"
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
              {credPending ? <SubmitSpinner label="Iniciando sesión…" /> : 'Entrar'}
            </button>
          </form>

          <p className={styles.footerText}>
            ¿Aún no tienes cuenta?{' '}
            <Link href="/register" className={styles.footerLink}>Crear cuenta</Link>
          </p>
        </div>
      )}

      {/* ═══ 2FA ═══ */}
      {step === '2fa' && activeToken && (
        <div>
          <button type="button" onClick={() => setBackClicked(true)} className={styles.authBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Volver
          </button>

          <span className={styles.authIconWell}>
            <Lock size={24} strokeWidth={1.7} />
          </span>
          <div className={styles.heading}>
            <h1 className={styles.headingTitle}>Verificación en dos pasos</h1>
            <p className={styles.headingSubtitle}>
              Te hemos enviado un código de 6 dígitos a tu correo. Introdúcelo para continuar.
            </p>
          </div>

          {twofaError && (
            <div className={`${styles.authBanner} ${styles.authBannerDanger}`}>
              <AlertCircle size={17} strokeWidth={2.2} className={styles.authBannerIcon} />
              <span>{twofaError}</span>
            </div>
          )}
          {resend2faState?.tempToken && (
            <div className={`${styles.authBanner} ${styles.authBannerInfo}`}>
              <Info size={17} strokeWidth={2} className={styles.authBannerIcon} />
              <span>Te hemos enviado un código nuevo.</span>
            </div>
          )}

          <form action={twofaAction} className={styles.formStack}>
            <input type="hidden" name="temp_token" value={activeToken} />
            <input type="hidden" name="code" value={codeValue} />
            <div className={styles.codeBoxes}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    codeRefs.current[i] = el;
                  }}
                  inputMode="numeric"
                  maxLength={1}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  aria-label={`Dígito ${i + 1}`}
                  value={digit}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  onPaste={i === 0 ? handleCodePaste : undefined}
                  className={styles.codeBox}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={twofaPending || codeValue.length < 6}
              className={styles.submitButton}
            >
              {twofaPending ? <SubmitSpinner label="Verificando…" /> : 'Verificar y entrar'}
            </button>
          </form>

          <div className={styles.resendRow}>
            ¿No te llega?{' '}
            <form action={resend2faDispatch} style={{ display: 'inline' }}>
              <input type="hidden" name="temp_token" value={activeToken} />
              <button type="submit" disabled={resend2faPending} className={styles.resendBtn}>
                {resend2faPending ? 'Reenviando…' : 'Reenviar código'}
              </button>
            </form>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
