'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../lib/auth-context';
import { supportApi, clientsApi } from '../../lib/api';
import { useToast } from '../../components/ui';
import type { Client, Pagination } from '../../lib/types';
import type { Ticket, TicketStats } from './types';
import { ADMIN_ROLES } from './types';

/* ═══════════════════════════════════════
   useTicketInbox — state & data loading
   Handles ticket listing, stats, filtering,
   pagination, and new ticket creation.
   Ref: DECISIONS.md §43, §46
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

  // New ticket modal
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newCategory, setNewCategory] = useState('support_general');
  const [newPriority, setNewPriority] = useState('normal');
  const [submitting, setSubmitting] = useState(false);

  // Admin: client selector
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchingClients, setSearchingClients] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  /* ─── Load data ─── */

  const loadConversations = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (search) params.search = search;

      const res = (await supportApi.listTickets(token, params)) as Pagination<Ticket>;
      setConversations(res.data);
      setTotalPages(res.meta?.total_pages || 1);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token, page, statusFilter, categoryFilter, search]);

  const loadStats = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const res = await supportApi.getStats(token, 'ticket') as TicketStats;
      setStats(res);
    } catch (err) { console.warn('[TicketInbox] loadStats failed:', err); }
  }, [token, isAdmin]);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { loadStats(); }, [loadStats]);

  // Debounced client search for admin
  useEffect(() => {
    if (!isAdmin || clientSearch.length < 2 || !token) {
      setClientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const res = (await clientsApi.list(token, { search: clientSearch, limit: 10 })) as Pagination<Client>;
        setClientResults(res.data || []);
      } catch (err) { console.warn('[TicketInbox] clientSearch failed:', err); setClientResults([]); }
      finally { setSearchingClients(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch, token, isAdmin]);

  /* ─── Create ticket ─── */

  const handleNewTicket = async () => {
    if (!token || !newSubject.trim() || !newBody.trim()) return;
    if (isAdmin && !selectedClient) return;
    setSubmitting(true);
    try {
      await supportApi.createTicket(
        token,
        {
          subject: newSubject.trim(),
          body: newBody.trim(),
          category: newCategory,
          priority: newPriority,
        },
        isAdmin && selectedClient ? selectedClient.id : undefined,
      );
      // Reset modal
      setShowNew(false);
      setNewSubject('');
      setNewBody('');
      setNewCategory('support_general');
      setNewPriority('normal');
      setSelectedClient(null);
      setClientSearch('');
      loadConversations();
      loadStats();
      toast('success', 'Ticket creado correctamente.');
    } catch (e) {
      console.error(e);
      toast('error', 'No se pudo crear el ticket.');
    }
    finally { setSubmitting(false); }
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
    user, isAdmin,
    // List
    conversations, loading, totalPages, page, setPage,
    // Filters
    search, setSearch, statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter,
    // Stats
    stats,
    // New ticket
    showNew, setShowNew,
    newSubject, setNewSubject, newBody, setNewBody,
    newCategory, setNewCategory, newPriority, setNewPriority,
    submitting, handleNewTicket,
    // Client selector
    clientSearch, setClientSearch, clientResults,
    selectedClient, searchingClients,
    selectClient, clearSelectedClient,
  };
}
