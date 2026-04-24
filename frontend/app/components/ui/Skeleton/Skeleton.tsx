import styles from './Skeleton.module.css';

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  circle?: boolean;
  className?: string;
}

export function Skeleton({ width, height = 16, circle = false, className = '' }: SkeletonProps) {
  return (
    <div
      className={`${styles.skeleton} ${circle ? styles.circle : ''} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}
