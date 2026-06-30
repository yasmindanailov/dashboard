/* ═══════════════════════════════════════
   support-sla.helper — Rediseño UI · F3·E9 (SLA visualización)
   SLA de PRIMERA RESPUESTA por conversación, calculado server-side
   (autoridad de tiempo única; el front solo presenta el snapshot).

   Reutiliza `conversations.first_response_at` + el `response_sla_hours`
   del tier Support Inside del cliente. Alineado con
   `core/tasks/sla-helper.ts`: sin plan SI → 24 h (no penalizamos al
   cliente básico). NO toca el cálculo de `Task.due_date` (otro dominio).
   ═══════════════════════════════════════ */

import { ConversationStatus } from '@prisma/client';

/** Horas de SLA de 1ª respuesta cuando el cliente no tiene plan SI.
 *  Coincide con `mapSITierToTicketSlaHours` (sin SI → 24 h). */
export const DEFAULT_RESPONSE_SLA_HOURS = 24;

const MS_PER_HOUR = 3_600_000;

/** Estados terminales: la conversación ya no espera acción del agente. */
const TERMINAL_STATUSES: ReadonlySet<ConversationStatus> = new Set([
  ConversationStatus.resolved,
  ConversationStatus.closed,
]);

/**
 * Estado del SLA de 1ª respuesta, derivado del estado de la conversación:
 *  - `running`  → sin 1ª respuesta y dentro de plazo (el reloj corre).
 *  - `breached` → sin 1ª respuesta y plazo vencido.
 *  - `paused`   → `waiting_client`: la pelota está en el tejado del cliente.
 *  - `met`      → la 1ª respuesta del agente ya se dio.
 *  - `none`     → terminal sin 1ª respuesta / no aplica (sin visual).
 */
export type ConversationSlaState =
  | 'running'
  | 'breached'
  | 'paused'
  | 'met'
  | 'none';

export interface ConversationSla {
  state: ConversationSlaState;
  /** Fecha límite de 1ª respuesta (`created_at` + `response_sla_hours`). ISO. */
  due_at: string | null;
  /** Horas de SLA aplicadas (tier SI del cliente o `DEFAULT_RESPONSE_SLA_HOURS`). */
  response_sla_hours: number;
  /** `true` si aún no hay 1ª respuesta del agente (incl. en pausa). */
  first_response_pending: boolean;
  /** ms hasta el vencimiento (negativo = vencido). Solo running/breached. */
  remaining_ms: number | null;
  /** % del plazo que QUEDA en el instante de la consulta (0..100). Solo running/breached. */
  remaining_pct: number | null;
  /** ms que tardó la 1ª respuesta (`first_response_at` − `created_at`). Solo `met`. */
  responded_in_ms: number | null;
  /** `true` si la 1ª respuesta llegó dentro de plazo. Solo `met`. */
  responded_within_sla: boolean | null;
}

export interface ConversationSlaInput {
  created_at: Date;
  first_response_at: Date | null;
  status: ConversationStatus;
  /** Horas de SLA del tier SI activo del cliente; `null`/0 → default. */
  response_sla_hours: number | null;
  /** Inyectable para tests; por defecto `new Date()`. */
  now?: Date;
}

/**
 * Calcula el SLA de 1ª respuesta de una conversación a partir de datos ya
 * existentes. Pura y determinista (acepta `now` inyectable). Se evalúa por
 * fila en la bandeja y en el detalle, así que mantiene coste O(1) sin I/O.
 */
export function computeConversationSla(
  input: ConversationSlaInput,
): ConversationSla {
  const slaHours =
    input.response_sla_hours && input.response_sla_hours > 0
      ? input.response_sla_hours
      : DEFAULT_RESPONSE_SLA_HOURS;
  const windowMs = slaHours * MS_PER_HOUR;
  const dueAt = new Date(input.created_at.getTime() + windowMs);
  const now = input.now ?? new Date();

  const base = {
    due_at: dueAt.toISOString(),
    response_sla_hours: slaHours,
    remaining_ms: null,
    remaining_pct: null,
    responded_in_ms: null,
    responded_within_sla: null,
  };

  // 1ª respuesta ya dada → SLA cumplido (dentro o fuera de plazo).
  if (input.first_response_at) {
    const respondedInMs =
      input.first_response_at.getTime() - input.created_at.getTime();
    return {
      ...base,
      state: 'met',
      first_response_pending: false,
      responded_in_ms: respondedInMs,
      responded_within_sla:
        input.first_response_at.getTime() <= dueAt.getTime(),
    };
  }

  // Sin 1ª respuesta y terminal (resuelta/cerrada sin responder) → no aplica.
  if (TERMINAL_STATUSES.has(input.status)) {
    return { ...base, state: 'none', first_response_pending: false };
  }

  // Sin 1ª respuesta y esperando al cliente → reloj en pausa.
  if (input.status === ConversationStatus.waiting_client) {
    return { ...base, state: 'paused', first_response_pending: true };
  }

  // open / waiting_agent sin 1ª respuesta → el reloj corre.
  const remainingMs = dueAt.getTime() - now.getTime();
  return {
    ...base,
    state: remainingMs >= 0 ? 'running' : 'breached',
    first_response_pending: true,
    remaining_ms: remainingMs,
    remaining_pct: clampPct((remainingMs / windowMs) * 100),
  };
}

/** Redondea a entero y acota a [0, 100]. */
function clampPct(value: number): number {
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value);
}
