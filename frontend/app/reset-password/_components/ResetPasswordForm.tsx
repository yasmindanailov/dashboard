'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check } from 'lucide-react';
import {
  resetPasswordAction,
  type SimpleAuthActionState,
} from '../../lib/auth-actions';
import AuthLayout from '../../AuthLayout';
import { RECOVER_PANEL } from '../../auth-panels';
import { EyeIcon, SubmitSpinner } from '../../auth-components';
import {
  PasswordChecklist,
  computePasswordChecks,
} from '../../_components/PasswordChecklist';
import styles from '../../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Reset Password Form — F4·W3 (reskin 1:1 con RecuperarContrasena.dc.html).
   El token llega del SC padre (page.tsx). Modelo A (Server Action).
   ═══════════════════════════════════════════════════════════ */

interface Props {
  token: string;
}

export default function ResetPasswordForm({ token }: Props) {
  const [state, formAction, pending] = useActionState<
    SimpleAuthActionState | null,
    FormData
  >(resetPasswordAction, null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const checks = computePasswordChecks(password, confirmPassword);
  const showSuccess = !!state?.success;

  if (showSuccess) {
    return (
      <AuthLayout headline={RECOVER_PANEL.headline} valueProps={RECOVER_PANEL.valueProps}>
        <div className={styles.authResult}>
          <div className={`${styles.authResultIcon} ${styles.authResultSuccess}`}>
            <Check size={30} strokeWidth={2.2} />
          </div>
          <h1 className={styles.authResultTitle}>Contraseña actualizada</h1>
          <p className={styles.authResultText}>
            Tu contraseña se ha restablecido correctamente. Ya puedes iniciar
            sesión.
          </p>
          <Link href="/" className={styles.authResultCta}>Iniciar sesión</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout headline={RECOVER_PANEL.headline} valueProps={RECOVER_PANEL.valueProps}>
      <div>
        <div className={styles.heading}>
          <h1 className={styles.headingTitle}>Nueva contraseña</h1>
          <p className={styles.headingSubtitle}>Elige una nueva contraseña segura.</p>
        </div>

        {state?.error && (
          <div className={`${styles.authBanner} ${styles.authBannerDanger}`}>
            <AlertCircle size={17} strokeWidth={2.2} className={styles.authBannerIcon} />
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction} className={styles.formStack}>
          <input type="hidden" name="token" value={token} />

          <div className={styles.fieldGroup}>
            <label htmlFor="new-password" className={styles.fieldLabel}>Nueva contraseña</label>
            <div className={styles.passwordWrapper}>
              <input
                id="new-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
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

          <div className={styles.fieldGroup}>
            <label htmlFor="confirm-password" className={styles.fieldLabel}>Confirmar contraseña</label>
            <input
              id="confirm-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.authInput}
            />
          </div>

          <PasswordChecklist checks={checks} />

          <button
            type="submit"
            disabled={pending || !checks.all}
            className={styles.submitButton}
          >
            {pending ? <SubmitSpinner label="Restableciendo…" /> : 'Restablecer contraseña'}
          </button>
        </form>
      </div>
    </AuthLayout>
  );
}
