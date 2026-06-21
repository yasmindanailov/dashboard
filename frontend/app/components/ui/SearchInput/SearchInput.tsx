import { forwardRef, type InputHTMLAttributes } from 'react';
import styles from './SearchInput.module.css';

/**
 * SearchInput — Aelium Design System
 *
 * Input with built-in search icon, clear button,
 * and optional loading indicator. Designed for
 * list/table filter use cases.
 *
 * @example
 *   <SearchInput
 *     value={search}
 *     onChange={(e) => setSearch(e.target.value)}
 *     onClear={() => setSearch('')}
 *     placeholder="Buscar clientes..."
 *     loading={isSearching}
 *   />
 *
 * Ref: docs/40-reference/DESIGN_SYSTEM.md
 */

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Label above the input */
  label?: string;
  /** Show loading spinner */
  loading?: boolean;
  /** Callback when clear button is clicked */
  onClear?: () => void;
  /** Size variant */
  size?: 'sm' | 'md';
}

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SpinnerIcon = () => (
  <svg className={styles.spinner} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 11-6.219-8.56" />
  </svg>
);

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ label, loading: isLoading, onClear, size = 'md', className = '', id, value, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const hasValue = value != null && value !== '';
    const sizeClass = size !== 'md' ? styles[size] : '';

    return (
      <div className={`${styles.wrapper} ${sizeClass} ${className}`}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}
        <div className={styles.searchContainer}>
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            ref={ref}
            id={inputId}
            type="search"
            className={styles.input}
            value={value}
            {...props}
          />
          {isLoading && (
            <span className={styles.loading}>
              <SpinnerIcon />
            </span>
          )}
          {!isLoading && hasValue && onClear && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={onClear}
              aria-label="Limpiar búsqueda"
            >
              <ClearIcon />
            </button>
          )}
        </div>
      </div>
    );
  },
);

SearchInput.displayName = 'SearchInput';
