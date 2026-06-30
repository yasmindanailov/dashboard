import Image from 'next/image';
import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * `solid` (def.) = fondo saturado + iniciales blancas.
   * `soft` = fondo pastel + iniciales de color, 1:1 con los avatares de las
   * listas del mockup (F4). Solo afecta al fallback de iniciales (sin `src`).
   */
  tone?: 'solid' | 'soft';
  className?: string;
}

/** Píxeles asociados a cada `size` — usados para next/image. */
const SIZE_PX: Record<NonNullable<AvatarProps['size']>, number> = {
  sm: 28,
  md: 40,
  lg: 56,
};

/** Hash determinista del nombre → índice de paleta (estable por cliente). */
function hashIndex(name: string, modulo: number): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % modulo;
}

/** Deterministic color from name string (tono `solid`). */
function hashColor(name: string): string {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  ];
  return colors[hashIndex(name, colors.length)];
}

/** Pares [fondo pastel, color iniciales] del mockup (tono `soft`). */
const SOFT_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#EFF4FF', '#3B82F6'],
  ['#E8F7F1', '#0E8C5F'],
  ['#F1ECFB', '#7C5CCB'],
  ['#FCF3E1', '#B27A12'],
  ['#E9F0FB', '#475569'],
  ['#FCECEC', '#D14343'],
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({
  name,
  src,
  size = 'md',
  tone = 'solid',
  className = '',
}: AvatarProps) {
  const initials = getInitials(name);

  if (src) {
    const px = SIZE_PX[size];
    return (
      <Image
        src={src}
        alt={name}
        width={px}
        height={px}
        className={`${styles.avatar} ${styles[size]} ${className}`}
      />
    );
  }

  let fallbackStyle: { background: string; color?: string };
  if (tone === 'soft') {
    const [bg, fg] = SOFT_PALETTE[hashIndex(name, SOFT_PALETTE.length)];
    fallbackStyle = { background: bg, color: fg };
  } else {
    fallbackStyle = { background: hashColor(name) };
  }

  return (
    <div
      className={`${styles.avatar} ${styles[size]} ${className}`}
      style={fallbackStyle}
      title={name}
    >
      <span className={styles.initials}>{initials}</span>
    </div>
  );
}
