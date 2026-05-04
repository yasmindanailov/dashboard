'use client';

import { useEffect, useState, useCallback } from 'react';
import { DetailPage, useToast } from '../../../../components/ui';
import type { DetailTab } from '../../../../components/ui';
import type {
  ClientNote,
  Conversation,
  NoteCategory,
  NoteSourceSystem,
} from '../../../../lib/types';
import type { ClientDetail, Tab } from '../types';
import { TABS } from '../types';
import ClientDetailHeader from '../ClientDetailHeader';
import ClientResumeTab from '../ClientResumeTab';
import ClientBillingTab from '../ClientBillingTab';
import ClientSupportTab from '../ClientSupportTab';
import ClientNotesTab from '../ClientNotesTab';
import {
  listClientNotesAction,
  listClientSupportAction,
} from '../_actions';

/* ═══════════════════════════════════════
   ClientDetailView — Sprint 13 §13.AUTH Fase E (Modelo A).
   Recibe `client` prehidratado por SC. Mantiene los tabs y el lazy
   load per-tab via Server Actions (cero localStorage). El initial tab
   se selecciona por searchParams si vienen `?tab=…`.
   ═══════════════════════════════════════ */

const detailTabs: DetailTab[] = TABS.map((t) => ({ key: t.key, label: t.label }));

interface Props {
  client: ClientDetail;
  initialTab: Tab;
}

export default function ClientDetailView({ client, initialTab }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>(initialTab);

  const [supportChats, setSupportChats] = useState<Conversation[]>([]);
  const [supportTickets, setSupportTickets] = useState<Conversation[]>([]);
  const [loadingSupport, setLoadingSupport] = useState(false);

  const [structuredNotes, setStructuredNotes] = useState<ClientNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteCategory, setNoteCategory] = useState<NoteCategory | ''>('');
  const [noteSourceSystem, setNoteSourceSystem] = useState<NoteSourceSystem | ''>('');
  const [notePinnedOnly, setNotePinnedOnly] = useState(false);

  /*
   * Lazy load del tab Soporte: dispara al cambiar a la tab.
   * El SC padre ya tiene `client`; aquí solo bajo el historial.
   */
  useEffect(() => {
    if (tab !== 'soporte') return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy load on tab change: historial de soporte se baja al cambiar a la tab "Soporte".
    setLoadingSupport(true);
    void (async () => {
      const result = await listClientSupportAction(client.id);
      if (cancelled) return;
      if (result.ok) {
        setSupportChats(result.chats);
        setSupportTickets(result.tickets);
      } else {
        toast('error', result.error);
      }
      setLoadingSupport(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, client.id, toast]);

  const loadStructuredNotes = useCallback(async () => {
    setLoadingNotes(true);
    const result = await listClientNotesAction(client.id, {
      category: noteCategory,
      sourceSystem: noteSourceSystem,
      pinnedOnly: notePinnedOnly,
    });
    if (result.ok) {
      setStructuredNotes(result.notes);
    } else {
      setStructuredNotes([]);
      toast('error', result.error);
    }
    setLoadingNotes(false);
  }, [client.id, noteCategory, noteSourceSystem, notePinnedOnly, toast]);

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
      {tab === 'resumen' && <ClientResumeTab client={client} />}
      {tab === 'facturacion' && <ClientBillingTab client={client} />}
      {tab === 'soporte' && (
        <ClientSupportTab
          loading={loadingSupport}
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
          category={noteCategory}
          sourceSystem={noteSourceSystem}
          pinnedOnly={notePinnedOnly}
          onCategoryChange={setNoteCategory}
          onSourceChange={setNoteSourceSystem}
          onPinnedToggle={setNotePinnedOnly}
          onRefresh={loadStructuredNotes}
        />
      )}
    </DetailPage>
  );
}
