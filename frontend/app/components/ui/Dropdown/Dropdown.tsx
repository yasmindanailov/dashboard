'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import styles from './Dropdown.module.css';

export interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  divider?: boolean;
}

export interface DropdownProps {
  items: DropdownItem[];
  trigger?: ReactNode;
  align?: 'left' | 'right';
}

export function Dropdown({ items, trigger, align = 'right' }: DropdownProps) {
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

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={trigger ? styles.triggerCustom : styles.trigger}
        onClick={() => setOpen(!open)}
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
      {open && (
        <div className={`${styles.menu} ${styles[align]}`}>
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} className={styles.divider} />
            ) : (
              <button
                key={i}
                className={`${styles.item} ${item.danger ? styles.danger : ''}`}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
              >
                {item.icon && <span className={styles.icon}>{item.icon}</span>}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
