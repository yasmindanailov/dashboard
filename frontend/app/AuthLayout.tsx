'use client';

import { type ReactNode } from 'react';
import { BrandMark } from './components/ui';
import styles from './auth.module.css';

/* ═══════════════════════════════════════════════════════════
   AuthLayout — split-screen compartido de todas las páginas de auth
   (F4·W3 · reskin 1:1 con los mockups Login/Registro/RecuperarContrasena).

   Izquierda: Aurora (degradado azul + 3 blobs animados) + eyebrow + titular
   (por página) + value props (por página) + footer.
   Derecha:   logo + formulario (children).

   Responsive: ≥1024px split-screen · <1024px solo el form (con logo arriba).
   Ref: ADR-059 (Aurora Digital split-screen). Tokens del DS + CSS module.
   ═══════════════════════════════════════════════════════════ */

export interface AuthValueProp {
  /** Icono (SVG Lucide, hereda color blanco del panel). */
  icon: ReactNode;
  text: string;
}

interface AuthLayoutProps {
  children: ReactNode;
  /** Titular grande del panel Aurora (varía por página). */
  headline: string;
  /** 3 propuestas de valor del panel Aurora (varían por página). */
  valueProps: AuthValueProp[];
  /** Ancho máx del formulario (login/recover 380 · registro 420). */
  formWidth?: number;
}

export default function AuthLayout({
  children,
  headline,
  valueProps,
  formWidth = 380,
}: AuthLayoutProps) {
  return (
    <div className={styles.authRoot}>
      {/* ═══ IZQUIERDA — Aurora + humano ═══ */}
      <div className={styles.auroraPanel}>
        <span className={styles.auroraBlob1} aria-hidden="true" />
        <span className={styles.auroraBlob2} aria-hidden="true" />
        <span className={styles.auroraBlob3} aria-hidden="true" />

        <div className={styles.auroraContent}>
          <p className={styles.auroraEyebrow}>Tu socio digital, a tu lado</p>
          <h2 className={styles.auroraHeadline}>{headline}</h2>
          <ul className={styles.valueProps}>
            {valueProps.map((vp, i) => (
              <li key={i} className={styles.valueProp}>
                <span className={styles.valuePropIcon}>{vp.icon}</span>
                <span className={styles.valuePropText}>{vp.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className={styles.auroraFooter}>© 2026 Aelium</p>
      </div>

      {/* ═══ DERECHA — formulario ═══ */}
      <div className={styles.formPanel}>
        <div className={styles.formContainer} style={{ maxWidth: formWidth }}>
          <div className={styles.formLogo}>
            <BrandMark withWordmark size={28} intro aria-label="Aelium" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
