'use client';

import { useTicketInbox } from '../../_shared/support/useTicketInbox';
import type { StatusTab } from '../../components/ui';
import TicketList from '../../_shared/support/TicketList';
import NewTicketModal from '../../_shared/support/NewTicketModal';
import {
  Button, SearchInput, Select,
  ListPage, FilterBar, StatusTabs,
} from '../../components/ui';
import { useAuth } from '../../lib/auth-context';

/* ═══════════════════════════════════════
   Admin Support — Portal de Administración (ADR-066 Fase E.3)
   Full workflow tabs (Todas / Abiertas / Esperando agente / Esperando
   cliente / Resueltas / Cerradas) + CTA "Nuevo ticket para cliente"
   con selector de cliente. CASL `Manage Conversation` filtra el acceso
   por rol staff:
     - superadmin / agent_full → ven todo
     - agent_support           → ve todo (su trabajo principal)
     - agent_billing           → 403 backend (no tiene Conversation)
   `agent_full` y `superadmin` pueden abrir tickets en nombre del
   cliente; `agent_support` NO abre tickets (sólo responde) — lo
   refleja `canOpenTicket` en el shell.
   El cliente final tiene `/dashboard/support` (tabs reducidas).
   Ref: UI_SPEC §2.4, ADR-066, ADR-067, DECISIONS.md §43
   ═══════════════════════════════════════ */

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas las categorías' },
  { value: 'support_general', label: 'Soporte general' },
  { value: 'support_billing', label: 'Facturación' },
  { value: 'support_technical', label: 'Soporte técnico' },
  { value: 'escalated_chat', label: 'Escalado desde chat' },
];

export default function AdminSupportPage() {
  const inbox = useTicketInbox();
  const { user } = useAuth();
  const roleSlug = user?.role?.slug || '';

  /* P6.1: agent_support responde, no abre tickets en nombre del cliente.
     superadmin / agent_full sí (CTA "Nuevo ticket para cliente"). */
  const AGENT_RESPOND_ONLY = ['agent_support'];
  const canOpenTicket = !AGENT_RESPOND_ONLY.includes(roleSlug);

  /* StatusTabs full workflow staff (admin ve los 6 estados) */
  const statusTabs: StatusTab[] = [
    { label: 'Todas', value: '', count: inbox.stats?.total_conversations },
    { label: 'Abiertas', value: 'open', count: inbox.stats?.open_count, variant: 'info' },
    { label: 'Esperando agente', value: 'waiting_agent', count: inbox.stats?.waiting_agent_count, variant: 'danger' },
    { label: 'Esperando cliente', value: 'waiting_client', count: inbox.stats?.waiting_client_count, variant: 'warning' },
    { label: 'Resueltas', value: 'resolved', count: inbox.stats?.resolved_count, variant: 'success' },
    { label: 'Cerradas', value: 'closed', count: inbox.stats?.closed_count },
  ];

  return (
    <ListPage
      title="Soporte"
      subtitle="Bandeja de conversaciones del equipo"
      action={
        canOpenTicket ? (
          <Button onClick={() => inbox.setShowNew(true)}>Nuevo ticket para cliente</Button>
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
      <TicketList
        tickets={inbox.conversations}
        loading={inbox.loading}
        isAdmin={inbox.isAdmin}
        page={inbox.page}
        totalPages={inbox.totalPages}
        onPageChange={inbox.setPage}
        basePath="/admin/support"
      />

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
