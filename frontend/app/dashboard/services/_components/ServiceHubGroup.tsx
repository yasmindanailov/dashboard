import type { ReactNode } from 'react';

import styles from './services-hub.module.css';

/**
 * ServiceHubGroup — Sprint F4·W3·U04. Sección del hub "Mis servicios":
 * encabezado (título + contador píldora) + rejilla de cards. `columns=2` →
 * grid responsive (hosting); `columns=1` → columna apilada (dominios · Support
 * Inside). 1:1 con `MisServicios.dc.html`. Presentacional (SC).
 */
export default function ServiceHubGroup({
  title,
  count,
  columns = 1,
  children,
}: {
  title: string;
  count: number;
  columns?: 1 | 2;
  children: ReactNode;
}) {
  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>
        <h2 className={styles.groupTitle}>{title}</h2>
        <span className={styles.groupCount}>{count}</span>
      </div>
      <div className={columns === 2 ? styles.grid2 : styles.grid1}>{children}</div>
    </section>
  );
}
