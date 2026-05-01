'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import { productsApi, clientsApi, billingApi } from '../../../lib/api';
import { getErrorMessage } from '../../../lib/error';
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
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;

  // Sub-fase 8.D.12.9 (ADR-076): si el comparador Support Inside (o cualquier
  // CTA del catálogo) redirige aquí con `?product_pricing_id=X`, saltamos
  // directo al step de facturación con plan pre-seleccionado.
  const prefilledPricingId = searchParams?.get('product_pricing_id') ?? null;

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
      // ADR-075 §A.2 + ADR-076 §frontend — `support_inside` queda fuera
      // del wizard de catálogo. Solo se llega a la suscripción de SI con
      // `?product_pricing_id=...` desde el comparador `/dashboard/support-inside`.
      // Defense in depth: si alguien linka al wizard sin query param, no
      // verá los planes SI mezclados con productos técnicos.
      setProducts(
        res.data.filter(
          (p) => p.type !== 'support_inside' && p.pricing.some((pr) => pr.active),
        ),
      );
    } catch (e) { console.warn('[Checkout] loadProducts failed:', getErrorMessage(e)); }
    finally { setLoading(false); }
  }, [token]);

  // Sub-fase 8.D.12.9 (ADR-076): cuando hay product_pricing_id en URL,
  // resolvemos el producto + pricing y saltamos a `profile`. Si admin,
  // mantenemos `step='client'` hasta que seleccione cliente, luego salta.
  const prefillFromUrl = useCallback(async () => {
    if (!token || !prefilledPricingId) return;
    try {
      // Necesitamos el producto que contiene este pricing. Buscamos en el
      // catálogo público completo (incluye support_inside porque el filtro
      // del wizard lo excluye PERO aquí queremos resolverlo manualmente).
      const fullCatalog = (await productsApi.list(token, { limit: 100, status: 'active' })) as { data: Product[] };
      let prod: Product | null = null;
      let pricing: ProductPricing | null = null;
      for (const p of fullCatalog.data) {
        const match = p.pricing.find((pr) => pr.id === prefilledPricingId);
        if (match) {
          prod = p;
          pricing = match;
          break;
        }
      }
      if (!prod || !pricing) return;
      setSelectedProduct(prod);
      setSelectedPricing(pricing);
      // Si soy cliente, salto a profile directamente. Si soy admin, dejo
      // que primero seleccione cliente — luego al pasar a `product` ya
      // habrá selectedPricing, así que avanzamos a profile.
      if (!isAdmin) setStep('profile');
    } catch (e) {
      console.warn('[Checkout] prefill failed:', e);
    }
  }, [token, prefilledPricingId, isAdmin]);

  useEffect(() => {
    void prefillFromUrl();
  }, [prefillFromUrl]);

  /* ─── Load billing profiles ─── */

  const loadProfiles = useCallback(async () => {
    if (!token || !targetUserId) return;
    try {
      const res = await clientsApi.getBillingProfiles(token, targetUserId) as BillingProfile[];
      setProfiles(Array.isArray(res) ? res : []);
      const defaultProfile = (Array.isArray(res) ? res : []).find((p: BillingProfile) => p.is_default);
      if (defaultProfile) setSelectedProfile(defaultProfile);
      else setSelectedProfile(null);
    } catch (e) {
      // El helper api() lanza objetos plain {status, message, correlationId}
      // sin prototype Error, por eso console.error(e) los imprimía como `{}`.
      // Usamos getErrorMessage para extraer el message legible.
      console.warn('[Checkout] loadProfiles failed:', getErrorMessage(e));
    }
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
      // Sprint 9.6 (ADR-066): cada portal redirige a su propio listado.
      // Sub-fase 8.D.12.9 (ADR-076): si el producto era Support Inside,
      // redirigimos a la vista de gestión SI en lugar del listado de
      // facturas — más útil para el cliente que acaba de activar el plan.
      const isSupportInsideCheckout =
        !isAdmin && selectedProduct?.type === 'support_inside';
      if (isSupportInsideCheckout) {
        router.push('/dashboard/support-inside');
      } else {
        router.push(isAdmin ? '/admin/billing' : '/dashboard/billing');
      }
    } catch (e) {
      setError(getErrorMessage(e) || 'Error al procesar el checkout');
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
