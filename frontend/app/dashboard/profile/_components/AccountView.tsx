'use client';

import { useState } from 'react';

import { Tabs } from '../../../components/ui';
import type { RegistrantProfile } from '../../../_shared/domains/_registrant-actions';
import type { AccountMe, AccountSession, BillingProfile } from '../_actions';

import AccountInfoForm from './AccountInfoForm';
import SecurityPanel from './SecurityPanel';
import BillingProfilesPanel from './BillingProfilesPanel';
import RegistrantForm from './RegistrantForm';
import styles from './AccountView.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   AccountView — orquestador de secciones (ADR-085). Client Component: gestiona
   la pestaña activa; cada sección es un componente con sus propias acciones.
   ═══════════════════════════════════════════════════════════════════════════ */

type TabId = 'cuenta' | 'seguridad' | 'facturacion' | 'dominios';

interface Props {
  me: AccountMe;
  sessions: AccountSession[];
  billingProfiles: BillingProfile[];
  registrant: RegistrantProfile | null;
}

export default function AccountView({
  me,
  sessions,
  billingProfiles,
  registrant,
}: Props) {
  const [tab, setTab] = useState<TabId>('cuenta');

  const tabs = [
    { id: 'cuenta', label: 'Cuenta' },
    { id: 'seguridad', label: 'Seguridad' },
    {
      id: 'facturacion',
      label: 'Facturación',
      count: billingProfiles.length || undefined,
    },
    ...(registrant ? [{ id: 'dominios', label: 'Dominios' }] : []),
  ];

  return (
    <div className={styles.wrap}>
      <Tabs tabs={tabs} activeTab={tab} onChange={(id) => setTab(id as TabId)} />
      <div className={styles.panel}>
        {tab === 'cuenta' && <AccountInfoForm me={me} />}
        {tab === 'seguridad' && <SecurityPanel me={me} sessions={sessions} />}
        {tab === 'facturacion' && (
          <BillingProfilesPanel initial={billingProfiles} />
        )}
        {tab === 'dominios' && registrant && (
          <RegistrantForm initial={registrant} />
        )}
      </div>
    </div>
  );
}
