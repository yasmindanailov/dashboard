'use client';

import {
  Clock,
  AlertTriangle,
  PauseCircle,
  CheckCircle2,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { ConversationSla } from './types';
import styles from './SlaIndicator.module.css';

/* ═══════════════════════════════════════
   SlaIndicator — Rediseño UI · F3·E9 (SLA visualización)
   Presenta el SLA de 1ª respuesta calculado server-side. Dos variantes,
   1:1 con los mockups (BandejaTickets / TicketConversacion / Soporte):
     - `inline`  → pill por fila en la bandeja (solo running/breached).
     - `detail`  → tira de estado bajo el header del detalle.
   Y dos audiencias: `admin` (literal, incl. "vencido") y `client`
   (tranquilizador, nunca "vencido"). El cálculo vive en el backend; aquí
   solo formateamos el snapshot. NO pinta barra de progreso: los mockups
   muestran una tira de estado, no un gauge.
   ═══════════════════════════════════════ */

type SlaTone = 'warning' | 'danger' | 'neutral' | 'success';

interface SlaView {
  tone: SlaTone;
  Icon: LucideIcon;
  label: string;
}

interface SlaIndicatorProps {
  sla: ConversationSla | null | undefined;
  /** `inline` = pill de fila; `detail` = tira del header. */
  variant?: 'inline' | 'detail';
  /** Ajusta el tono del copy. `client` nunca muestra "vencido". */
  audience?: 'admin' | 'client';
  className?: string;
}

const MIN_MS = 60_000;

/** "3 h 12 m" / "38 min" / "2 d 4 h". Acota a 0 (nunca negativo). */
function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / MIN_MS));
  if (totalMin < 60) return `${totalMin} min`;
  const totalHours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (totalHours < 24) {
    return mins > 0 ? `${totalHours} h ${mins} m` : `${totalHours} h`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
}

/** Hora local "14:30". */
function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Resuelve tono + icono + copy según estado, variante y audiencia.
 * Devuelve `null` cuando ese estado no tiene representación en la variante
 * (p. ej. `inline` solo dibuja running/breached; el resto se omite — igual
 * que el mockup, que oculta la pill en pausa/resuelto).
 */
function resolveView(
  sla: ConversationSla,
  variant: 'inline' | 'detail',
  audience: 'admin' | 'client',
): SlaView | null {
  const isClient = audience === 'client';

  switch (sla.state) {
    case 'running': {
      const remaining =
        sla.remaining_ms != null ? formatDuration(sla.remaining_ms) : '';
      if (variant === 'inline') {
        return { tone: 'warning', Icon: Clock, label: `SLA en ${remaining}` };
      }
      if (isClient) {
        // Tranquilizador: verde si holgado, ámbar si queda poco.
        const tight = sla.remaining_pct != null && sla.remaining_pct <= 25;
        return tight
          ? {
              tone: 'warning',
              Icon: Clock,
              label: `Quedan ${remaining} para responderte`,
            }
          : {
              tone: 'success',
              Icon: ShieldCheck,
              label: `Dentro de plazo · respondemos en menos de ${sla.response_sla_hours} h`,
            };
      }
      const due = sla.due_at ? formatClock(sla.due_at) : '';
      return {
        tone: 'warning',
        Icon: Clock,
        label: `Responder antes de ${due} · quedan ${remaining}`,
      };
    }

    case 'breached': {
      if (isClient) {
        // Nunca "vencido" al cliente: lo enmarcamos como prioridad.
        return {
          tone: 'warning',
          Icon: Clock,
          label: 'Estamos priorizando tu respuesta',
        };
      }
      if (variant === 'inline') {
        return { tone: 'danger', Icon: AlertTriangle, label: 'SLA vencido' };
      }
      const overdue =
        sla.remaining_ms != null ? formatDuration(-sla.remaining_ms) : '';
      return {
        tone: 'danger',
        Icon: AlertTriangle,
        label: `SLA vencido hace ${overdue} · responde cuanto antes`,
      };
    }

    case 'paused': {
      // La pelota está en el cliente. La pill de fila se oculta; al cliente
      // tampoco le mostramos nada (su badge de estado ya lo dice).
      if (variant === 'inline' || isClient) return null;
      return {
        tone: 'neutral',
        Icon: PauseCircle,
        label: 'Esperando respuesta del cliente · SLA en pausa',
      };
    }

    case 'met': {
      if (variant === 'inline') return null;
      const took =
        sla.responded_in_ms != null
          ? formatDuration(sla.responded_in_ms)
          : '';
      if (sla.responded_within_sla) {
        return {
          tone: 'success',
          Icon: CheckCircle2,
          label: isClient
            ? `Dentro de plazo · respondido en ${took}`
            : `Primera respuesta a tiempo · ${took}`,
        };
      }
      // Fuera de plazo: al cliente no le señalamos el retraso.
      return isClient
        ? {
            tone: 'neutral',
            Icon: CheckCircle2,
            label: `Respondido en ${took}`,
          }
        : {
            tone: 'warning',
            Icon: CheckCircle2,
            label: `Primera respuesta fuera de SLA · ${took}`,
          };
    }

    case 'none':
    default:
      return null;
  }
}

export default function SlaIndicator({
  sla,
  variant = 'inline',
  audience = 'admin',
  className = '',
}: SlaIndicatorProps) {
  if (!sla) return null;
  const view = resolveView(sla, variant, audience);
  if (!view) return null;

  const { tone, Icon, label } = view;
  const variantClass = variant === 'inline' ? styles.inline : styles.detail;

  return (
    <span
      className={`${variantClass} ${styles[`tone_${tone}`]} ${className}`.trim()}
      data-sla-state={sla.state}
    >
      <Icon size={variant === 'inline' ? 13 : 15} strokeWidth={2} aria-hidden />
      <span className={styles.label}>{label}</span>
    </span>
  );
}
