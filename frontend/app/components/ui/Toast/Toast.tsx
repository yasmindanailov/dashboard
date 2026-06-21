'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import styles from './Toast.module.css';

/* ═══════════════════════════════════════
   Toast — Aelium Design System

   Variants: success, error, warning, info
   Undo variant (§4.9): adds "Deshacer" button
   + countdown progress bar + 8s auto-dismiss.

   Usage:
     const { toast, toastUndo } = useToast();
     toast('success', 'Factura creada');
     toastUndo('info', 'Ticket cerrado', handleReopen);

   Ref: docs/40-reference/DESIGN_SYSTEM.md, UI_SPEC §4.9
   ═══════════════════════════════════════ */

/* ── Types ── */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
  /** If present, renders "Deshacer" button + countdown bar (§4.9) */
  onUndo?: () => void;
}

interface ToastContextValue {
  /** Show a standard toast notification */
  toast: (variant: ToastVariant, message: string, duration?: number) => void;
  /** Show a toast with "Deshacer" button (§4.9). Default 8s duration. */
  toastUndo: (variant: ToastVariant, message: string, onUndo: () => void, duration?: number) => void;
}

/* ── Context ── */

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

/* ── Icons ── */

const ICONS: Record<ToastVariant, ReactNode> = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

/* ── Undo countdown bar ── */

function UndoProgress({ duration }: { duration: number }) {
  return (
    <div className={styles.progressTrack}>
      <div
        className={styles.progressBar}
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}

/* ── Single toast item (handles undo + close) ── */

function ToastItem({
  item,
  onDismiss,
}: {
  item: ToastMessage;
  onDismiss: (id: string) => void;
}) {
  const handleUndo = () => {
    item.onUndo?.();
    onDismiss(item.id);
  };

  return (
    <div
      className={`${styles.toast} ${styles[item.variant]} ${item.onUndo ? styles.hasUndo : ''}`}
      role="alert"
    >
      <span className={styles.icon}>{ICONS[item.variant]}</span>
      <span className={styles.message}>{item.message}</span>

      {item.onUndo && (
        <button
          className={styles.undoButton}
          onClick={handleUndo}
          type="button"
        >
          Deshacer
        </button>
      )}

      <button
        className={styles.close}
        onClick={() => onDismiss(item.id)}
        aria-label="Cerrar"
        type="button"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {item.onUndo && <UndoProgress duration={item.duration} />}
    </div>
  );
}

/* ── Provider ── */

const DEFAULT_DURATION = 5000;
const UNDO_DURATION = 8000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counterRef = useRef(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    // Clear timer if still active
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (msg: Omit<ToastMessage, 'id'>) => {
      const id = `toast-${++counterRef.current}`;
      const fullMsg: ToastMessage = { ...msg, id };
      setToasts((prev) => [...prev, fullMsg]);

      if (msg.duration > 0) {
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          removeToast(id);
        }, msg.duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [removeToast],
  );

  const toast = useCallback(
    (variant: ToastVariant, message: string, duration = DEFAULT_DURATION) => {
      addToast({ variant, message, duration });
    },
    [addToast],
  );

  const toastUndo = useCallback(
    (variant: ToastVariant, message: string, onUndo: () => void, duration = UNDO_DURATION) => {
      addToast({ variant, message, duration, onUndo });
    },
    [addToast],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, toastUndo }}>
      {children}

      {/* Toast container */}
      <div className={styles.container}>
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
