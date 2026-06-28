import type { CSSProperties } from 'react';

import styles from './BrandMark.module.css';

export interface BrandMarkProps {
  /** Alto del isotipo en px (base de diseño: 28). El wordmark escala con él. */
  size?: number;
  /** Muestra el wordmark "aelium" junto al isotipo. */
  withWordmark?: boolean;
  /** Versión monocroma (hereda `currentColor`) en vez de la bicolor de marca. */
  mono?: boolean;
  /**
   * Reproduce la animación de entrada **«01 · Ensamblaje»** del mockup vivo
   * (`LogotipoAnimado.dc.html`): los dos rombos convergen desde los lados, una
   * sola vez al montar (CSS puro, sin JS). Pensado para el logo del shell y del
   * login «al entrar a la página». Respeta `prefers-reduced-motion` (aparece sin
   * desplazamiento). Úsalo con la versión bicolor de marca (no con `mono`).
   */
  intro?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * BrandMark — isotipo de Aelium (F1d). Copia exacta del logo del mockup vivo
 * (`Downloads/mockup-uiux/Login.dc.html` + `LogotipoAnimado.dc.html`): dos
 * cuadrados redondeados rotados 45° **alineados horizontalmente** (claro
 * `#BFDBFE` detrás-izquierda, brand `#3B82F6` delante-derecha), proporción base
 * 28px (rombo 17, offset 10, top 6, radio 5). Colores de marca fijos.
 */
export function BrandMark({
  size = 28,
  withWordmark = false,
  mono = false,
  intro = false,
  className = '',
  ...aria
}: BrandMarkProps) {
  const k = size / 28; // factor de escala respecto a la base de diseño (28px)
  const d = 17 * k; // lado del rombo
  const off = 10 * k; // desplazamiento horizontal del rombo delantero
  const top = 6 * k; // offset vertical de ambos rombos
  const radius = 5 * k;
  const back = mono ? 'currentColor' : '#BFDBFE';
  const front = mono ? 'currentColor' : '#3B82F6';

  // Distancia de deslizamiento del Ensamblaje, proporcional al tamaño.
  const markStyle = {
    width: size,
    height: size,
    ...(intro ? { '--bm-assemble-shift': `${Math.round(size * 0.85)}px` } : {}),
  } as CSSProperties;
  const backCls = intro ? `${styles.diamond} ${styles.introBack}` : styles.diamond;
  const frontCls = intro ? `${styles.diamond} ${styles.introFront}` : styles.diamond;

  return (
    <span className={`${styles.lockup} ${className}`} aria-label={aria['aria-label'] ?? 'aelium'}>
      <span className={styles.mark} style={markStyle} aria-hidden="true">
        <span
          className={backCls}
          style={{ left: 0, top, width: d, height: d, borderRadius: radius, background: back, opacity: mono ? 0.45 : 1 }}
        />
        <span
          className={frontCls}
          style={{ left: off, top, width: d, height: d, borderRadius: radius, background: front }}
        />
      </span>
      {withWordmark && (
        <span className={styles.wordmark} style={{ fontSize: Math.round(size * 0.64) }}>
          aelium
        </span>
      )}
    </span>
  );
}
