'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { productsApi, clientsApi, billingApi } from '../../../lib/api';
import type { Product, ProductPricing, BillingProfile, ClientOption, Step } from './types';
import { ADMIN_ROLES } from './types';

/* ═══════════════════════════════════════
   useCheckout — state & checkout logic
   Handles multi-step checkout: client selection
   (admin), product, pricing, billing profile,
   and final submission.
   Ref: DECISIONS.md §37
   ═══════════════════════════════════════ */

export function useCheckout() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;

  const [step, setStep] = useState<Step>(isAdmin ? 'client' : 'product');
  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<BillingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Admin: client search
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  // Selections
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<ProductPricing | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<BillingProfile | null>(null);
  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || '' : '';

  const targetUserId = isAdmin ? selectedClient?.id : user?.id;
  const targetUserName = isAdmin
    ? `${selectedClient?.first_name || ''} ${selectedClient?.last_name || ''}`
    : `${user?.first_name || ''} ${user?.last_name || ''}`;
  const targetUserEmail = isAdmin ? selectedClient?.email : user?.email;

  /* ─── Client search (admin, debounced) ─── */

  useEffect(() => {
    if (!isAdmin || !token || clientSearch.length < 2) {
      setClientResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const res = await clientsApi.list(token, { search: clientSearch, limit: 10 }) as { data: ClientOption[] };
        setClientResults(res.data || []);
      } catch (err) { console.warn('[Checkout] clientSearch failed:', err); setClientResults([]); }
      finally { setSearchingClients(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [isAdmin, token, clientSearch]);

  /* ─── Load products ─── */

  const loadProducts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await productsApi.list(token, { limit: 50, status: 'active' }) as { data: Product[] };
      setProducts(res.data.filter((p) => p.pricing.some((pr) => pr.active)));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [token]);

  /* ─── Load billing profiles ─── */

  const loadProfiles = useCallback(async () => {
    if (!token || !targetUserId) return;
    try {
      const res = await clientsApi.getBillingProfiles(token, targetUserId) as BillingProfile[];
      setProfiles(Array.isArray(res) ? res : []);
      const defaultProfile = (Array.isArray(res) ? res : []).find((p: BillingProfile) => p.is_default);
      if (defaultProfile) setSelectedProfile(defaultProfile);
      else setSelectedProfile(null);
    } catch (e) { console.error(e); }
  }, [token, targetUserId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);
  useEffect(() => { if (targetUserId) loadProfiles(); }, [loadProfiles, targetUserId]);

  /* ─── Step handlers ─── */

  const handleSelectClient = (client: ClientOption) => {
    setSelectedClient(client);
    setClientSearch('');
    setClientResults([]);
    setSelectedProfile(null);
    setStep('product');
  };

  const clearSelectedClient = () => {
    setSelectedClient(null);
    setSelectedProfile(null);
  };

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    const activePricing = product.pricing.filter((p) => p.active);
    if (activePricing.length === 1) {
      setSelectedPricing(activePricing[0]);
      setStep('profile');
    } else {
      setStep('pricing');
    }
  };

  /* ─── Final checkout ─── */

  const handleCheckout = async () => {
    if (!token || !selectedPricing || !user) return;
    if (isAdmin && !selectedClient) {
      setError('Debes seleccionar un cliente destino.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await billingApi.checkout(token, {
        product_pricing_id: selectedPricing.id,
        billing_profile_id: selectedProfile?.id,
        label: label || undefined,
        domain: domain || undefined,
      }, isAdmin ? selectedClient!.id : undefined);
      router.push('/dashboard/billing');
    } catch (e: any) {
      setError(e?.message || 'Error al procesar el checkout');
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Step indicator config ─── */

  const allSteps: { key: Step; label: string; num: number }[] = isAdmin
    ? [
        { key: 'client', label: 'Cliente', num: 1 },
        { key: 'product', label: 'Producto', num: 2 },
        { key: 'pricing', label: 'Plan', num: 3 },
        { key: 'profile', label: 'Facturación', num: 4 },
        { key: 'confirm', label: 'Confirmar', num: 5 },
      ]
    : [
        { key: 'product', label: 'Producto', num: 1 },
        { key: 'pricing', label: 'Plan', num: 2 },
        { key: 'profile', label: 'Facturación', num: 3 },
        { key: 'confirm', label: 'Confirmar', num: 4 },
      ];

  const currentStepIndex = allSteps.findIndex((s) => s.key === step);

  return {
    user, isAdmin, step, setStep, allSteps, currentStepIndex,
    // Products & pricing
    products, loading, selectedProduct, selectedPricing, setSelectedPricing,
    handleSelectProduct,
    // Billing profiles
    profiles, selectedProfile, setSelectedProfile,
    targetUserName, targetUserEmail,
    label, setLabel, domain, setDomain,
    // Client search
    clientSearch, setClientSearch, clientResults, searchingClients,
    selectedClient, handleSelectClient, clearSelectedClient,
    // Checkout
    submitting, error, handleCheckout,
  };
}
