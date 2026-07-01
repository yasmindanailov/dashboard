'use client';

import styles from './auth.module.css';

/* ═══════════════════════════════════════════════════════════
   Auth Shared Components — Aelium Dashboard
   
   Reusable sub-components for auth pages:
   - EyeIcon: password visibility toggle icon
   - PasswordCheck: inline validation indicator
   
   Extracted to comply with DS Regla 15 (DRY).
   Used by: login, register, reset-password.
   ═══════════════════════════════════════════════════════════ */

/** Toggle icon for password visibility */
export function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** Spinner + etiqueta para el botón de submit en pending (compartido). */
export function SubmitSpinner({ label }: { label: string }) {
  return (
    <span className={styles.submitSpinner}>
      <svg className={styles.spinnerIcon} viewBox="0 0 24 24">
        <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {label}
    </span>
  );
}

/** Inline password requirement check indicator */
export function PasswordCheck({ passed, text }: { passed: boolean; text: string }) {
  return (
    <div className={`${styles.passwordCheck} ${passed ? styles.passwordCheckPass : styles.passwordCheckFail}`}>
      {passed ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
      )}
      {text}
    </div>
  );
}
