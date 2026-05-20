import type { ReactNode } from 'react';
import styles from './DescriptionList.module.css';

/**
 * DescriptionList — Aelium Design System (Sprint 15C.II Fase F.12.5, Amendment V).
 *
 * Lista de pares etiqueta-valor (`<dl>`) canónica para metadata. Dos layouts:
 *   - **`stacked`** (default): rejilla `término | valor` por filas. Para datos
 *     técnicos / metadata vertical (admin) — el valor admite `ReactNode`
 *     (links, badges, `<CopyableId>`).
 *   - **`inline`**: pares fluyendo en horizontal, separados por `·`. Para la
 *     metadata del header (Plan · Dominio · Contratado · Renueva — §3.1). El
 *     `term` es opcional; sin él, solo se muestra el valor.
 *
 * Server-component compatible: sin hooks, sin estado. Tokens only. Las filas se
 * envuelven en `<div display:contents>` para conservar key sin romper la
 * rejilla CSS (los `<dt>`/`<dd>` participan como hijos directos del grid).
 *
 * @example
 *   <DescriptionList items={[
 *     { term: 'ID servicio', value: <CopyableId id={service.id} /> },
 *     { term: 'Creado', value: '12 mar 2026' },
 *   ]} />
 *   <DescriptionList layout="inline" items={[
 *     { value: 'Plan Pro' }, { value: 'miweb.com' },
 *     { term: 'Contratado', value: '12 mar' },
 *   ]} />
 */
export interface DescriptionItem {
  /** Etiqueta del par. Opcional en `inline` (valor suelto). */
  term?: ReactNode;
  /** Valor del par (admite ReactNode: links, badges, CopyableId…). */
  value: ReactNode;
  /** Key estable opcional (por defecto el índice). */
  key?: string;
}

export interface DescriptionListProps {
  items: DescriptionItem[];
  layout?: 'stacked' | 'inline';
  className?: string;
}

export function DescriptionList({
  items,
  layout = 'stacked',
  className = '',
}: DescriptionListProps) {
  const isInline = layout === 'inline';
  return (
    <dl
      className={`${isInline ? styles.inline : styles.stacked} ${className}`.trim()}
    >
      {items.map((item, i) => (
        <div
          key={item.key ?? i}
          className={isInline ? styles.inlineItem : styles.row}
        >
          {item.term != null && (
            <dt className={isInline ? styles.inlineTerm : styles.term}>
              {item.term}
            </dt>
          )}
          <dd className={isInline ? styles.inlineValue : styles.value}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
