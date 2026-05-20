'use client';

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './Dropdown.module.css';

/** Props que el modo `triggerAsChild` inyecta en el elemento trigger. */
interface TriggerInjectedProps {
  onClick?: () => void;
  'aria-haspopup'?: 'menu';
  'aria-expanded'?: boolean;
}

export interface DropdownItem {
  /** Etiqueta del ítem. Opcional solo para `divider`. */
  label?: string;
  /** Handler al seleccionar. Opcional solo para `divider`. */
  onClick?: () => void;
  icon?: ReactNode;
  danger?: boolean;
  divider?: boolean;
  /**
   * Línea de descripción (gris) bajo la etiqueta — da contexto de la acción
   * sin tooltip (patrón Stripe/Linear/Vercel para menús de acciones). Sprint
   * 15C.II Fase F.12.5 (Amendment VII).
   */
  description?: string;
  /** Deshabilita el ítem (no clicable, atenuado). */
  disabled?: boolean;
}

export interface DropdownProps {
  items: DropdownItem[];
  trigger?: ReactNode;
  align?: 'left' | 'right';
  /**
   * Si `true`, el `trigger` ES el control (se le inyecta `onClick` + aria) en
   * lugar de envolverlo en otro `<button>`. Úsalo cuando el trigger ya sea un
   * elemento interactivo (ej. DS `<Button>`) — evita el `<button>` anidado
   * (error de hidratación). Sprint 15C.II Fase F.12.5 (Amendment VII).
   */
  triggerAsChild?: boolean;
}

export function Dropdown({
  items,
  trigger,
  align = 'right',
  triggerAsChild = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const toggle = () => setOpen((o) => !o);

  return (
    <div className={styles.wrapper} ref={ref}>
      {triggerAsChild && isValidElement<TriggerInjectedProps>(trigger) ? (
        // El trigger es el control: inyectamos onClick + aria sin envolverlo en
        // otro <button> (evita <button> dentro de <button>).
        cloneElement(trigger, {
          onClick: toggle,
          'aria-haspopup': 'menu',
          'aria-expanded': open,
        })
      ) : (
        <button
          className={trigger ? styles.triggerCustom : styles.trigger}
          onClick={toggle}
          aria-haspopup="true"
          aria-expanded={open}
        >
          {trigger || (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          )}
        </button>
      )}
      {open && (
        <div className={`${styles.menu} ${styles[align]}`}>
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className={styles.divider} />
            ) : (
              <button
                key={i}
                type="button"
                disabled={item.disabled}
                className={`${styles.item} ${item.danger ? styles.danger : ''} ${
                  item.description ? styles.itemRich : ''
                }`}
                onClick={() => {
                  item.onClick?.();
                  setOpen(false);
                }}
              >
                {item.icon && <span className={styles.icon}>{item.icon}</span>}
                <span className={styles.itemBody}>
                  <span className={styles.itemLabel}>{item.label}</span>
                  {item.description && (
                    <span className={styles.itemDescription}>
                      {item.description}
                    </span>
                  )}
                </span>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
