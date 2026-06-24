'use client';

import { useState } from 'react';

import { Tabs } from '../../../components/ui';
import DomainSearch from './DomainSearch';
import DomainTransfer from './DomainTransfer';

/* ═══════════════════════════════════════
   DomainStoreTabs — Tienda · Dominios (Sprint 15D.II.T2c.3).
   Dos puertas al MISMO carrito único: Registrar (buscador) y Transferir (traer un
   dominio que ya posees). Patrón WHMCS/OVH/GoDaddy. La gestión de tus dominios ya
   registrados vive en /dashboard/domains.
   ═══════════════════════════════════════ */

const TABS = [
  { id: 'register', label: 'Registrar' },
  { id: 'transfer', label: 'Transferir' },
];

export default function DomainStoreTabs() {
  const [tab, setTab] = useState('register');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === 'register' ? <DomainSearch /> : <DomainTransfer />}
    </div>
  );
}
