import { Check } from 'lucide-react';
import styles from '../auth.module.css';

/* Checklist de contraseña compartido (registro + reset) — 1:1 con el mockup:
   grid 2×2, "Mayúsculas y minúsculas" combinado. La política coincide con el
   backend (RegisterDto/ResetPasswordDto: MinLength 8 + Matches upper/lower/number). */

export interface PasswordChecks {
  length: boolean;
  mix: boolean;
  number: boolean;
  match: boolean;
}

export function computePasswordChecks(
  password: string,
  confirm: string,
): PasswordChecks & { all: boolean } {
  const length = password.length >= 8;
  const mix = /[A-Z]/.test(password) && /[a-z]/.test(password);
  const number = /[0-9]/.test(password);
  const match = password.length > 0 && password === confirm;
  return { length, mix, number, match, all: length && mix && number && match };
}

export function PasswordChecklist({ checks }: { checks: PasswordChecks }) {
  const items: { ok: boolean; label: string }[] = [
    { ok: checks.length, label: 'Al menos 8 caracteres' },
    { ok: checks.mix, label: 'Mayúsculas y minúsculas' },
    { ok: checks.number, label: 'Al menos un número' },
    { ok: checks.match, label: 'Las contraseñas coinciden' },
  ];
  return (
    <div className={styles.pwChecklist}>
      {items.map((it, i) => (
        <div
          key={i}
          className={`${styles.pwCheckItem} ${it.ok ? styles.pwCheckPass : styles.pwCheckFail}`}
        >
          <Check size={14} strokeWidth={2.6} />
          {it.label}
        </div>
      ))}
    </div>
  );
}
