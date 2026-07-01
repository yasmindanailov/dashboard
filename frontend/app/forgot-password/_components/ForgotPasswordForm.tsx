'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Mail } from 'lucide-react';
import {
  forgotPasswordAction,
  type SimpleAuthActionState,
} from '../../lib/auth-actions';
import AuthLayout from '../../AuthLayout';
import { RECOVER_PANEL } from '../../auth-panels';
import { SubmitSpinner } from '../../auth-components';
import styles from '../../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Forgot Password Form — F4·W3 (reskin 1:1 con RecuperarContrasena.dc.html).

   El backend siempre responde 200 (anti email-enumeration); cualquier
   resultado no-error = "Revisa tu email" visual. Modelo A (Server Action).
   ═══════════════════════════════════════════════════════════ */

export default function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<
    SimpleAuthActionState | null,
    FormData
  >(forgotPasswordAction, null);

  const [email, setEmail] = useState('');
  const showSuccess = !!state?.success;

  return (
    <AuthLayout headline={RECOVER_PANEL.headline} valueProps={RECOVER_PANEL.valueProps}>
      {!showSuccess ? (
        <div>
          <div className={styles.heading}>
            <h1 className={styles.headingTitle}>Recuperar contraseña</h1>
            <p className={styles.headingSubtitle}>
              Introduce tu email y te enviaremos un enlace para restablecer tu
              contraseña.
            </p>
          </div>

          {state?.error && (
            <div className={`${styles.authBanner} ${styles.authBannerDanger}`}>
              <AlertCircle size={17} strokeWidth={2.2} className={styles.authBannerIcon} />
              <span>{state.error}</span>
            </div>
          )}

          <form action={formAction} className={styles.formStack}>
            <div className={styles.fieldGroup}>
              <label htmlFor="forgot-email" className={styles.fieldLabel}>Email</label>
              <input
                id="forgot-email"
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

            <button type="submit" disabled={pending} className={styles.submitButton}>
              {pending ? <SubmitSpinner label="Enviando…" /> : 'Enviar enlace de recuperación'}
            </button>
          </form>

          <p className={styles.footerText}>
            <Link href="/" className={styles.footerLink}>← Volver al login</Link>
          </p>
        </div>
      ) : (
        <div className={styles.authResult}>
          <div className={`${styles.authResultIcon} ${styles.authResultBrand}`}>
            <Mail size={30} strokeWidth={1.8} />
          </div>
          <h1 className={styles.authResultTitle}>Revisa tu email</h1>
          <p className={styles.authResultText}>
            Si existe una cuenta con <strong>{email}</strong>, recibirás un enlace
            para restablecer tu contraseña.
          </p>
          <p className={styles.authResultHint}>
            El enlace caduca en 1 hora. Revisa también tu carpeta de spam.
          </p>
          <div className={styles.resendRow}>
            ¿No te llega?{' '}
            <form action={formAction} style={{ display: 'inline' }}>
              <input type="hidden" name="email" value={email} />
              <button type="submit" disabled={pending} className={styles.resendBtn}>
                {pending ? 'Reenviando…' : 'Reenviar enlace'}
              </button>
            </form>
          </div>
          <Link href="/" className={styles.authResultLinkMuted}>← Volver al login</Link>
        </div>
      )}
    </AuthLayout>
  );
}
