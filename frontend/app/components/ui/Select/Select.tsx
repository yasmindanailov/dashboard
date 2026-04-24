import { forwardRef, type SelectHTMLAttributes } from 'react';
import styles from './Select.module.css';

/**
 * Select — Aelium Design System
 *
 * Native <select> wrapper with consistent styling, label,
 * error/helper text, and size variants.
 *
 * @example
 *   <Select label="Estado" value={v} onChange={...}>
 *     <option value="active">Activo</option>
 *     <option value="inactive">Inactivo</option>
 *   </Select>
 *
 * Ref: docs/DESIGN_SYSTEM.md
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Label displayed above the select */
  label?: string;
  /** Validation error message */
  error?: string;
  /** Helper text shown below the select */
  helperText?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Placeholder text (first disabled option) */
  placeholder?: string;
  /** Declarative options array — alternative to children */
  options?: SelectOption[];
}

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, size = 'md', placeholder, options, children, className = '', id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const sizeClass = size !== 'md' ? styles[size] : '';

    return (
      <div className={`${styles.wrapper} ${sizeClass} ${className}`}>
        {label && (
          <label htmlFor={selectId} className={styles.label}>
            {label}
          </label>
        )}
        <div className={`${styles.selectContainer} ${error ? styles.hasError : ''}`}>
          <select
            ref={ref}
            id={selectId}
            className={styles.select}
            {...props}
          >
            {placeholder && (
              <option value="" disabled className={styles.placeholder}>
                {placeholder}
              </option>
            )}
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>
          <span className={styles.chevron}>
            <ChevronIcon />
          </span>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        {!error && helperText && <p className={styles.helper}>{helperText}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
