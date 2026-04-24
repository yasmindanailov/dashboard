'use client';

import { type ReactNode } from 'react';
import GradientMesh from './components/ui/GradientMesh';
import styles from './auth.module.css';

/* ═══════════════════════════════════════════════════════════
   AuthLayout — Shared split-screen for all auth pages
   
   Left:  Aurora Digital (GradientMesh) + brand card
   Right: Auth form (children)

   Responsive:
     Desktop → 55% aurora | 45% form
     Mobile  → Full form with logo above

   Ref: UI_SPEC §5.13, §2.8
   Zero hex · Zero Tailwind · CSS module only
   ═══════════════════════════════════════════════════════════ */

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className={styles.authRoot}>
      {/* ═══ LEFT — Aurora Digital ═══ */}
      <div className={styles.auroraPanel}>
        <GradientMesh />
        <div className={styles.auroraBrand}>
          <div className={styles.brandCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-blue-black.svg"
              alt="Aelium"
              className={styles.brandLogo}
            />
          </div>
          <p className={styles.brandSlogan}>Tu socio digital, a tu lado</p>
        </div>
      </div>

      {/* ═══ RIGHT — Form Panel ═══ */}
      <div className={styles.formPanel}>
        <div className={styles.formContainer}>
          {/* Mobile logo (only visible <1024px) */}
          <div className={styles.mobileLogo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/logo-blue-black.svg"
              alt="Aelium"
              className={styles.mobileLogoImg}
            />
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
