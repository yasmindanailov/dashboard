'use client';

import {
  useEffect,
  useCallback,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Selector canónico de elementos focusables para el focus trap (WCAG 2.1
 * 2.1.2 No Keyboard Trap + 2.4.3 Focus Order). Excluye:
 *   - Elementos `disabled` (no son focusables por el browser).
 *   - `tabindex="-1"` (programmatically focusable pero NO en el orden Tab).
 *   - Botones del header tipo "close": SÍ se incluyen (el admin debe poder
 *     ciclar al close button con Tab).
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  // Sprint 15C.II Fase C (gap G7 — WCAG 2.1 a11y compliance):
  //   - `aria-labelledby` vincula el `<h2>` título del modal con el
  //     `<div role="dialog">` parent (screen readers anuncian el título
  //     al abrir el modal).
  //   - `useId()` genera un id estable cliente↔server (canónico React 18+
  //     para SSR). Solo lo usamos cuando hay `title` (el modal sin título
  //     mantiene `aria-modal="true"` sin labelledby).
  //   - **Focus trap**: el foco entra al primer elemento focusable al
  //     abrir; Tab/Shift+Tab cicla dentro del dialog (no escapa al body
  //     detrás del overlay). Implementación manual ~30 LOC sin
  //     dependencias externas (preferido a `focus-trap-react` para
  //     mantener bundle ligero).
  //   - **Restore focus**: al cerrar, devolvemos el foco al elemento que
  //     lo tenía antes de abrir el modal (botón que disparó la apertura).
  //     Patrón canónico WAI-ARIA Authoring Practices "Modal Dialog Pattern".
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';

    // Guardar el elemento focused antes de abrir para devolver el foco
    // al cerrar (WAI-ARIA Authoring Practices "Modal Dialog Pattern").
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Focus inicial al primer elemento focusable del dialog (no al
    // botón close — el footer/body suele tener acción primaria).
    const dialog = dialogRef.current;
    const focusables = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusables && focusables.length > 0) {
      focusables[0].focus();
    } else {
      // Sin focusables, foco al dialog mismo (tabindex="-1") para que
      // los screen readers entiendan que estamos dentro del modal.
      dialog?.focus();
    }

    // Focus trap: cicla Tab/Shift+Tab dentro del set de focusables.
    // Re-query en cada Tab porque footer/body pueden añadir/quitar
    // botones dinámicamente (ej. botón "Confirmar" deshabilitado tras
    // submit en ChangePackageModal).
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleTab);

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.removeEventListener('keydown', handleTab);
      document.body.style.overflow = '';
      // Devolver el foco al disparador (si todavía existe en el DOM).
      const previous = previousFocusRef.current;
      if (previous && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open, handleEsc]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        className={`${styles.dialog} ${styles[size]}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title && (
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>{title}</h2>
            <button className={styles.close} onClick={onClose} aria-label="Cerrar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
