'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/auth-context';
import { useToast } from '../../components/ui';
import type { Client } from '../../lib/types';
import type { Ticket, TicketStats } from './types';
import { ADMIN_ROLES } from './types';
import {
  createTicketAction,
  getTicketStatsAction,
  listTicketsAction,
  searchClientsAction,
} from './_actions';

/* ═══════════════════════════════════════
   useTicketInbox — Sprint 13 §13.AUTH Fase E (Modelo A).
   Reescrito para invocar Server Actions en lugar de
   `supportApi.X(token, …)` con localStorage. Cero token cliente.
   Ref: DECISIONS.md §43, §46. ADR-078 Amendment A1.
   ═══════════════════════════════════════ */

export function useTicketInbox() {
  const { user } = useAuth();
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<TicketStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('support_general');
  const [newPriority, setNewPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchingClients, setSearchingClients] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    const result = await listTicketsAction({
      page,
      limit: 20,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      search: search || undefined,
    });
    if (result.ok) {
      setConversations(result.tickets);
      setTotalPages(result.totalPages);
    }
    setLoading(false);
  }, [page, statusFilter, categoryFilter, search]);

  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    const result = await getTicketStatsAction();
    if (result.ok) setStats(result.stats);
  }, [isAdmin]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lazy load on filter/role change (prop-driven sync con backend).
    void loadConversations();
  }, [loadConversations]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga stats inicial admin-only (one-shot post-mount).
    void loadStats();
  }, [loadStats]);

  /* Debounced client search admin-only. */
  useEffect(() => {
    if (!isAdmin || clientSearch.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpia resultados cuando el filtro queda corto (debounce search reset).
      setClientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingClients(true);
      const result = await searchClientsAction(clientSearch);
      if (result.ok) setClientResults(result.clients);
      else setClientResults([]);
      setSearchingClients(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch, isAdmin]);

  const handleNewTicket = async () => {
    if (!newSubject.trim() || !newBody.trim()) return;
    if (isAdmin && !selectedClient) return;
    setSubmitting(true);
    const result = await createTicketAction(
      {
        subject: newSubject.trim(),
        body: newBody.trim(),
        category: newCategory,
        priority: newPriority,
      },
      isAdmin && selectedClient ? selectedClient.id : undefined,
    );
    setSubmitting(false);
    if (!result.ok) {
      toast('error', result.error);
      return;
    }
    setShowNew(false);
    setNewSubject('');
    setNewBody('');
    setNewCategory('support_general');
    setNewPriority('normal');
    setSelectedClient(null);
    setClientSearch('');
    void loadConversations();
    void loadStats();
    toast('success', 'Ticket creado correctamente.');
  };

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearch('');
    setClientResults([]);
  };

  const clearSelectedClient = () => {
    setSelectedClient(null);
    setClientSearch('');
  };

  return {
    user,
    isAdmin,
    conversations,
    loading,
    totalPages,
    page,
    setPage,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    stats,
    showNew,
    setShowNew,
    newSubject,
    setNewSubject,
    newBody,
    setNewBody,
    newCategory,
    setNewCategory,
    newPriority,
    setNewPriority,
    submitting,
    handleNewTicket,
    clientSearch,
    setClientSearch,
    clientResults,
    selectedClient,
    searchingClients,
    selectClient,
    clearSelectedClient,
  };
}
