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
 *   - **`divided`**: filas `término … valor` (space-between) con separador faint
 *     entre ellas. Para las cards de datos del detalle (Info del servicio /
 *     Datos técnicos), 1:1 con los mockups (F4·U24).
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
  layout?: 'stacked' | 'inline' | 'divided';
  className?: string;
}

const LIST_CLASS = {
  stacked: styles.stacked,
  inline: styles.inline,
  divided: styles.divided,
} as const;
const ROW_CLASS = {
  stacked: styles.row,
  inline: styles.inlineItem,
  divided: styles.dividedRow,
} as const;
const TERM_CLASS = {
  stacked: styles.term,
  inline: styles.inlineTerm,
  divided: styles.dividedTerm,
} as const;
const VALUE_CLASS = {
  stacked: styles.value,
  inline: styles.inlineValue,
  divided: styles.dividedValue,
} as const;

export function DescriptionList({
  items,
  layout = 'stacked',
  className = '',
}: DescriptionListProps) {
  return (
    <dl className={`${LIST_CLASS[layout]} ${className}`.trim()}>
      {items.map((item, i) => (
        <div key={item.key ?? i} className={ROW_CLASS[layout]}>
          {item.term != null && (
            <dt className={TERM_CLASS[layout]}>{item.term}</dt>
          )}
          <dd className={VALUE_CLASS[layout]}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
