'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import styles from './Breadcrumbs.module.css';

export interface Crumb {
  label: string;
  /** Si tiene href, es un enlace (no la hoja actual). */
  href?: string;
}

export interface BreadcrumbsProps {
  items: Crumb[];
}

/**
 * Breadcrumbs — migas del topbar del shell cliente (mockup Shell.dc.html
 * líneas 124-131): raíz (enlace, 17px slate-400) + separador chevron + página
 * actual (17px slate-900). El último item es la hoja (sin href). Cliente-only.
 */
export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className={styles.wrap} aria-label="Migas de navegación">
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <span className={styles.crumb} key={`${c.label}-${i}`}>
            {i > 0 && (
              <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" className={styles.sep} />
            )}
            {c.href && !isLast ? (
              <Link href={c.href} className={styles.link}>
                {c.label}
              </Link>
            ) : (
              <span className={styles.current} aria-current={isLast ? 'page' : undefined}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
