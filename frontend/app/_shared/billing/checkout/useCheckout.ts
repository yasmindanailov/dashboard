'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
import {
  checkoutAction,
  listCatalogProductsAction,
  listClientBillingProfilesAction,
  searchCheckoutClientsAction,
} from './_actions';
import type {
  BillingProfile,
  ClientOption,
  Product,
  ProductPricing,
  Step,
} from './types';
import { ADMIN_ROLES } from './types';

/* ═══════════════════════════════════════
   useCheckout — Sprint 13 §13.AUTH Fase E (Modelo A).
   Reescrito ADR-078 Amendment A1: API REST → Server Actions.
   Cero token cliente, cero localStorage.
   Ref: DECISIONS.md §37.
   ═══════════════════════════════════════ */

export function useCheckout() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role?.slug ? ADMIN_ROLES.includes(user.role.slug) : false;

  /*
   * Sub-fase 8.D.12.9 (ADR-076): si el comparador Support Inside (o
   * cualquier CTA del catálogo) redirige aquí con `?product_pricing_id=X`,
   * saltamos directo al step de facturación con plan pre-seleccionado.
   */
  const prefilledPricingId = searchParams?.get('product_pricing_id') ?? null;

  const [step, setStep] = useState<Step>(isAdmin ? 'client' : 'product');
  const [products, setProducts] = useState<Product[]>([]);
  const [profiles, setProfiles] = useState<BillingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<ClientOption[]>([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedPricing, setSelectedPricing] = useState<ProductPricing | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<BillingProfile | null>(null);
  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState('');

  const targetUserId = isAdmin ? selectedClient?.id : user?.id;
  const targetUserName = isAdmin
    ? `${selectedClient?.first_name || ''} ${selectedClient?.last_name || ''}`
    : `${user?.first_name || ''} ${user?.last_name || ''}`;
  const targetUserEmail = isAdmin ? selectedClient?.email : user?.email;

  /* Client search admin (debounced). El setState inicial sincroniza UI
     con cambio de filtro externo — patrón canónico React 19 cuando el
     effect representa un sistema externo (debounce + fetch). */
  useEffect(() => {
    if (!isAdmin || clientSearch.length < 2) {
      setClientResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setSearchingClients(true);
      const result = await searchCheckoutClientsAction(clientSearch);
      if (result.ok) setClientResults(result.clients);
      else setClientResults([]);
      setSearchingClients(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [isAdmin, clientSearch]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const result = await listCatalogProductsAction({ onlyActive: true, limit: 50 });
    if (result.ok) {
      /*
       * ADR-075 §A.2 + ADR-076 §frontend — `support_inside` queda fuera
       * del wizard de catálogo. Solo se llega a la suscripción de SI con
       * `?product_pricing_id=...` desde el comparador. Defense in depth:
       * si alguien linka al wizard sin query param, no verá los planes
       * SI mezclados con productos técnicos.
       */
      setProducts(
        result.products.filter(
          (p) => p.type !== 'support_inside' && p.pricing.some((pr) => pr.active),
        ),
      );
    }
    setLoading(false);
  }, []);

  const prefillFromUrl = useCallback(async () => {
    if (!prefilledPricingId) return;
    /*
     * Necesitamos el producto que contiene este pricing. Buscamos en el
     * catálogo público completo (incluye support_inside porque el filtro
     * del wizard lo excluye PERO aquí queremos resolverlo manualmente).
     */
    const result = await listCatalogProductsAction({ onlyActive: true, limit: 100 });
    if (!result.ok) return;
    let prod: Product | null = null;
    let pricing: ProductPricing | null = null;
    for (const p of result.products) {
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
    if (!isAdmin) setStep('profile');
  }, [prefilledPricingId, isAdmin]);

  useEffect(() => {
    void prefillFromUrl();
  }, [prefillFromUrl]);

  const loadProfiles = useCallback(async () => {
    if (!targetUserId) return;
    const result = await listClientBillingProfilesAction(targetUserId);
    if (!result.ok) return;
    setProfiles(result.profiles);
    const defaultProfile = result.profiles.find((p) => p.is_default);
    if (defaultProfile) setSelectedProfile(defaultProfile);
    else setSelectedProfile(null);
  }, [targetUserId]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);
  useEffect(() => {
    if (targetUserId) void loadProfiles();
  }, [loadProfiles, targetUserId]);

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

  const handleCheckout = async () => {
    if (!selectedPricing || !user) return;
    if (isAdmin && !selectedClient) {
      setError('Debes seleccionar un cliente destino.');
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await checkoutAction(
      {
        product_pricing_id: selectedPricing.id,
        billing_profile_id: selectedProfile?.id,
        label: label || undefined,
        domain: domain || undefined,
      },
      isAdmin ? selectedClient!.id : undefined,
    );
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    /*
     * Sprint 9.6 (ADR-066): cada portal redirige a su propio listado.
     * Sub-fase 8.D.12.9 (ADR-076): si el producto era Support Inside,
     * redirigimos a la vista de gestión SI en lugar del listado de
     * facturas — más útil para el cliente que acaba de activar el plan.
     */
    const isSupportInsideCheckout =
      !isAdmin && selectedProduct?.type === 'support_inside';
    if (isSupportInsideCheckout) {
      router.push('/dashboard/support-inside');
    } else {
      router.push(isAdmin ? '/admin/billing' : '/dashboard/billing');
    }
  };

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
    user,
    isAdmin,
    step,
    setStep,
    allSteps,
    currentStepIndex,
    products,
    loading,
    selectedProduct,
    selectedPricing,
    setSelectedPricing,
    handleSelectProduct,
    profiles,
    selectedProfile,
    setSelectedProfile,
    targetUserName,
    targetUserEmail,
    label,
    setLabel,
    domain,
    setDomain,
    clientSearch,
    setClientSearch,
    clientResults,
    searchingClients,
    selectedClient,
    handleSelectClient,
    clearSelectedClient,
    submitting,
    error,
    handleCheckout,
  };
}
