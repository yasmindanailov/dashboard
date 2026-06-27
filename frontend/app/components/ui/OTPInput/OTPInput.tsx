'use client';

import { useRef, type KeyboardEvent } from 'react';

import styles from './OTPInput.module.css';

export interface OTPInputProps {
  /** Número de casillas (mockup 2FA: 6). */
  length?: number;
  /** Valor controlado (string de dígitos). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
}

/**
 * OTPInput — primitiva del DS (F1a). Spec del mockup (Login 2FA): N casillas
 * cuadradas con auto-avance y backspace inverso. Controlado.
 */
export function OTPInput({
  length = 6,
  value,
  onChange,
  disabled = false,
  className = '',
  ...aria
}: OTPInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = value.split('').slice(0, length);

  const setCharAt = (i: number, ch: string) => {
    const arr = value.split('');
    while (arr.length < length) arr.push('');
    arr[i] = ch;
    onChange(arr.join('').slice(0, length));
  };

  const handleInput = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    setCharAt(i, digit);
    if (digit && i < length - 1) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !chars[i] && i > 0) refs.current[i - 1]?.focus();
  };

  return (
    <div className={`${styles.wrap} ${className}`} role="group" aria-label={aria['aria-label']}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          value={chars[i] ?? ''}
          onChange={(e) => handleInput(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className={styles.box}
          aria-label={`Dígito ${i + 1}`}
        />
      ))}
    </div>
  );
}
