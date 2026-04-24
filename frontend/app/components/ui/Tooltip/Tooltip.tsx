'use client';

import { useState, type ReactNode } from 'react';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Allow multiline content (wraps text at ~240px) */
  multiline?: boolean;
}

export function Tooltip({ content, children, position = 'top', multiline = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className={styles.wrapper}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={`${styles.tooltip} ${styles[position]} ${multiline ? styles.multiline : ''}`}
          role="tooltip"
        >
          {content}
        </div>
      )}
    </div>
  );
}
