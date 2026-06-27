'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { RefreshCw, Hourglass } from 'lucide-react';

import { Button, useToast } from '../../components/ui';
import { t } from '../i18n';

import { refreshServiceInfoAction } from './_actions';

/**
 * MetricsRefreshButton — Sprint 15C.II Fase B (ADR-083 Amendment A4.1)
 * + Sprint 15C.II Fase C round 7 (smoke real Yasmin 2026-05-10).
 *
 * Subcomponente Client Component embebido en `MetricsBar.tsx`. Renderiza
 * un botón "↻ Refrescar" pequeño en la esquina superior-derecha de la
 * card "Métricas". Click → server action `refreshServiceInfoAction` que
 * invoca `POST /services/:id/refresh` (o admin) con forceRevalidate=true
 * + revalidatePath para que el SC padre se rerenderice con métricas
 * frescas.
 *
 * Sprint 15C.II Fase C round 7 — patrón canónico industria
 * (Stripe admin / Datadog / AWS Console): cooldown visible 10s tras
 * cada refresh exitoso para evitar:
 *   - Rate-limit accidental contra el proveedor (mocks dev + prod real).
 *   - DoS por click repetitivo del admin durante debugging.
 *   - UX confuso (admin no sabe si "ya pulsé" y espera resultado).
 *
 * El botón muestra el countdown "↻ 9s" → "↻ 8s" → ... durante el
 * cooldown, luego vuelve a "↻ Refrescar". Si el server action falla,
 * el cooldown NO se aplica (el admin debe poder reintentar inmediato).
 *
 * Cliente NO ve este botón — `MetricsBar.tsx` solo lo renderiza si
 * `isAdmin === true`. Cliente ve "Actualizado hace X" pasivo (UX
 * estándar Stripe customer / Vercel viewer).
 */
interface MetricsRefreshButtonProps {
  /** ID del service que se refresca. */
  serviceId: string;
  /** True si la página es admin. False NO debería llegar aquí — el
   *  caller (MetricsBar) gating ya filtra cliente fuera. */
  isAdmin: boolean;
}

const COOLDOWN_SECONDS = 10;

export function MetricsRefreshButton({
  serviceId,
  isAdmin,
}: MetricsRefreshButtonProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Countdown tick: decrementa el cooldown cada segundo hasta 0.
  // useEffect se cancela al desmontar (cleanup) o si el cooldown llega a 0.
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setTimeout(() => {
      setCooldownRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownRemaining]);

  function handleRefresh(): void {
    startTransition(async () => {
      const result = await refreshServiceInfoAction(serviceId, isAdmin);
      if (result.ok) {
        toast('success', t('metrics.refresh.success'));
        // Cooldown solo en éxito — si falla, admin puede reintentar
        // inmediato (típicamente para diagnosticar transient error).
        setCooldownRemaining(COOLDOWN_SECONDS);
      } else {
        toast('error', result.error || t('metrics.refresh.error'));
      }
    });
  }

  const disabled = isPending || cooldownRemaining > 0;

  let icon: ReactNode;
  let label: string;
  if (isPending) {
    icon = <Hourglass size={14} aria-hidden="true" />;
    label = t('metrics.refreshing');
  } else if (cooldownRemaining > 0) {
    icon = <RefreshCw size={14} aria-hidden="true" />;
    label = `${cooldownRemaining}s`;
  } else {
    icon = <RefreshCw size={14} aria-hidden="true" />;
    label = t('metrics.refresh');
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleRefresh}
      disabled={disabled}
      title={
        cooldownRemaining > 0
          ? `Espera ${cooldownRemaining}s antes de refrescar de nuevo (cooldown anti rate-limit).`
          : t('metrics.refresh.tooltip')
      }
      aria-label={t('metrics.refresh.aria_label')}
    >
      {icon}
      {label}
    </Button>
  );
}
