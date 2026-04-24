'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../lib/auth-context';
import styles from './ContextBackLink.module.css';

/* ═══════════════════════════════════════
   ContextBackLink — Cross-module "Back to…" link
   Shows a subtle referrer link above the breadcrumb
   when navigating between modules.

   Only visible for: admin, agent, partner roles.
   Client never sees this (P6.1).

   Uses ?from= and ?fromLabel= query params.
   Ref: UI_SPEC §P6.1
   ═══════════════════════════════════════ */

const CLIENT_ROLES = ['client'];

export default function ContextBackLink() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || 'client';

  // P6.1: Only show for non-client roles
  if (CLIENT_ROLES.includes(roleSlug)) return null;

  const from = searchParams.get('from');
  const fromLabel = searchParams.get('fromLabel');

  if (!from || !fromLabel) return null;

  return (
    <Link href={from} className={styles.backLink} aria-label={`Navegar de vuelta a ${fromLabel}`}>
      <svg
        width="14" height="14" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        className={styles.backIcon}
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
      <span>Volver a {fromLabel}</span>
    </Link>
  );
}
