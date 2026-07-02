import type { ReactNode } from 'react';

import styles from './services-hub.module.css';

/**
 * ServiceHubGroup — Sprint F4·W3·U04. Sección del hub "Mis servicios":
 * encabezado (título + contador píldora) + grid de cards ficha. Presentacional
 * (SC). Agrupación por categoría con contadores (gap §U04).
 */
export default function ServiceHubGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>
        <h2 className={styles.groupTitle}>{title}</h2>
        <span className={styles.groupCount}>{count}</span>
      </div>
      <div className={styles.grid}>{children}</div>
    </section>
  );
}
