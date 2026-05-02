'use client';

// TODO(ADR-078, Sprint 13): migrar a Server Component cuando cierre §13.AUTH.

import { useState, useEffect, use, useCallback } from 'react';
import Link from 'next/link';
import { clientsApi, supportApi } from '../../../lib/api';
import { DetailPage, useToast } from '../../../components/ui';
import type { DetailTab } from '../../../components/ui';
import type {
  ClientNote,
  Conversation,
  NoteCategory,
  NoteSourceSystem,
  Pagination,
} from '../../../lib/types';
import type { ClientDetail, Tab } from './types';
import { TABS } from './types';
import ClientDetailHeader from './ClientDetailHeader';
import ClientResumeTab from './ClientResumeTab';
import ClientBillingTab from './ClientBillingTab';
import ClientSupportTab from './ClientSupportTab';
import ClientNotesTab from './ClientNotesTab';

/* ═══════════════════════════════════════
   Client Detail Page — Orchestrator (Sprint 16 / ADR-079).
   ═══════════════════════════════════════ */

const detailTabs: DetailTab[] = TABS.map((t) => ({ key: t.key, label: t.label }));

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('resumen');
  const { toast } = useToast();

  // Support history (carga lazy en su tab).
  const [supportChats, setSupportChats] = useState<Conversation[]>([]);
  const [supportTickets, setSupportTickets] = useState<Conversation[]>([]);
  const [loadingSupport, setLoadingSupport] = useState(false);

  // Structured notes — ADR-079 §3.8 nuevo contrato canónico.
  const [structuredNotes, setStructuredNotes] = useState<ClientNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteCategory, setNoteCategory] = useState<NoteCategory | ''>('');
  const [noteSourceSystem, setNoteSourceSystem] = useState<NoteSourceSystem | ''>(
    '',
  );
  const [notePinnedOnly, setNotePinnedOnly] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    clientsApi
      .get(token, id)
      .then((data) => setClient(data as ClientDetail))
      .catch(() => {
        toast('error', 'No se pudo cargar el cliente.');
      })
      .finally(() => setLoading(false));
  }, [id, toast]);

  useEffect(() => {
    if (tab !== 'soporte') return;
    const token = localStorage.getItem('access_token');
    if (!token) return;
    setLoadingSupport(true);
    Promise.all([
      supportApi.listChats(token, {
        user_id: id,
        limit: 50,
      }) as Promise<Pagination<Conversation>>,
      supportApi.listTickets(token, {
        user_id: id,
        limit: 50,
      }) as Promise<Pagination<Conversation>>,
    ])
      .then(([chatsRes, ticketsRes]) => {
        setSupportChats(chatsRes.data || []);
        setSupportTickets(ticketsRes.data || []);
      })
      .catch(() => {
        toast('error', 'No se pudo cargar el historial de soporte.');
      })
      .finally(() => setLoadingSupport(false));
  }, [tab, id, toast]);

  const loadStructuredNotes = useCallback(async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    setLoadingNotes(true);
    try {
      const params: {
        limit: number;
        category?: string;
        source_system?: string;
        pinned_only?: boolean;
      } = { limit: 100 };
      if (noteCategory) params.category = noteCategory;
      if (noteSourceSystem) params.source_system = noteSourceSystem;
      if (notePinnedOnly) params.pinned_only = true;
      const res = (await clientsApi.listStructuredNotes(
        token,
        id,
        params,
      )) as Pagination<ClientNote>;
      setStructuredNotes(res.data || []);
    } catch (err) {
      console.warn('[ClientDetail] loadNotes failed:', err);
      setStructuredNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  }, [id, noteCategory, noteSourceSystem, notePinnedOnly]);

  useEffect(() => {
    if (tab === 'notas') void loadStructuredNotes();
  }, [tab, loadStructuredNotes]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('tab') === 'notas') setTab('notas');
    }
  }, []);

  if (loading)
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-10) 0',
        }}
      >
        <svg
          style={{
            animation: 'spin 1s linear infinite',
            width: 24,
            height: 24,
            color: 'var(--brand)',
          }}
          viewBox="0 0 24 24"
        >
          <circle
            opacity="0.25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
          />
          <path
            opacity="0.75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      </div>
    );

  if (!client)
    return (
      <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
        <p
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          Cliente no encontrado
        </p>
        <Link
          href="/admin/clients"
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--brand)',
            marginTop: 'var(--space-2)',
            display: 'inline-block',
            textDecoration: 'none',
          }}
        >
          ← Volver
        </Link>
      </div>
    );

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
