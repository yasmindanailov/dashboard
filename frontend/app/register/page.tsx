'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { authApi } from '../lib/api';
import { getErrorMessage } from '../lib/error';
import AuthLayout from '../AuthLayout';
import { EyeIcon, PasswordCheck } from '../auth-components';
import styles from '../auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Register Page — Aelium Dashboard
   
   Layout: AuthLayout (split-screen §5.13)
   Steps: form → success (verify email)
   DS compliance: zero hex, zero Tailwind, CSS module
   
   Ref: UI_SPEC §5.13, §4.6 (validation)
   ═══════════════════════════════════════════════════════════ */

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
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
  const passwordValid = passwordChecks.length && passwordChecks.upper && passwordChecks.lower && passwordChecks.number && passwordChecks.match;

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordValid) return;
    setError('');
    setIsLoading(true);

    try {
      await authApi.register({ first_name: firstName, last_name: lastName, email, password });
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err) || 'Error al registrarse');
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
          {/* Heading (P5 tono) */}
          <div className={styles.heading}>
            <h1 className={styles.headingTitle}>Crear cuenta</h1>
            <p className={styles.headingSubtitle}>Regístrate para acceder a tu panel de gestión</p>
          </div>

          {/* Error alert */}
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

          <form onSubmit={handleRegister} className={styles.formStack}>
            {/* Name row */}
            <div className={styles.nameRow}>
              <div className={styles.fieldGroup}>
                <label htmlFor="reg-first" className={styles.fieldLabel}>Nombre</label>
                <input
                  id="reg-first" type="text" autoComplete="given-name" required
                  value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Juan" className={styles.authInput}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="reg-last" className={styles.fieldLabel}>Apellido</label>
                <input
                  id="reg-last" type="text" autoComplete="family-name" required
                  value={lastName} onChange={(e) => setLastName(e.target.value)}
                  placeholder="García" className={styles.authInput}
                />
              </div>
            </div>

            {/* Email */}
            <div className={styles.fieldGroup}>
              <label htmlFor="reg-email" className={styles.fieldLabel}>Email</label>
              <input
                id="reg-email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com" className={styles.authInput}
              />
            </div>

            {/* Password */}
            <div className={styles.fieldGroup}>
              <label htmlFor="reg-password" className={styles.fieldLabel}>Contraseña</label>
              <div className={styles.passwordWrapper}>
                <input
                  id="reg-password"
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

              {/* Password strength (§4.6) */}
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
              <label htmlFor="reg-confirm" className={styles.fieldLabel}>Confirmar contraseña</label>
              <input
                id="reg-confirm"
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

            {/* Submit */}
            <button type="submit" disabled={isLoading || !passwordValid} className={styles.submitButton}>
              {isLoading ? (
                <span className={styles.submitSpinner}>
                  <svg className={styles.spinnerIcon} viewBox="0 0 24 24">
                    <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creando cuenta...
                </span>
              ) : 'Crear cuenta'}
            </button>
          </form>

          <p className={styles.footerText}>
            ¿Ya tienes cuenta?{' '}
            <Link href="/" className={styles.footerLink}>Iniciar sesión</Link>
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
          <h1 className={styles.successTitle}>Verifica tu email</h1>
          <p className={styles.successText}>
            Hemos enviado un enlace de verificación a <strong>{email}</strong>. Revisa tu bandeja de entrada.
          </p>
          <Link href="/" className={styles.footerLink}>← Volver al login</Link>
        </motion.div>
      )}
    </AuthLayout>
  );
}
