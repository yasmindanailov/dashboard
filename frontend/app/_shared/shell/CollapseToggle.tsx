'use client';

import { ChevronLeft } from 'lucide-react';

import styles from './CollapseToggle.module.css';

export interface CollapseToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  className?: string;
}

/**
 * CollapseToggle — chevron flotante para contraer/expandir el sidebar.
 *
 * Spec del mockup `admin/Shell.dc.html` (líneas 134-136): botón circular anclado
 * al borde derecho del sidebar (`right:-13px`, centrado vertical); el chevron
 * apunta a la izquierda (contraer) y rota 180° al estar contraído (expandir).
 * Compartido por el shell cliente y admin (F2). El estado de colapso vive en el
 * shell padre; este componente es presentacional. Cumple D1 (icono Lucide).
 */
export function CollapseToggle({ collapsed, onToggle, className = '' }: CollapseToggleProps) {
  const label = collapsed ? 'Expandir menú' : 'Contraer menú';
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      className={`${styles.toggle} ${className}`}
    >
      <ChevronLeft
        size={14}
        strokeWidth={2}
        aria-hidden="true"
        className={`${styles.chevron} ${collapsed ? styles.chevronCollapsed : ''}`}
      />
    </button>
  );
}
