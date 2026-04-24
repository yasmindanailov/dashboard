import { forwardRef, type TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

/**
 * Textarea — Aelium Design System
 *
 * Multi-line text input with label, error/helper text,
 * character counter, and resize control.
 *
 * @example
 *   <Textarea label="Descripción" rows={4} maxLength={500} showCount />
 *
 * Ref: docs/DESIGN_SYSTEM.md
 */

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Label displayed above the textarea */
  label?: string;
  /** Validation error message */
  error?: string;
  /** Helper text shown below */
  helperText?: string;
  /** Show character count (requires maxLength) */
  showCount?: boolean;
  /** Disable resize */
  resizable?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, showCount, resizable = true, className = '', id, maxLength, value, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const currentLength = typeof value === 'string' ? value.length : 0;
    const showCounter = showCount && maxLength;

    let countClass = styles.charCount;
    if (showCounter && maxLength) {
      const ratio = currentLength / maxLength;
      if (ratio >= 1) countClass += ` ${styles.charCountError}`;
      else if (ratio >= 0.9) countClass += ` ${styles.charCountWarning}`;
    }

    return (
      <div className={`${styles.wrapper} ${className}`}>
        {label && (
          <label htmlFor={textareaId} className={styles.label}>
            {label}
          </label>
        )}
        <div className={`${styles.textareaContainer} ${error ? styles.hasError : ''}`}>
          <textarea
            ref={ref}
            id={textareaId}
            className={`${styles.textarea} ${!resizable ? styles.noResize : ''}`}
            maxLength={maxLength}
            value={value}
            {...props}
          />
        </div>
        <div className={styles.footer}>
          <div>
            {error && <p className={styles.error}>{error}</p>}
            {!error && helperText && <p className={styles.helper}>{helperText}</p>}
          </div>
          {showCounter && (
            <p className={countClass}>
              {currentLength}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
