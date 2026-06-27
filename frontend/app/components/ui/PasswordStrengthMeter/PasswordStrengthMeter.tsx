import styles from './PasswordStrengthMeter.module.css';

export interface PasswordStrengthMeterProps {
  /** 0 = vacío · 1 débil · 2 mejorable · 3 buena · 4 excelente. */
  score: 0 | 1 | 2 | 3 | 4;
  className?: string;
}

const LEVELS = [
  { label: 'Introduce una contraseña', cls: 'l0' },
  { label: 'Débil', cls: 'l1' },
  { label: 'Mejorable', cls: 'l2' },
  { label: 'Buena', cls: 'l3' },
  { label: 'Excelente', cls: 'l4' },
] as const;

/**
 * PasswordStrengthMeter — primitiva del DS (F1a). Spec del mockup (Perfil):
 * 4 barras + etiqueta, progresión débil→excelente. Colores mapeados a tokens
 * del DS (la divergencia de matiz exacto vs mockup #0E8C5F/#D9892B es deuda
 * de token registrada en gap §4.3, reconciliación sistémica aparte).
 */
export function PasswordStrengthMeter({ score, className = '' }: PasswordStrengthMeterProps) {
  const level = LEVELS[score];
  return (
    <div className={`${styles.wrap} ${className}`}>
      <div className={styles.bars} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`${styles.bar} ${i <= score ? styles[level.cls] : ''}`} />
        ))}
      </div>
      <span className={`${styles.label} ${styles[level.cls]}`}>{level.label}</span>
    </div>
  );
}
