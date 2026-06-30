'use client';

import { useEffect, useState, useCallback } from 'react';
import { DetailPage, useToast } from '../../../../components/ui';
import type { DetailTab } from '../../../../components/ui';
import type { ClientNote, Conversation } from '../../../../lib/types';
import type {
  ClientBillingStats,
  ClientDetail,
  ClientServiceItem,
  Tab,
} from '../types';
import { TABS } from '../types';
import ClientDetailHeader from '../ClientDetailHeader';
import ClientResumeTab from '../ClientResumeTab';
import ClientServicesTab from '../ClientServicesTab';
import ClientBillingTab from '../ClientBillingTab';
import ClientSupportTab from '../ClientSupportTab';
import ClientNotesTab from '../ClientNotesTab';
import { listClientNotesAction } from '../_actions';

/* ═══════════════════════════════════════
   ClientDetailView (F4·U22) — orquesta los 5 tabs. `client`, `services`,
   `billingStats` y el soporte vienen prehidratados por el SC (eager, para las
   stat-cards del Resumen y el tab Servicios). Las notas siguen lazy (filtros).
   ═══════════════════════════════════════ */

const OPEN_STATUSES = new Set(['open', 'waiting_agent']);

interface Props {
  client: ClientDetail;
  initialTab: Tab;
  services: ClientServiceItem[];
  billingStats: ClientBillingStats | null;
  supportChats: Conversation[];
  supportTickets: Conversation[];
}

export default function ClientDetailView({
  client,
  initialTab,
  services,
  billingStats,
  supportChats,
  supportTickets,
}: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);

  const [structuredNotes, setStructuredNotes] = useState<ClientNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  const supportTotal = supportChats.length + supportTickets.length;
  const supportOpen = [...supportChats, ...supportTickets].filter((c) =>
    OPEN_STATUSES.has(c.status),
  ).length;

  // F4·U22 — contadores en los tabs (1:1 mockup): Servicios (no-SI) y Soporte.
  const servicesCount = services.filter(
    (s) => s.product?.type !== 'support_inside',
  ).length;
  const detailTabs: DetailTab[] = TABS.map((t) => ({
    key: t.key,
    label: t.label,
    count:
      t.key === 'servicios'
        ? servicesCount
        : t.key === 'soporte'
          ? supportTotal
          : undefined,
  }));

  // F4·U22 — cargamos TODAS las notas una vez; el filtrado (categoría/origen/
  // fijadas) es client-side en ClientNotesTab (chips con contador, 1:1 mockup).
  const loadStructuredNotes = useCallback(async () => {
    setLoadingNotes(true);
    const result = await listClientNotesAction(client.id, {});
    if (result.ok) {
      setStructuredNotes(result.notes);
    } else {
      setStructuredNotes([]);
      toast('error', result.error);
    }
    setLoadingNotes(false);
  }, [client.id, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy load on tab change: notas estructuradas se cargan al cambiar a la tab "Notas".
    if (tab === 'notas') void loadStructuredNotes();
  }, [tab, loadStructuredNotes]);

  return (
    <DetailPage
      breadcrumb={[
        { label: 'Clientes', href: '/admin/clients' },
        { label: `${client.first_name} ${client.last_name}` },
      ]}
      header={<ClientDetailHeader client={client} />}
      tabs={detailTabs}
      activeTab={tab}
      onTabChange={(k) => setTab(k as Tab)}
      wide
    >
      {tab === 'resumen' && (
        <ClientResumeTab
          client={client}
          services={services}
          billingStats={billingStats}
          supportOpen={supportOpen}
          supportTotal={supportTotal}
          onNavigateTab={setTab}
        />
      )}
      {tab === 'servicios' && (
        <ClientServicesTab client={client} services={services} />
      )}
      {tab === 'facturacion' && (
        <ClientBillingTab client={client} billingStats={billingStats} />
      )}
      {tab === 'soporte' && (
        <ClientSupportTab
          loading={false}
          chats={supportChats}
          tickets={supportTickets}
          clientId={client.id}
          clientName={`${client.first_name} ${client.last_name}`}
        />
      )}
      {tab === 'notas' && (
        <ClientNotesTab
          clientId={client.id}
          notes={structuredNotes}
          loading={loadingNotes}
          onRefresh={loadStructuredNotes}
        />
      )}
    </DetailPage>
  );
}
