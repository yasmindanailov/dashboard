'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { clientsApi, supportApi } from '../../../lib/api';
import { DetailPage, useToast } from '../../../components/ui';
import type { DetailTab } from '../../../components/ui';
import type { ClientDetail, Tab } from './types';
import { TABS } from './types';
import ClientDetailHeader from './ClientDetailHeader';
import ClientResumeTab from './ClientResumeTab';
import ClientBillingTab from './ClientBillingTab';
import ClientSupportTab from './ClientSupportTab';
import ClientNotesTab from './ClientNotesTab';

/* ═══════════════════════════════════════
   Client Detail Page — Orchestrator
   Layout: DetailPage (§2.5)
   Anatomy: Breadcrumb → Header → Tabs → Content
   Ref: ROADMAP.md §7.5.D21, UI_SPEC §2.5
   ═══════════════════════════════════════ */

const detailTabs: DetailTab[] = TABS.map(t => ({ key: t.key, label: t.label }));

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('resumen');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteSuccess, setNoteSuccess] = useState(false);
  const { toast } = useToast();

  // Support history
  const [supportChats, setSupportChats] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [loadingSupport, setLoadingSupport] = useState(false);

  // Structured notes
  const [structuredNotes, setStructuredNotes] = useState<any[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteCategory, setNoteCategory] = useState('general');
  const [noteFilter, setNoteFilter] = useState<string>('');

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    clientsApi.get(token, id)
      .then((data) => setClient(data as ClientDetail))
      .catch(() => { toast('error', 'No se pudo cargar el cliente.'); })
      .finally(() => setLoading(false));
  }, [id]);

  // Load support history when tab changes
  useEffect(() => {
    if (tab !== 'soporte') return;
    const token = localStorage.getItem('access_token');
    if (!token) return;
    setLoadingSupport(true);
    Promise.all([
      supportApi.listChats(token, { user_id: id, limit: 50 }),
      supportApi.listTickets(token, { user_id: id, limit: 50 }),
    ]).then(([chatsRes, ticketsRes]: any[]) => {
      setSupportChats(chatsRes.data || []);
      setSupportTickets(ticketsRes.data || []);
    }).catch(() => { toast('error', 'No se pudo cargar el historial de soporte.'); }).finally(() => setLoadingSupport(false));
  }, [tab, id]);

  // Load structured notes
  const loadStructuredNotes = async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    setLoadingNotes(true);
    try {
      const p: any = { limit: 100 };
      if (noteFilter) p.category = noteFilter;
      const res = await clientsApi.listStructuredNotes(token, id, p) as any;
      setStructuredNotes(res.data || []);
    } catch (err) { console.warn('[ClientDetail] loadNotes failed:', err); setStructuredNotes([]); }
    finally { setLoadingNotes(false); }
  };

  useEffect(() => { if (tab === 'notas') loadStructuredNotes(); }, [tab, id, noteFilter]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      if (p.get('tab') === 'notas') setTab('notas');
    }
  }, []);

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    const token = localStorage.getItem('access_token');
    if (!token) return;
    setSavingNote(true); setError(null); setNoteSuccess(false);
    try {
      await clientsApi.addNote(token, id, noteText);
      const data = await clientsApi.get(token, id) as ClientDetail;
      setClient(data); setNoteText(''); setNoteSuccess(true); setNoteCategory('general');
      if (tab === 'notas') loadStructuredNotes();
      toast('success', 'Nota guardada correctamente.');
      setTimeout(() => setNoteSuccess(false), 3000);
    } catch (err: unknown) {
      toast('error', err instanceof Error ? err.message : 'Error al guardar la nota');
    } finally { setSavingNote(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-10) 0' }}>
      <svg style={{ animation: 'spin 1s linear infinite', width: 24, height: 24, color: 'var(--brand)' }} viewBox="0 0 24 24">
        <circle opacity="0.25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path opacity="0.75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );

  if (!client) return (
    <div style={{ textAlign: 'center', padding: 'var(--space-10) 0' }}>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Cliente no encontrado</p>
      <Link href="/dashboard/clients" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', color: 'var(--brand)', marginTop: 'var(--space-2)', display: 'inline-block', textDecoration: 'none' }}>← Volver</Link>
    </div>
  );

  return (
    <DetailPage
      breadcrumb={[
        { label: 'Clientes', href: '/dashboard/clients' },
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
      {tab === 'soporte' && <ClientSupportTab loading={loadingSupport} chats={supportChats} tickets={supportTickets} clientId={client.id} clientName={`${client.first_name} ${client.last_name}`} />}
      {tab === 'notas' && (
        <ClientNotesTab
          notes={structuredNotes} loading={loadingNotes}
          noteFilter={noteFilter} onFilterChange={setNoteFilter}
          noteText={noteText} noteCategory={noteCategory}
          savingNote={savingNote} noteSuccess={noteSuccess} error={error}
          onNoteTextChange={setNoteText} onNoteCategoryChange={setNoteCategory}
          onAddNote={handleAddNote} onRefresh={loadStructuredNotes}
        />
      )}
    </DetailPage>
  );
}
