'use client';

import { useTicketInbox } from './useTicketInbox';
import { STATUS_CONFIG, ADMIN_ROLES } from './types';
import type { StatusTab } from '../../components/ui';
import TicketList from './TicketList';
import NewTicketModal from './NewTicketModal';
import {
  Button, SearchInput, Select,
  ListPage, FilterBar, StatusTabs,
} from '../../components/ui';
import { useAuth } from '../../lib/auth-context';

/* ═══════════════════════════════════════
   Support Page — Ticket Inbox (UI_SPEC §2.4)
   Layout: ListPage + StatusTabs + FilterBar
   StatsCards removed (§3.1: only in Overview).
   StatusTabs replace the status Select (§3.2).
   Ref: ROADMAP.md §7.5.D20, UI_SPEC §5.5
   ═══════════════════════════════════════ */

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas las categorías' },
  { value: 'support_general', label: 'Soporte general' },
  { value: 'support_billing', label: 'Facturación' },
  { value: 'support_technical', label: 'Soporte técnico' },
  { value: 'escalated_chat', label: 'Escalado desde chat' },
];

export default function SupportPage() {
  const inbox = useTicketInbox();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || 'client';
  const isClient = roleSlug === 'client';

  /* P6.1: Agents respond to tickets, they don't open them.
     CTA visible for: client (opens own), superadmin/agent_full (opens on behalf) */
  const AGENT_ONLY_ROLES = ['agent_support', 'agent_billing'];
  const isAgentOnly = AGENT_ONLY_ROLES.includes(roleSlug);
  const canOpenTicket = !isAgentOnly;

  /* ── StatusTabs with stats counts (§3.2, P6.1) ── */
  const statusTabs: StatusTab[] = [
    { label: 'Todas', value: '', count: inbox.stats?.total_conversations },
    { label: 'Abiertas', value: 'open', count: inbox.stats?.open_count, variant: 'info' },
    { label: 'Esperando agente', value: 'waiting_agent', count: inbox.stats?.waiting_agent_count, variant: 'danger' },
    { label: 'Esperando cliente', value: 'waiting_client', count: inbox.stats?.waiting_client_count, variant: 'warning' },
    { label: 'Resueltas', value: 'resolved', count: inbox.stats?.resolved_count, variant: 'success' },
    /* P6.1: Client doesn't need 'Cerradas' tab */
    ...(!isClient ? [{ label: 'Cerradas', value: 'closed', count: inbox.stats?.closed_count }] : []),
  ];

  return (
    <ListPage
      title={inbox.isAdmin ? 'Tickets de soporte' : 'Mis tickets'}
      subtitle={inbox.isAdmin
        ? 'Bandeja de conversaciones del equipo'
        : 'Tus consultas y conversaciones con el equipo'}
      action={
        canOpenTicket ? (
          <Button onClick={() => inbox.setShowNew(true)}>
            {inbox.isAdmin ? 'Nuevo ticket para cliente' : 'Nueva conversación'}
          </Button>
        ) : undefined
      }
      statusTabs={
        <StatusTabs
          tabs={statusTabs}
          active={inbox.statusFilter}
          onChange={(v) => { inbox.setStatusFilter(v); inbox.setPage(1); }}
        />
      }
      filterBar={
        <FilterBar
          search={
            <SearchInput
              value={inbox.search}
              onChange={(e) => { inbox.setSearch(e.target.value); inbox.setPage(1); }}
              onClear={() => { inbox.setSearch(''); inbox.setPage(1); }}
              placeholder="Buscar por asunto o contenido..."
            />
          }
          filters={
            <Select
              value={inbox.categoryFilter || ''}
              onChange={(e) => { inbox.setCategoryFilter(e.target.value); inbox.setPage(1); }}
              options={CATEGORY_OPTIONS}
            />
          }
        />
      }
    >
      {/* Ticket list (card list — §3.3: contenido rico) */}
      <TicketList
        tickets={inbox.conversations}
        loading={inbox.loading}
        isAdmin={inbox.isAdmin}
        page={inbox.page}
        totalPages={inbox.totalPages}
        onPageChange={inbox.setPage}
      />

      {/* New ticket modal */}
      {inbox.showNew && (
        <NewTicketModal
          isAdmin={inbox.isAdmin}
          subject={inbox.newSubject}
          body={inbox.newBody}
          category={inbox.newCategory}
          priority={inbox.newPriority}
          submitting={inbox.submitting}
          onSubjectChange={inbox.setNewSubject}
          onBodyChange={inbox.setNewBody}
          onCategoryChange={inbox.setNewCategory}
          onPriorityChange={inbox.setNewPriority}
          onSubmit={inbox.handleNewTicket}
          onClose={() => inbox.setShowNew(false)}
          clientSearch={inbox.clientSearch}
          clientResults={inbox.clientResults}
          selectedClient={inbox.selectedClient}
          searchingClients={inbox.searchingClients}
          onClientSearchChange={inbox.setClientSearch}
          onSelectClient={inbox.selectClient}
          onClearClient={inbox.clearSelectedClient}
        />
      )}
    </ListPage>
  );
}
