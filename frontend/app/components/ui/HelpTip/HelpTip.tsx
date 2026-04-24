'use client';

import { Tooltip } from '../Tooltip';
import styles from './HelpTip.module.css';

export interface HelpTipProps {
  /** Explanation text — should be 1 sentence, no jargon (§4.12 tone) */
  text: string;
  /** Tooltip position relative to the icon */
  position?: 'top' | 'bottom' | 'left' | 'right';
}

/**
 * HelpTip — Contextual help icon with explanatory tooltip.
 *
 * UI_SPEC §4.12: Icono ⓘ junto a conceptos que el cliente podría
 * no entender. Tono Aelium: breve, claro, sin tecnicismos.
 *
 * Usage:
 *   <span>Próxima renovación <HelpTip text="Se cobra automáticamente en la fecha de aniversario de tu servicio." /></span>
 *
 * Rules:
 *   - Maximum 2-3 per page
 *   - Only rendered for role `client` — caller must guard by role
 *   - Text must be one sentence, no technical terms
 */
export function HelpTip({ text, position = 'top' }: HelpTipProps) {
  return (
    <Tooltip content={text} position={position} multiline>
      <span className={styles.icon} aria-label="Más información" role="img">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </span>
    </Tooltip>
  );
}
