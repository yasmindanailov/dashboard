'use client';

import { useId } from 'react';

import styles from './BrandMark.module.css';

export interface BrandMarkProps {
  /** Alto del isotipo en px (el wordmark escala con él). */
  size?: number;
  /** Muestra el wordmark "aelium" junto al isotipo. */
  withWordmark?: boolean;
  /** Versión monocroma (hereda `currentColor`) en vez de la bicolor de marca. */
  mono?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * BrandMark — isotipo de Aelium (F1d). Dos rombos redondeados bicolor
 * (delantero `#3B82F6`, trasero `#93C5FD` con corte) extraídos del mockup
 * `Logotipo.dc.html` (symbol aelDuo/aelMono, viewBox 10 20 80 60). Reemplaza
 * el placeholder "A" de los sidebars y el SVG `#4b77bb` de `public/brand`.
 * Los colores de marca son fijos por identidad (no theme-dependent).
 */
export function BrandMark({
  size = 28,
  withWordmark = false,
  mono = false,
  className = '',
  ...aria
}: BrandMarkProps) {
  // useId() genera ids con ':' (':r0:') que rompen la referencia url(#id) de la
  // máscara SVG → se quitan los dos puntos para un id válido en url().
  const maskId = `aelCut-${useId().replace(/:/g, '')}`;
  const width = (size * 80) / 60; // viewBox 80×60
  const back = mono ? 'currentColor' : '#93C5FD';
  const front = mono ? 'currentColor' : '#3B82F6';

  return (
    <span className={`${styles.lockup} ${className}`} aria-label={aria['aria-label'] ?? 'aelium'}>
      <svg
        viewBox="10 20 80 60"
        width={width}
        height={size}
        className={styles.mark}
        role="img"
        aria-hidden="true"
      >
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect x="0" y="0" width="100" height="100" fill="#fff" />
          <rect
            x="47"
            y="47"
            width="26"
            height="26"
            rx="4"
            transform="rotate(45 60 60)"
            fill="none"
            stroke="#000"
            strokeWidth="2.8"
          />
        </mask>
        <rect
          x="27"
          y="27"
          width="26"
          height="26"
          rx="4"
          transform="rotate(45 40 40)"
          fill={back}
          mask={`url(#${maskId})`}
        />
        <rect x="47" y="47" width="26" height="26" rx="4" transform="rotate(45 60 60)" fill={front} />
      </svg>
      {withWordmark && (
        <span className={styles.wordmark} style={{ fontSize: Math.round(size * 0.72) }}>
          aelium
        </span>
      )}
    </span>
  );
}
