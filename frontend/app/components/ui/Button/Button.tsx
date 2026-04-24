import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './Button.module.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  iconOnly?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/**
 * Button — Aelium Design System
 *
 * Variantes: primary (brand), secondary (outline), ghost (minimal), danger (destructivo).
 * Tamaños: sm (28px), md (36px), lg (44px).
 * Loading: muestra spinner y desactiva interacción.
 *
 * Ref: docs/DESIGN_SYSTEM.md
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      iconOnly = false,
      leftIcon,
      rightIcon,
      children,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const classes = [
      styles.btn,
      styles[variant],
      styles[size],
      fullWidth && styles.fullWidth,
      loading && styles.loading,
      iconOnly && styles.iconOnly,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={disabled || loading}
        {...props}
      >
        {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
        {children}
        {rightIcon && <span className={styles.icon}>{rightIcon}</span>}
        {loading && (
          <span className={styles.spinner}>
            <span className={styles.spinnerIcon} />
          </span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
