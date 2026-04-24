import type { ReactNode, HTMLAttributes } from 'react';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Card({ variant = 'default', padding = 'md', children, className = '', ...props }: CardProps) {
  const classes = `${styles.card} ${styles[variant]} ${styles[`pad_${padding}`]} ${className}`;
  return <div className={classes} {...props}>{children}</div>;
}
