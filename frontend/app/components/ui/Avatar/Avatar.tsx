import styles from './Avatar.module.css';

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Deterministic color from name string */
function hashColor(name: string): string {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const initials = getInitials(name);

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`${styles.avatar} ${styles[size]} ${className}`}
      />
    );
  }

  return (
    <div
      className={`${styles.avatar} ${styles[size]} ${className}`}
      style={{ background: hashColor(name) }}
      title={name}
    >
      <span className={styles.initials}>{initials}</span>
    </div>
  );
}
